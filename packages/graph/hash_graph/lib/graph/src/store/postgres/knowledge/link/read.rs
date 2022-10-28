use std::str::FromStr;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::uri::VersionedUri;

use crate::{
    knowledge::{Link, LinkQueryPath, PersistedLink},
    ontology::LinkTypeQueryPath,
    store::{
        crud,
        postgres::query::{Distinctness, Ordering, SelectCompiler},
        query::Filter,
        AsClient, PostgresStore, QueryError,
    },
};

#[async_trait]
impl<C: AsClient> crud::Read<PersistedLink> for PostgresStore<C> {
    type Query<'q> = Filter<'q, Link>;

    async fn read<'f: 'q, 'q>(
        &self,
        filter: &'f Self::Query<'q>,
    ) -> Result<Vec<PersistedLink>, QueryError> {
        let mut compiler = SelectCompiler::new();
        compiler.add_selection_path(
            &LinkQueryPath::Type(LinkTypeQueryPath::VersionedUri),
            Distinctness::Destinct,
            None,
        );
        compiler.add_selection_path(&LinkQueryPath::Source(None), Distinctness::Destinct, None);
        compiler.add_selection_path(&LinkQueryPath::Target(None), Distinctness::Destinct, None);
        compiler.add_selection_path(
            &LinkQueryPath::Index,
            Distinctness::Destinct,
            Some(Ordering::Ascending),
        );
        compiler.add_selection_path(&LinkQueryPath::OwnedById, Distinctness::Indestinct, None);
        compiler.add_selection_path(&LinkQueryPath::CreatedById, Distinctness::Indestinct, None);
        compiler.add_filter(filter);

        let (statement, parameters) = compiler.compile();

        self.as_client()
            .query_raw(&statement, parameters.iter().copied())
            .await
            .into_report()
            .change_context(QueryError)?
            .map(|row| row.into_report().change_context(QueryError))
            .and_then(|row| async move {
                let link_type_id = VersionedUri::from_str(row.get(0))
                    .into_report()
                    .change_context(QueryError)?;
                let source_entity_id = row.get(1);
                let target_entity_id = row.get(2);
                let index = row.get(3);
                let owned_by_id = row.get(4);
                let created_by_id = row.get(5);

                Ok(PersistedLink::new(
                    Link::new(source_entity_id, target_entity_id, link_type_id, index),
                    owned_by_id,
                    created_by_id,
                ))
            })
            .try_collect()
            .await
    }
}

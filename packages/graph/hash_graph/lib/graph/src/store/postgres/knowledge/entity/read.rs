use std::str::FromStr;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::uri::VersionedUri;

use crate::{
    knowledge::{Entity, PersistedEntity, PersistedEntityIdentifier},
    store::{
        crud, postgres::query::SelectCompiler, query::Filter, AsClient, PostgresStore, QueryError,
    },
};

#[async_trait]
impl<C: AsClient> crud::Read<PersistedEntity> for PostgresStore<C> {
    type Query<'q> = Filter<'q, Entity>;

    async fn read<'f: 'q, 'q>(
        &self,
        filter: &'f Self::Query<'q>,
    ) -> Result<Vec<PersistedEntity>, QueryError> {
        let mut compiler = SelectCompiler::with_default_selection();
        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        self.as_client()
            .query_raw(&statement, parameters.iter().copied())
            .await
            .into_report()
            .change_context(QueryError)?
            .map(|row| row.into_report().change_context(QueryError))
            .and_then(|row| async move {
                let entity = serde_json::from_value(row.get(0))
                    .into_report()
                    .change_context(QueryError)?;
                let id = row.get(1);
                let version = row.get(2);
                let entity_type_uri = VersionedUri::from_str(row.get(3))
                    .into_report()
                    .change_context(QueryError)?;
                let owned_by_id = row.get(4);
                let created_by_id = row.get(5);
                let updated_by_id = row.get(6);

                Ok(PersistedEntity::new(
                    entity,
                    PersistedEntityIdentifier::new(id, version, owned_by_id),
                    entity_type_uri,
                    created_by_id,
                    updated_by_id,
                    None,
                ))
            })
            .try_collect()
            .await
    }
}

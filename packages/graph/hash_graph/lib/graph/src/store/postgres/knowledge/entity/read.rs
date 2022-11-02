use std::str::FromStr;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::uri::VersionedUri;

use crate::{
    knowledge::{
        Entity, EntityId, EntityQueryPath, LinkEntityMetadata, PersistedEntity,
        PersistedEntityIdentifier,
    },
    ontology::EntityTypeQueryPath,
    store::{
        crud,
        postgres::query::{Distinctness, Ordering, SelectCompiler},
        query::Filter,
        AsClient, PostgresStore, QueryError,
    },
};

#[async_trait]
impl<C: AsClient> crud::Read<PersistedEntity> for PostgresStore<C> {
    type Query<'q> = Filter<'q, Entity>;

    async fn read<'f: 'q, 'q>(
        &self,
        filter: &'f Self::Query<'q>,
    ) -> Result<Vec<PersistedEntity>, QueryError> {
        let mut compiler = SelectCompiler::new();

        compiler.add_selection_path(
            &EntityQueryPath::Properties(None),
            Distinctness::Indistinct,
            None,
        );
        compiler.add_selection_path(&EntityQueryPath::Id, Distinctness::Distinct, None);
        compiler.add_selection_path(&EntityQueryPath::Version, Distinctness::Distinct, None);
        compiler.add_selection_path(
            &EntityQueryPath::Type(EntityTypeQueryPath::VersionedUri),
            Distinctness::Indistinct,
            None,
        );
        compiler.add_selection_path(&EntityQueryPath::OwnedById, Distinctness::Indistinct, None);
        compiler.add_selection_path(
            &EntityQueryPath::CreatedById,
            Distinctness::Indistinct,
            None,
        );
        compiler.add_selection_path(
            &EntityQueryPath::UpdatedById,
            Distinctness::Indistinct,
            None,
        );
        compiler.add_selection_path(
            &EntityQueryPath::LeftEntityId,
            Distinctness::Indistinct,
            None,
        );
        compiler.add_selection_path(
            &EntityQueryPath::RightEntityId,
            Distinctness::Indistinct,
            None,
        );
        compiler.add_selection_path(&EntityQueryPath::LeftOrder, Distinctness::Indistinct, None);
        compiler.add_selection_path(&EntityQueryPath::RightOrder, Distinctness::Indistinct, None);

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

                let link_metadata = {
                    let left_entity_id: Option<EntityId> = row.get(7);
                    let right_entity_id: Option<EntityId> = row.get(8);
                    match (left_entity_id, right_entity_id) {
                        (Some(left_entity_id), Some(right_entity_id)) => {
                            Some(LinkEntityMetadata::new(
                                left_entity_id,
                                right_entity_id,
                                row.get(9),
                                row.get(10),
                            ))
                        }
                        (None, None) => None,
                        (Some(_), None) => unreachable!(
                            "It's not possible to have a link entity with only the left entity id \
                             specified"
                        ),
                        (None, Some(_)) => unreachable!(
                            "It's not possible to have a link entity with only the right entity \
                             id specified"
                        ),
                    }
                };

                Ok(PersistedEntity::new(
                    entity,
                    PersistedEntityIdentifier::new(id, version, owned_by_id),
                    entity_type_uri,
                    created_by_id,
                    updated_by_id,
                    None,
                    link_metadata,
                ))
            })
            .try_collect()
            .await
    }
}

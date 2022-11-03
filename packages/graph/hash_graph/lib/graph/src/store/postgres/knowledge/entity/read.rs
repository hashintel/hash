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
        let mut compiler = SelectCompiler::new();

        let properties_index = compiler.add_selection_path(&EntityQueryPath::Properties(None));
        let entity_id_index = compiler.add_selection_path(&EntityQueryPath::Id);
        let version_index = compiler.add_selection_path(&EntityQueryPath::Version);
        let type_id_index =
            compiler.add_selection_path(&EntityQueryPath::Type(EntityTypeQueryPath::VersionedUri));
        let owned_by_id_index = compiler.add_selection_path(&EntityQueryPath::OwnedById);
        let created_by_id_index = compiler.add_selection_path(&EntityQueryPath::CreatedById);
        let updated_by_id_index = compiler.add_selection_path(&EntityQueryPath::UpdatedById);
        let left_entity_id_index = compiler.add_selection_path(&EntityQueryPath::LeftEntity(None));
        let right_entity_id_index =
            compiler.add_selection_path(&EntityQueryPath::RightEntity(None));
        let left_order_index = compiler.add_selection_path(&EntityQueryPath::LeftOrder);
        let right_order_index = compiler.add_selection_path(&EntityQueryPath::RightOrder);

        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        self.as_client()
            .query_raw(&statement, parameters.iter().copied())
            .await
            .into_report()
            .change_context(QueryError)?
            .map(|row| row.into_report().change_context(QueryError))
            .and_then(|row| async move {
                let entity: Entity = serde_json::from_value(row.get(properties_index))
                    .into_report()
                    .change_context(QueryError)?;
                let entity_type_uri = VersionedUri::from_str(row.get(type_id_index))
                    .into_report()
                    .change_context(QueryError)?;

                let link_metadata = {
                    let left_entity_id: Option<EntityId> = row.get(left_entity_id_index);
                    let right_entity_id: Option<EntityId> = row.get(right_entity_id_index);
                    match (left_entity_id, right_entity_id) {
                        (Some(left_entity_id), Some(right_entity_id)) => {
                            Some(LinkEntityMetadata::new(
                                left_entity_id,
                                right_entity_id,
                                row.get(left_order_index),
                                row.get(right_order_index),
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
                    PersistedEntityIdentifier::new(
                        row.get(entity_id_index),
                        row.get(version_index),
                        row.get(owned_by_id_index),
                    ),
                    entity_type_uri,
                    row.get(created_by_id_index),
                    row.get(updated_by_id_index),
                    link_metadata,
                    // TODO: only the historic table would have an `archived` field.
                    //   Consider what we should do about that.
                    false,
                ))
            })
            .try_collect()
            .await
    }
}

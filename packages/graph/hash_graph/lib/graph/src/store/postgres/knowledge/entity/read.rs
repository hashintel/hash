use std::str::FromStr;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::uri::VersionedUri;

use crate::{
    knowledge::{
        Entity, EntityQueryPath, EntityUuid, LinkEntityMetadata, PersistedEntity,
        PersistedEntityIdentifier,
    },
    ontology::EntityTypeQueryPath,
    provenance::{CreatedById, OwnedById, UpdatedById},
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
        let entity_uuid_index = compiler.add_selection_path(&EntityQueryPath::Id);
        let version_index = compiler.add_selection_path(&EntityQueryPath::Version);
        let archived_index = compiler.add_selection_path(&EntityQueryPath::Archived);
        let type_id_index =
            compiler.add_selection_path(&EntityQueryPath::Type(EntityTypeQueryPath::VersionedUri));
        let owned_by_id_index = compiler.add_selection_path(&EntityQueryPath::OwnedById);
        let created_by_id_index = compiler.add_selection_path(&EntityQueryPath::CreatedById);
        let updated_by_id_index = compiler.add_selection_path(&EntityQueryPath::UpdatedById);
        let left_entity_uuid_index =
            compiler.add_selection_path(&EntityQueryPath::LeftEntity(None));
        let right_entity_uuid_index =
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
                    let left_entity_uuid: Option<EntityUuid> = row.get(left_entity_uuid_index);
                    let right_entity_uuid: Option<EntityUuid> = row.get(right_entity_uuid_index);
                    match (left_entity_uuid, right_entity_uuid) {
                        (Some(left_entity_uuid), Some(right_entity_uuid)) => {
                            Some(LinkEntityMetadata::new(
                                left_entity_uuid,
                                right_entity_uuid,
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

                let owned_by_id = OwnedById::new(row.get(owned_by_id_index));
                let created_by_id = CreatedById::new(row.get(created_by_id_index));
                let updated_by_id = UpdatedById::new(row.get(updated_by_id_index));

                Ok(PersistedEntity::new(
                    entity,
                    PersistedEntityIdentifier::new(
                        row.get(entity_uuid_index),
                        row.get(version_index),
                        owned_by_id,
                    ),
                    entity_type_uri,
                    created_by_id,
                    updated_by_id,
                    link_metadata,
                    // TODO: only the historic table would have an `archived` field.
                    //   Consider what we should do about that.
                    row.get(archived_index),
                ))
            })
            .try_collect()
            .await
    }
}

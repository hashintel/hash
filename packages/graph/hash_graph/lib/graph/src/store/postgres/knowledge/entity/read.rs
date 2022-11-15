use std::str::FromStr;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::uri::VersionedUri;
use uuid::Uuid;

use crate::{
    identifier::{
        account::AccountId,
        knowledge::{EntityEditionId, EntityId},
    },
    knowledge::{Entity, EntityProperties, EntityQueryPath, EntityUuid, LinkEntityMetadata},
    ontology::EntityTypeQueryPath,
    provenance::{CreatedById, OwnedById, ProvenanceMetadata, UpdatedById},
    store::{
        crud, postgres::query::SelectCompiler, query::Filter, AsClient, PostgresStore, QueryError,
    },
};

#[async_trait]
impl<C: AsClient> crud::Read<Entity> for PostgresStore<C> {
    type Query<'q> = Filter<'q, Entity>;

    async fn read<'f: 'q, 'q>(
        &self,
        filter: &'f Self::Query<'q>,
    ) -> Result<Vec<Entity>, QueryError> {
        // We can't define these inline otherwise we'll drop while borrowed
        let left_owned_by_id_query_path =
            EntityQueryPath::LeftEntity(Some(Box::new(EntityQueryPath::OwnedById)));
        let right_owned_by_id_query_path =
            EntityQueryPath::RightEntity(Some(Box::new(EntityQueryPath::OwnedById)));

        let mut compiler = SelectCompiler::new();

        let owned_by_id_index = compiler.add_selection_path(&EntityQueryPath::OwnedById);
        let entity_uuid_index = compiler.add_selection_path(&EntityQueryPath::Uuid);
        let version_index = compiler.add_selection_path(&EntityQueryPath::Version);

        let type_id_index =
            compiler.add_selection_path(&EntityQueryPath::Type(EntityTypeQueryPath::VersionedUri));

        let properties_index = compiler.add_selection_path(&EntityQueryPath::Properties(None));

        let left_entity_owned_by_id_index =
            compiler.add_selection_path(&left_owned_by_id_query_path);
        let left_entity_uuid_index =
            compiler.add_selection_path(&EntityQueryPath::LeftEntity(None));
        let right_entity_owned_by_id_index =
            compiler.add_selection_path(&right_owned_by_id_query_path);
        let right_entity_uuid_index =
            compiler.add_selection_path(&EntityQueryPath::RightEntity(None));
        let left_order_index = compiler.add_selection_path(&EntityQueryPath::LeftOrder);
        let right_order_index = compiler.add_selection_path(&EntityQueryPath::RightOrder);

        let created_by_id_index = compiler.add_selection_path(&EntityQueryPath::CreatedById);
        let updated_by_id_index = compiler.add_selection_path(&EntityQueryPath::UpdatedById);

        let archived_index = compiler.add_selection_path(&EntityQueryPath::Archived);

        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        self.as_client()
            .query_raw(&statement, parameters.iter().copied())
            .await
            .into_report()
            .change_context(QueryError)?
            .map(|row| row.into_report().change_context(QueryError))
            .and_then(|row| async move {
                let entity: EntityProperties = serde_json::from_value(row.get(properties_index))
                    .into_report()
                    .change_context(QueryError)?;
                let entity_type_uri = VersionedUri::from_str(row.get(type_id_index))
                    .into_report()
                    .change_context(QueryError)?;

                let link_metadata = {
                    let left_owned_by_id: Option<AccountId> =
                        row.get(left_entity_owned_by_id_index);
                    let left_entity_uuid: Option<Uuid> = row.get(left_entity_uuid_index);
                    let right_owned_by_id: Option<AccountId> =
                        row.get(right_entity_owned_by_id_index);
                    let right_entity_uuid: Option<Uuid> = row.get(right_entity_uuid_index);
                    match (
                        left_owned_by_id,
                        left_entity_uuid,
                        right_owned_by_id,
                        right_entity_uuid,
                    ) {
                        (
                            Some(left_owned_by_id),
                            Some(left_entity_uuid),
                            Some(right_owned_by_id),
                            Some(right_entity_uuid),
                        ) => Some(LinkEntityMetadata::new(
                            EntityId::new(
                                OwnedById::new(left_owned_by_id),
                                EntityUuid::new(left_entity_uuid),
                            ),
                            EntityId::new(
                                OwnedById::new(right_owned_by_id),
                                EntityUuid::new(right_entity_uuid),
                            ),
                            row.get(left_order_index),
                            row.get(right_order_index),
                        )),
                        (None, None, None, None) => None,
                        _ => unreachable!(
                            "It's not possible to have a link entity with the left entityId or \
                             right entityId unspecified"
                        ),
                    }
                };

                let owned_by_id = OwnedById::new(row.get(owned_by_id_index));
                let entity_uuid = EntityUuid::new(row.get(entity_uuid_index));
                let created_by_id = CreatedById::new(row.get(created_by_id_index));
                let updated_by_id = UpdatedById::new(row.get(updated_by_id_index));

                Ok(Entity::new(
                    entity,
                    EntityEditionId::new(
                        EntityId::new(owned_by_id, entity_uuid),
                        row.get(version_index),
                    ),
                    entity_type_uri,
                    ProvenanceMetadata::new(created_by_id, updated_by_id),
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

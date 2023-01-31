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
        knowledge::{EntityEditionId, EntityId, EntityRecordId, EntityRevisionVersion},
        time::{TimeProjection, VersionInterval},
    },
    knowledge::{Entity, EntityProperties, EntityQueryPath, EntityUuid, LinkData},
    ontology::EntityTypeQueryPath,
    provenance::{OwnedById, ProvenanceMetadata, UpdatedById},
    store::{
        crud,
        postgres::query::{Distinctness, SelectCompiler},
        query::Filter,
        AsClient, PostgresStore, QueryError,
    },
};

#[async_trait]
impl<C: AsClient> crud::Read<Entity> for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self))]
    async fn read(
        &self,
        filter: &Filter<Entity>,
        time_projection: &TimeProjection,
    ) -> Result<Vec<Entity>, QueryError> {
        // We can't define these inline otherwise we'll drop while borrowed
        let left_entity_uuid_path = EntityQueryPath::LeftEntity(Box::new(EntityQueryPath::Uuid));
        let left_owned_by_id_query_path =
            EntityQueryPath::LeftEntity(Box::new(EntityQueryPath::OwnedById));
        let right_entity_uuid_path = EntityQueryPath::RightEntity(Box::new(EntityQueryPath::Uuid));
        let right_owned_by_id_query_path =
            EntityQueryPath::RightEntity(Box::new(EntityQueryPath::OwnedById));

        let mut compiler = SelectCompiler::new(time_projection);

        let owned_by_id_index = compiler.add_selection_path(&EntityQueryPath::OwnedById);
        let entity_uuid_index = compiler.add_selection_path(&EntityQueryPath::Uuid);
        let edition_id_index = compiler.add_distinct_selection_with_ordering(
            &EntityQueryPath::EditionId,
            Distinctness::Distinct,
            None,
        );
        let decision_time_index = compiler.add_selection_path(&EntityQueryPath::DecisionTime);
        let transaction_time_index = compiler.add_selection_path(&EntityQueryPath::TransactionTime);

        let type_id_index =
            compiler.add_selection_path(&EntityQueryPath::Type(EntityTypeQueryPath::VersionedUri));

        let properties_index = compiler.add_selection_path(&EntityQueryPath::Properties(None));

        let left_entity_uuid_index = compiler.add_selection_path(&left_entity_uuid_path);
        let left_entity_owned_by_id_index =
            compiler.add_selection_path(&left_owned_by_id_query_path);
        let right_entity_uuid_index = compiler.add_selection_path(&right_entity_uuid_path);
        let right_entity_owned_by_id_index =
            compiler.add_selection_path(&right_owned_by_id_query_path);
        let left_to_right_order_index =
            compiler.add_selection_path(&EntityQueryPath::LeftToRightOrder);
        let right_to_left_order_index =
            compiler.add_selection_path(&EntityQueryPath::RightToLeftOrder);

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
                let properties: EntityProperties =
                    serde_json::from_value(row.get(properties_index))
                        .into_report()
                        .change_context(QueryError)?;
                let entity_type_uri = VersionedUri::from_str(row.get(type_id_index))
                    .into_report()
                    .change_context(QueryError)?;

                let link_data = {
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
                        ) => Some(LinkData::new(
                            EntityId::new(
                                OwnedById::new(left_owned_by_id),
                                EntityUuid::new(left_entity_uuid),
                            ),
                            EntityId::new(
                                OwnedById::new(right_owned_by_id),
                                EntityUuid::new(right_entity_uuid),
                            ),
                            row.get(left_to_right_order_index),
                            row.get(right_to_left_order_index),
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
                let updated_by_id = UpdatedById::new(row.get(updated_by_id_index));

                Ok(Entity::new(
                    properties,
                    link_data,
                    EntityRecordId::new(
                        EntityId::new(owned_by_id, entity_uuid),
                        EntityEditionId::new(row.get(edition_id_index)),
                    ),
                    EntityRevisionVersion::new(
                        VersionInterval::from_anonymous(row.get(decision_time_index)),
                        VersionInterval::from_anonymous(row.get(transaction_time_index)),
                    ),
                    entity_type_uri,
                    ProvenanceMetadata::new(updated_by_id),
                    // TODO: only the historic table would have an `archived` field.
                    //   Consider what we should do about that.
                    row.get(archived_index),
                ))
            })
            .try_collect()
            .await
    }
}

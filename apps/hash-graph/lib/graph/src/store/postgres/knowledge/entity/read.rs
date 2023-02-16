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
        knowledge::{EntityEditionId, EntityId, EntityRecordId, EntityVersion},
        time::TimeProjection,
    },
    knowledge::{
        Entity, EntityLinkOrder, EntityMetadata, EntityProperties, EntityQueryPath, EntityUuid,
        LinkData,
    },
    ontology::EntityTypeQueryPath,
    provenance::{OwnedById, ProvenanceMetadata},
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
                let entity_type_id = VersionedUri::from_str(row.get(type_id_index))
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
                        ) => Some(LinkData {
                            left_entity_id: EntityId {
                                owned_by_id: OwnedById::new(left_owned_by_id),
                                entity_uuid: EntityUuid::new(left_entity_uuid),
                            },
                            right_entity_id: EntityId {
                                owned_by_id: OwnedById::new(right_owned_by_id),
                                entity_uuid: EntityUuid::new(right_entity_uuid),
                            },
                            order: EntityLinkOrder {
                                left_to_right: row.get(left_to_right_order_index),
                                right_to_left: row.get(right_to_left_order_index),
                            },
                        }),
                        (None, None, None, None) => None,
                        _ => unreachable!(
                            "It's not possible to have a link entity with the left entityId or \
                             right entityId unspecified"
                        ),
                    }
                };

                Ok(Entity {
                    properties,
                    link_data,
                    metadata: EntityMetadata {
                        record_id: EntityRecordId {
                            entity_id: EntityId {
                                owned_by_id: row.get(owned_by_id_index),
                                entity_uuid: row.get(entity_uuid_index),
                            },
                            edition_id: EntityEditionId::new(row.get(edition_id_index)),
                        },
                        version: EntityVersion {
                            decision_time: row.get(decision_time_index),
                            transaction_time: row.get(transaction_time_index),
                        },
                        entity_type_id,
                        provenance: ProvenanceMetadata {
                            updated_by_id: row.get(updated_by_id_index),
                        },
                        archived: row.get(archived_index),
                    },
                })
            })
            .try_collect()
            .await
    }
}

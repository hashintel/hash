use std::str::FromStr;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::url::VersionedUrl;
use uuid::Uuid;

use crate::{
    identifier::{
        account::AccountId,
        knowledge::{EntityId, EntityRecordId, EntityTemporalMetadata},
    },
    knowledge::{Entity, EntityLinkOrder, EntityMetadata, EntityQueryPath, EntityUuid, LinkData},
    ontology::EntityTypeQueryPath,
    provenance::{OwnedById, ProvenanceMetadata, RecordCreatedById},
    store::{
        crud,
        postgres::query::{Distinctness, SelectCompiler},
        query::Filter,
        AsClient, PostgresStore, QueryError,
    },
    subgraph::{
        edges::{EdgeDirection, KnowledgeGraphEdgeKind, SharedEdgeKind},
        temporal_axes::QueryTemporalAxes,
    },
};

#[async_trait]
impl<C: AsClient> crud::Read<Entity> for PostgresStore<C> {
    type Record = Entity;

    type ReadStream = impl futures::Stream<Item = Result<Self::Record, QueryError>> + Send + Sync;

    #[tracing::instrument(level = "info", skip(self))]
    async fn read(
        &self,
        filter: &Filter<Entity>,
        temporal_axes: Option<&QueryTemporalAxes>,
    ) -> Result<Self::ReadStream, QueryError> {
        // We can't define these inline otherwise we'll drop while borrowed
        let left_entity_uuid_path = EntityQueryPath::EntityEdge {
            edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
            path: Box::new(EntityQueryPath::Uuid),
            direction: EdgeDirection::Outgoing,
        };
        let left_owned_by_id_query_path = EntityQueryPath::EntityEdge {
            edge_kind: KnowledgeGraphEdgeKind::HasLeftEntity,
            path: Box::new(EntityQueryPath::OwnedById),
            direction: EdgeDirection::Outgoing,
        };
        let right_entity_uuid_path = EntityQueryPath::EntityEdge {
            edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
            path: Box::new(EntityQueryPath::Uuid),
            direction: EdgeDirection::Outgoing,
        };
        let right_owned_by_id_query_path = EntityQueryPath::EntityEdge {
            edge_kind: KnowledgeGraphEdgeKind::HasRightEntity,
            path: Box::new(EntityQueryPath::OwnedById),
            direction: EdgeDirection::Outgoing,
        };

        let mut compiler = SelectCompiler::new(temporal_axes);

        let owned_by_id_index = compiler.add_distinct_selection_with_ordering(
            &EntityQueryPath::OwnedById,
            Distinctness::Distinct,
            None,
        );
        let entity_uuid_index = compiler.add_distinct_selection_with_ordering(
            &EntityQueryPath::Uuid,
            Distinctness::Distinct,
            None,
        );
        let decision_time_index = compiler.add_distinct_selection_with_ordering(
            &EntityQueryPath::DecisionTime,
            Distinctness::Distinct,
            None,
        );
        let transaction_time_index = compiler.add_distinct_selection_with_ordering(
            &EntityQueryPath::TransactionTime,
            Distinctness::Distinct,
            None,
        );

        let edition_id_index = compiler.add_selection_path(&EntityQueryPath::EditionId);
        let type_id_index = compiler.add_selection_path(&EntityQueryPath::EntityTypeEdge {
            edge_kind: SharedEdgeKind::IsOfType,
            path: EntityTypeQueryPath::VersionedUrl,
        });

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

        let record_created_by_id_index =
            compiler.add_selection_path(&EntityQueryPath::RecordCreatedById);

        let archived_index = compiler.add_selection_path(&EntityQueryPath::Archived);

        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        let stream = self
            .as_client()
            .query_raw(&statement, parameters.iter().copied())
            .await
            .into_report()
            .change_context(QueryError)?
            .map(|row| row.into_report().change_context(QueryError))
            .and_then(move |row| async move {
                let entity_type_id = VersionedUrl::from_str(row.get(type_id_index))
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

                let record_created_by_id =
                    RecordCreatedById::new(row.get(record_created_by_id_index));

                Ok(Entity {
                    properties: row.get(properties_index),
                    link_data,
                    metadata: EntityMetadata::new(
                        EntityRecordId {
                            entity_id: EntityId {
                                owned_by_id: row.get(owned_by_id_index),
                                entity_uuid: row.get(entity_uuid_index),
                            },
                            edition_id: row.get(edition_id_index),
                        },
                        EntityTemporalMetadata {
                            decision_time: row.get(decision_time_index),
                            transaction_time: row.get(transaction_time_index),
                        },
                        entity_type_id,
                        ProvenanceMetadata::new(record_created_by_id),
                        row.get(archived_index),
                    ),
                })
            });
        Ok(stream)
    }
}

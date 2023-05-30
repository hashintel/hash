use std::{mem::swap, str::FromStr};

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::url::{BaseUrl, VersionedUrl};
use uuid::Uuid;

use crate::{
    identifier::{
        account::AccountId,
        knowledge::{EntityEditionId, EntityId, EntityRecordId, EntityTemporalMetadata},
        time::{
            LeftClosedTemporalInterval, RightBoundedTemporalInterval, TemporalTagged, TimeAxis,
            Timestamp,
        },
    },
    knowledge::{Entity, EntityLinkOrder, EntityMetadata, EntityQueryPath, EntityUuid, LinkData},
    ontology::EntityTypeQueryPath,
    provenance::{OwnedById, ProvenanceMetadata, RecordCreatedById},
    store::{
        crud,
        postgres::query::{
            Distinctness, ForeignKeyReference, ReferenceTable, SelectCompiler, Table, Transpile,
        },
        query::Filter,
        AsClient, PostgresStore, QueryError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, KnowledgeGraphEdgeKind, SharedEdgeKind},
        identifier::{EntityTypeVertexId, EntityVertexId},
        temporal_axes::{PinnedAxis, QueryTemporalAxes, VariableAxis},
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

#[derive(Debug)]
pub struct EntityEdgeTraversalData {
    owned_by_ids: Vec<OwnedById>,
    entity_uuids: Vec<EntityUuid>,
    entity_revision_ids: Vec<Timestamp<VariableAxis>>,
    intervals: Vec<RightBoundedTemporalInterval<VariableAxis>>,
    resolve_depths: Vec<GraphResolveDepths>,
    pinned_timestamp: Timestamp<PinnedAxis>,
    variable_axis: TimeAxis,
}

impl EntityEdgeTraversalData {
    pub const fn new(pinned_timestamp: Timestamp<PinnedAxis>, variable_axis: TimeAxis) -> Self {
        Self {
            owned_by_ids: Vec::new(),
            entity_uuids: Vec::new(),
            entity_revision_ids: Vec::new(),
            intervals: Vec::new(),
            resolve_depths: Vec::new(),
            pinned_timestamp,
            variable_axis,
        }
    }

    pub fn push(
        &mut self,
        vertex_id: EntityVertexId,
        interval: RightBoundedTemporalInterval<VariableAxis>,
        resolve_depth: GraphResolveDepths,
    ) {
        self.owned_by_ids.push(vertex_id.base_id.owned_by_id);
        self.entity_uuids.push(vertex_id.base_id.entity_uuid);
        self.entity_revision_ids.push(vertex_id.revision_id);
        self.intervals.push(interval);
        self.resolve_depths.push(resolve_depth);
    }
}

/// The result of an entity-to-ontology edge traversal.
pub struct SharedEdgeTraversal {
    pub left_endpoint: EntityVertexId,
    pub right_endpoint: EntityTypeVertexId,
    pub resolve_depths: GraphResolveDepths,
    pub traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
}

pub struct KnowledgeEdgeTraversal {
    pub left_endpoint: EntityVertexId,
    pub right_endpoint: EntityVertexId,
    pub right_endpoint_edition_id: EntityEditionId,
    pub resolve_depths: GraphResolveDepths,
    pub edge_interval: LeftClosedTemporalInterval<VariableAxis>,
    pub traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
}

impl<C: AsClient> PostgresStore<C> {
    pub(crate) async fn read_shared_edges<'t>(
        &self,
        traversal_data: &'t EntityEdgeTraversalData,
    ) -> Result<impl Iterator<Item = SharedEdgeTraversal> + 't, QueryError> {
        let (pinned_axis, variable_axis) = match traversal_data.variable_axis {
            TimeAxis::DecisionTime => ("transaction_time", "decision_time"),
            TimeAxis::TransactionTime => ("decision_time", "transaction_time"),
        };

        Ok(self
            .client
            .as_client()
            .query(
                &format!(
                    r#"
                        SELECT
                             filter.idx,
                             ontology_ids.base_url,
                             ontology_ids.version,
                             filter.interval * source.{variable_axis}
                        FROM unnest($1::uuid[], $2::uuid[], $3::timestamptz[], $4::tstzrange[])
                             WITH ORDINALITY
                             AS filter(owned_by_id, entity_uuid, entity_version, interval, idx)

                        JOIN entity_temporal_metadata AS source
                          ON source.{pinned_axis} @> $5::timestamptz
                         AND lower(source.{variable_axis}) = filter.entity_version
                         AND source.owned_by_id = filter.owned_by_id
                         AND source.entity_uuid = filter.entity_uuid

                        JOIN entity_is_of_type
                          ON source.entity_edition_id = entity_is_of_type.entity_edition_id

                        JOIN ontology_ids
                          ON entity_is_of_type.entity_type_ontology_id = ontology_ids.ontology_id;
                    "#
                ),
                &[
                    &traversal_data.owned_by_ids,
                    &traversal_data.entity_uuids,
                    &traversal_data.entity_revision_ids,
                    &traversal_data.intervals,
                    &traversal_data.pinned_timestamp,
                ],
            )
            .await
            .into_report()
            .change_context(QueryError)?
            .into_iter()
            .map(|row| {
                let index = usize::try_from(row.get::<_, i64>(0) - 1).expect("invalid index");
                SharedEdgeTraversal {
                    left_endpoint: EntityVertexId {
                        base_id: EntityId {
                            owned_by_id: traversal_data.owned_by_ids[index],
                            entity_uuid: traversal_data.entity_uuids[index],
                        },
                        revision_id: traversal_data.entity_revision_ids[index],
                    },
                    right_endpoint: EntityTypeVertexId {
                        base_id: BaseUrl::new(row.get(1)).expect("invalid URL"),
                        revision_id: row.get(2),
                    },
                    resolve_depths: traversal_data.resolve_depths[index],
                    traversal_interval: row.get(3),
                }
            }))
    }

    pub(crate) async fn read_knowledge_edges<'t>(
        &self,
        traversal_data: &'t EntityEdgeTraversalData,
        reference_table: ReferenceTable,
        edge_direction: EdgeDirection,
    ) -> Result<impl Iterator<Item = KnowledgeEdgeTraversal> + 't, QueryError> {
        let (pinned_axis, variable_axis) = match traversal_data.variable_axis {
            TimeAxis::DecisionTime => ("transaction_time", "decision_time"),
            TimeAxis::TransactionTime => ("decision_time", "transaction_time"),
        };

        let table = Table::Reference(reference_table).transpile_to_string();
        let [mut source_1, mut source_2] =
            if let ForeignKeyReference::Double { join, .. } = reference_table.source_relation() {
                [join[0].transpile_to_string(), join[1].transpile_to_string()]
            } else {
                unreachable!("entity reference tables don't have single conditions")
            };
        let [mut target_1, mut target_2] =
            if let ForeignKeyReference::Double { on, .. } = reference_table.target_relation() {
                [on[0].transpile_to_string(), on[1].transpile_to_string()]
            } else {
                unreachable!("entity reference tables don't have single conditions")
            };

        if edge_direction == EdgeDirection::Incoming {
            swap(&mut source_1, &mut target_1);
            swap(&mut source_2, &mut target_2);
        }

        Ok(self
            .client
            .as_client()
            .query(
                &format!(
                    r#"
                        SELECT
                             filter.idx,
                             target.owned_by_id,
                             target.entity_uuid,
                             lower(target.{variable_axis}),
                             target.entity_edition_id,
                             source.{variable_axis} * target.{variable_axis},
                             source.{variable_axis} * target.{variable_axis} * filter.interval
                        FROM unnest($1::uuid[], $2::uuid[], $3::timestamptz[], $4::tstzrange[])
                             WITH ORDINALITY
                             AS filter(owned_by_id, entity_uuid, entity_version, interval, idx)

                        JOIN entity_temporal_metadata AS source
                          ON source.{pinned_axis} @> $5::timestamptz
                         AND lower(source.{variable_axis}) = filter.entity_version
                         AND source.owned_by_id = filter.owned_by_id
                         AND source.entity_uuid = filter.entity_uuid

                        JOIN {table}
                          ON {source_1} = source.owned_by_id
                         AND {source_2} = source.entity_uuid

                        JOIN entity_temporal_metadata AS target
                          ON target.{pinned_axis} @> $5::timestamptz
                         AND target.{variable_axis} && source.{variable_axis}
                         AND target.{variable_axis} && filter.interval
                         AND target.owned_by_id = {target_1}
                         AND target.entity_uuid = {target_2}
                    "#
                ),
                &[
                    &traversal_data.owned_by_ids,
                    &traversal_data.entity_uuids,
                    &traversal_data.entity_revision_ids,
                    &traversal_data.intervals,
                    &traversal_data.pinned_timestamp,
                ],
            )
            .await
            .into_report()
            .change_context(QueryError)?
            .into_iter()
            .map(|row| {
                let index = usize::try_from(row.get::<_, i64>(0) - 1).expect("invalid index");
                KnowledgeEdgeTraversal {
                    left_endpoint: EntityVertexId {
                        base_id: EntityId {
                            owned_by_id: traversal_data.owned_by_ids[index],
                            entity_uuid: traversal_data.entity_uuids[index],
                        },
                        revision_id: traversal_data.entity_revision_ids[index],
                    },
                    right_endpoint: EntityVertexId {
                        base_id: EntityId {
                            owned_by_id: row.get(1),
                            entity_uuid: row.get(2),
                        },
                        revision_id: row.get::<_, Timestamp<()>>(3).cast(),
                    },
                    right_endpoint_edition_id: row.get(4),
                    edge_interval: row.get(5),
                    resolve_depths: traversal_data.resolve_depths[index],
                    traversal_interval: row.get(6),
                }
            }))
    }
}

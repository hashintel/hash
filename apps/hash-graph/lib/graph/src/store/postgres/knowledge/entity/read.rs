use std::{borrow::Cow, mem::swap, str::FromStr};

use async_trait::async_trait;
use error_stack::{Report, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use graph_types::{
    knowledge::{
        entity::{
            Entity, EntityEditionId, EntityId, EntityMetadata, EntityRecordId,
            EntityTemporalMetadata, EntityUuid,
        },
        link::{EntityLinkOrder, LinkData},
    },
    provenance::{OwnedById, ProvenanceMetadata, RecordCreatedById},
};
use temporal_versioning::{
    LeftClosedTemporalInterval, RightBoundedTemporalInterval, TemporalTagged, TimeAxis, Timestamp,
};
use tokio_postgres::GenericClient;
use type_system::url::{BaseUrl, VersionedUrl};
use uuid::Uuid;

use crate::{
    knowledge::EntityQueryPath,
    ontology::EntityTypeQueryPath,
    store::{
        crud,
        postgres::{
            ontology::OntologyId,
            query::{
                Condition, Distinctness, Expression, ForeignKeyReference, Function, Ordering,
                ReferenceTable, SelectCompiler, Table, Transpile,
            },
        },
        query::{Filter, Parameter},
        AsClient, PostgresStore, QueryError, Record,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, KnowledgeGraphEdgeKind, SharedEdgeKind},
        identifier::{EntityTypeVertexId, EntityVertexId},
        temporal_axes::{PinnedAxis, QueryTemporalAxes, VariableAxis},
    },
};

struct CursorParameters<'p> {
    owned_by_id: Parameter<'p>,
    entity_uuid: Parameter<'p>,
    revision_id: Parameter<'p>,
}

#[async_trait]
impl<C: AsClient> crud::Read<Entity> for PostgresStore<C> {
    type Record = Entity;

    type ReadStream = impl futures::Stream<Item = Result<Self::Record, QueryError>> + Send + Sync;

    #[tracing::instrument(level = "info", skip(self))]
    async fn read(
        &self,
        filter: &Filter<Entity>,
        temporal_axes: Option<&QueryTemporalAxes>,
        after: Option<&<Self::Record as Record>::VertexId>,
        limit: Option<usize>,
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
        if let Some(limit) = limit {
            compiler.set_limit(limit);
        }

        let cursor_parameters: Option<CursorParameters> = after.map(|cursor| CursorParameters {
            owned_by_id: Parameter::Uuid(cursor.base_id.owned_by_id.into_uuid()),
            entity_uuid: Parameter::Uuid(cursor.base_id.entity_uuid.into_uuid()),
            revision_id: Parameter::Timestamp(cursor.revision_id.cast()),
        });

        let (owned_by_id_index, entity_uuid_index, (transaction_time_index, decision_time_index)) =
            if let Some(cursor_parameters) = &cursor_parameters {
                let owned_by_id_expression =
                    compiler.compile_parameter(&cursor_parameters.owned_by_id).0;
                let entity_uuid_expression =
                    compiler.compile_parameter(&cursor_parameters.entity_uuid).0;
                let revision_id_expression =
                    compiler.compile_parameter(&cursor_parameters.revision_id).0;
                (
                    compiler.add_cursor_selection(
                        &EntityQueryPath::OwnedById,
                        Ordering::Ascending,
                        |column| Condition::GreaterOrEqual(column, owned_by_id_expression),
                    ),
                    compiler.add_cursor_selection(
                        &EntityQueryPath::Uuid,
                        Ordering::Ascending,
                        |column| Condition::GreaterOrEqual(column, entity_uuid_expression),
                    ),
                    match temporal_axes.map(QueryTemporalAxes::variable_time_axis) {
                        Some(TimeAxis::TransactionTime) => (
                            compiler.add_cursor_selection(
                                &EntityQueryPath::TransactionTime,
                                Ordering::Descending,
                                |column| {
                                    Condition::Less(
                                        Expression::Function(Function::Lower(Box::new(column))),
                                        revision_id_expression,
                                    )
                                },
                            ),
                            compiler.add_selection_path(&EntityQueryPath::DecisionTime),
                        ),
                        Some(TimeAxis::DecisionTime) => (
                            compiler.add_selection_path(&EntityQueryPath::TransactionTime),
                            compiler.add_cursor_selection(
                                &EntityQueryPath::DecisionTime,
                                Ordering::Descending,
                                |column| {
                                    Condition::Less(
                                        Expression::Function(Function::Lower(Box::new(column))),
                                        revision_id_expression,
                                    )
                                },
                            ),
                        ),
                        None => {
                            return Err(Report::new(QueryError).attach_printable(
                                "When specifying the `start` parameter, a temporal axes has to be \
                                 provided",
                            ));
                        }
                    },
                )
            } else {
                // If we neither have `limit` nor `after` we don't need to sort
                let maybe_ascending = limit.map(|_| Ordering::Ascending);
                let maybe_descending = limit.map(|_| Ordering::Descending);
                (
                    compiler.add_distinct_selection_with_ordering(
                        &EntityQueryPath::OwnedById,
                        Distinctness::Distinct,
                        maybe_ascending,
                    ),
                    compiler.add_distinct_selection_with_ordering(
                        &EntityQueryPath::Uuid,
                        Distinctness::Distinct,
                        maybe_ascending,
                    ),
                    (
                        compiler.add_distinct_selection_with_ordering(
                            &EntityQueryPath::TransactionTime,
                            Distinctness::Distinct,
                            maybe_descending.filter(|_| {
                                temporal_axes.map_or(true, |axes| {
                                    axes.variable_time_axis() == TimeAxis::TransactionTime
                                })
                            }),
                        ),
                        compiler.add_distinct_selection_with_ordering(
                            &EntityQueryPath::DecisionTime,
                            Distinctness::Distinct,
                            maybe_descending.filter(|_| {
                                temporal_axes.map_or(true, |axes| {
                                    axes.variable_time_axis() == TimeAxis::DecisionTime
                                })
                            }),
                        ),
                    ),
                )
            };

        let edition_id_index = compiler.add_selection_path(&EntityQueryPath::EditionId);
        let type_id_index = compiler.add_selection_path(&EntityQueryPath::EntityTypeEdge {
            edge_kind: SharedEdgeKind::IsOfType,
            path: EntityTypeQueryPath::VersionedUrl,
            inheritance_depth: Some(0),
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
        let draft_index = compiler.add_selection_path(&EntityQueryPath::Draft);

        compiler.add_filter(filter);
        let (statement, parameters) = compiler.compile();

        let stream = self
            .as_client()
            .query_raw(&statement, parameters.iter().copied())
            .await
            .change_context(QueryError)?
            .map(|row| row.change_context(QueryError))
            .and_then(move |row| async move {
                let entity_type_id =
                    VersionedUrl::from_str(row.get(type_id_index)).change_context(QueryError)?;

                let link_data = {
                    let left_owned_by_id: Option<Uuid> = row.get(left_entity_owned_by_id_index);
                    let left_entity_uuid: Option<Uuid> = row.get(left_entity_uuid_index);
                    let right_owned_by_id: Option<Uuid> = row.get(right_entity_owned_by_id_index);
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
                        ProvenanceMetadata {
                            record_created_by_id,
                            record_archived_by_id: None,
                        },
                        row.get(archived_index),
                        row.get(draft_index),
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
    pub right_endpoint_ontology_id: OntologyId,
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
        depth: Option<u32>,
    ) -> Result<impl Iterator<Item = (OntologyId, SharedEdgeTraversal)> + 't, QueryError> {
        let (pinned_axis, variable_axis) = match traversal_data.variable_axis {
            TimeAxis::DecisionTime => ("transaction_time", "decision_time"),
            TimeAxis::TransactionTime => ("decision_time", "transaction_time"),
        };

        let table = if depth == Some(0) {
            "entity_is_of_type"
        } else {
            "closed_entity_is_of_type"
        };

        let where_statement = match depth {
            Some(depth) if depth != 0 => Cow::Owned(format!(
                "WHERE closed_entity_is_of_type.inheritance_depth <= {depth}"
            )),
            _ => Cow::Borrowed(""),
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
                             ontology_ids.ontology_id,
                             filter.interval * source.{variable_axis}
                        FROM unnest($1::uuid[], $2::uuid[], $3::timestamptz[], $4::tstzrange[])
                             WITH ORDINALITY
                             AS filter(web_id, entity_uuid, entity_version, interval, idx)

                        JOIN entity_temporal_metadata AS source
                          ON source.{pinned_axis} @> $5::timestamptz
                         AND lower(source.{variable_axis}) = filter.entity_version
                         AND source.web_id = filter.web_id
                         AND source.entity_uuid = filter.entity_uuid

                        JOIN {table}
                          ON source.entity_edition_id = {table}.entity_edition_id

                        JOIN ontology_ids
                          ON {table}.entity_type_ontology_id = ontology_ids.ontology_id

                        {where_statement};
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
            .change_context(QueryError)?
            .into_iter()
            .map(|row| {
                let index = usize::try_from(row.get::<_, i64>(0) - 1).expect("invalid index");
                let right_endpoint_ontology_id = row.get(3);
                (
                    right_endpoint_ontology_id,
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
                        right_endpoint_ontology_id,
                        resolve_depths: traversal_data.resolve_depths[index],
                        traversal_interval: row.get(4),
                    },
                )
            }))
    }

    pub(crate) async fn read_knowledge_edges<'t>(
        &self,
        traversal_data: &'t EntityEdgeTraversalData,
        reference_table: ReferenceTable,
        edge_direction: EdgeDirection,
    ) -> Result<impl Iterator<Item = (EntityId, KnowledgeEdgeTraversal)> + 't, QueryError> {
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
                             target.web_id,
                             target.entity_uuid,
                             lower(target.{variable_axis}),
                             target.entity_edition_id,
                             source.{variable_axis} * target.{variable_axis},
                             source.{variable_axis} * target.{variable_axis} * filter.interval
                        FROM unnest($1::uuid[], $2::uuid[], $3::timestamptz[], $4::tstzrange[])
                             WITH ORDINALITY
                             AS filter(web_id, entity_uuid, entity_version, interval, idx)

                        JOIN entity_temporal_metadata AS source
                          ON source.{pinned_axis} @> $5::timestamptz
                         AND lower(source.{variable_axis}) = filter.entity_version
                         AND source.web_id = filter.web_id
                         AND source.entity_uuid = filter.entity_uuid

                        JOIN {table}
                          ON {source_1} = source.web_id
                         AND {source_2} = source.entity_uuid

                        JOIN entity_temporal_metadata AS target
                          ON target.{pinned_axis} @> $5::timestamptz
                         AND target.{variable_axis} && source.{variable_axis}
                         AND target.{variable_axis} && filter.interval
                         AND target.web_id = {target_1}
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
            .change_context(QueryError)?
            .into_iter()
            .map(|row| {
                let index = usize::try_from(row.get::<_, i64>(0) - 1).expect("invalid index");
                let right_endpoint_base_id = EntityId {
                    owned_by_id: row.get(1),
                    entity_uuid: row.get(2),
                };
                (
                    right_endpoint_base_id,
                    KnowledgeEdgeTraversal {
                        left_endpoint: EntityVertexId {
                            base_id: EntityId {
                                owned_by_id: traversal_data.owned_by_ids[index],
                                entity_uuid: traversal_data.entity_uuids[index],
                            },
                            revision_id: traversal_data.entity_revision_ids[index],
                        },
                        right_endpoint: EntityVertexId {
                            base_id: right_endpoint_base_id,
                            revision_id: row.get::<_, Timestamp<()>>(3).cast(),
                        },
                        right_endpoint_edition_id: row.get(4),
                        edge_interval: row.get(5),
                        resolve_depths: traversal_data.resolve_depths[index],
                        traversal_interval: row.get(6),
                    },
                )
            }))
    }
}

use std::{borrow::Cow, mem::swap};

use error_stack::{Result, ResultExt};
use graph_types::{
    knowledge::entity::{EntityEditionId, EntityId, EntityUuid},
    owned_by_id::OwnedById,
};
use temporal_versioning::{
    LeftClosedTemporalInterval, RightBoundedTemporalInterval, TemporalTagged, TimeAxis, Timestamp,
};
use tokio_postgres::GenericClient;
use type_system::url::BaseUrl;

use crate::{
    store::{
        postgres::{
            ontology::OntologyId,
            query::{ForeignKeyReference, ReferenceTable, Table, Transpile},
        },
        AsClient, PostgresStore, QueryError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths},
        identifier::{EntityTypeVertexId, EntityVertexId},
        temporal_axes::{PinnedAxis, VariableAxis},
    },
};

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
    #[tracing::instrument(level = "trace", skip(self))]
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

    #[tracing::instrument(level = "trace", skip(self))]
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

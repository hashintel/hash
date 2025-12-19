use alloc::borrow::Cow;
use std::collections::HashSet;

use error_stack::{Report, ResultExt as _};
use futures::TryStreamExt as _;
use hash_graph_authorization::policies::action::ActionName;
use hash_graph_store::{
    entity::EntityQueryPath,
    error::QueryError,
    filter::Filter,
    subgraph::{
        edges::{
            EdgeDirection, EntityTraversalEdge, EntityTraversalEdgeKind, KnowledgeGraphEdgeKind,
        },
        identifier::{EntityTypeVertexId, EntityVertexId},
        temporal_axes::{PinnedAxis, QueryTemporalAxes, VariableAxis},
    },
};
use hash_graph_temporal_versioning::{
    LeftClosedTemporalInterval, RightBoundedTemporalInterval, TimeAxis, Timestamp,
};
use postgres_types::ToSql;
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;
use type_system::{
    knowledge::{
        Entity,
        entity::id::{EntityEditionId, EntityId, EntityUuid},
    },
    ontology::id::{BaseUrl, OntologyTypeUuid},
    principal::actor_group::WebId,
};

use crate::store::{
    StoreProvider,
    postgres::{AsClient, PostgresStore, query::SelectCompiler},
};

#[derive(Debug)]
pub struct EntityEdgeTraversalData {
    web_ids: Vec<WebId>,
    entity_uuids: Vec<EntityUuid>,
    entity_revision_ids: Vec<Timestamp<VariableAxis>>,
    intervals: Vec<RightBoundedTemporalInterval<VariableAxis>>,
    pub pinned_timestamp: Timestamp<PinnedAxis>,
    pub variable_axis: TimeAxis,
}

impl EntityEdgeTraversalData {
    pub fn with_capacity(temporal_axes: &QueryTemporalAxes, capacity: usize) -> Self {
        Self {
            web_ids: Vec::with_capacity(capacity),
            entity_uuids: Vec::with_capacity(capacity),
            entity_revision_ids: Vec::with_capacity(capacity),
            intervals: Vec::with_capacity(capacity),
            pinned_timestamp: temporal_axes.pinned_timestamp(),
            variable_axis: temporal_axes.variable_time_axis(),
        }
    }

    pub fn push(
        &mut self,
        vertex_id: EntityVertexId,
        interval: RightBoundedTemporalInterval<VariableAxis>,
    ) {
        self.web_ids.push(vertex_id.base_id.web_id);
        self.entity_uuids.push(vertex_id.base_id.entity_uuid);
        self.entity_revision_ids.push(vertex_id.revision_id);
        self.intervals.push(interval);
    }

    pub const fn len(&self) -> usize {
        self.web_ids.len()
    }

    pub const fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

/// The result of an entity-to-ontology edge traversal.
#[derive(Debug)]
pub struct SharedEdgeTraversal {
    pub left_endpoint: EntityVertexId,
    pub right_endpoint: EntityTypeVertexId,
    pub right_endpoint_ontology_id: OntologyTypeUuid,
    pub traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
}

#[derive(Debug)]
pub struct KnowledgeEdgeTraversal {
    pub left_endpoint: EntityVertexId,
    pub right_endpoint: EntityVertexId,
    pub right_endpoint_edition_id: EntityEditionId,
    pub edge_interval: LeftClosedTemporalInterval<VariableAxis>,
    pub traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
}

/// Metadata for edges traversed in a single hop during entity traversal.
#[derive(Debug)]
pub struct EdgeHopMetadata {
    pub edge_kind: KnowledgeGraphEdgeKind,
    pub edge_direction: EdgeDirection,
    pub edges: Vec<KnowledgeEdgeTraversal>,
}

/// Result of traversing entity edges via recursive CTE.
#[derive(Debug, Default)]
pub struct EntityTraversalResult {
    /// All entity edition IDs encountered during traversal (for permission filtering).
    pub entity_edition_ids: Vec<EntityEditionId>,
    /// Edges grouped by hop in traversal order.
    pub edge_hops: Vec<EdgeHopMetadata>,
}

impl<C> PostgresStore<C>
where
    C: AsClient,
{
    #[tracing::instrument(level = "info", skip(self))]
    pub(crate) async fn read_shared_edges<'t>(
        &self,
        traversal_data: &'t EntityEdgeTraversalData,
        depth: Option<u32>,
    ) -> Result<
        impl Iterator<Item = (OntologyTypeUuid, SharedEdgeTraversal)> + 't,
        Report<QueryError>,
    > {
        let (pinned_axis, variable_axis) = match traversal_data.variable_axis {
            TimeAxis::DecisionTime => ("transaction_time", "decision_time"),
            TimeAxis::TransactionTime => ("decision_time", "transaction_time"),
        };

        let where_statement = depth.map_or(Cow::Borrowed(""), |depth| {
            Cow::Owned(format!(
                "WHERE entity_is_of_type.inheritance_depth <= {depth}"
            ))
        });

        Ok(self
            .client
            .as_client()
            .query(
                &format!(
                    "
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

                        JOIN entity_is_of_type
                          ON source.entity_edition_id = entity_is_of_type.entity_edition_id

                        JOIN ontology_ids
                          ON entity_is_of_type.entity_type_ontology_id = ontology_ids.ontology_id

                        {where_statement};
                    "
                ),
                &[
                    &traversal_data.web_ids,
                    &traversal_data.entity_uuids,
                    &traversal_data.entity_revision_ids,
                    &traversal_data.intervals,
                    &traversal_data.pinned_timestamp,
                ],
            )
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(QueryError)?
            .into_iter()
            .map(|row| {
                let index = usize::try_from(row.get::<_, i64>(0) - 1).expect("invalid index");
                let right_endpoint_ontology_id = row.get(3);
                (
                    right_endpoint_ontology_id,
                    #[expect(
                        clippy::indexing_slicing,
                        reason = "index is guaranteed to be in bounds"
                    )]
                    SharedEdgeTraversal {
                        left_endpoint: EntityVertexId {
                            base_id: EntityId {
                                web_id: traversal_data.web_ids[index],
                                entity_uuid: traversal_data.entity_uuids[index],
                                draft_id: None,
                            },
                            revision_id: traversal_data.entity_revision_ids[index],
                        },
                        right_endpoint: EntityTypeVertexId {
                            base_id: BaseUrl::new(row.get(1)).expect("invalid URL"),
                            revision_id: row.get(2),
                        },
                        right_endpoint_ontology_id,
                        traversal_interval: row.get(4),
                    },
                )
            }))
    }

    /// Filters entity edition IDs by permission policies.
    ///
    /// Queries the database to determine which of the provided entity edition IDs are permitted
    /// for the current actor based on their policies. This allows efficient batch permission
    /// checking for multiple entities at once.
    ///
    /// Returns a [`HashSet`] of permitted entity edition IDs. If no policy components are
    /// provided (i.e., no permission checks required), returns `None` which should be
    /// interpreted as "all entities permitted".
    ///
    /// # Arguments
    ///
    /// * `entity_edition_ids` - All entity edition IDs to check permissions for
    /// * `pinned_timestamp` - Timestamp for the pinned temporal axis
    /// * `variable_axis` - Which temporal axis is variable (decision time or transaction time)
    /// * `provider` - Store provider containing policy components for permission checks
    ///
    /// # Errors
    ///
    /// Returns [`QueryError`] if the permission query fails.
    #[tracing::instrument(level = "info", skip_all)]
    pub(crate) async fn filter_knowledge_edges(
        &self,
        entity_edition_ids: &[EntityEditionId],
        temporal_bounds: &QueryTemporalAxes,
        provider: &StoreProvider<'_, Self>,
    ) -> Result<Option<HashSet<EntityEditionId>>, Report<QueryError>> {
        let permitted_entity_edition_ids =
            if let Some(policy_components) = provider.policy_components {
                let mut compiler = SelectCompiler::new(Some(temporal_bounds), true);

                let entity_editions_filter = Filter::for_entity_edition_ids(entity_edition_ids);
                compiler
                    .add_filter(&entity_editions_filter)
                    .change_context(QueryError)?;

                // TODO: Ideally, we'd incorporate the filter in the above query, but that's
                //       not easily possible as the query above uses features that the query
                //       compiler does not support yet.
                let permission_filter = Filter::<Entity>::for_policies(
                    policy_components.extract_filter_policies(ActionName::ViewEntity),
                    policy_components.actor_id(),
                    policy_components.optimization_data(ActionName::ViewEntity),
                );
                compiler
                    .add_filter(&permission_filter)
                    .change_context(QueryError)?;

                let edition_id_idx = compiler.add_selection_path(&EntityQueryPath::EditionId);

                let (statement, parameters) = compiler.compile();

                Some(
                    provider
                        .store
                        .as_client()
                        .query_raw(&statement, parameters.iter().copied())
                        .instrument(tracing::info_span!(
                            "SELECT",
                            otel.kind = "client",
                            db.system = "postgresql",
                            peer.service = "Postgres",
                            db.query.text = statement,
                        ))
                        .instrument(tracing::trace_span!("query_permitted_entity_edition_ids"))
                        .await
                        .change_context(QueryError)?
                        .map_ok(|row| row.get::<_, EntityEditionId>(edition_id_idx))
                        .try_collect::<HashSet<_>>()
                        .instrument(tracing::trace_span!("collect_permitted_entity_edition_ids"))
                        .await
                        .change_context(QueryError)?,
                )
            } else {
                None
            };

        Ok(permitted_entity_edition_ids)
    }

    /// Reads knowledge graph edges by traversing entity relationships.
    ///
    /// Executes a recursive CTE query that traverses all edges at once, to avoid an N+1 query
    /// pattern where each edge would require a separate database call.
    ///
    /// The implementation uses the unified `entity_edge` table which stores both edge kinds
    /// (`has_left_entity`, `has_right_entity`) and directions (`outgoing`, `incoming`) as
    /// explicit columns. Each edge is stored bidirectionally, enabling efficient traversal in
    /// both directions without UNION ALL operations.
    ///
    /// The CTE uses array-based edge configuration to specify which edge kind and direction to
    /// follow at each depth level, allowing arbitrary traversal patterns through the entity
    /// graph.
    ///
    /// # Errors
    ///
    /// Returns [`QueryError`] if the database query fails during traversal.
    #[tracing::instrument(level = "info", skip_all)]
    #[expect(clippy::too_many_lines)]
    pub(crate) async fn read_knowledge_edges(
        &self,
        entities: impl IntoIterator<
            Item = &(EntityVertexId, RightBoundedTemporalInterval<VariableAxis>),
        >,
        edges: &[EntityTraversalEdge],
        temporal_axes: &QueryTemporalAxes,
    ) -> Result<EntityTraversalResult, Report<QueryError>> {
        // Fast path: No edges to traverse
        if edges.is_empty() {
            return Ok(EntityTraversalResult {
                entity_edition_ids: Vec::new(),
                edge_hops: Vec::new(),
            });
        }

        let entities = entities.into_iter();
        // Build traversal data from starting entities
        let mut traversal_data =
            EntityEdgeTraversalData::with_capacity(temporal_axes, entities.size_hint().0);

        for (entity_vertex_id, traversal_interval) in entities {
            traversal_data.push(*entity_vertex_id, *traversal_interval);
        }

        // Build edge configuration: encode each edge as (kind, direction) tuple
        // This tells the CTE which edges to follow at each depth level
        let (edge_kinds, edge_directions) = edges
            .iter()
            .map(|edge| match edge {
                EntityTraversalEdge::HasLeftEntity { direction } => {
                    (EntityTraversalEdgeKind::HasLeftEntity, *direction)
                }
                EntityTraversalEdge::HasRightEntity { direction } => {
                    (EntityTraversalEdgeKind::HasRightEntity, *direction)
                }
            })
            .collect::<(Vec<_>, Vec<_>)>();

        #[expect(
            clippy::cast_possible_truncation,
            clippy::cast_possible_wrap,
            reason = "edge count is bounded by query complexity limits"
        )]
        let max_depth = edges.len() as i32;
        let (pinned_axis, variable_axis) = match traversal_data.variable_axis {
            TimeAxis::DecisionTime => ("transaction_time", "decision_time"),
            TimeAxis::TransactionTime => ("decision_time", "transaction_time"),
        };

        // Execute recursive CTE
        //
        // The CTE structure:
        // 1. Base case: Start with input entities from traversal_data
        // 2. Recursive case: Join entity_edge table, then add temporal metadata joins
        // 3. Filter edges by configuration array at each depth
        // 4. Track source entity for each edge (needed to reconstruct edge topology)
        self.client
            .as_client()
            .query_raw(
                &format!(
                    "
                    WITH RECURSIVE traversal AS (
                        -- Base case: starting entities
                        SELECT
                            filter.web_id AS source_web_id,
                            filter.entity_uuid AS source_entity_uuid,
                            filter.entity_version AS source_entity_version,
                            source.entity_edition_id AS source_edition_id,
                            filter.web_id AS current_web_id,
                            filter.entity_uuid AS current_entity_uuid,
                            filter.entity_version AS current_entity_version,
                            source.entity_edition_id AS current_edition_id,
                            source.{variable_axis} AS current_variable_interval,
                            filter.interval AS traversal_interval,
                            0::int AS depth,
                            NULL::entity_edge_kind AS edge_kind,
                            NULL::edge_direction AS edge_direction
                        FROM unnest(
                            $1::uuid[],
                            $2::uuid[],
                            $3::timestamptz[],
                            $4::tstzrange[]
                        ) AS filter(web_id, entity_uuid, entity_version, interval)
                        JOIN entity_temporal_metadata AS source
                          ON source.{pinned_axis} @> $5::timestamptz
                         AND lower(source.{variable_axis}) = filter.entity_version
                         AND source.web_id = filter.web_id
                         AND source.entity_uuid = filter.entity_uuid

                        UNION ALL

                        -- Recursive case: follow edges based on configuration
                        SELECT
                            trav.current_web_id,
                            trav.current_entity_uuid,
                            trav.current_entity_version,
                            trav.current_edition_id,
                            target.web_id,
                            target.entity_uuid,
                            lower(target.{variable_axis}),
                            target.entity_edition_id,
                            target.{variable_axis},
                            trav.traversal_interval * target.{variable_axis},
                            trav.depth + 1,
                            edge.kind,
                            edge.direction
                        FROM traversal AS trav

                        -- Join with unified edge table
                        JOIN entity_edge AS edge
                          ON edge.source_web_id = trav.current_web_id
                         AND edge.source_entity_uuid = trav.current_entity_uuid
                         -- Filter by edge configuration for this depth level
                         -- Array indexing returns NULL if depth+1 exceeds array bounds,
                         -- but this is prevented by WHERE trav.depth < $8 below
                         AND edge.kind = ($6::entity_edge_kind[])[trav.depth + 1]
                         AND edge.direction = ($7::edge_direction[])[trav.depth + 1]

                        -- Join source entity temporal metadata
                        JOIN entity_temporal_metadata AS source
                          ON source.web_id = edge.source_web_id
                         AND source.entity_uuid = edge.source_entity_uuid
                         AND source.{pinned_axis} @> $5::timestamptz

                        -- Join target entity temporal metadata
                        -- TODO: Consider moving temporal metadata into edge table to reduce joins
                        JOIN entity_temporal_metadata AS target
                          ON target.web_id = edge.target_web_id
                         AND target.entity_uuid = edge.target_entity_uuid
                         AND target.{pinned_axis} @> $5::timestamptz
                         AND target.{variable_axis} && source.{variable_axis}
                         AND target.{variable_axis} && trav.traversal_interval
                         -- Ensure traversal interval is valid
                         AND NOT isempty(trav.traversal_interval * target.{variable_axis})
                        -- Depth limit prevents array out-of-bounds in edge configuration access
                        WHERE trav.depth < $8
                    )
                    SELECT
                        source_web_id,
                        source_entity_uuid,
                        source_entity_version,
                        current_web_id,
                        current_entity_uuid,
                        current_entity_version,
                        current_edition_id,
                        current_variable_interval,
                        traversal_interval,
                        depth,
                        edge_kind,
                        edge_direction
                    FROM traversal
                    WHERE depth > 0  -- Exclude base case entities from results
                    ORDER BY depth, source_web_id, source_entity_uuid, current_web_id, \
                     current_entity_uuid
                    "
                ),
                [
                    &traversal_data.web_ids as &(dyn ToSql + Sync),
                    &traversal_data.entity_uuids,
                    &traversal_data.entity_revision_ids,
                    &traversal_data.intervals,
                    &traversal_data.pinned_timestamp,
                    &edge_kinds,
                    &edge_directions,
                    &max_depth,
                ],
            )
            .instrument(tracing::info_span!(
                "SELECT (recursive CTE)",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(QueryError)?
            .try_fold(
                EntityTraversalResult::default(),
                |mut traversal_result, row| async move {
                    #[expect(
                        clippy::cast_sign_loss,
                        reason = "depth is always positive in the query"
                    )]
                    let depth = row.get::<_, i32>(9) as usize - 1; // depth starts at 1, arrays at 0

                    // Ensure edge_hops has entry for this depth level
                    while traversal_result.edge_hops.len() <= depth {
                        traversal_result.edge_hops.push(EdgeHopMetadata {
                            edge_kind: row.get(10),
                            edge_direction: row.get(11),
                            edges: Vec::new(),
                        });
                    }

                    let right_endpoint_edition_id: EntityEditionId = row.get(6);
                    traversal_result
                        .entity_edition_ids
                        .push(right_endpoint_edition_id);

                    let edge = KnowledgeEdgeTraversal {
                        left_endpoint: EntityVertexId {
                            base_id: EntityId {
                                web_id: row.get(0),
                                entity_uuid: row.get(1),
                                draft_id: None,
                            },
                            revision_id: row.get(2),
                        },
                        right_endpoint: EntityVertexId {
                            base_id: EntityId {
                                web_id: row.get(3),
                                entity_uuid: row.get(4),
                                draft_id: None,
                            },
                            revision_id: row.get(5),
                        },
                        right_endpoint_edition_id,
                        edge_interval: row.get(7),
                        traversal_interval: row.get(8),
                    };

                    #[expect(
                        clippy::indexing_slicing,
                        reason = "depth_idx is valid: just ensured edge_hops.len() > depth_idx"
                    )]
                    traversal_result.edge_hops[depth].edges.push(edge);

                    Ok(traversal_result)
                },
            )
            .instrument(tracing::trace_span!("parse_cte_results"))
            .await
            .change_context(QueryError)
    }
}

use alloc::borrow::Cow;
use core::mem::swap;
use std::collections::HashSet;

use error_stack::{Report, ResultExt as _};
use futures::TryStreamExt as _;
use hash_graph_authorization::policies::action::ActionName;
use hash_graph_store::{
    entity::EntityQueryPath,
    error::QueryError,
    filter::Filter,
    subgraph::{
        edges::{EdgeDirection, EntityTraversalEdge, KnowledgeGraphEdgeKind},
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
    postgres::{
        AsClient, PostgresStore,
        query::{ForeignKeyReference, ReferenceTable, SelectCompiler, Table, Transpile as _},
    },
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
pub struct SharedEdgeTraversal {
    pub left_endpoint: EntityVertexId,
    pub right_endpoint: EntityTypeVertexId,
    pub right_endpoint_ontology_id: OntologyTypeUuid,
    pub traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
}

pub struct KnowledgeEdgeTraversal {
    pub left_endpoint: EntityVertexId,
    pub right_endpoint: EntityVertexId,
    pub right_endpoint_edition_id: EntityEditionId,
    pub edge_interval: LeftClosedTemporalInterval<VariableAxis>,
    pub traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
}

/// Metadata for edges traversed in a single hop during entity traversal.
pub struct EdgeHopMetadata {
    pub edge_kind: KnowledgeGraphEdgeKind,
    pub edge_direction: EdgeDirection,
    pub edges: Vec<KnowledgeEdgeTraversal>,
}

/// Result of traversing entity edges, either via CTE or sequential queries.
pub struct EntityTraversalResult {
    /// All entity edition IDs encountered during traversal (for permission filtering)
    pub entity_edition_ids: Vec<EntityEditionId>,
    /// Edges grouped by hop in traversal order
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

    #[tracing::instrument(level = "info", skip(self, traversal_data))]
    #[expect(clippy::too_many_lines)]
    pub(crate) async fn read_knowledge_edges(
        &self,
        traversal_data: &EntityEdgeTraversalData,
        reference_table: ReferenceTable,
        edge_direction: EdgeDirection,
    ) -> Result<(Vec<EntityEditionId>, Vec<KnowledgeEdgeTraversal>), Report<QueryError>> {
        let (pinned_axis, variable_axis) = match traversal_data.variable_axis {
            TimeAxis::DecisionTime => ("transaction_time", "decision_time"),
            TimeAxis::TransactionTime => ("decision_time", "transaction_time"),
        };

        let table = Table::Reference(reference_table).transpile_to_string();
        let [mut source_1, mut source_2] =
            if let ForeignKeyReference::Double { join, .. } = reference_table.source_relation() {
                [
                    join[0].to_expression(None).transpile_to_string(),
                    join[1].to_expression(None).transpile_to_string(),
                ]
            } else {
                unreachable!("entity reference tables don't have single conditions")
            };
        let [mut target_1, mut target_2] =
            if let ForeignKeyReference::Double { on, .. } = reference_table.target_relation() {
                [
                    on[0].to_expression(None).transpile_to_string(),
                    on[1].to_expression(None).transpile_to_string(),
                ]
            } else {
                unreachable!("entity reference tables don't have single conditions")
            };

        if edge_direction == EdgeDirection::Incoming {
            swap(&mut source_1, &mut target_1);
            swap(&mut source_2, &mut target_2);
        }

        self.client
            .as_client()
            .query_raw(
                &format!(
                    "
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
                         AND NOT isempty(
                            source.{variable_axis} * target.{variable_axis} * filter.interval
                         )
                         AND target.web_id = {target_1}
                         AND target.entity_uuid = {target_2}
                    "
                ),
                [
                    &traversal_data.web_ids as &(dyn ToSql + Sync),
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
            .map_ok(|row| {
                let index = usize::try_from(row.get::<_, i64>(0) - 1).expect("invalid index");
                let right_endpoint_edition_id = row.get(4);
                (
                    right_endpoint_edition_id,
                    #[expect(
                        clippy::indexing_slicing,
                        reason = "index is guaranteed to be in bounds"
                    )]
                    KnowledgeEdgeTraversal {
                        left_endpoint: EntityVertexId {
                            base_id: EntityId {
                                web_id: traversal_data.web_ids[index],
                                entity_uuid: traversal_data.entity_uuids[index],
                                draft_id: None,
                            },
                            revision_id: traversal_data.entity_revision_ids[index],
                        },
                        right_endpoint: EntityVertexId {
                            base_id: EntityId {
                                web_id: row.get(1),
                                entity_uuid: row.get(2),
                                draft_id: None,
                            },
                            revision_id: row.get(3),
                        },
                        right_endpoint_edition_id,
                        edge_interval: row.get(5),
                        traversal_interval: row.get(6),
                    },
                )
            })
            .try_collect::<(Vec<_>, Vec<_>)>()
            .instrument(tracing::trace_span!("collect_edges"))
            .await
            .change_context(QueryError)
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

    /// Traverses multiple entity edges in a single recursive CTE query.
    ///
    /// This function is designed to replace the N+1 query pattern where [`read_knowledge_edges`]
    /// is called sequentially for each edge. Instead, it executes a single PostgreSQL recursive
    /// CTE that traverses all edges at once, performing automatic interval merging and
    /// deduplication.
    ///
    /// # Arguments
    ///
    /// * `traversal_data` - Starting entities with their temporal intervals
    /// * `edges` - Sequence of entity edges to traverse (e.g., `[HasLeftEntity, HasRightEntity]`)
    /// * `provider` - Store provider for permission checks (applied after traversal)
    ///
    /// # Returns
    ///
    /// Returns an iterator of [`KnowledgeEdgeTraversal`] representing the final entities reached
    /// after traversing all edges, with merged intervals for entities reached through multiple
    /// paths.
    ///
    /// # Implementation Status
    ///
    /// **Phase 0**: This is currently a stub that returns an empty iterator. The recursive CTE
    /// implementation will be added in subsequent phases:
    ///
    /// - Phase 1: Basic CTE structure without deduplication
    /// - Phase 2: Multirange-based interval merging
    /// - Phase 3: Full integration with permission filtering
    ///
    /// # Errors
    ///
    /// Returns [`QueryError`] if the database query fails or permission filtering encounters an
    /// error.
    /// Executes a recursive CTE query to traverse multiple entity edges in a single query.
    ///
    /// This method replaces the N+1 query pattern by executing a single PostgreSQL recursive CTE
    /// that traverses all edges at once, performing automatic interval merging and deduplication
    /// using PostgreSQL's multirange types.
    ///
    /// # Arguments
    ///
    /// * `traversal_data` - Starting entities with their temporal intervals
    /// * `edges` - Sequence of edges to traverse (e.g., `[HasLeftEntity, HasRightEntity]`)
    ///
    /// # Returns
    ///
    /// Returns [`EntityTraversalResult`] on success, or `None` if the CTE cannot be used for
    /// this configuration (e.g., unsupported edge types or query complexity).
    ///
    /// # Errors
    ///
    /// Returns [`QueryError`] if the database query fails.
    #[tracing::instrument(level = "info", skip_all)]
    pub(crate) async fn read_knowledge_edges_recursive(
        &self,
        _traversal_data: &EntityEdgeTraversalData,
        _edges: &[EntityTraversalEdge],
    ) -> Result<Option<EntityTraversalResult>, Report<QueryError>> {
        // TODO: Implement recursive CTE query
        //
        // The query will:
        // 1. Build edge configuration arrays (edge_types, edge_directions)
        // 2. Execute recursive CTE with:
        //    - Base case: Starting entities from traversal_data
        //    - Recursive case: UNION ALL over 4 edge combinations (left/right, incoming/outgoing)
        //    - Deduplication: GROUP BY (entity, depth) with range_agg() for interval merging
        // 3. Return all depths, group edges by hop

        // For now, return None to use sequential fallback
        Ok(None)
    }
}

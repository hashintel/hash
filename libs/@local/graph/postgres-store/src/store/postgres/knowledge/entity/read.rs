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
        edges::{EdgeDirection, GraphResolveDepths},
        identifier::{EntityTypeVertexId, EntityVertexId},
        temporal_axes::{
            PinnedAxis, PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableAxis,
            VariableTemporalAxisUnresolved,
        },
    },
};
use hash_graph_temporal_versioning::{
    LeftClosedTemporalInterval, RightBoundedTemporalInterval, TemporalTagged as _, TimeAxis,
    Timestamp,
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
    resolve_depths: Vec<GraphResolveDepths>,
    pinned_timestamp: Timestamp<PinnedAxis>,
    variable_axis: TimeAxis,
}

impl EntityEdgeTraversalData {
    pub const fn new(pinned_timestamp: Timestamp<PinnedAxis>, variable_axis: TimeAxis) -> Self {
        Self {
            web_ids: Vec::new(),
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
        self.web_ids.push(vertex_id.base_id.web_id);
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
    pub right_endpoint_ontology_id: OntologyTypeUuid,
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
                        resolve_depths: traversal_data.resolve_depths[index],
                        traversal_interval: row.get(4),
                    },
                )
            }))
    }

    #[tracing::instrument(level = "info", skip(self, provider))]
    #[expect(clippy::too_many_lines)]
    pub(crate) async fn read_knowledge_edges<'t>(
        &self,
        traversal_data: &'t EntityEdgeTraversalData,
        reference_table: ReferenceTable,
        edge_direction: EdgeDirection,
        provider: &StoreProvider<'_, Self>,
    ) -> Result<impl Iterator<Item = KnowledgeEdgeTraversal> + 't, Report<QueryError>> {
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

        let (entity_edition_ids, edges) = self
            .client
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
                        resolve_depths: traversal_data.resolve_depths[index],
                        traversal_interval: row.get(6),
                    },
                )
            })
            .try_collect::<(Vec<_>, Vec<_>)>()
            .instrument(tracing::trace_span!("collect_edges"))
            .await
            .change_context(QueryError)?;

        let permitted_entity_edition_ids =
            if let Some(policy_components) = provider.policy_components {
                let temporal_bounds = match traversal_data.variable_axis {
                    TimeAxis::DecisionTime => QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(Some(
                            traversal_data.pinned_timestamp.cast(),
                        )),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    },
                    TimeAxis::TransactionTime => QueryTemporalAxesUnresolved::TransactionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(Some(
                            traversal_data.pinned_timestamp.cast(),
                        )),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    },
                }
                .resolve();
                let mut compiler = SelectCompiler::new(Some(&temporal_bounds), true);

                let entity_editions_filter = Filter::for_entity_edition_ids(&entity_edition_ids);
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

        Ok(edges.into_iter().filter(move |edge| {
            let Some(permitted_entity_edition_ids) = &permitted_entity_edition_ids else {
                return true;
            };
            permitted_entity_edition_ids.contains(&edge.right_endpoint_edition_id)
        }))
    }
}

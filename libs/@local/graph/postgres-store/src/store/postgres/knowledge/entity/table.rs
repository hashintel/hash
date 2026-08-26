//! The dedicated entities-table read: summary, count, and page in one
//! transaction.
//!
//! The table endpoint answers the entities table views with flat rows built from
//! materialized columns. When no explicit type filter is given, the visible-type
//! universe is derived from the summary and sent into the page query as an
//! include list — an indexable, estimable type clause the planner can work with,
//! where the bare scope filter alone provokes pathological plans. The count
//! rides along in the summary scan when the page carries no narrowing filters,
//! and runs as its own statement otherwise. Follow-up pages continue on the
//! first page's database state through the cursor.

use alloc::borrow::Cow;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use futures::TryStreamExt as _;
use hash_graph_authorization::policies::{MergePolicies, PolicyComponents, action::ActionName};
use hash_graph_store::{
    entity::{
        EntityQueryCursor, EntityQueryPath, EntityQuerySorting, EntityQuerySortingRecord,
        EntityTableCursor, EntityTableLinkEndpoint, EntityTablePropertyFilter,
        EntityTablePropertyValue, EntityTableRow, EntityTableSortKey, EntityTableSorting,
        EntityTableSummary, EntityTableWebScope, QueryEntitiesTableParams,
        QueryEntitiesTableResponse, TYPE_UNIVERSE_LIMIT,
    },
    entity_type::{EntityTypeQueryPath, EntityTypeStore as _, IncludeEntityTypeOption},
    error::QueryError,
    filter::{
        Filter, FilterExpression, FilterExpressionList, JsonPath, Parameter, ParameterList,
        PathToken, protection::transform_filter,
    },
    query::CursorField,
    subgraph::{
        edges::{EdgeDirection, KnowledgeGraphEdgeKind, SharedEdgeKind},
        temporal_axes::{
            PinnedTemporalAxis, QueryTemporalAxes, QueryTemporalAxesUnresolved,
            VariableTemporalAxis,
        },
    },
};
use hash_graph_temporal_versioning::{
    ClosedTemporalBound, DecisionTime, LeftClosedTemporalInterval, LimitedTemporalBound,
    TemporalBound, TemporalTagged as _, Timestamp, TransactionTime,
};
use serde::Deserialize as _;
use tokio_postgres::{GenericClient as _, Row};
use tracing::Instrument as _;
use type_system::{
    knowledge::{
        Entity,
        entity::id::{EntityEditionId, EntityId},
        property::metadata::PropertyObjectMetadata,
    },
    ontology::{VersionedUrl, entity_type::EntityTypeUuid},
    principal::{actor::ActorId, actor_group::WebId},
};

use crate::store::{
    AsClient, PostgresStore,
    postgres::{
        InTransaction,
        knowledge::entity::summary::{
            Deduplication, EntitySummaries, EntitySummaryQuery, EntitySummaryRequest,
        },
        query::{PostgresSorting as _, SelectCompiler, StatementShape},
    },
    validation::StoreProvider,
};

/// Column indices of the row selections in the compiled page statement.
struct RowIndices {
    web_id: usize,
    entity_uuid: usize,
    draft_id: usize,
    edition_id: usize,
    label: usize,
    type_versioned_urls: usize,
    type_titles: usize,
    direct_type_count: usize,
    created_at_transaction_time: usize,
    created_at_decision_time: usize,
    decision_time: usize,
    created_by: usize,
    edition_created_by: usize,
    archived: usize,
    properties: usize,
    property_metadata: usize,
    source_entity: LinkEndpointIndices,
    target_entity: LinkEndpointIndices,
}

/// Column indices of one endpoint's selections in the compiled page statement.
///
/// Every column reads `NULL` on non-link rows, which [`Self::decode`] folds
/// into [`None`].
struct LinkEndpointIndices {
    web_id: usize,
    entity_uuid: usize,
    edition_id: usize,
    label: usize,
    type_versioned_urls: usize,
    direct_type_count: usize,
}

/// The [`EntityQueryPath`]s selecting one endpoint of a link row.
///
/// [`SelectCompiler::add_selection_path`] borrows its paths for the compiled
/// statement's lifetime, and [`EntityQueryPath::EntityEdge`] allocates — the
/// paths need an owner that outlives the compiler.
struct LinkEndpointPaths {
    web_id: EntityQueryPath<'static>,
    entity_uuid: EntityQueryPath<'static>,
    edition_id: EntityQueryPath<'static>,
    label: EntityQueryPath<'static>,
    type_versioned_urls: EntityQueryPath<'static>,
    direct_type_count: EntityQueryPath<'static>,
}

impl LinkEndpointPaths {
    fn new(edge_kind: KnowledgeGraphEdgeKind) -> Self {
        let endpoint_path = |path: EntityQueryPath<'static>| EntityQueryPath::EntityEdge {
            edge_kind,
            path: Box::new(path),
            direction: EdgeDirection::Outgoing,
        };

        Self {
            web_id: endpoint_path(EntityQueryPath::WebId),
            entity_uuid: endpoint_path(EntityQueryPath::Uuid),
            edition_id: endpoint_path(EntityQueryPath::EditionId),
            label: endpoint_path(EntityQueryPath::FirstLabel),
            type_versioned_urls: endpoint_path(EntityQueryPath::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path: EntityTypeQueryPath::VersionedUrl,
                inheritance_depth: None,
            }),
            direct_type_count: endpoint_path(EntityQueryPath::DirectTypeCount),
        }
    }
}

/// The allocating [`EntityQueryPath`]s among a table row's selections.
struct RowPaths {
    source_entity: LinkEndpointPaths,
    target_entity: LinkEndpointPaths,
}

impl RowPaths {
    fn new() -> Self {
        Self {
            source_entity: LinkEndpointPaths::new(KnowledgeGraphEdgeKind::HasLeftEntity),
            target_entity: LinkEndpointPaths::new(KnowledgeGraphEdgeKind::HasRightEntity),
        }
    }
}

impl LinkEndpointIndices {
    fn install<'p>(
        compiler: &mut SelectCompiler<'p, '_, Entity>,
        paths: &'p LinkEndpointPaths,
    ) -> Self {
        Self {
            web_id: compiler.add_selection_path(&paths.web_id),
            entity_uuid: compiler.add_selection_path(&paths.entity_uuid),
            edition_id: compiler.add_selection_path(&paths.edition_id),
            label: compiler.add_selection_path(&paths.label),
            type_versioned_urls: compiler.add_selection_path(&paths.type_versioned_urls),
            direct_type_count: compiler.add_selection_path(&paths.direct_type_count),
        }
    }

    fn decode(&self, row: &Row) -> Option<(EntityTableLinkEndpoint, EntityEditionId)> {
        let web_id = row.get::<_, Option<_>>(self.web_id)?;
        let entity_uuid = row.get::<_, Option<_>>(self.entity_uuid)?;
        let edition_id = row.get::<_, Option<EntityEditionId>>(self.edition_id)?;
        // The edition cache is maintained in the same transaction as the
        // editions, so a matched edition always has its cache row and the
        // cache columns read non-null, like the row's own decode.
        let direct_type_count = usize::try_from(row.get::<_, i32>(self.direct_type_count))
            .expect("the direct type count should be non-negative");

        Some((
            EntityTableLinkEndpoint {
                entity_id: EntityId {
                    web_id,
                    entity_uuid,
                    draft_id: None,
                },
                label: row.get(self.label),
                entity_type_ids: row
                    .get::<_, Vec<VersionedUrl>>(self.type_versioned_urls)
                    .into_iter()
                    .take(direct_type_count)
                    .collect(),
            },
            edition_id,
        ))
    }
}

impl RowIndices {
    fn install<'p>(compiler: &mut SelectCompiler<'p, '_, Entity>, paths: &'p RowPaths) -> Self {
        Self {
            web_id: compiler.add_selection_path(&EntityQueryPath::WebId),
            entity_uuid: compiler.add_selection_path(&EntityQueryPath::Uuid),
            draft_id: compiler.add_selection_path(&EntityQueryPath::DraftId),
            edition_id: compiler.add_selection_path(&EntityQueryPath::EditionId),
            label: compiler.add_selection_path(&EntityQueryPath::FirstLabel),
            type_versioned_urls: compiler.add_selection_path(&EntityQueryPath::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path: EntityTypeQueryPath::VersionedUrl,
                inheritance_depth: None,
            }),
            type_titles: compiler.add_selection_path(&EntityQueryPath::EntityTypeEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path: EntityTypeQueryPath::Title,
                inheritance_depth: None,
            }),
            direct_type_count: compiler.add_selection_path(&EntityQueryPath::DirectTypeCount),
            created_at_transaction_time: compiler
                .add_selection_path(&EntityQueryPath::CreatedAtTransactionTime),
            created_at_decision_time: compiler
                .add_selection_path(&EntityQueryPath::CreatedAtDecisionTime),
            decision_time: compiler.add_selection_path(&EntityQueryPath::DecisionTime),
            created_by: compiler.add_selection_path(&EntityQueryPath::CreatedById),
            edition_created_by: compiler.add_selection_path(&EntityQueryPath::EditionCreatedById),
            archived: compiler.add_selection_path(&EntityQueryPath::Archived),
            properties: compiler.add_selection_path(&EntityQueryPath::Properties(None)),
            property_metadata: compiler
                .add_selection_path(&EntityQueryPath::PropertyMetadata(None)),
            source_entity: LinkEndpointIndices::install(compiler, &paths.source_entity),
            target_entity: LinkEndpointIndices::install(compiler, &paths.target_entity),
        }
    }

    fn decode(&self, row: &Row) -> (EntityTableRow, LinkEndpointEditions) {
        let direct_type_count = usize::try_from(row.get::<_, i32>(self.direct_type_count))
            .expect("the direct type count should be non-negative");

        let decision_time =
            row.get::<_, LeftClosedTemporalInterval<DecisionTime>>(self.decision_time);
        let (ClosedTemporalBound::Inclusive(edition_created_at_decision_time), _) =
            decision_time.into_bounds();

        let source_entity = self.source_entity.decode(row);
        let target_entity = self.target_entity.decode(row);
        let editions = LinkEndpointEditions {
            source: source_entity.as_ref().map(|(_, edition_id)| *edition_id),
            target: target_entity.as_ref().map(|(_, edition_id)| *edition_id),
        };

        let row = EntityTableRow {
            entity_id: EntityId {
                web_id: row.get(self.web_id),
                entity_uuid: row.get(self.entity_uuid),
                draft_id: row.get(self.draft_id),
            },
            entity_edition_id: row.get(self.edition_id),
            label: row.get(self.label),
            entity_type_ids: row
                .get::<_, Vec<VersionedUrl>>(self.type_versioned_urls)
                .into_iter()
                .take(direct_type_count)
                .collect(),
            entity_type_titles: row
                .get::<_, Vec<String>>(self.type_titles)
                .into_iter()
                .take(direct_type_count)
                .collect(),
            created_at_transaction_time: row.get(self.created_at_transaction_time),
            created_at_decision_time: row.get(self.created_at_decision_time),
            edition_created_at_decision_time,
            created_by: row.get(self.created_by),
            last_edited_by: row.get(self.edition_created_by),
            archived: row.get(self.archived),
            properties: row.get(self.properties),
            properties_metadata: row
                .get::<_, Option<serde_json::Value>>(self.property_metadata)
                .map(|value| {
                    PropertyObjectMetadata::deserialize(value)
                        .expect("the stored property metadata should be valid")
                })
                .unwrap_or_default(),
            source_entity: source_entity.map(|(endpoint, _)| endpoint),
            target_entity: target_entity.map(|(endpoint, _)| endpoint),
        };

        (row, editions)
    }
}

/// The edition ids of a row's link endpoints. An endpoint is only shown once
/// its edition passes the knowledge-edge permission check.
struct LinkEndpointEditions {
    source: Option<EntityEditionId>,
    target: Option<EntityEditionId>,
}

/// The type universe to pin for a page sequence, or [`None`] when the summary
/// held more types than [`TYPE_UNIVERSE_LIMIT`].
///
/// Past the limit the include clause stops being worth its cost in bind
/// parameters and cursor bytes, and the scope filter alone decides the rows
/// either way.
fn pin_universe(type_ids: &HashMap<VersionedUrl, usize>) -> Option<Vec<VersionedUrl>> {
    if type_ids.len() > TYPE_UNIVERSE_LIMIT {
        return None;
    }

    let mut universe = type_ids.keys().cloned().collect::<Vec<_>>();
    // The universe is sent as query parameters and travels inside the cursor —
    // keep its order deterministic.
    universe.sort_unstable();
    Some(universe)
}

/// The sort key plus the uuid tiebreaker — the keyset the cursor's position
/// carries. Drafts are never rows, so the entity uuid alone breaks ties.
fn sorting_records(sort: EntityTableSorting) -> Vec<EntityQuerySortingRecord<'static>> {
    let key_path = match sort.key {
        EntityTableSortKey::CreatedAtDecisionTime => EntityQueryPath::CreatedAtDecisionTime,
        EntityTableSortKey::EditionCreatedAtDecisionTime => EntityQueryPath::DecisionTime,
        EntityTableSortKey::Label => EntityQueryPath::FirstLabel,
        EntityTableSortKey::TypeTitle => EntityQueryPath::FirstTypeTitle,
        EntityTableSortKey::Archived => EntityQueryPath::Archived,
    };

    vec![
        EntityQuerySortingRecord {
            path: key_path,
            ordering: sort.ordering,
            nulls: None,
        },
        EntityQuerySortingRecord {
            path: EntityQueryPath::Uuid,
            ordering: sort.ordering,
            nulls: None,
        },
    ]
}

/// Draft entities are never rows of the table.
///
/// Excluding them keeps `draft_id IS NULL` on every temporal-metadata join the
/// compiler emits — including the ones hydrating a link row's endpoints, which
/// would otherwise match one row per draft edition and let a product row mix
/// columns from different editions.
const INCLUDE_DRAFTS: bool = false;

impl<C> PostgresStore<C, InTransaction>
where
    C: AsClient,
{
    #[expect(clippy::too_many_lines)]
    #[tracing::instrument(level = "info", skip(self, params))]
    pub(crate) async fn query_entities_table_impl(
        &self,
        actor_id: ActorId,
        params: QueryEntitiesTableParams,
    ) -> Result<QueryEntitiesTableResponse, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self, Some(actor_id))
            .with_action(ActionName::ViewEntity, MergePolicies::Yes)
            .await
            .change_context(QueryError)?;

        // The sort shapes the keyset, so a continuation reads it from its
        // token instead of trusting the re-sent request. The snapshot instants
        // are minted here for a first page — a shade after the transaction's
        // own snapshot, so a writer committing in between stays out of this
        // page's aggregates but can still surface on a later page.
        let (transaction_time, decision_time, mut type_universe, sort, position) =
            match &params.cursor {
                None => {
                    let now: Timestamp<()> = Timestamp::now();
                    (now.cast(), now.cast(), None, params.sort, None)
                }
                Some(cursor) => (
                    cursor.transaction_time,
                    cursor.decision_time,
                    cursor.type_universe.clone(),
                    cursor.sort,
                    Some(cursor.position.clone()),
                ),
            };
        let temporal_axes = instant_axes(transaction_time, decision_time);

        // TODO(BE-707): assemble the view-entity policy filter through a shared
        //  entry point instead of repeating the extraction on every read path.
        let policy_filter = Filter::<Entity>::for_policies(
            policy_components.extract_filter_policies(ActionName::ViewEntity),
            policy_components.actor_id(),
            policy_components.optimization_data(ActionName::ViewEntity),
        );

        let type_selection = params.filter.entity_type_ids.clone();

        // Sensitive properties get the same two-sided protection the generic
        // read path applies: the responses mask them, and the user's filters
        // are rewritten so they cannot be probed through row presence or the
        // count.
        let should_apply_protection =
            !self.settings.filter_protection.is_empty() && !policy_components.is_instance_admin();

        let scope_filter = scope_filter(&params);
        let mut property_filter = property_filters_filter(&params.filter.property_filters);
        if let Some(filter) = &mut property_filter {
            // Aligns the compared values with the property columns' JSONB
            // representation, like the generic read path does for its filters.
            filter
                .convert_parameters(&StoreProvider::new(self, &policy_components))
                .await
                .change_context(QueryError)?;
        }
        if should_apply_protection {
            property_filter = property_filter.map(|filter| {
                transform_filter(
                    filter,
                    &self.settings.filter_protection,
                    0,
                    policy_components.actor_id(),
                )
            });
        }

        // Only a first page derives a universe: a continuation's token already
        // says what its sequence runs on, including that the universe was too
        // large to pin — where deriving it again would pay the summary scan
        // per page only to drop it again.
        let needs_universe = params.cursor.is_none() && type_selection.is_none();
        // Without narrowing filters the page's full filters equal the scope
        // (the include clause is result-neutral and the excluded base URLs
        // live inside the scope filter), so the count can ride along in the
        // summary scan instead of paying a second full scan.
        let count_matches_scope =
            type_selection.is_none() && params.filter.property_filters.is_empty();
        let scope_summaries = if params.include_summary || needs_universe {
            Some(
                self.scope_summary(
                    &policy_filter,
                    &scope_filter,
                    &temporal_axes,
                    params.include_summary && count_matches_scope,
                )
                .await?,
            )
        } else {
            None
        };
        if needs_universe {
            type_universe = scope_summaries.as_ref().and_then(|summaries| {
                pin_universe(
                    summaries
                        .type_ids
                        .as_ref()
                        .expect("the type summary should always be requested"),
                )
            });
        }

        let type_filter = type_selection
            .as_ref()
            .or(type_universe.as_ref())
            .map(|entity_type_ids| type_include_filter(entity_type_ids));

        // The count reflects the page query's full filters, where the type
        // summary spans the scope so the filter UI can widen a selection.
        let summary =
            if let Some(scope_summaries) = scope_summaries.filter(|_| params.include_summary) {
                Some(EntityTableSummary {
                    count: match scope_summaries.count {
                        Some(count) => count,
                        None => {
                            self.table_count(
                                [
                                    Some(&policy_filter),
                                    Some(&scope_filter),
                                    type_filter.as_ref(),
                                    property_filter.as_ref(),
                                ],
                                &temporal_axes,
                            )
                            .await?
                        }
                    },
                    entity_type_ids: scope_summaries
                        .type_ids
                        .expect("the type summary should always be requested"),
                    entity_type_titles: scope_summaries
                        .type_titles
                        .expect("the type summary should always be requested"),
                })
            } else {
                None
            };

        let row_paths = RowPaths::new();
        let mut compiler = SelectCompiler::new(Some(&temporal_axes), INCLUDE_DRAFTS);

        // The rows carry raw property objects, so the page masks them the
        // same way the generic read path masks its entities.
        let property_protection_filter;
        if should_apply_protection {
            property_protection_filter = self
                .settings
                .filter_protection
                .to_property_protection_filter(policy_components.actor_id());
            compiler.with_property_masking(&property_protection_filter);
        }

        compiler
            .add_filter(&policy_filter)
            .change_context(QueryError)?;
        compiler
            .add_filter(&scope_filter)
            .change_context(QueryError)?;
        if let Some(property_filter) = &property_filter {
            compiler
                .add_filter(property_filter)
                .change_context(QueryError)?;
        }
        if let Some(type_filter) = &type_filter {
            compiler
                .add_filter(type_filter)
                .change_context(QueryError)?;
        }

        compiler.set_limit(params.limit);
        // The table vouches for the keys-first preconditions: its hydration
        // joins match at most one row per key and the distinct key pins all
        // row-multiplying columns. Embeddings cannot occur here.
        compiler.set_statement_shape(StatementShape::KeysFirst);

        let sorting = EntityQuerySorting {
            paths: sorting_records(sort),
            cursor: position,
        };
        let cursor_parameters = sorting.encode().change_context(QueryError)?;
        let cursor_indices = sorting
            .compile(&mut compiler, cursor_parameters.as_ref(), &temporal_axes)
            .change_context(QueryError)?;

        let row_indices = RowIndices::install(&mut compiler, &row_paths);

        let (statement, parameters) = compiler.compile();

        let rows: Vec<_> = self
            .as_client()
            .query_raw(&statement, parameters)
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement,
            ))
            .await
            .change_context(QueryError)?
            .try_collect()
            .await
            .change_context(QueryError)?;

        let cursor = (rows.len() == params.limit)
            .then(|| rows.last())
            .flatten()
            .map(|row| EntityTableCursor {
                transaction_time,
                decision_time,
                type_universe: type_selection
                    .is_none()
                    .then(|| type_universe.clone())
                    .flatten(),
                sort,
                position: EntityQueryCursor {
                    values: cursor_indices
                        .iter()
                        .map(|&index| {
                            row.get::<_, Option<CursorField>>(index)
                                .unwrap_or(CursorField::Json(
                                    type_system::knowledge::PropertyValue::Null,
                                ))
                                .into_owned()
                        })
                        .collect(),
                },
            });

        let (mut rows, row_editions): (Vec<_>, Vec<_>) =
            rows.iter().map(|row| row_indices.decode(row)).unzip();

        // Link endpoints are hydrated through joins the policy filter does not
        // reach, so they pass the same permission check the subgraph traversal
        // applies to its edges before they are shown.
        let endpoint_editions = row_editions
            .iter()
            .flat_map(|editions| [editions.source, editions.target])
            .flatten()
            .collect::<Vec<_>>();
        if !endpoint_editions.is_empty()
            && let Some(permitted) = self
                .filter_knowledge_edges(
                    &endpoint_editions,
                    &temporal_axes,
                    &StoreProvider::new(self, &policy_components),
                )
                .await?
        {
            for (row, editions) in rows.iter_mut().zip(&row_editions) {
                if editions
                    .source
                    .is_some_and(|edition_id| !permitted.contains(&edition_id))
                {
                    row.source_entity = None;
                }
                if editions
                    .target
                    .is_some_and(|edition_id| !permitted.contains(&edition_id))
                {
                    row.target_entity = None;
                }
            }
        }

        if !params.conversions.is_empty() {
            let provider = StoreProvider::new(self, &policy_components);
            for row in &mut rows {
                self.convert_properties(
                    &provider,
                    &mut row.properties,
                    &mut row.properties_metadata,
                    &params.conversions,
                )
                .await
                .change_context(QueryError)?;
            }
        }

        let closed_multi_entity_types = if params.include_entity_types.is_some() {
            // Link endpoints resolve as their own type combinations, so their
            // chips can be rendered from the same map as the rows.
            let endpoint_types = |endpoint: &Option<EntityTableLinkEndpoint>| {
                endpoint
                    .as_ref()
                    .map(|endpoint| endpoint.entity_type_ids.clone())
            };
            Some(
                self.get_closed_multi_entity_types(
                    Some(actor_id),
                    rows.iter()
                        .map(|row| row.entity_type_ids.clone())
                        .chain(
                            rows.iter()
                                .filter_map(|row| endpoint_types(&row.source_entity)),
                        )
                        .chain(
                            rows.iter()
                                .filter_map(|row| endpoint_types(&row.target_entity)),
                        ),
                    QueryTemporalAxesUnresolved::live_only(),
                    None,
                )
                .await?
                .entity_types,
            )
        } else {
            None
        };
        let definitions = match params.include_entity_types {
            Some(
                IncludeEntityTypeOption::Resolved
                | IncludeEntityTypeOption::ResolvedWithDataTypeChildren,
            ) => {
                let entity_type_uuids = rows
                    .iter()
                    .flat_map(|row| {
                        row.entity_type_ids
                            .iter()
                            .chain(
                                row.source_entity
                                    .iter()
                                    .flat_map(|endpoint| endpoint.entity_type_ids.iter()),
                            )
                            .chain(
                                row.target_entity
                                    .iter()
                                    .flat_map(|endpoint| endpoint.entity_type_ids.iter()),
                            )
                            .map(EntityTypeUuid::from_url)
                    })
                    .collect::<HashSet<_>>()
                    .into_iter()
                    .collect::<Vec<_>>();
                Some(
                    self.get_entity_type_resolve_definitions(
                        Some(actor_id),
                        &entity_type_uuids,
                        params.include_entity_types
                            == Some(IncludeEntityTypeOption::ResolvedWithDataTypeChildren),
                    )
                    .await?,
                )
            }
            None | Some(IncludeEntityTypeOption::Closed) => None,
        };

        Ok(QueryEntitiesTableResponse {
            rows,
            closed_multi_entity_types,
            definitions,
            cursor,
            summary,
        })
    }

    /// Runs the type summary over the scope, before any type selection,
    /// carrying the scope count along when requested.
    ///
    /// The policy filter is part of the scope, so the counts and types only
    /// ever span what the actor may view.
    async fn scope_summary(
        &self,
        policy_filter: &Filter<'_, Entity>,
        scope_filter: &Filter<'_, Entity>,
        temporal_axes: &QueryTemporalAxes,
        include_count: bool,
    ) -> Result<EntitySummaries, Report<QueryError>> {
        let mut compiler = SelectCompiler::new(Some(temporal_axes), INCLUDE_DRAFTS);
        compiler
            .add_filter(policy_filter)
            .change_context(QueryError)?;
        compiler
            .add_filter(scope_filter)
            .change_context(QueryError)?;

        let summary_query = EntitySummaryQuery::new(
            &mut compiler,
            EntitySummaryRequest {
                count: include_count,
                type_ids: true,
                type_titles: true,
                ..EntitySummaryRequest::default()
            },
        )
        .expect("the type summaries should always be requested");

        let (statement, parameters) = compiler.compile();
        // The table's temporal axes are a point in time, so an edition can only
        // match once — but a to-many filter join could still fan out.
        let dedup = if compiler.has_to_many_join() {
            Deduplication::Required
        } else {
            Deduplication::Skip
        };
        let statement = summary_query.statement(&statement, dedup);

        // The planner estimates the summary's set-returning functions a
        // thousandfold too high, which pushes the statement over the JIT
        // thresholds and burns hundreds of milliseconds compiling it on
        // every execution. The transaction's other statements are limited
        // keyset reads that never reach those thresholds, so the local
        // setting staying on for them costs nothing.
        self.as_client()
            .execute("SET LOCAL jit = off", &[])
            .await
            .change_context(QueryError)?;

        let rows = self
            .as_client()
            .query_raw(&statement, parameters)
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement,
            ))
            .await
            .change_context(QueryError)?
            .try_collect::<Vec<_>>()
            .await
            .change_context(QueryError)?;

        summary_query.decode(rows)
    }

    /// Counts the rows matching the page query's full filters.
    async fn table_count<'f>(
        &self,
        filters: [Option<&'f Filter<'f, Entity>>; 4],
        temporal_axes: &QueryTemporalAxes,
    ) -> Result<usize, Report<QueryError>> {
        let mut compiler = SelectCompiler::new(Some(temporal_axes), INCLUDE_DRAFTS);
        for filter in filters.into_iter().flatten() {
            compiler.add_filter(filter).change_context(QueryError)?;
        }

        let summary_query = EntitySummaryQuery::new(
            &mut compiler,
            EntitySummaryRequest {
                count: true,
                ..EntitySummaryRequest::default()
            },
        )
        .expect("the count summary should always be requested");

        let (statement, parameters) = compiler.compile();
        let dedup = if compiler.has_to_many_join() {
            Deduplication::Required
        } else {
            Deduplication::Skip
        };
        let statement = summary_query.statement(&statement, dedup);

        let rows = self
            .as_client()
            .query_raw(&statement, parameters)
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement,
            ))
            .await
            .change_context(QueryError)?
            .try_collect::<Vec<_>>()
            .await
            .change_context(QueryError)?;

        summary_query.decode(rows)?.count.ok_or_else(|| {
            Report::new(QueryError).attach("the count summary returned no count row")
        })
    }
}

/// The scope shared by the summary and the page query: webs, excluded types,
/// and archival.
fn scope_filter<'f>(params: &'f QueryEntitiesTableParams) -> Filter<'f, Entity> {
    let webs_in = |webs: &'f [WebId]| {
        Filter::In(
            FilterExpression::Path {
                path: EntityQueryPath::WebId,
            },
            FilterExpressionList::ParameterList {
                parameters: ParameterList::WebIds(webs),
            },
        )
    };

    let mut clauses = Vec::new();

    match &params.filter.webs {
        EntityTableWebScope::Include { webs } => {
            clauses.push(webs_in(webs));
        }
        EntityTableWebScope::Exclude { webs } => {
            if !webs.is_empty() {
                clauses.push(Filter::Not(Box::new(webs_in(webs))));
            }
        }
    }

    // Excluding here rather than in the page's type clause drops the excluded
    // entities from the summary and the count as well, catches multi-type
    // entities that also carry a selected type, and keeps the exclusions in
    // force when the request narrows to a selection.
    clauses.extend(
        params
            .filter
            .excluded_type_base_urls
            .iter()
            .map(|base_url| {
                Filter::NotEqual(
                    FilterExpression::Path {
                        path: EntityQueryPath::EntityTypeEdge {
                            edge_kind: SharedEdgeKind::IsOfType,
                            path: EntityTypeQueryPath::BaseUrl,
                            inheritance_depth: None,
                        },
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Text(base_url.to_string().into()),
                        convert: None,
                    },
                )
            }),
    );

    if !params.filter.include_archived {
        clauses.push(Filter::NotEqual(
            FilterExpression::Path {
                path: EntityQueryPath::Archived,
            },
            FilterExpression::Parameter {
                parameter: Parameter::Boolean(true),
                convert: None,
            },
        ));
    }

    Filter::All(clauses)
}

/// Assembles the table's snapshot axes from its two instants.
///
/// The table's one-row-per-entity shape — the summary counting entities
/// rather than editions, the keyset paging without duplicates, and the
/// hydration joins matching at most one row per key — assumes an edition can
/// match the axes only once. Instants guarantee that by construction, where
/// an interval axis would break it.
fn instant_axes(
    transaction_time: Timestamp<TransactionTime>,
    decision_time: Timestamp<DecisionTime>,
) -> QueryTemporalAxes {
    QueryTemporalAxes::DecisionTime {
        pinned: PinnedTemporalAxis::new(transaction_time),
        variable: VariableTemporalAxis::new(
            TemporalBound::Inclusive(decision_time),
            LimitedTemporalBound::Inclusive(decision_time),
        ),
    }
}

/// Translates the table's property conditions into one conjunctive filter, or
/// [`None`] when there are none.
fn property_filters_filter<'f>(
    property_filters: &[EntityTablePropertyFilter],
) -> Option<Filter<'f, Entity>> {
    if property_filters.is_empty() {
        return None;
    }

    Some(Filter::All(
        property_filters
            .iter()
            .map(property_condition_filter)
            .collect(),
    ))
}

fn property_condition_filter<'f>(
    property_filter: &EntityTablePropertyFilter,
) -> Filter<'f, Entity> {
    let path = || {
        EntityQueryPath::Properties(Some(JsonPath::from_path_tokens(vec![PathToken::Field(
            Cow::Owned(property_filter.property().to_string()),
        )])))
    };
    let path_expression = || FilterExpression::Path { path: path() };
    let boolean = |value: bool| FilterExpression::Parameter {
        parameter: Parameter::Boolean(value),
        convert: None,
    };
    let text = |value: &str| FilterExpression::Parameter {
        parameter: Parameter::Text(Cow::Owned(value.to_owned())),
        convert: None,
    };
    let number = |value: &hash_codec::numeric::Real| FilterExpression::Parameter {
        parameter: Parameter::Decimal(value.clone()),
        convert: None,
    };
    let value = |value: &EntityTablePropertyValue| match value {
        EntityTablePropertyValue::Number(real) => number(real),
        EntityTablePropertyValue::String(string) => text(string),
    };

    match property_filter {
        EntityTablePropertyFilter::HasAnyValue { .. } => Filter::Exists { path: path() },
        EntityTablePropertyFilter::IsEmpty { .. } => {
            Filter::Not(Box::new(Filter::Exists { path: path() }))
        }
        EntityTablePropertyFilter::IsTrue { .. } => Filter::Equal(path_expression(), boolean(true)),
        EntityTablePropertyFilter::IsFalse { .. } => {
            Filter::Equal(path_expression(), boolean(false))
        }
        EntityTablePropertyFilter::Equals {
            value: compared, ..
        } => Filter::Equal(path_expression(), value(compared)),
        EntityTablePropertyFilter::NotEquals {
            value: compared, ..
        } => Filter::NotEqual(path_expression(), value(compared)),
        EntityTablePropertyFilter::GreaterThan {
            value: compared, ..
        } => Filter::Greater(path_expression(), number(compared)),
        EntityTablePropertyFilter::GreaterThanOrEqual {
            value: compared, ..
        } => Filter::GreaterOrEqual(path_expression(), number(compared)),
        EntityTablePropertyFilter::LessThan {
            value: compared, ..
        } => Filter::Less(path_expression(), number(compared)),
        EntityTablePropertyFilter::LessThanOrEqual {
            value: compared, ..
        } => Filter::LessOrEqual(path_expression(), number(compared)),
        EntityTablePropertyFilter::ContainsSegment {
            value: compared, ..
        } => Filter::ContainsSegment(path_expression(), text(compared)),
        EntityTablePropertyFilter::StartsWith {
            value: compared, ..
        } => Filter::StartsWith(path_expression(), text(compared)),
        EntityTablePropertyFilter::EndsWith {
            value: compared, ..
        } => Filter::EndsWith(path_expression(), text(compared)),
    }
}

fn type_include_filter<'f>(entity_type_ids: &[VersionedUrl]) -> Filter<'f, Entity> {
    Filter::Any(
        entity_type_ids
            .iter()
            .map(|entity_type_id| {
                Filter::Equal(
                    FilterExpression::Path {
                        path: EntityQueryPath::EntityTypeEdge {
                            edge_kind: SharedEdgeKind::IsOfType,
                            path: EntityTypeQueryPath::VersionedUrl,
                            inheritance_depth: None,
                        },
                    },
                    FilterExpression::Parameter {
                        parameter: Parameter::Text(entity_type_id.to_string().into()),
                        convert: None,
                    },
                )
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use core::str::FromStr as _;

    use hash_codec::numeric::Real;
    use hash_graph_store::entity::EntityTableFilter;
    use type_system::{ontology::BaseUrl, principal::actor_group::WebId};
    use uuid::Uuid;

    use super::*;
    use crate::store::postgres::query::test_helper::trim_whitespace;

    fn params(webs: Option<Vec<WebId>>) -> QueryEntitiesTableParams {
        QueryEntitiesTableParams {
            filter: EntityTableFilter {
                webs: webs.map_or_else(EntityTableWebScope::default, |webs| {
                    EntityTableWebScope::Include { webs }
                }),
                entity_type_ids: None,
                excluded_type_base_urls: Vec::new(),
                include_archived: false,
                property_filters: Vec::new(),
            },
            cursor: None,
            limit: 500,
            sort: EntityTableSorting::default(),
            conversions: Vec::new(),
            include_summary: false,
            include_entity_types: None,
        }
    }

    fn sample_timestamp<A>() -> Timestamp<A> {
        serde_json::from_value(serde_json::json!("2025-01-01T00:00:00Z"))
            .expect("the timestamp should deserialize")
    }

    #[test]
    fn a_universe_is_pinned_in_order_up_to_the_limit() {
        let universe = |count: usize| {
            pin_universe(
                &(0..count)
                    .map(|index| {
                        (
                            VersionedUrl::from_str(&format!(
                                "https://example.com/types/entity-type/type-{index}/v/1"
                            ))
                            .expect("the URL should be a valid versioned URL"),
                            1,
                        )
                    })
                    .collect(),
            )
        };

        let pinned = universe(TYPE_UNIVERSE_LIMIT).expect("the universe should be pinned");
        assert_eq!(pinned.len(), TYPE_UNIVERSE_LIMIT);
        assert!(
            pinned.is_sorted(),
            "the universe travels in the cursor, so its order should be deterministic",
        );

        assert_eq!(
            universe(TYPE_UNIVERSE_LIMIT + 1),
            None,
            "a universe past the limit should be dropped rather than pinned",
        );
    }

    #[test]
    fn cursor_token_roundtrip() {
        let cursor = EntityTableCursor {
            transaction_time: sample_timestamp(),
            decision_time: sample_timestamp(),
            type_universe: Some(vec![
                VersionedUrl::from_str("https://example.com/types/entity-type/person/v/1")
                    .expect("the URL should be a valid versioned URL"),
            ]),
            sort: EntityTableSorting {
                key: EntityTableSortKey::Label,
                ordering: hash_graph_store::query::Ordering::Ascending,
            },
            position: EntityQueryCursor {
                values: vec![
                    CursorField::String("cursor value".into()),
                    CursorField::Uuid(Uuid::nil()),
                ],
            },
        };

        let token = serde_json::to_value(&cursor).expect("the cursor should serialize");
        assert!(token.is_string(), "the wire shape is an opaque token");

        let decoded: EntityTableCursor =
            serde_json::from_value(token.clone()).expect("the token should decode");

        pretty_assertions::assert_eq!(
            serde_json::to_value(&decoded).expect("the cursor should serialize"),
            token,
        );

        assert_eq!(decoded.sort, cursor.sort, "the token pins the sort");
    }

    // The NOT clauses are compiled next to the derived universe's GIN-friendly
    // include clause in the full page statement (`table_page_statement`) — on
    // their own they would be unindexable, which the type scope's shape rules
    // out.
    #[test]
    fn table_exclusion_scopes_statement() {
        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let mut params = params(None);
        params.filter.webs = EntityTableWebScope::Exclude {
            webs: vec![WebId::new(Uuid::nil())],
        };
        params.filter.excluded_type_base_urls = vec![
            BaseUrl::new("https://example.com/types/entity-type/noise/".to_owned())
                .expect("the URL should be a valid base URL"),
        ];
        params.filter.include_archived = true;

        let scope = scope_filter(&params);

        let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), INCLUDE_DRAFTS);
        compiler
            .add_filter(&scope)
            .expect("the scope filter should compile");
        compiler.add_selection_path(&EntityQueryPath::Uuid);

        let (statement, _parameters) = compiler.compile();

        pretty_assertions::assert_eq!(
            trim_whitespace(&statement),
            trim_whitespace(
                r#"SELECT "entity_temporal_metadata_0_0_0"."entity_uuid"
                FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
                INNER JOIN "entity_edition_cache" AS "entity_edition_cache_0_1_0" ON "entity_edition_cache_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
                WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
                  AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
                  AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
                  AND ((NOT("entity_temporal_metadata_0_0_0"."web_id" = ANY($3)))
                  AND (NOT("entity_edition_cache_0_1_0"."base_urls" @> ARRAY[$4]::text[])))"#,
            ),
        );
    }

    #[test]
    fn table_property_filters_statement() {
        let property = |suffix: &str| {
            BaseUrl::new(format!("https://example.com/types/property-type/{suffix}/"))
                .expect("the URL should be a valid base URL")
        };
        // Every operator once, pinning each condition's SQL shape.
        let property_filters = vec![
            EntityTablePropertyFilter::HasAnyValue {
                property: property("a"),
            },
            EntityTablePropertyFilter::IsEmpty {
                property: property("b"),
            },
            EntityTablePropertyFilter::IsTrue {
                property: property("c"),
            },
            EntityTablePropertyFilter::IsFalse {
                property: property("d"),
            },
            EntityTablePropertyFilter::Equals {
                property: property("e"),
                value: EntityTablePropertyValue::String("x".to_owned()),
            },
            EntityTablePropertyFilter::NotEquals {
                property: property("f"),
                value: EntityTablePropertyValue::Number(Real::from(1)),
            },
            EntityTablePropertyFilter::GreaterThan {
                property: property("g"),
                value: Real::from(2),
            },
            EntityTablePropertyFilter::GreaterThanOrEqual {
                property: property("h"),
                value: Real::from(3),
            },
            EntityTablePropertyFilter::LessThan {
                property: property("i"),
                value: Real::from(4),
            },
            EntityTablePropertyFilter::LessThanOrEqual {
                property: property("j"),
                value: Real::from(5),
            },
            EntityTablePropertyFilter::ContainsSegment {
                property: property("k"),
                value: "y".to_owned(),
            },
            EntityTablePropertyFilter::StartsWith {
                property: property("l"),
                value: "z".to_owned(),
            },
            EntityTablePropertyFilter::EndsWith {
                property: property("m"),
                value: "w".to_owned(),
            },
        ];

        let filter =
            property_filters_filter(&property_filters).expect("the filters should build a filter");

        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), INCLUDE_DRAFTS);
        compiler
            .add_filter(&filter)
            .expect("the property filter should compile");
        compiler.add_selection_path(&EntityQueryPath::Uuid);

        let (statement, _parameters) = compiler.compile();

        pretty_assertions::assert_eq!(
            trim_whitespace(&statement),
            trim_whitespace(
                r#"SELECT "entity_temporal_metadata_0_0_0"."entity_uuid"
                FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
                INNER JOIN "entity_editions" AS "entity_editions_0_1_0" ON "entity_editions_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
                WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
                  AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $2::TIMESTAMPTZ)
                  AND ("entity_temporal_metadata_0_0_0"."decision_time" && $3)
                  AND ((jsonb_path_query_first("entity_editions_0_1_0"."properties", (($1::text)::jsonpath)) IS NOT NULL)
                  AND (jsonb_path_query_first("entity_editions_0_1_0"."properties", (($4::text)::jsonpath)) IS NULL)
                  AND (jsonb_path_query_first("entity_editions_0_1_0"."properties", (($5::text)::jsonpath)) = $6)
                  AND (jsonb_path_query_first("entity_editions_0_1_0"."properties", (($7::text)::jsonpath)) = $8)
                  AND (jsonb_path_query_first("entity_editions_0_1_0"."properties", (($9::text)::jsonpath)) = $10)
                  AND (jsonb_path_query_first("entity_editions_0_1_0"."properties", (($11::text)::jsonpath)) != $12)
                  AND (jsonb_path_query_first("entity_editions_0_1_0"."properties", (($13::text)::jsonpath)) > $14)
                  AND (jsonb_path_query_first("entity_editions_0_1_0"."properties", (($15::text)::jsonpath)) >= $16)
                  AND (jsonb_path_query_first("entity_editions_0_1_0"."properties", (($17::text)::jsonpath)) < $18)
                  AND (jsonb_path_query_first("entity_editions_0_1_0"."properties", (($19::text)::jsonpath)) <= $20)
                  AND (strpos(((jsonb_path_query_first("entity_editions_0_1_0"."properties", (($21::text)::jsonpath))) #>> '{}'::text[]), $22) > 0)
                  AND (starts_with(((jsonb_path_query_first("entity_editions_0_1_0"."properties", (($23::text)::jsonpath))) #>> '{}'::text[]), $24))
                  AND (right(((jsonb_path_query_first("entity_editions_0_1_0"."properties", (($25::text)::jsonpath))) #>> '{}'::text[]), length($26)) = $26))"#,
            ),
        );
    }

    #[test]
    fn sort_keys_compile_to_their_order_by_columns() {
        let order_by_lines = [
            EntityTableSortKey::CreatedAtDecisionTime,
            EntityTableSortKey::EditionCreatedAtDecisionTime,
            EntityTableSortKey::Label,
            EntityTableSortKey::TypeTitle,
            EntityTableSortKey::Archived,
        ]
        .map(|key| {
            let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
            let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), INCLUDE_DRAFTS);
            compiler.set_limit(10);
            compiler.set_statement_shape(StatementShape::KeysFirst);

            let sorting = EntityQuerySorting {
                paths: sorting_records(EntityTableSorting {
                    key,
                    ordering: hash_graph_store::query::Ordering::Descending,
                }),
                cursor: None,
            };
            let cursor_parameters = sorting.encode().expect("the sorting should encode");
            sorting
                .compile(&mut compiler, cursor_parameters.as_ref(), &temporal_axes)
                .expect("the sorting should compile");

            let (statement, _parameters) = compiler.compile();
            statement
                .split("ORDER BY")
                .nth(1)
                .expect("the statement should have an ORDER BY")
                .split("LIMIT")
                .next()
                .expect("the ORDER BY should precede the LIMIT")
                .trim()
                .to_owned()
        });

        pretty_assertions::assert_eq!(
            order_by_lines,
            [
                r#""created_at_decision_time" DESC, "entity_uuid" DESC"#,
                r#""decision_time" DESC, "entity_uuid" DESC"#,
                r#"("labels")[1] DESC, "entity_uuid" DESC"#,
                r#"("type_titles")[1] DESC, "entity_uuid" DESC"#,
                r#""archived" DESC, "entity_uuid" DESC"#,
            ]
        );
    }

    #[test]
    fn table_page_statement() {
        let temporal_axes = QueryTemporalAxesUnresolved::all().resolve();
        let params = params(Some(vec![WebId::new(Uuid::nil())]));

        let scope = scope_filter(&params);
        let types = type_include_filter(&[VersionedUrl::from_str(
            "https://example.com/types/entity-type/person/v/1",
        )
        .expect("the URL should be a valid versioned URL")]);

        let row_paths = RowPaths::new();
        let mut compiler = SelectCompiler::<Entity>::new(Some(&temporal_axes), INCLUDE_DRAFTS);
        compiler
            .add_filter(&scope)
            .expect("the scope filter should compile");
        compiler
            .add_filter(&types)
            .expect("the type filter should compile");
        compiler.set_limit(params.limit);
        compiler.set_statement_shape(StatementShape::KeysFirst);

        let sorting = EntityQuerySorting {
            paths: sorting_records(params.sort),
            cursor: None,
        };
        let cursor_parameters = sorting.encode().expect("the sorting should encode");
        sorting
            .compile(&mut compiler, cursor_parameters.as_ref(), &temporal_axes)
            .expect("the sorting should compile");

        RowIndices::install(&mut compiler, &row_paths);

        let (statement, _parameters) = compiler.compile();

        pretty_assertions::assert_eq!(
            trim_whitespace(&statement),
            trim_whitespace(
                r#"WITH "roots" AS (SELECT
                  "entity_ids_2_1_0"."created_at_decision_time", "entity_temporal_metadata_0_0_0"."entity_uuid", "entity_temporal_metadata_0_0_0"."web_id", "entity_temporal_metadata_0_0_0"."draft_id", "entity_temporal_metadata_0_0_0"."entity_edition_id", "entity_ids_2_1_0"."created_at_transaction_time", "entity_temporal_metadata_0_0_0"."decision_time", "entity_ids_2_1_0"."created_by_id"
                FROM "entity_temporal_metadata" AS "entity_temporal_metadata_0_0_0"
                INNER JOIN "entity_editions" AS "entity_editions_0_1_0" ON "entity_editions_0_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
                INNER JOIN "entity_edition_cache" AS "entity_edition_cache_1_1_0" ON "entity_edition_cache_1_1_0"."entity_edition_id" = "entity_temporal_metadata_0_0_0"."entity_edition_id"
                INNER JOIN "entity_ids" AS "entity_ids_2_1_0" ON "entity_ids_2_1_0"."web_id" = "entity_temporal_metadata_0_0_0"."web_id" AND "entity_ids_2_1_0"."entity_uuid" = "entity_temporal_metadata_0_0_0"."entity_uuid"
                WHERE ("entity_temporal_metadata_0_0_0"."draft_id" IS NULL)
                  AND ("entity_temporal_metadata_0_0_0"."transaction_time" @> $1::TIMESTAMPTZ)
                  AND ("entity_temporal_metadata_0_0_0"."decision_time" && $2)
                  AND (("entity_temporal_metadata_0_0_0"."web_id" = ANY($3))
                  AND ("entity_editions_0_1_0"."archived" != $4))
                  AND (("entity_edition_cache_1_1_0"."versioned_urls" @> ARRAY[$5]::text[]))),
                "limited" AS (SELECT *
                FROM "roots"
                ORDER BY "created_at_decision_time" DESC, "entity_uuid" DESC LIMIT 500)
                SELECT DISTINCT ON("limited"."created_at_decision_time", "limited"."entity_uuid") "limited"."created_at_decision_time", "limited"."entity_uuid", "limited"."web_id", "limited"."draft_id", "limited"."entity_edition_id", ("entity_edition_cache_2_1_0"."labels")[1], "entity_edition_cache_2_1_0"."versioned_urls", "entity_edition_cache_2_1_0"."type_titles", "entity_edition_cache_2_1_0"."direct_types", "limited"."created_at_transaction_time", "limited"."decision_time", "limited"."created_by_id", "entity_editions_2_1_0"."created_by_id", "entity_editions_2_1_0"."archived", "entity_editions_2_1_0"."properties", "entity_editions_2_1_0"."property_metadata", "entity_has_left_entity_2_1_0"."left_web_id", "entity_has_left_entity_2_1_0"."left_entity_uuid", "entity_temporal_metadata_2_2_0"."entity_edition_id", ("entity_edition_cache_2_3_0"."labels")[1], "entity_edition_cache_2_3_0"."versioned_urls", "entity_edition_cache_2_3_0"."direct_types", "entity_has_right_entity_2_1_0"."right_web_id", "entity_has_right_entity_2_1_0"."right_entity_uuid", "entity_temporal_metadata_2_2_1"."entity_edition_id", ("entity_edition_cache_2_3_1"."labels")[1], "entity_edition_cache_2_3_2"."versioned_urls", "entity_edition_cache_2_3_3"."direct_types"
                FROM "limited"
                INNER JOIN "entity_edition_cache" AS "entity_edition_cache_2_1_0" ON "entity_edition_cache_2_1_0"."entity_edition_id" = "limited"."entity_edition_id"
                INNER JOIN "entity_editions" AS "entity_editions_2_1_0" ON "entity_editions_2_1_0"."entity_edition_id" = "limited"."entity_edition_id"
                LEFT OUTER JOIN "entity_has_left_entity" AS "entity_has_left_entity_2_1_0" ON "entity_has_left_entity_2_1_0"."web_id" = "limited"."web_id" AND "entity_has_left_entity_2_1_0"."entity_uuid" = "limited"."entity_uuid"
                LEFT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_2_2_0" ON "entity_temporal_metadata_2_2_0"."web_id" = "entity_has_left_entity_2_1_0"."left_web_id" AND "entity_temporal_metadata_2_2_0"."entity_uuid" = "entity_has_left_entity_2_1_0"."left_entity_uuid" AND "entity_temporal_metadata_2_2_0"."draft_id" IS NULL AND "entity_temporal_metadata_2_2_0"."transaction_time" @> $1::TIMESTAMPTZ AND "entity_temporal_metadata_2_2_0"."decision_time" && $2
                LEFT OUTER JOIN "entity_edition_cache" AS "entity_edition_cache_2_3_0" ON "entity_edition_cache_2_3_0"."entity_edition_id" = "entity_temporal_metadata_2_2_0"."entity_edition_id"
                LEFT OUTER JOIN "entity_has_right_entity" AS "entity_has_right_entity_2_1_0" ON "entity_has_right_entity_2_1_0"."web_id" = "limited"."web_id" AND "entity_has_right_entity_2_1_0"."entity_uuid" = "limited"."entity_uuid"
                LEFT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_2_2_1" ON "entity_temporal_metadata_2_2_1"."web_id" = "entity_has_right_entity_2_1_0"."right_web_id" AND "entity_temporal_metadata_2_2_1"."entity_uuid" = "entity_has_right_entity_2_1_0"."right_entity_uuid" AND "entity_temporal_metadata_2_2_1"."draft_id" IS NULL AND "entity_temporal_metadata_2_2_1"."transaction_time" @> $1::TIMESTAMPTZ AND "entity_temporal_metadata_2_2_1"."decision_time" && $2
                LEFT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_2_2_2" ON "entity_temporal_metadata_2_2_2"."web_id" = "entity_has_right_entity_2_1_0"."right_web_id" AND "entity_temporal_metadata_2_2_2"."entity_uuid" = "entity_has_right_entity_2_1_0"."right_entity_uuid" AND "entity_temporal_metadata_2_2_2"."draft_id" IS NULL AND "entity_temporal_metadata_2_2_2"."transaction_time" @> $1::TIMESTAMPTZ AND "entity_temporal_metadata_2_2_2"."decision_time" && $2
                LEFT OUTER JOIN "entity_edition_cache" AS "entity_edition_cache_2_3_1" ON "entity_edition_cache_2_3_1"."entity_edition_id" = "entity_temporal_metadata_2_2_2"."entity_edition_id"
                LEFT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_2_2_3" ON "entity_temporal_metadata_2_2_3"."web_id" = "entity_has_right_entity_2_1_0"."right_web_id" AND "entity_temporal_metadata_2_2_3"."entity_uuid" = "entity_has_right_entity_2_1_0"."right_entity_uuid" AND "entity_temporal_metadata_2_2_3"."draft_id" IS NULL AND "entity_temporal_metadata_2_2_3"."transaction_time" @> $1::TIMESTAMPTZ AND "entity_temporal_metadata_2_2_3"."decision_time" && $2
                LEFT OUTER JOIN "entity_edition_cache" AS "entity_edition_cache_2_3_2" ON "entity_edition_cache_2_3_2"."entity_edition_id" = "entity_temporal_metadata_2_2_3"."entity_edition_id"
                LEFT OUTER JOIN "entity_temporal_metadata" AS "entity_temporal_metadata_2_2_4" ON "entity_temporal_metadata_2_2_4"."web_id" = "entity_has_right_entity_2_1_0"."right_web_id" AND "entity_temporal_metadata_2_2_4"."entity_uuid" = "entity_has_right_entity_2_1_0"."right_entity_uuid" AND "entity_temporal_metadata_2_2_4"."draft_id" IS NULL AND "entity_temporal_metadata_2_2_4"."transaction_time" @> $1::TIMESTAMPTZ AND "entity_temporal_metadata_2_2_4"."decision_time" && $2
                LEFT OUTER JOIN "entity_edition_cache" AS "entity_edition_cache_2_3_3" ON "entity_edition_cache_2_3_3"."entity_edition_id" = "entity_temporal_metadata_2_2_4"."entity_edition_id"
                ORDER BY "limited"."created_at_decision_time" DESC, "limited"."entity_uuid" DESC LIMIT 500"#,
            ),
        );
    }
}

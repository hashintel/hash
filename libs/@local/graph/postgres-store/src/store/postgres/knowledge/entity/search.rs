use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::{MergePolicies, PolicyComponents, action::ActionName};
use hash_graph_store::{
    entity::{
        EntityQueryPath, EntityQuerySorting, QueryEntitiesParams, SearchEntitiesFilter,
        SearchEntitiesParams, SearchEntitiesResponse,
    },
    entity_type::IncludeEntityTypeOption,
    error::QueryError,
    filter::{Filter, FilterExpression, FilterExpressionList, Parameter, ParameterList},
    subgraph::temporal_axes::{QueryTemporalAxes, QueryTemporalAxesUnresolved},
};
use hash_graph_types::Embedding;
use postgres_types::ToSql;
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;
use type_system::{
    knowledge::{Entity, entity::id::EntityId},
    ontology::id::VersionedUrl,
    principal::{actor::ActorId, actor_group::WebId},
};

use crate::store::{
    AsClient, PostgresStore,
    postgres::{
        InTransaction,
        query::{QUANTIZED_RANK_OVERFETCH, SelectCompiler},
    },
};

const fn empty_response() -> SearchEntitiesResponse {
    SearchEntitiesResponse {
        entities: Vec::new(),
        closed_multi_entity_types: None,
    }
}

/// The non-policy restrictions of a search.
///
/// A search never returns archived entities; the type and web restrictions come from the
/// request.
fn request_filter<'p>(
    entity_type_ids: &'p [VersionedUrl],
    web_ids: &'p [WebId],
) -> Filter<'p, Entity> {
    let mut request_filters = vec![Filter::Equal(
        FilterExpression::Path {
            path: EntityQueryPath::Archived,
        },
        FilterExpression::Parameter {
            parameter: Parameter::Boolean(false),
            convert: None,
        },
    )];
    if !entity_type_ids.is_empty() {
        request_filters.push(Filter::Any(
            entity_type_ids
                .iter()
                .map(Filter::for_entity_by_type_id)
                .collect(),
        ));
    }
    if !web_ids.is_empty() {
        request_filters.push(Filter::In(
            FilterExpression::Path {
                path: EntityQueryPath::WebId,
            },
            FilterExpressionList::ParameterList {
                parameters: ParameterList::WebIds(web_ids),
            },
        ));
    }
    Filter::All(request_filters)
}

/// The statement that re-scores the candidate keys against the full vector.
///
/// The keys arrive as three parallel arrays, followed by the embedding and the distance
/// threshold. The unique index on `(web_id, entity_uuid, property) NULLS NOT DISTINCT` yields
/// at most one embedding row per candidate, so the join cannot fan out. The key columns break
/// distance ties, which keeps the ordering deterministic.
fn rerank_statement(limit: usize) -> String {
    format!(
        "WITH candidates AS (
             SELECT *
               FROM unnest($1::uuid[], $2::uuid[], $3::uuid[])
                 AS candidates (web_id, entity_uuid, draft_id)
         )
         SELECT candidates.web_id,
                candidates.entity_uuid,
                candidates.draft_id,
                entity_embeddings.embedding <=> $4::vector AS distance
           FROM candidates
           JOIN entity_embeddings
             ON entity_embeddings.web_id = candidates.web_id
            AND entity_embeddings.entity_uuid = candidates.entity_uuid
          WHERE entity_embeddings.property IS NULL
            AND entity_embeddings.embedding <=> $4::vector <= $5
          ORDER BY distance, candidates.web_id, candidates.entity_uuid, candidates.draft_id
          LIMIT {limit}"
    )
}

impl<C> PostgresStore<C, InTransaction>
where
    C: AsClient,
{
    /// Reads the entities whose combined embedding is closest to `params.embedding`.
    ///
    /// The candidates rank per policy branch: a single statement over the whole permit
    /// disjunction can span several tables, which forces the planner to materialize the visible
    /// set instead of walking the vector index. A branch replaces that top-level disjunction
    /// with a conjunction and gets its own key-read. The union of the branches' candidates is
    /// re-scored against the full vector before the survivors are hydrated.
    #[tracing::instrument(
        level = "info",
        skip(self, params),
        fields(branches = tracing::field::Empty)
    )]
    pub(crate) async fn search_entities_impl(
        &self,
        actor_id: ActorId,
        params: SearchEntitiesParams,
    ) -> Result<SearchEntitiesResponse, Report<QueryError>> {
        let SearchEntitiesParams {
            embedding,
            maximum_semantic_distance,
            limit,
            include_entity_types,
            filter:
                SearchEntitiesFilter {
                    entity_type_ids,
                    web_ids,
                    include_drafts,
                },
        } = params;

        let policy_components = PolicyComponents::builder(self, Some(actor_id))
            .with_action(ActionName::ViewEntity, MergePolicies::Yes)
            .await
            .change_context(QueryError)?;
        let policy_branches = Filter::<Entity>::for_policy_branches(
            policy_components.extract_filter_policies(ActionName::ViewEntity),
            policy_components.actor_id(),
            policy_components.optimization_data(ActionName::ViewEntity),
        );
        // The branch count is the fan-out of sequential key-reads, so a slow search with a
        // pathological policy set stays attributable.
        tracing::Span::current().record("branches", policy_branches.len());

        if policy_branches.is_empty() {
            return Ok(empty_response());
        }

        // A search always runs against the current time.
        let temporal_axes = QueryTemporalAxesUnresolved::live_only().resolve();
        let request_filter = request_filter(&entity_type_ids, &web_ids);

        let candidate_pool = limit.saturating_mul(QUANTIZED_RANK_OVERFETCH);
        self.prepare_hnsw_scan(candidate_pool).await?;

        // The branches may permit overlapping sets of entities, so the candidate keys
        // deduplicate before the rerank.
        let mut candidates = HashSet::new();
        for policy_branch in &policy_branches {
            candidates.extend(
                self.branch_candidates(
                    policy_branch,
                    &request_filter,
                    &temporal_axes,
                    include_drafts,
                    &embedding,
                    candidate_pool,
                )
                .await?,
            );
        }

        if candidates.is_empty() {
            return Ok(empty_response());
        }

        let ranked = self
            .rerank_candidates(
                &candidates,
                &embedding,
                maximum_semantic_distance.into_inner(),
                limit,
            )
            .await?;

        if ranked.len() < limit {
            // Expected for actors whose filters pass few candidates: the iterative scan gives up
            // at `hnsw.max_scan_tuples`. The event is what distinguishes that from a genuinely
            // sparse result when a search returns fewer rows than requested.
            tracing::debug!(
                limit,
                ranked = ranked.len(),
                candidates = candidates.len(),
                candidate_pool,
                branches = policy_branches.len(),
                "the search returned fewer results than requested"
            );
        }

        if ranked.is_empty() {
            return Ok(empty_response());
        }

        self.hydrate_ranked(actor_id, &ranked, include_drafts, include_entity_types)
            .await
    }

    /// Prepares the transaction's HNSW scans to produce the whole candidate pool.
    ///
    /// An HNSW scan stops after `ef_search` tuples (default 40) regardless of the statement's
    /// limit. The iterative mode resumes the walk when the filters discard candidates, or when
    /// the pool exceeds the setting's range of 1 to 1000. `SET LOCAL` scopes the settings to
    /// the enclosing transaction.
    async fn prepare_hnsw_scan(&self, candidate_pool: usize) -> Result<(), Report<QueryError>> {
        let settings = format!(
            "SET LOCAL hnsw.ef_search = {};
             SET LOCAL hnsw.iterative_scan = relaxed_order;",
            candidate_pool.clamp(1, 1000)
        );
        self.as_client()
            .batch_execute(&settings)
            .instrument(tracing::info_span!(
                "SET",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = settings,
            ))
            .await
            .change_context(QueryError)
    }

    /// Reads one policy branch's candidate keys, ranked on the quantized embedding.
    async fn branch_candidates(
        &self,
        policy_branch: &Filter<'_, Entity>,
        request_filter: &Filter<'_, Entity>,
        temporal_axes: &QueryTemporalAxes,
        include_drafts: bool,
        embedding: &Embedding<'_>,
        candidate_pool: usize,
    ) -> Result<Vec<EntityId>, Report<QueryError>> {
        let web_id_path = EntityQueryPath::WebId;
        let uuid_path = EntityQueryPath::Uuid;
        let draft_id_path = EntityQueryPath::DraftId;
        let embedding_path = EntityQueryPath::Embedding;

        let mut compiler = SelectCompiler::<Entity>::new(Some(temporal_axes), include_drafts);
        compiler
            .add_filter(policy_branch)
            .change_context(QueryError)?;
        compiler
            .add_filter(request_filter)
            .change_context(QueryError)?;
        compiler.add_selection_path(&web_id_path);
        compiler.add_selection_path(&uuid_path);
        compiler.add_selection_path(&draft_id_path);
        let embeddings_alias = compiler
            .rank_by_quantized_distance(&embedding_path, embedding)
            .change_context(QueryError)?;
        // The search compares against the combined embedding over all of an entity's properties.
        compiler.restrict_embedding_property(embeddings_alias, None);
        compiler.set_limit(candidate_pool);

        let (statement, parameters) = compiler.compile();
        Ok(self
            .as_client()
            .query(&statement, parameters)
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement,
            ))
            .await
            .change_context(QueryError)?
            .into_iter()
            .map(|row| EntityId {
                web_id: row.get(0),
                entity_uuid: row.get(1),
                draft_id: row.get(2),
            })
            .collect())
    }

    /// Re-scores the candidates against the full vector, applying the distance threshold.
    async fn rerank_candidates(
        &self,
        candidates: &HashSet<EntityId>,
        embedding: &Embedding<'_>,
        maximum_distance: f64,
        limit: usize,
    ) -> Result<Vec<EntityId>, Report<QueryError>> {
        let mut candidate_web_ids = Vec::with_capacity(candidates.len());
        let mut candidate_entity_uuids = Vec::with_capacity(candidates.len());
        let mut candidate_draft_ids = Vec::with_capacity(candidates.len());
        for entity_id in candidates {
            candidate_web_ids.push(entity_id.web_id);
            candidate_entity_uuids.push(entity_id.entity_uuid);
            candidate_draft_ids.push(entity_id.draft_id);
        }

        let statement = rerank_statement(limit);
        let parameters: [&(dyn ToSql + Sync); 5] = [
            &candidate_web_ids,
            &candidate_entity_uuids,
            &candidate_draft_ids,
            embedding,
            &maximum_distance,
        ];

        Ok(self
            .as_client()
            .query(&statement, &parameters)
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement,
            ))
            .await
            .change_context(QueryError)?
            .into_iter()
            .map(|row| EntityId {
                web_id: row.get(0),
                entity_uuid: row.get(1),
                draft_id: row.get(2),
            })
            .collect())
    }

    /// Hydrates the ranked entities, restoring the ranking the hydration read does not preserve.
    async fn hydrate_ranked(
        &self,
        actor_id: ActorId,
        ranked: &[EntityId],
        include_drafts: bool,
        include_entity_types: bool,
    ) -> Result<SearchEntitiesResponse, Report<QueryError>> {
        // The box cuts the hydration subtree out of the search future's type, whose layout
        // otherwise overflows rustc's recursion depth.
        let response = Box::pin(
            self.query_entities_impl(
                Some(actor_id),
                QueryEntitiesParams {
                    filter: Filter::Any(
                        ranked
                            .iter()
                            .map(|&entity_id| {
                                let by_id = Filter::for_entity_by_entity_id(entity_id);
                                if entity_id.draft_id.is_some() {
                                    by_id
                                } else {
                                    // The shared filter leaves the draft dimension open for live
                                    // ids, which would hydrate an entity's drafts alongside it
                                    // when drafts are included.
                                    Filter::All(vec![
                                        by_id,
                                        Filter::Not(Box::new(Filter::Exists {
                                            path: EntityQueryPath::DraftId,
                                        })),
                                    ])
                                }
                            })
                            .collect(),
                    ),
                    temporal_axes: QueryTemporalAxesUnresolved::live_only(),
                    sorting: EntityQuerySorting {
                        paths: vec![],
                        cursor: None,
                    },
                    conversions: Vec::new(),
                    // The filter already names exactly the entities to hydrate.
                    limit: ranked.len(),
                    include_drafts,
                    include_entity_types: include_entity_types
                        .then_some(IncludeEntityTypeOption::Closed),
                    include_permissions: false,
                },
            ),
        )
        .await?;

        // The hydration filter names exactly the ranked ids, so a row without a rank cannot
        // occur — dropping it beats `Option`'s None-first ordering, which would put it on top.
        let ranks = ranked
            .iter()
            .enumerate()
            .map(|(rank, &entity_id)| (entity_id, rank))
            .collect::<HashMap<_, _>>();
        let mut entities = response.entities;
        entities.retain(|entity| ranks.contains_key(&entity.metadata.record_id.entity_id));
        if entities.len() != ranked.len() {
            // The hydration applies the policies a second time, so a shortfall means the branch
            // decomposition permitted more than the combined policy filter does.
            tracing::warn!(
                ranked = ranked.len(),
                hydrated = entities.len(),
                "the hydration disagrees with the ranked candidates"
            );
        }
        entities.sort_by_key(|entity| {
            ranks
                .get(&entity.metadata.record_id.entity_id)
                .copied()
                .expect("the retained entities should all carry a rank")
        });

        Ok(SearchEntitiesResponse {
            entities,
            closed_multi_entity_types: response.closed_multi_entity_types,
        })
    }
}

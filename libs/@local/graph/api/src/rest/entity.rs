//! Web routes for CRU operations on entities.

use alloc::sync::Arc;
use core::{assert_matches::debug_assert_matches, mem};
use std::collections::HashMap;

use axum::{Extension, Router, response::Response, routing::post};
use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hash_graph_postgres_store::store::error::{EntityDoesNotExist, RaceConditionOnUpdate};
use hash_graph_store::{
    entity::{
        ClosedMultiEntityTypeMap, CountEntitiesParams, CreateEntityParams, DiffEntityParams,
        DiffEntityResult, EntityQueryCursor, EntityQueryPath, EntityQuerySorting,
        EntityQuerySortingRecord, EntityQuerySortingToken, EntityQueryToken, EntityStore,
        EntityTypesError, EntityValidationReport, EntityValidationType, GetEntitiesParams,
        GetEntitiesResponse, GetEntitySubgraphParams, HasPermissionForEntitiesParams,
        LinkDataStateError, LinkDataValidationReport, LinkError, LinkTargetError,
        LinkValidationReport, LinkedEntityError, MetadataValidationReport, PatchEntityParams,
        PropertyMetadataValidationReport, QueryConversion, UnexpectedEntityType,
        UpdateEntityEmbeddingsParams, ValidateEntityComponents, ValidateEntityParams,
    },
    entity_type::{EntityTypeResolveDefinitions, IncludeEntityTypeOption},
    filter::Filter,
    pool::StorePool,
    query::{NullOrdering, Ordering},
    subgraph::{
        edges::{GraphResolveDepths, SubgraphTraversalParams, TraversalPath},
        temporal_axes::QueryTemporalAxesUnresolved,
    },
};
use hash_graph_types::{
    Embedding,
    knowledge::{
        entity::EntityEmbedding,
        property::visitor::{
            ArrayItemNumberMismatch, ArrayValidationReport, DataTypeCanonicalCalculation,
            DataTypeConversionError, DataTypeInferenceError, JsonSchemaValueTypeMismatch,
            ObjectPropertyValidationReport, ObjectValidationReport, OneOfArrayValidationReports,
            OneOfObjectValidationReports, OneOfPropertyValidationReports,
            PropertyArrayValidationReport, PropertyObjectValidationReport,
            PropertyValidationReport, PropertyValueTypeMismatch, PropertyValueValidationReport,
            ValueValidationError, ValueValidationReport,
        },
    },
};
use hash_temporal_client::TemporalClient;
use hashql_core::{
    collection::fast_hash_map, heap::Heap, module::ModuleRegistry, span::storage::SpanStorage,
    r#type::environment::Environment,
};
use hashql_eval::graph::read::FilterSlice;
use hashql_hir::visit::Visitor as _;
use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::{
        Confidence, Entity, Property,
        entity::{
            EntityMetadata, LinkData,
            id::{EntityEditionId, EntityId, EntityRecordId, EntityUuid},
            metadata::{EntityTemporalMetadata, EntityTypeIdDiff},
            provenance::{
                EntityEditionProvenance, EntityProvenance, InferredEntityProvenance,
                ProvidedEntityEditionProvenance,
            },
        },
        property::{
            PropertyArrayWithMetadata, PropertyDiff, PropertyObject, PropertyObjectWithMetadata,
            PropertyPatchOperation, PropertyPath, PropertyPathElement, PropertyValueWithMetadata,
            PropertyWithMetadata,
            metadata::{
                ArrayMetadata, ObjectMetadata, PropertyArrayMetadata, PropertyMetadata,
                PropertyObjectMetadata, PropertyProvenance, PropertyValueMetadata,
            },
        },
        value::{ValueMetadata, metadata::ValueProvenance},
    },
    ontology::VersionedUrl,
    principal::{
        actor::{ActorEntityUuid, ActorType},
        actor_group::WebId,
    },
    provenance::{Location, OriginProvenance, SourceProvenance, SourceType},
};
use utoipa::{OpenApi, ToSchema};

use crate::rest::{
    AuthenticatedUserHeader, OpenApiQuery, QueryLogger, json::Json, status::report_to_response,
    utoipa_typedef::subgraph::Subgraph,
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_entity,
        create_entities,
        validate_entity,
        has_permission_for_entities,
        get_entities,
        get_entity_subgraph,
        count_entities,
        patch_entity,
        update_entity_embeddings,
        diff_entity,
    ),
    components(
        schemas(
            CreateEntityParams,
            PropertyWithMetadata,
            PropertyValueWithMetadata,
            PropertyArrayWithMetadata,
            PropertyObjectWithMetadata,
            ValidateEntityParams,
            CountEntitiesParams,
            EntityValidationType,
            ValidateEntityComponents,
            Embedding,
            UpdateEntityEmbeddingsParams,
            EntityEmbedding,
            EntityQueryToken,

            PatchEntityParams,
            PropertyPatchOperation,

            HasPermissionForEntitiesParams,

            GetEntitiesRequest,
            GetEntitySubgraphRequest,
            EntityQueryCursor,
            Ordering,
            NullOrdering,
            EntityQuerySortingRecord,
            EntityQuerySortingToken,
            GetEntitiesResponse,
            GetEntitySubgraphResponse,
            ClosedMultiEntityTypeMap,
            QueryConversion,

            Entity,
            Property,
            PropertyProvenance,
            PropertyObject,
            ArrayMetadata,
            ObjectMetadata,
            ValueMetadata,
            ValueProvenance,
            PropertyObjectMetadata,
            PropertyArrayMetadata,
            PropertyValueMetadata,
            PropertyMetadata,
            EntityUuid,
            EntityId,
            EntityEditionId,
            EntityMetadata,
            EntityProvenance,
            EntityEditionProvenance,
            InferredEntityProvenance,
            ProvidedEntityEditionProvenance,
            ActorType,
            OriginProvenance,
            SourceType,
            SourceProvenance,
            Location,
            EntityRecordId,
            EntityTemporalMetadata,
            EntityQueryToken,
            LinkData,
            EntityValidationReport,
            LinkedEntityError,
            LinkDataValidationReport,
            LinkDataStateError,
            LinkValidationReport,
            LinkError,
            LinkTargetError,
            UnexpectedEntityType,
            MetadataValidationReport,
            EntityTypesError,
            PropertyMetadataValidationReport,
            ObjectPropertyValidationReport,
            JsonSchemaValueTypeMismatch,
            ArrayValidationReport,
            ArrayItemNumberMismatch,
            PropertyValidationReport,
            OneOfPropertyValidationReports,
            PropertyValueValidationReport,
            ObjectValidationReport,
            DataTypeConversionError,
            DataTypeCanonicalCalculation,
            DataTypeInferenceError,
            PropertyValueTypeMismatch,
            OneOfArrayValidationReports,
            PropertyArrayValidationReport,
            OneOfObjectValidationReports,
            PropertyObjectValidationReport,
            ValueValidationReport,
            ValueValidationError,

            DiffEntityParams,
            DiffEntityResult,
            EntityTypeIdDiff,
            PropertyDiff,
            PropertyPath,
            PropertyPathElement,
            Confidence,
        )
    ),
    tags(
        (name = "Entity", description = "entity management API")
    )
)]
pub(crate) struct EntityResource;

impl EntityResource {
    /// Create routes for interacting with entities.
    pub(crate) fn routes<S>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/entities",
            Router::new()
                .route("/", post(create_entity::<S>).patch(patch_entity::<S>))
                .route("/bulk", post(create_entities::<S>))
                .route("/diff", post(diff_entity::<S>))
                .route("/validate", post(validate_entity::<S>))
                .route("/embeddings", post(update_entity_embeddings::<S>))
                .route("/permissions", post(has_permission_for_entities::<S>))
                .nest(
                    "/query",
                    Router::new()
                        .route("/", post(get_entities::<S>))
                        .route("/subgraph", post(get_entity_subgraph::<S>))
                        .route("/count", post(count_entities::<S>)),
                ),
        )
    }
}

#[utoipa::path(
    post,
    path = "/entities",
    request_body = CreateEntityParams,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The created entity", body = Entity),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity Type URL was not found"),
        (status = 500, description = "Store error occurred"),
    ),
)]
async fn create_entity<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<Entity>, Response>
where
    S: StorePool + Send + Sync,
{
    let params = CreateEntityParams::deserialize(&body)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .create_entity(actor_id, params)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/entities/bulk",
    request_body = [CreateEntityParams],
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The created entities", body = [Entity]),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity Type URL was not found"),
        (status = 500, description = "Store error occurred"),
    ),
)]
async fn create_entities<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<Vec<Entity>>, Response>
where
    S: StorePool + Send + Sync,
{
    let params = Vec::<CreateEntityParams>::deserialize(&body)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .create_entities(actor_id, params)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/entities/validate",
    request_body = ValidateEntityParams,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The validation report", body = HashMap<usize, EntityValidationReport>),
        (status = 400, content_type = "application/json", description = "The entity validation failed"),

        (status = 404, description = "Entity Type URL was not found"),
        (status = 500, description = "Store error occurred"),
    ),
)]
async fn validate_entity<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<HashMap<usize, EntityValidationReport>>, Response>
where
    S: StorePool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::ValidateEntity(&body));
    }

    let params = ValidateEntityParams::deserialize(&body)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let response = store
        .validate_entity(actor_id, params)
        .await
        .map_err(report_to_response)
        .map(Json);
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[utoipa::path(
    post,
    path = "/entities/permissions",
    tag = "Entity",
    request_body = HasPermissionForEntitiesParams,
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, body = HashMap<EntityUuid, Vec<EntityEditionId>>, description = "Information if the actor has the permission for the entities"),

        (status = 500, description = "Internal error occurred"),
    )
)]
async fn has_permission_for_entities<S>(
    AuthenticatedUserHeader(actor): AuthenticatedUserHeader,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
    Json(params): Json<HasPermissionForEntitiesParams<'static>>,
) -> Result<Json<HashMap<EntityId, Vec<EntityEditionId>>>, Response>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: EntityStore,
{
    store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?
        .has_permission_for_entities(AuthenticatedActor::from(actor), params)
        .await
        .map(Json)
        .map_err(report_to_response)
}

#[tracing::instrument(level = "info", skip_all)]
fn generate_sorting_paths(
    paths: Option<Vec<EntityQuerySortingRecord<'_>>>,
    limit: Option<usize>,
    cursor: Option<EntityQueryCursor<'_>>,
    temporal_axes: &QueryTemporalAxesUnresolved,
) -> EntityQuerySorting<'static> {
    let temporal_axes_sorting_path = match temporal_axes {
        QueryTemporalAxesUnresolved::TransactionTime { .. } => &EntityQueryPath::TransactionTime,
        QueryTemporalAxesUnresolved::DecisionTime { .. } => &EntityQueryPath::DecisionTime,
    };

    let sorting = paths
        .map_or_else(
            || {
                if limit.is_some() || cursor.is_some() {
                    vec![
                        EntityQuerySortingRecord {
                            path: temporal_axes_sorting_path.clone(),
                            ordering: Ordering::Descending,
                            nulls: None,
                        },
                        EntityQuerySortingRecord {
                            path: EntityQueryPath::Uuid,
                            ordering: Ordering::Ascending,
                            nulls: None,
                        },
                        EntityQuerySortingRecord {
                            path: EntityQueryPath::WebId,
                            ordering: Ordering::Ascending,
                            nulls: None,
                        },
                    ]
                } else {
                    Vec::new()
                }
            },
            |mut paths| {
                let mut has_temporal_axis = false;
                let mut has_uuid = false;
                let mut has_web_id = false;

                for path in &paths {
                    if path.path == EntityQueryPath::TransactionTime
                        || path.path == EntityQueryPath::DecisionTime
                    {
                        has_temporal_axis = true;
                    }
                    if path.path == EntityQueryPath::Uuid {
                        has_uuid = true;
                    }
                    if path.path == EntityQueryPath::WebId {
                        has_web_id = true;
                    }
                }

                if !has_temporal_axis {
                    paths.push(EntityQuerySortingRecord {
                        path: temporal_axes_sorting_path.clone(),
                        ordering: Ordering::Descending,
                        nulls: None,
                    });
                }
                if !has_uuid {
                    paths.push(EntityQuerySortingRecord {
                        path: EntityQueryPath::Uuid,
                        ordering: Ordering::Ascending,
                        nulls: None,
                    });
                }
                if !has_web_id {
                    paths.push(EntityQuerySortingRecord {
                        path: EntityQueryPath::WebId,
                        ordering: Ordering::Ascending,
                        nulls: None,
                    });
                }

                paths
            },
        )
        .into_iter()
        .map(EntityQuerySortingRecord::into_owned)
        .collect();

    EntityQuerySorting {
        paths: sorting,
        cursor: cursor.map(EntityQueryCursor::into_owned),
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(untagged, deny_unknown_fields)]
#[expect(clippy::large_enum_variant)]
pub enum GetEntitiesQuery<'q> {
    Filter {
        #[serde(borrow)]
        filter: Filter<'q, Entity>,
    },
    Query {
        #[serde(borrow)]
        query: &'q serde_json::value::RawValue,
    },
    /// Empty query
    ///
    /// Cannot be used directly, only used internally when removing the query from the request body.
    #[serde(skip)]
    #[doc(hidden)]
    Empty,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "Parameter struct deserialized from JSON"
)]
pub struct GetEntitiesRequest<'q, 's, 'p> {
    #[serde(flatten, borrow)]
    pub query: GetEntitiesQuery<'q>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
    pub limit: Option<usize>,
    #[serde(borrow, default)]
    pub conversions: Vec<QueryConversion<'p>>,
    #[serde(borrow)]
    pub sorting_paths: Option<Vec<EntityQuerySortingRecord<'p>>>,
    #[serde(borrow)]
    pub cursor: Option<EntityQueryCursor<'s>>,
    #[serde(default)]
    pub include_count: bool,
    #[serde(default)]
    pub include_entity_types: Option<IncludeEntityTypeOption>,
    #[serde(default)]
    pub include_web_ids: bool,
    #[serde(default)]
    pub include_created_by_ids: bool,
    #[serde(default)]
    pub include_edition_created_by_ids: bool,
    #[serde(default)]
    pub include_type_ids: bool,
    #[serde(default)]
    pub include_type_titles: bool,
}

fn get_entities_request_to_params<'q, 's, 'p: 'q>(
    request: GetEntitiesRequest<'_, 's, 'p>,
    filter: Filter<'q, Entity>,
) -> GetEntitiesParams<'q> {
    debug_assert_matches!(
        request.query,
        GetEntitiesQuery::Empty,
        "The query parameter is unused, instead use the filter parameter."
    );

    GetEntitiesParams {
        filter,
        sorting: generate_sorting_paths(
            request.sorting_paths,
            request.limit,
            request.cursor,
            &request.temporal_axes,
        ),
        limit: request.limit,
        conversions: request.conversions,
        include_drafts: request.include_drafts,
        include_count: request.include_count,
        include_entity_types: request.include_entity_types,
        temporal_axes: request.temporal_axes,
        include_web_ids: request.include_web_ids,
        include_created_by_ids: request.include_created_by_ids,
        include_edition_created_by_ids: request.include_edition_created_by_ids,
        include_type_ids: request.include_type_ids,
        include_type_titles: request.include_type_titles,
    }
}

#[expect(
    clippy::unnecessary_wraps,
    clippy::panic_in_result_fn,
    reason = "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly"
)]
fn compile_query<'h, 'q>(
    heap: &'h Heap,
    query: &'q serde_json::value::RawValue,
) -> Result<Filter<'h, Entity>, !> {
    let spans = Arc::new(SpanStorage::new());

    // Parse the query
    let parser = hashql_syntax_jexpr::Parser::new(heap, Arc::clone(&spans));
    let mut ast = parser.parse_expr(query.get().as_bytes()).expect(
        "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly",
    );

    let mut env = Environment::new(ast.span, heap);
    let modules = ModuleRegistry::new(&env);

    // Lower the AST
    let (types, diagnostics) =
        hashql_ast::lowering::lower(heap.intern_symbol("main"), &mut ast, &env, &modules);
    assert!(
        diagnostics.is_empty(),
        "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly"
    );

    let interner = hashql_hir::intern::Interner::new(heap);

    // Reify the HIR from the AST
    let (hir, diagnostics) = hashql_hir::node::Node::from_ast(ast, &env, &interner, &types);
    assert!(
        diagnostics.is_empty(),
        "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly"
    );
    let hir = hir.expect(
        "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly",
    );

    // Lower the HIR
    let hir = hashql_hir::lower::lower(hir, &types, &mut env, &modules, &interner).expect(
        "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly",
    );

    // Evaluate the HIR
    // TODO: https://linear.app/hash/issue/BE-41/hashql-expose-input-in-graph-api
    let inputs = fast_hash_map(0);
    let mut compiler = hashql_eval::graph::read::GraphReadCompiler::new(heap, &inputs);

    compiler.visit_node(&hir);

    let result = compiler.finish().expect(
        "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly",
    );

    let output = result.output.get(&hir.id).expect(
        "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly",
    );

    // Compile the Filter into one
    let filters = match output {
        FilterSlice::Entity { range } => result.filters.entity(range.clone()),
    };

    let filter = match filters {
        [] => Filter::All(Vec::new()),
        [filter] => filter.clone(),
        _ => Filter::All(filters.to_vec()),
    };

    Ok(filter)
}

#[utoipa::path(
    post,
    path = "/entities/query",
    request_body = GetEntitiesRequest,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("after" = Option<String>, Query, description = "The cursor to start reading from"),
        ("limit" = Option<usize>, Query, description = "The maximum number of entities to read"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = GetEntitiesResponse,
            description = "A list of entities that satisfy the given query.",
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_entities<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<GetEntitiesResponse<'static>>, Response>
where
    S: StorePool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetEntities(&request));
    }

    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let mut request = GetEntitiesRequest::deserialize(&request)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    if request.limit == Some(0) {
        tracing::warn!(
            %actor_id,
            "The limit is set to zero, so no entities will be returned."
        );
    }

    let query = mem::replace(&mut request.query, GetEntitiesQuery::Empty);

    // TODO: https://linear.app/hash/issue/H-5351/reuse-parts-between-compilation-units
    let heap = Heap::empty_unchecked();

    let filter = match query {
        GetEntitiesQuery::Empty => unreachable!("empty cannot be deserialized"),
        GetEntitiesQuery::Filter { filter } => filter,
        GetEntitiesQuery::Query { query } => {
            // "super let" would not require us to prime the heap separately, we could just declare
            // the heap here
            heap.prime_unchecked();

            compile_query(&heap, query).expect(
                "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly",
            )
        }
    };

    let params = get_entities_request_to_params(request, filter);

    let response = store
        .get_entities(actor_id, params)
        .await
        .map(|response| {
            Json(GetEntitiesResponse {
                entities: response.entities,
                cursor: response.cursor.map(EntityQueryCursor::into_owned),
                count: response.count,
                closed_multi_entity_types: response.closed_multi_entity_types,
                definitions: response.definitions,
                web_ids: response.web_ids,
                created_by_ids: response.created_by_ids,
                edition_created_by_ids: response.edition_created_by_ids,
                type_ids: response.type_ids,
                type_titles: response.type_titles,
            })
        })
        .map_err(report_to_response);

    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

fn get_entities_subgraph_request_to_params<'q, 's, 'p: 'q>(
    request: GetEntitySubgraphRequest<'_, 's, 'p>,
    filter: Filter<'q, Entity>,
) -> GetEntitySubgraphParams<'q> {
    match request {
        GetEntitySubgraphRequest::ResolveDepths {
            graph_resolve_depths,
            request,
        } => GetEntitySubgraphParams::ResolveDepths {
            graph_resolve_depths,
            request: get_entities_request_to_params(request, filter),
        },
        GetEntitySubgraphRequest::Paths {
            traversal_paths,
            request,
        } => GetEntitySubgraphParams::Paths {
            traversal_paths,
            request: get_entities_request_to_params(request, filter),
        },
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(untagged, deny_unknown_fields)]
pub enum GetEntitySubgraphRequest<'q, 's, 'p> {
    #[serde(rename_all = "camelCase")]
    ResolveDepths {
        graph_resolve_depths: GraphResolveDepths,
        #[serde(borrow, flatten)]
        request: GetEntitiesRequest<'q, 's, 'p>,
    },
    #[serde(rename_all = "camelCase")]
    Paths {
        traversal_paths: Vec<TraversalPath>,
        #[serde(borrow, flatten)]
        request: GetEntitiesRequest<'q, 's, 'p>,
    },
}

impl<'q, 's, 'p> GetEntitySubgraphRequest<'q, 's, 'p> {
    #[must_use]
    pub fn from_parts(
        request: GetEntitiesRequest<'q, 's, 'p>,
        traversal_params: SubgraphTraversalParams,
    ) -> Self {
        match traversal_params {
            SubgraphTraversalParams::Paths { traversal_paths } => Self::Paths {
                request,
                traversal_paths,
            },
            SubgraphTraversalParams::ResolveDepths {
                graph_resolve_depths,
            } => Self::ResolveDepths {
                request,
                graph_resolve_depths,
            },
        }
    }

    #[must_use]
    pub fn into_parts(self) -> (GetEntitiesRequest<'q, 's, 'p>, SubgraphTraversalParams) {
        match self {
            Self::Paths {
                request,
                traversal_paths,
            } => (request, SubgraphTraversalParams::Paths { traversal_paths }),
            Self::ResolveDepths {
                request,
                graph_resolve_depths,
            } => (
                request,
                SubgraphTraversalParams::ResolveDepths {
                    graph_resolve_depths,
                },
            ),
        }
    }
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct GetEntitySubgraphResponse<'r> {
    subgraph: Subgraph,
    #[serde(borrow)]
    cursor: Option<EntityQueryCursor<'r>>,
    count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    closed_multi_entity_types: Option<HashMap<VersionedUrl, ClosedMultiEntityTypeMap>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    definitions: Option<EntityTypeResolveDefinitions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    web_ids: Option<HashMap<WebId, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    edition_created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    type_ids: Option<HashMap<VersionedUrl, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    type_titles: Option<HashMap<VersionedUrl, String>>,
}

#[utoipa::path(
    post,
    path = "/entities/query/subgraph",
    request_body = GetEntitySubgraphRequest,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("after" = Option<String>, Query, description = "The cursor to start reading from"),
        ("limit" = Option<usize>, Query, description = "The maximum number of entities to read"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = GetEntitySubgraphResponse,
            description = "A subgraph rooted at entities that satisfy the given query, each resolved to the requested depth.",
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_entity_subgraph<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<GetEntitySubgraphResponse<'static>>, Response>
where
    S: StorePool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetEntitySubgraph(&request));
    }

    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let mut request = GetEntitySubgraphRequest::deserialize(&request)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    let query = mem::replace(
        match &mut request {
            GetEntitySubgraphRequest::ResolveDepths {
                graph_resolve_depths: _,
                request,
            }
            | GetEntitySubgraphRequest::Paths {
                traversal_paths: _,
                request,
            } => &mut request.query,
        },
        GetEntitiesQuery::Empty,
    );

    // TODO: https://linear.app/hash/issue/H-5351/reuse-parts-between-compilation-units
    let heap = Heap::empty_unchecked();

    let filter = match query {
        GetEntitiesQuery::Empty => unreachable!("empty cannot be deserialized"),
        GetEntitiesQuery::Filter { filter } => filter,
        GetEntitiesQuery::Query { query } => {
            // "super let" would not require us to prime the heap separately, we could just declare
            // the heap here
            heap.prime_unchecked();

            compile_query(&heap, query).expect(
                "https://linear.app/hash/issue/BE-39/hashql-handle-errors-in-the-graph-api-properly",
            )
        }
    };

    let params = get_entities_subgraph_request_to_params(request, filter);

    let response = store
        .get_entity_subgraph(actor_id, params)
        .await
        .map(|response| {
            Json(GetEntitySubgraphResponse {
                subgraph: response.subgraph.into(),
                cursor: response.cursor.map(EntityQueryCursor::into_owned),
                count: response.count,
                closed_multi_entity_types: response.closed_multi_entity_types,
                definitions: response.definitions,
                web_ids: response.web_ids,
                created_by_ids: response.created_by_ids,
                edition_created_by_ids: response.edition_created_by_ids,
                type_ids: response.type_ids,
                type_titles: response.type_titles,
            })
        })
        .map_err(report_to_response);
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[utoipa::path(
    post,
    path = "/entities/query/count",
    request_body = CountEntitiesParams,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),

    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = usize,
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
async fn count_entities<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<usize>, Response>
where
    S: StorePool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::CountEntities(&request));
    }

    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let response = store
        .count_entities(
            actor_id,
            CountEntitiesParams::deserialize(&request)
                .map_err(Report::from)
                .map_err(report_to_response)?,
        )
        .await
        .map(Json)
        .map_err(report_to_response);
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[utoipa::path(
    patch,
    path = "/entities",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The updated entity", body = Entity),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),
        (status = 423, content_type = "text/plain", description = "The entity that should be updated was unexpectedly updated at the same time"),

        (status = 404, description = "Entity ID or Entity Type URL was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = PatchEntityParams,
)]
async fn patch_entity<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(params): Json<PatchEntityParams>,
) -> Result<Json<Entity>, Response>
where
    S: StorePool + Send + Sync,
{
    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .patch_entity(actor_id, params)
        .await
        .map_err(|report| {
            if report.contains::<EntityDoesNotExist>() {
                report.attach_opaque(hash_status::StatusCode::NotFound)
            } else if report.contains::<RaceConditionOnUpdate>() {
                report.attach_opaque(hash_status::StatusCode::Cancelled)
            } else {
                report
            }
        })
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/entities/embeddings",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, content_type = "application/json", description = "The embeddings were created"),

        (status = 403, description = "Insufficient permissions to update the entity"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateEntityEmbeddingsParams,
)]
async fn update_entity_embeddings<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<(), Response>
where
    S: StorePool + Send + Sync,
{
    // Manually deserialize the request from a JSON value to allow borrowed deserialization and
    // better error reporting.
    let params = UpdateEntityEmbeddingsParams::deserialize(body)
        .attach_opaque(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .update_entity_embeddings(actor_id, params)
        .await
        .map_err(report_to_response)
}

#[utoipa::path(
    post,
    path = "/entities/diff",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The difference between the two entities", body = DiffEntityResult),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = DiffEntityParams,
)]
async fn diff_entity<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(params): Json<DiffEntityParams>,
) -> Result<Json<DiffEntityResult<'static>>, Response>
where
    S: StorePool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::DiffEntity(&params));
    }

    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let response = store
        .diff_entity(actor_id, params)
        .await
        .map_err(|report| {
            if report.contains::<EntityDoesNotExist>() {
                report.attach_opaque(hash_status::StatusCode::NotFound)
            } else {
                report
            }
        })
        .map_err(report_to_response)
        .map(Json);
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

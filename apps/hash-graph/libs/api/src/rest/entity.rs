//! Web routes for CRU operations on entities.

use alloc::sync::Arc;

use authorization::{
    backend::{ModifyRelationshipOperation, PermissionAssertion},
    schema::{
        EntityAdministratorSubject, EntityEditorSubject, EntityOwnerSubject, EntityPermission,
        EntityRelationAndSubject, EntitySetting, EntitySettingSubject, EntitySubjectSet,
        EntityViewerSubject, WebOwnerSubject,
    },
    zanzibar::Consistency,
    AuthorizationApi, AuthorizationApiPool,
};
use axum::{
    extract::Path,
    http::StatusCode,
    response::Response,
    routing::{get, post},
    Extension, Router,
};
use error_stack::{Report, ResultExt};
use graph::{
    knowledge::{EntityQueryPath, EntityQuerySortingToken, EntityQueryToken},
    store::{
        error::{EntityDoesNotExist, RaceConditionOnUpdate},
        knowledge::{
            CountEntitiesParams, CreateEntityRequest, DiffEntityParams, DiffEntityResult,
            GetEntitiesParams, GetEntitiesResponse, GetEntitySubgraphParams, PatchEntityParams,
            UpdateEntityEmbeddingsParams, ValidateEntityParams,
        },
        query::Filter,
        AccountStore, EntityQueryCursor, EntityQuerySorting, EntityQuerySortingRecord, EntityStore,
        EntityValidationType, NullOrdering, Ordering, StorePool,
    },
    subgraph::{edges::GraphResolveDepths, temporal_axes::QueryTemporalAxesUnresolved},
};
use graph_types::{
    knowledge::{
        entity::{
            ActorType, Entity, EntityEditionId, EntityEditionProvenance, EntityEmbedding, EntityId,
            EntityMetadata, EntityProvenance, EntityRecordId, EntityTemporalMetadata, EntityUuid,
            InferredEntityProvenance, Location, OriginProvenance, ProvidedEntityEditionProvenance,
            SourceProvenance, SourceType,
        },
        link::LinkData,
        ArrayMetadata, Confidence, EntityTypeIdDiff, ObjectMetadata, Property, PropertyDiff,
        PropertyMetadata, PropertyMetadataObject, PropertyObject, PropertyPatchOperation,
        PropertyPath, PropertyPathElement, PropertyProvenance, PropertyWithMetadata,
        PropertyWithMetadataObject, ValueMetadata,
    },
    owned_by_id::OwnedById,
    Embedding,
};
use serde::{Deserialize, Serialize};
use temporal_client::TemporalClient;
use utoipa::{OpenApi, ToSchema};
use validation::ValidateEntityComponents;

use crate::rest::{
    api_resource::RoutedResource, json::Json, status::report_to_response,
    utoipa_typedef::subgraph::Subgraph, AuthenticatedUserHeader, PermissionResponse,
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_entity,
        create_entities,
        validate_entity,
        check_entity_permission,
        get_entities,
        get_entity_subgraph,
        count_entities,
        patch_entity,
        update_entity_embeddings,
        diff_entity,

        get_entity_authorization_relationships,
        modify_entity_authorization_relationships,

        add_entity_administrator,
        remove_entity_administrator,
        add_entity_editor,
        remove_entity_editor,
    ),
    components(
        schemas(
            CreateEntityRequest,
            PropertyWithMetadata,
            PropertyWithMetadataObject,
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

            EntityRelationAndSubject,
            EntityPermission,
            EntitySubjectSet,
            EntitySettingSubject,
            EntityOwnerSubject,
            EntityAdministratorSubject,
            EntityEditorSubject,
            EntityViewerSubject,
            ModifyEntityAuthorizationRelationship,
            ModifyRelationshipOperation,
            EntitySetting,

            GetEntitiesRequest,
            GetEntitySubgraphRequest,
            EntityQueryCursor,
            Ordering,
            NullOrdering,
            EntityQuerySortingRecord,
            EntityQuerySortingToken,
            GetEntitiesResponse,
            GetEntitySubgraphResponse,

            Entity,
            Property,
            PropertyProvenance,
            PropertyObject,
            ArrayMetadata,
            ObjectMetadata,
            ValueMetadata,
            PropertyMetadataObject,
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

impl RoutedResource for EntityResource {
    /// Create routes for interacting with entities.
    fn routes<S, A>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        A: AuthorizationApiPool + Send + Sync + 'static,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/entities",
            Router::new()
                .route("/", post(create_entity::<S, A>).patch(patch_entity::<S, A>))
                .route("/bulk", post(create_entities::<S, A>))
                .route(
                    "/relationships",
                    post(modify_entity_authorization_relationships::<A>),
                )
                .route("/diff", post(diff_entity::<S, A>))
                .route("/validate", post(validate_entity::<S, A>))
                .route("/embeddings", post(update_entity_embeddings::<S, A>))
                .nest(
                    "/:entity_id",
                    Router::new()
                        .route(
                            "/relationships",
                            get(get_entity_authorization_relationships::<A>),
                        )
                        .route(
                            "/administrators/:administrator",
                            post(add_entity_administrator::<A, S>)
                                .delete(remove_entity_administrator::<A, S>),
                        )
                        .route(
                            "/editors/:editor",
                            post(add_entity_editor::<A, S>).delete(remove_entity_editor::<A, S>),
                        )
                        .route(
                            "/permissions/:permission",
                            get(check_entity_permission::<A>),
                        ),
                )
                .nest(
                    "/query",
                    Router::new()
                        .route("/", post(get_entities::<S, A>))
                        .route("/subgraph", post(get_entity_subgraph::<S, A>))
                        .route("/count", post(count_entities::<S, A>)),
                ),
        )
    }
}

#[utoipa::path(
    post,
    path = "/entities",
    request_body = CreateEntityRequest,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The created entity", body = Entity),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity Type URL was not found"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn create_entity<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<Entity>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let params = CreateEntityRequest::deserialize(&body).map_err(report_to_response)?;

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
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
    request_body = [CreateEntityRequest],
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The created entities", body = [Entity]),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity Type URL was not found"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn create_entities<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<Vec<Entity>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let params = Vec::<CreateEntityRequest>::deserialize(&body).map_err(report_to_response)?;

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
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
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, description = "The validation passed"),
        (status = 400, content_type = "application/json", description = "The entity validation failed"),

        (status = 404, description = "Entity Type URL was not found"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn validate_entity<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<StatusCode, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let params = ValidateEntityParams::deserialize(&body).map_err(report_to_response)?;

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .validate_entity(actor_id, Consistency::FullyConsistent, params)
        .await
        .attach(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/entities/{entity_id}/permissions/{permission}",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The entity ID to check if the actor has the permission"),
        ("permission" = EntityPermission, Path, description = "The permission to check for"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor has the permission for the entity"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn check_entity_permission<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_id, permission)): Path<(EntityId, EntityPermission)>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<PermissionResponse>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(report_to_response)?
            .check_entity_permission(
                actor_id,
                permission,
                entity_id,
                Consistency::FullyConsistent,
            )
            .await
            .map_err(report_to_response)?
            .has_permission,
    }))
}

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
                            path: EntityQueryPath::OwnedById,
                            ordering: Ordering::Ascending,
                            nulls: None,
                        },
                    ]
                } else {
                    Vec::new()
                }
            },
            |mut paths| {
                paths.push(EntityQuerySortingRecord {
                    path: temporal_axes_sorting_path.clone(),
                    ordering: Ordering::Descending,
                    nulls: None,
                });
                paths.push(EntityQuerySortingRecord {
                    path: EntityQueryPath::Uuid,
                    ordering: Ordering::Ascending,
                    nulls: None,
                });
                paths.push(EntityQuerySortingRecord {
                    path: EntityQueryPath::OwnedById,
                    ordering: Ordering::Ascending,
                    nulls: None,
                });
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

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetEntitiesRequest<'q, 's, 'p> {
    #[serde(borrow)]
    filter: Filter<'q, Entity>,
    temporal_axes: QueryTemporalAxesUnresolved,
    include_drafts: bool,
    limit: Option<usize>,
    #[serde(borrow)]
    sorting_paths: Option<Vec<EntityQuerySortingRecord<'p>>>,
    #[serde(borrow)]
    cursor: Option<EntityQueryCursor<'s>>,
    #[serde(default)]
    include_count: bool,
}

#[utoipa::path(
    post,
    path = "/entities/query",
    request_body = GetEntitiesRequest,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
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
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, request)
)]
async fn get_entities<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<GetEntitiesResponse<'static>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let mut request = GetEntitiesRequest::deserialize(&request).map_err(report_to_response)?;
    request
        .filter
        .convert_parameters()
        .map_err(report_to_response)?;

    store
        .get_entities(
            actor_id,
            GetEntitiesParams {
                filter: request.filter,
                sorting: generate_sorting_paths(
                    request.sorting_paths,
                    request.limit,
                    request.cursor,
                    &request.temporal_axes,
                ),
                limit: request.limit,
                include_drafts: request.include_drafts,
                include_count: request.include_count,
                temporal_axes: request.temporal_axes,
            },
        )
        .await
        .map(|response| {
            Json(GetEntitiesResponse {
                entities: response.entities,
                cursor: response.cursor.map(EntityQueryCursor::into_owned),
                count: response.count,
            })
        })
        .map_err(report_to_response)
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetEntitySubgraphRequest<'q, 's, 'p> {
    #[serde(borrow)]
    filter: Filter<'q, Entity>,
    graph_resolve_depths: GraphResolveDepths,
    temporal_axes: QueryTemporalAxesUnresolved,
    include_drafts: bool,
    limit: Option<usize>,
    #[serde(borrow)]
    sorting_paths: Option<Vec<EntityQuerySortingRecord<'p>>>,
    #[serde(borrow)]
    cursor: Option<EntityQueryCursor<'s>>,
    #[serde(default)]
    include_count: bool,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct GetEntitySubgraphResponse<'r> {
    subgraph: Subgraph,
    #[serde(borrow)]
    cursor: Option<EntityQueryCursor<'r>>,
    count: Option<usize>,
}

#[utoipa::path(
    post,
    path = "/entities/query/subgraph",
    request_body = GetEntitySubgraphRequest,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
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
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, request)
)]
async fn get_entity_subgraph<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<GetEntitySubgraphResponse<'static>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let mut request =
        GetEntitySubgraphRequest::deserialize(&request).map_err(report_to_response)?;
    request
        .filter
        .convert_parameters()
        .map_err(report_to_response)?;

    store
        .get_entity_subgraph(
            actor_id,
            GetEntitySubgraphParams {
                filter: request.filter,
                sorting: generate_sorting_paths(
                    request.sorting_paths,
                    request.limit,
                    request.cursor,
                    &request.temporal_axes,
                ),
                limit: request.limit,
                graph_resolve_depths: request.graph_resolve_depths,
                include_drafts: request.include_drafts,
                include_count: request.include_count,
                temporal_axes: request.temporal_axes,
            },
        )
        .await
        .map(|response| {
            Json(GetEntitySubgraphResponse {
                subgraph: response.subgraph.into(),
                cursor: response.cursor.map(EntityQueryCursor::into_owned),
                count: response.count,
            })
        })
        .map_err(report_to_response)
}

#[utoipa::path(
    post,
    path = "/entities/query/count",
    request_body = CountEntitiesParams,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),

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
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, request)
)]
async fn count_entities<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<usize>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let mut query = CountEntitiesParams::deserialize(&request).map_err(report_to_response)?;
    query
        .filter
        .convert_parameters()
        .map_err(report_to_response)?;

    store
        .count_entities(actor_id, query)
        .await
        .map(Json)
        .map_err(report_to_response)
}

#[utoipa::path(
    patch,
    path = "/entities",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
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
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn patch_entity<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(params): Json<PatchEntityParams>,
) -> Result<Json<Entity>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .patch_entity(actor_id, params)
        .await
        .map_err(|report| {
            if report.contains::<EntityDoesNotExist>() {
                report.attach(hash_status::StatusCode::NotFound)
            } else if report.contains::<RaceConditionOnUpdate>() {
                report.attach(hash_status::StatusCode::Cancelled)
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
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, content_type = "application/json", description = "The embeddings were created"),

        (status = 403, description = "Insufficient permissions to update the entity"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateEntityEmbeddingsParams,
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, body)
)]
async fn update_entity_embeddings<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<(), Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    // Manually deserialize the request from a JSON value to allow borrowed deserialization and
    // better error reporting.
    let params = UpdateEntityEmbeddingsParams::deserialize(body)
        .attach(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
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
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The difference between the two entities", body = DiffEntityResult),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = DiffEntityParams,
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn diff_entity<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(params): Json<DiffEntityParams>,
) -> Result<Json<DiffEntityResult<'static>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .diff_entity(actor_id, params)
        .await
        .map_err(|report| {
            if report.contains::<EntityDoesNotExist>() {
                report.attach(hash_status::StatusCode::NotFound)
            } else {
                report
            }
        })
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/entities/{entity_id}/relationships",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The Entity to read the relations for"),
    ),
    responses(
        (status = 200, description = "The relations of the entity", body = [EntityRelationAndSubject]),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn get_entity_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(entity_id): Path<EntityId>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<Vec<EntityRelationAndSubject>>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    Ok(Json(
        authorization_api
            .get_entity_relations(entity_id, Consistency::FullyConsistent)
            .await
            .map_err(report_to_response)?,
    ))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct ModifyEntityAuthorizationRelationship {
    operation: ModifyRelationshipOperation,
    resource: EntityId,
    relation_subject: EntityRelationAndSubject,
}

#[utoipa::path(
    post,
    path = "/entities/relationships",
    tag = "Entity",
    request_body = [ModifyEntityAuthorizationRelationship],
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, description = "The relationship was modified for the entity"),

        (status = 403, description = "Permission denied"),
)
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn modify_entity_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    relationships: Json<Vec<ModifyEntityAuthorizationRelationship>>,
) -> Result<StatusCode, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let (entities, operations): (Vec<_>, Vec<_>) = relationships
        .0
        .into_iter()
        .map(|request| {
            (
                request.resource,
                (
                    request.operation,
                    request.resource,
                    request.relation_subject,
                ),
            )
        })
        .unzip();

    let (permissions, _zookie) = authorization_api
        .check_entities_permission(
            actor_id,
            EntityPermission::Update,
            entities,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(report_to_response)?;

    let mut failed = false;
    // TODO: Change interface for `check_entities_permission` to avoid this loop
    for (entity_id, has_permission) in permissions {
        if !has_permission {
            tracing::error!(
                "Insufficient permissions to modify relationship for entity `{entity_id}`"
            );
            failed = true;
        }
    }

    if failed {
        return Err(report_to_response(
            Report::new(PermissionAssertion).attach(hash_status::StatusCode::PermissionDenied),
        ));
    }

    // for request in relationships.0 {
    authorization_api
        .modify_entity_relations(operations)
        .await
        .map_err(report_to_response)?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/entities/{entity_id}/administrators/{administrator}",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The Entity to add the administrator to"),
        ("administrator" = OwnedById, Path, description = "The administrator to add to the entity"),
    ),
    responses(
        (status = 204, description = "The administrator was added to the entity"),

        (status = 403, description = "Permission denied"),
)
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn add_entity_administrator<A, S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_id, owned_by_id)): Path<(EntityId, OwnedById)>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
) -> Result<StatusCode, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_permission = authorization_api
        .check_entity_permission(
            actor_id,
            EntityPermission::Update,
            entity_id,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(|error| {
            tracing::error!(
                ?error,
                "Could not check if administrator can be added to entity"
            );
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    let administrator_id = store_pool
        .acquire(&mut authorization_api, temporal_client.0)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not acquire store");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .identify_owned_by_id(owned_by_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not identify account or account group");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let administrator = match administrator_id {
        WebOwnerSubject::Account { id } => EntityAdministratorSubject::Account { id },
        WebOwnerSubject::AccountGroup { id } => EntityAdministratorSubject::AccountGroup {
            id,
            set: EntitySubjectSet::Member,
        },
    };

    authorization_api
        .modify_entity_relations([(
            ModifyRelationshipOperation::Create,
            entity_id,
            EntityRelationAndSubject::Administrator {
                subject: administrator,
                level: 0,
            },
        )])
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not add entity administrator");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    delete,
    path = "/entities/{entity_id}/administrators/{administrator}",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The Entity to remove the administrator from"),
        ("administrator" = OwnedById, Path, description = "The administrator to remove from the entity"),
    ),
    responses(
        (status = 204, description = "The administrator was removed from the entity"),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn remove_entity_administrator<A, S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_id, owned_by_id)): Path<(EntityId, OwnedById)>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
) -> Result<StatusCode, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_permission = authorization_api
        .check_entity_permission(
            actor_id,
            EntityPermission::FullAccess,
            entity_id,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(|error| {
            tracing::error!(
                ?error,
                "Could not check if administrator can be removed from entity"
            );
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    let administrator_id = store_pool
        .acquire(&mut authorization_api, temporal_client.0)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not acquire store");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .identify_owned_by_id(owned_by_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not identify account or account group");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let administrator = match administrator_id {
        WebOwnerSubject::Account { id } => EntityAdministratorSubject::Account { id },
        WebOwnerSubject::AccountGroup { id } => EntityAdministratorSubject::AccountGroup {
            id,
            set: EntitySubjectSet::Member,
        },
    };

    authorization_api
        .modify_entity_relations([(
            ModifyRelationshipOperation::Delete,
            entity_id,
            EntityRelationAndSubject::Administrator {
                subject: administrator,
                level: 0,
            },
        )])
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not remove entity administrator");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/entities/{entity_id}/editors/{editor}",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The Entity to add the editor to"),
        ("editor" = OwnedById, Path, description = "The editor to add to the entity"),
    ),
    responses(
        (status = 204, description = "The editor was added to the entity"),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn add_entity_editor<A, S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_id, editor)): Path<(EntityId, OwnedById)>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
) -> Result<StatusCode, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_permission = authorization_api
        .check_entity_permission(
            actor_id,
            EntityPermission::FullAccess,
            entity_id,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not check if editor can be added to entity");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    let editor_id = store_pool
        .acquire(&mut authorization_api, temporal_client.0)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not acquire store");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .identify_owned_by_id(editor)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not identify account or account group");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let subject = match editor_id {
        WebOwnerSubject::Account { id } => EntityEditorSubject::Account { id },
        WebOwnerSubject::AccountGroup { id } => EntityEditorSubject::AccountGroup {
            id,
            set: EntitySubjectSet::Member,
        },
    };

    authorization_api
        .modify_entity_relations([(
            ModifyRelationshipOperation::Create,
            entity_id,
            EntityRelationAndSubject::Editor { subject, level: 0 },
        )])
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not add entity editor");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    delete,
    path = "/entities/{entity_id}/editors/{editor}",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The Entity to remove the editor from"),
        ("editor" = OwnedById, Path, description = "The editor to remove from the entity"),
    ),
    responses(
        (status = 204, description = "The editor was removed from the entity"),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn remove_entity_editor<A, S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_id, editor)): Path<(EntityId, OwnedById)>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
) -> Result<StatusCode, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_permission = authorization_api
        .check_entity_permission(
            actor_id,
            EntityPermission::Update,
            entity_id,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(|error| {
            tracing::error!(
                ?error,
                "Could not check if editor can be removed from entity"
            );
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    let editor_id = store_pool
        .acquire(&mut authorization_api, temporal_client.0)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not acquire store");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .identify_owned_by_id(editor)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not identify account or account group");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let subject = match editor_id {
        WebOwnerSubject::Account { id } => EntityEditorSubject::Account { id },
        WebOwnerSubject::AccountGroup { id } => EntityEditorSubject::AccountGroup {
            id,
            set: EntitySubjectSet::Member,
        },
    };

    authorization_api
        .modify_entity_relations([(
            ModifyRelationshipOperation::Delete,
            entity_id,
            EntityRelationAndSubject::Editor { subject, level: 0 },
        )])
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not remove entity editor");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

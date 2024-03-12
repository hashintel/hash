//! Web routes for CRU operations on entities.

#![expect(clippy::str_to_string)]

use std::sync::Arc;

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
            CreateEntityRequest, GetEntityParams, UpdateEntityEmbeddingsParams, UpdateEntityParams,
            ValidateEntityParams,
        },
        AccountStore, EntityQueryCursor, EntityQuerySorting, EntityQuerySortingRecord, EntityStore,
        EntityValidationType, NullOrdering, Ordering, StorePool,
    },
    subgraph::{query::EntityStructuralQuery, temporal_axes::QueryTemporalAxesUnresolved},
};
use graph_types::{
    knowledge::{
        entity::{
            Entity, EntityEditionId, EntityEditionProvenanceMetadata, EntityEmbedding, EntityId,
            EntityMetadata, EntityProperties, EntityProvenanceMetadata, EntityRecordId,
            EntityTemporalMetadata, EntityUuid,
        },
        link::{EntityLinkOrder, LinkData, LinkOrder},
    },
    owned_by_id::OwnedById,
    Embedding,
};
use serde::{Deserialize, Serialize};
use temporal_client::TemporalClient;
use temporal_versioning::{DecisionTime, Timestamp};
use type_system::url::VersionedUrl;
use utoipa::{OpenApi, ToSchema};
use validation::ValidationProfile;

use crate::rest::{
    api_resource::RoutedResource, json::Json, status::report_to_response,
    utoipa_typedef::subgraph::Subgraph, AuthenticatedUserHeader, PermissionResponse,
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_entity,
        validate_entity,
        check_entity_permission,
        get_entities_by_query,
        update_entity,
        update_entity_embeddings,

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
            ValidateEntityParams,
            EntityValidationType,
            ValidationProfile,
            UpdateEntityRequest,
            Embedding,
            UpdateEntityEmbeddingsParams,
            EntityEmbedding,
            EntityQueryToken,
            EntityStructuralQuery,

            EntityRelationAndSubject,
            EntityPermission,
            EntitySettingSubject,
            EntityOwnerSubject,
            EntityAdministratorSubject,
            EntityEditorSubject,
            EntityViewerSubject,
            ModifyEntityAuthorizationRelationship,
            ModifyRelationshipOperation,
            EntitySetting,

            GetEntityByQueryRequest,
            EntityQueryCursor,
            Ordering,
            NullOrdering,
            EntityQuerySortingRecord,
            EntityQuerySortingToken,
            GetEntityByQueryResponse,

            Entity,
            EntityUuid,
            EntityId,
            EntityEditionId,
            EntityMetadata,
            EntityProvenanceMetadata,
            EntityEditionProvenanceMetadata,
            EntityLinkOrder,
            EntityProperties,
            EntityRecordId,
            EntityTemporalMetadata,
            EntityQueryToken,
            LinkData,
            LinkOrder,
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
                .route("/", post(create_entity::<S, A>).put(update_entity::<S, A>))
                .route(
                    "/relationships",
                    post(modify_entity_authorization_relationships::<A>),
                )
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
                .route("/query", post(get_entities_by_query::<S, A>)),
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
        (status = 200, content_type = "application/json", description = "The metadata of the created entity", body = EntityMetadata),
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
) -> Result<Json<EntityMetadata>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let params = CreateEntityRequest::deserialize(&body).map_err(report_to_response)?;

    let mut store = store_pool.acquire().await.map_err(report_to_response)?;
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    store
        .create_entity(
            actor_id,
            &mut authorization_api,
            temporal_client.as_deref(),
            params,
        )
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
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn validate_entity<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    Json(body): Json<serde_json::Value>,
) -> Result<StatusCode, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let params = ValidateEntityParams::deserialize(&body).map_err(report_to_response)?;

    let store = store_pool.acquire().await.map_err(report_to_response)?;
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    store
        .validate_entity(
            actor_id,
            &authorization_api,
            Consistency::FullyConsistent,
            params,
        )
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

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetEntityByQueryRequest<'q, 's, 'p> {
    #[serde(borrow)]
    #[schema(format = "EntityStructuralQuery")]
    query: EntityStructuralQuery<'q>,
    limit: Option<usize>,
    #[serde(borrow)]
    sorting_paths: Option<Vec<EntityQuerySortingRecord<'p>>>,
    #[serde(borrow)]
    cursor: Option<EntityQueryCursor<'s>>,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct GetEntityByQueryResponse<'r> {
    subgraph: Subgraph,
    #[serde(borrow)]
    cursor: Option<EntityQueryCursor<'r>>,
}

#[utoipa::path(
    post,
    path = "/entities/query",
    request_body = GetEntityByQueryRequest,
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
            body = GetEntityByQueryResponse,
            description = "A subgraph rooted at entities that satisfy the given query, each resolved to the requested depth.",
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool, request))]
async fn get_entities_by_query<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<GetEntityByQueryResponse<'static>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let store = store_pool.acquire().await.map_err(report_to_response)?;

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut request = GetEntityByQueryRequest::deserialize(&request).map_err(report_to_response)?;
    request
        .query
        .filter
        .convert_parameters()
        .map_err(report_to_response)?;

    let temporal_axes_sorting_path = match request.query.temporal_axes {
        QueryTemporalAxesUnresolved::TransactionTime { .. } => &EntityQueryPath::TransactionTime,
        QueryTemporalAxesUnresolved::DecisionTime { .. } => &EntityQueryPath::DecisionTime,
    };

    let sorting = request.sorting_paths.map_or_else(
        || {
            if request.limit.is_some() || request.cursor.is_some() {
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
    );

    let (subgraph, cursor) = store
        .get_entity(
            actor_id,
            &authorization_api,
            GetEntityParams {
                query: request.query,
                sorting: EntityQuerySorting {
                    paths: sorting
                        .into_iter()
                        .map(EntityQuerySortingRecord::into_owned)
                        .collect(),
                    cursor: request.cursor.map(EntityQueryCursor::into_owned),
                },
                limit: request.limit,
            },
        )
        .await
        .map_err(report_to_response)?;

    Ok(Json(GetEntityByQueryResponse {
        subgraph: subgraph.into(),
        cursor: cursor.map(EntityQueryCursor::into_owned),
    }))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct UpdateEntityRequest {
    properties: EntityProperties,
    entity_id: EntityId,
    entity_type_ids: Vec<VersionedUrl>,
    #[serde(flatten)]
    order: EntityLinkOrder,
    archived: bool,
    draft: bool,
    #[serde(default)]
    #[schema(nullable = false)]
    decision_time: Option<Timestamp<DecisionTime>>,
}

#[utoipa::path(
    put,
    path = "/entities",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated entity", body = EntityMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),
        (status = 423, content_type = "text/plain", description = "The entity that should be updated was unexpectedly updated at the same time"),

        (status = 404, description = "Entity ID or Entity Type URL was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateEntityRequest,
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn update_entity<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    body: Json<UpdateEntityRequest>,
) -> Result<Json<EntityMetadata>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let Json(UpdateEntityRequest {
        properties,
        entity_id,
        entity_type_ids,
        order: link_order,
        archived,
        draft,
        decision_time,
    }) = body;

    let mut store = store_pool.acquire().await.map_err(report_to_response)?;
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    store
        .update_entity(
            actor_id,
            &mut authorization_api,
            temporal_client.as_deref(),
            UpdateEntityParams {
                entity_id,
                decision_time,
                entity_type_ids,
                properties,
                link_order,
                archived,
                draft,
            },
        )
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
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn update_entity_embeddings<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
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

    let mut store = store_pool.acquire().await.map_err(report_to_response)?;
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    store
        .update_entity_embeddings(actor_id, &mut authorization_api, params)
        .await
        .map_err(report_to_response)
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
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn add_entity_administrator<A, S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_id, owned_by_id)): Path<(EntityId, OwnedById)>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
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

    let store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let administrator_id = store
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
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn remove_entity_administrator<A, S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_id, owned_by_id)): Path<(EntityId, OwnedById)>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
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

    let store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let administrator_id = store
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
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn add_entity_editor<A, S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_id, editor)): Path<(EntityId, OwnedById)>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
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

    let store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let editor_id = store.identify_owned_by_id(editor).await.map_err(|report| {
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
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn remove_entity_editor<A, S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_id, editor)): Path<(EntityId, OwnedById)>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
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

    let store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let editor_id = store.identify_owned_by_id(editor).await.map_err(|report| {
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

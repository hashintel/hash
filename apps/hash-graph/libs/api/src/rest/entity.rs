//! Web routes for CRU operations on entities.

#![expect(clippy::str_to_string)]

use std::{collections::HashSet, sync::Arc};

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
    extract::{OriginalUri, Path, Query},
    http::{header::LINK, HeaderMap, StatusCode},
    response::Response,
    routing::{get, post},
    Extension, Router,
};
use error_stack::{Report, ResultExt};
use graph::{
    knowledge::EntityQueryToken,
    store::{
        error::{EntityDoesNotExist, RaceConditionOnUpdate},
        AccountStore, EntityStore, EntityValidationType, StorePool,
    },
    subgraph::{
        identifier::EntityVertexId,
        query::{EntityStructuralQuery, StructuralQuery},
    },
};
use graph_types::{
    knowledge::{
        entity::{
            Entity, EntityEditionId, EntityEmbedding, EntityId, EntityMetadata, EntityProperties,
            EntityRecordId, EntityTemporalMetadata, EntityUuid,
        },
        link::{EntityLinkOrder, LinkData, LinkOrder},
    },
    provenance::OwnedById,
    Embedding,
};
use serde::Deserialize;
use type_system::url::VersionedUrl;
use utoipa::{OpenApi, ToSchema};
use validation::ValidationProfile;

use crate::rest::{
    api_resource::RoutedResource, json::Json, status::report_to_response,
    utoipa_typedef::subgraph::Subgraph, AuthenticatedUserHeader, Cursor, Pagination,
    PermissionResponse,
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
            ValidateEntityRequest,
            ValidationOperation,
            UpdateEntityRequest,
            Embedding,
            EntityEmbeddingUpdateRequest,
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

            Entity,
            EntityUuid,
            EntityId,
            EntityEditionId,
            EntityMetadata,
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

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct CreateEntityRequest {
    properties: EntityProperties,
    #[schema(value_type = SHARED_VersionedUrl)]
    entity_type_id: VersionedUrl,
    owned_by_id: OwnedById,
    #[schema(nullable = false)]
    entity_uuid: Option<EntityUuid>,
    #[serde(default)]
    #[schema(nullable = false)]
    link_data: Option<LinkData>,
    draft: bool,
    relationships: Vec<EntityRelationAndSubject>,
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
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn create_entity<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    body: Json<CreateEntityRequest>,
) -> Result<Json<EntityMetadata>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let Json(CreateEntityRequest {
        properties,
        entity_type_id,
        owned_by_id,
        entity_uuid,
        link_data,
        draft,
        relationships,
    }) = body;

    let mut store = store_pool.acquire().await.map_err(report_to_response)?;
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    store
        .create_entity(
            actor_id,
            &mut authorization_api,
            owned_by_id,
            entity_uuid,
            None,
            false,
            draft,
            entity_type_id,
            properties,
            link_data,
            relationships,
        )
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[derive(Debug, PartialEq, Eq, Hash, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
enum ValidationOperation {
    All,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ValidateEntityRequest {
    #[schema(value_type = SHARED_VersionedUrl)]
    entity_type_id: VersionedUrl,
    properties: EntityProperties,
    #[serde(default)]
    link_data: Option<LinkData>,
    #[schema(value_type = Vec<ValidationOperation>)]
    operations: HashSet<ValidationOperation>,
    draft: bool,
}

#[utoipa::path(
    post,
    path = "/entities/validate",
    request_body = ValidateEntityRequest,
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
    body: Json<ValidateEntityRequest>,
) -> Result<StatusCode, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let Json(ValidateEntityRequest {
        entity_type_id,
        properties,
        link_data,
        operations,
        draft,
    }) = body;

    if operations.contains(&ValidationOperation::All) {
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
                EntityValidationType::Id(&entity_type_id),
                &properties,
                link_data.as_ref(),
                if draft {
                    ValidationProfile::Draft
                } else {
                    ValidationProfile::Full
                },
            )
            .await
            .attach(hash_status::StatusCode::InvalidArgument)
            .map_err(report_to_response)?;
    }

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

#[utoipa::path(
    post,
    path = "/entities/query",
    request_body = EntityStructuralQuery,
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
            body = Subgraph,
            description = "A subgraph rooted at entities that satisfy the given query, each resolved to the requested depth.",
            headers(
                ("Link" = String, description = "The link to be used to query the next page of entities"),
            ),
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn get_entities_by_query<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    Query(pagination): Query<Pagination<EntityVertexId>>,
    OriginalUri(uri): OriginalUri,
    Json(query): Json<serde_json::Value>,
) -> Result<(HeaderMap, Json<Subgraph>), Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let store = store_pool.acquire().await.map_err(report_to_response)?;

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut query = StructuralQuery::deserialize(&query).map_err(report_to_response)?;
    query
        .filter
        .convert_parameters()
        .map_err(report_to_response)?;
    let subgraph = store
        .get_entity(
            actor_id,
            &authorization_api,
            &query,
            pagination.after.as_ref().map(|cursor| &cursor.0),
            pagination.limit,
        )
        .await
        .map_err(report_to_response)?;

    let cursor = subgraph.roots.iter().last().map(Cursor);
    let mut headers = HeaderMap::new();
    if let (Some(cursor), Some(limit)) = (cursor, pagination.limit) {
        headers.insert(LINK, cursor.link_header("next", uri, limit)?);
    }
    Ok((headers, Json(Subgraph::from(subgraph))))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct UpdateEntityRequest {
    properties: EntityProperties,
    entity_id: EntityId,
    #[schema(value_type = SHARED_VersionedUrl)]
    entity_type_id: VersionedUrl,
    #[serde(flatten)]
    order: EntityLinkOrder,
    archived: bool,
    draft: bool,
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
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn update_entity<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    body: Json<UpdateEntityRequest>,
) -> Result<Json<EntityMetadata>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let Json(UpdateEntityRequest {
        properties,
        entity_id,
        entity_type_id,
        order,
        archived,
        draft,
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
            entity_id,
            None,
            archived,
            draft,
            entity_type_id,
            properties,
            order,
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

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct EntityEmbeddingUpdateRequest {
    embeddings: Vec<EntityEmbedding<'static>>,
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
    request_body = UpdateEntityRequest,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn update_entity_embeddings<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    body: Json<EntityEmbeddingUpdateRequest>,
) -> Result<(), Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let Json(EntityEmbeddingUpdateRequest { embeddings }) = body;

    let mut store = store_pool.acquire().await.map_err(report_to_response)?;
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    store
        .update_entity_embeddings(actor_id, &mut authorization_api, embeddings)
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

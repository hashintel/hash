//! Web routes for CRU operations on entities.

#![expect(clippy::str_to_string)]

use std::{iter::once, sync::Arc};

use authorization::{
    schema::{EntityRelation, OwnerId},
    zanzibar::Consistency,
    AuthorizationApi, AuthorizationApiPool, EntitySubject,
};
use axum::{
    extract::Path,
    http::StatusCode,
    routing::{get, post},
    Extension, Router,
};
use graph_types::{
    knowledge::{
        entity::{
            Entity, EntityEditionId, EntityId, EntityMetadata, EntityProperties, EntityRecordId,
            EntityTemporalMetadata, EntityUuid,
        },
        link::{EntityLinkOrder, LinkData, LinkOrder},
    },
    provenance::OwnedById,
};
use serde::{Deserialize, Serialize};
use type_system::url::VersionedUrl;
use utoipa::{openapi, OpenApi, ToSchema};

use crate::{
    api::rest::{
        api_resource::RoutedResource, json::Json, report_to_status_code,
        utoipa_typedef::subgraph::Subgraph, AuthenticatedUserHeader, PermissionResponse,
    },
    knowledge::EntityQueryToken,
    store::{
        error::{EntityDoesNotExist, RaceConditionOnUpdate},
        AccountStore, EntityStore, StorePool,
    },
    subgraph::query::{EntityStructuralQuery, StructuralQuery},
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_entity,
        get_entities_by_query,
        can_view_entity,
        can_update_entity,
        update_entity,

        get_entity_authorization_relationships,

        add_entity_owner,
        remove_entity_owner,
        add_entity_editor,
        remove_entity_editor,
        add_entity_viewer,
        remove_entity_viewer,
    ),
    components(
        schemas(
            CreateEntityRequest,
            UpdateEntityRequest,
            EntityQueryToken,
            EntityStructuralQuery,

            EntityRelation,
            EntitySubject,
            EntityAuthorizationRelationship,

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

            Viewer,
        )
    ),
    tags(
        (name = "Entity", description = "entity management API")
    )
)]
pub struct EntityResource;

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
                .nest(
                    "/:entity_id",
                    Router::new()
                        .route(
                            "/relationships",
                            get(get_entity_authorization_relationships::<A>),
                        )
                        .route(
                            "/owners/:owner",
                            post(add_entity_owner::<A, S>).delete(remove_entity_owner::<A, S>),
                        )
                        .route(
                            "/editors/:editor",
                            post(add_entity_editor::<A, S>).delete(remove_entity_editor::<A, S>),
                        )
                        .route(
                            "/viewers/:viewer",
                            post(add_entity_viewer::<A, S>).delete(remove_entity_viewer::<A, S>),
                        )
                        .route("/permissions/view", get(can_view_entity::<A>))
                        .route("/permissions/update", get(can_update_entity::<A>)),
                )
                .route("/query", post(get_entities_by_query::<S, A>)),
        )
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct CreateEntityRequest {
    properties: EntityProperties,
    #[schema(value_type = SHARED_VersionedUrl)]
    entity_type_id: VersionedUrl,
    owned_by_id: OwnedById,
    #[schema(nullable = false)]
    entity_uuid: Option<EntityUuid>,
    // TODO: this could break invariants if we don't move to fractional indexing
    //  https://app.asana.com/0/1201095311341924/1202085856561975/f
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    link_data: Option<LinkData>,
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
) -> Result<Json<EntityMetadata>, StatusCode>
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
    }) = body;

    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .create_entity(
            actor_id,
            &mut authorization_api,
            owned_by_id,
            entity_uuid,
            None,
            false,
            entity_type_id,
            properties,
            link_data,
        )
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create entity");

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/entities/query",
    request_body = EntityStructuralQuery,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", body = Subgraph, description = "A subgraph rooted at entities that satisfy the given query, each resolved to the requested depth."),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn get_entities_by_query<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    Json(query): Json<serde_json::Value>,
) -> Result<Json<Subgraph>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let store = store_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut query = StructuralQuery::deserialize(&query).map_err(|error| {
        tracing::error!(?error, "Could not deserialize query");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    query.filter.convert_parameters().map_err(|error| {
        tracing::error!(?error, "Could not validate query");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let subgraph = store
        .get_entity(actor_id, &authorization_api, &query)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, ?query, "Could not read entities from the store");
            report_to_status_code(&report)
        })?;

    Ok(Json(subgraph.into()))
}

#[utoipa::path(
    get,
    path = "/entities/{entity_id}/permissions/view",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The entity ID to check if the actor can view"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor can view the entity"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn can_view_entity<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(entity_id): Path<EntityId>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<PermissionResponse>, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(|error| {
                tracing::error!(?error, "Could not acquire access to the authorization API");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .can_view_entity(actor_id, entity_id, Consistency::FullyConsistent)
            .await
            .map_err(|error| {
                tracing::error!(
                    ?error,
                    "Could not check if entity can be viewed by the specified actor"
                );
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .has_permission,
    }))
}

#[utoipa::path(
    get,
    path = "/entities/{entity_id}/permissions/update",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The entity ID to check if the actor can update"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor can update the entity"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn can_update_entity<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(entity_id): Path<EntityId>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<PermissionResponse>, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(|error| {
                tracing::error!(?error, "Could not acquire access to the authorization API");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .can_update_entity(actor_id, entity_id, Consistency::FullyConsistent)
            .await
            .map_err(|error| {
                tracing::error!(
                    ?error,
                    "Could not check if entity can be updated by the specified actor"
                );
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .has_permission,
    }))
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct UpdateEntityRequest {
    properties: EntityProperties,
    entity_id: EntityId,
    #[schema(value_type = SHARED_VersionedUrl)]
    entity_type_id: VersionedUrl,
    #[serde(flatten)]
    order: EntityLinkOrder,
    archived: bool,
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
) -> Result<Json<EntityMetadata>, StatusCode>
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
    }) = body;

    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_entity(
            actor_id,
            &mut authorization_api,
            entity_id,
            None,
            archived,
            entity_type_id,
            properties,
            order,
        )
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update entity");

            if report.contains::<EntityDoesNotExist>() {
                StatusCode::NOT_FOUND
            } else if report.contains::<RaceConditionOnUpdate>() {
                StatusCode::LOCKED
            } else {
                // Insertion/update errors are considered internal server errors.
                StatusCode::INTERNAL_SERVER_ERROR
            }
        })
        .map(Json)
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PublicTag {
    Public,
}

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Viewer {
    Public(PublicTag),
    Owner(OwnedById),
}

impl<'s> ToSchema<'s> for Viewer {
    fn schema() -> (&'static str, openapi::RefOr<openapi::Schema>) {
        (
            "Viewer",
            openapi::OneOfBuilder::new()
                .item(openapi::schema::Schema::from(
                    openapi::schema::ObjectBuilder::new()
                        .schema_type(openapi::SchemaType::String)
                        .enum_values(Some(once(serde_json::Value::String("public".to_owned())))),
                ))
                .item(openapi::schema::Ref::from_schema_name("OwnedById"))
                .into(),
        )
    }
}

#[derive(Serialize, ToSchema)]
struct EntityAuthorizationRelationship {
    relation: EntityRelation,
    subject: EntitySubject,
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
        (status = 200, description = "The relations of the entity", body = [EntityAuthorizationRelationship]),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn get_entity_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(entity_id): Path<EntityId>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<Vec<EntityAuthorizationRelationship>>, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(
        authorization_api
            .get_entity_relations(entity_id, Consistency::FullyConsistent)
            .await
            .map_err(|error| {
                tracing::error!(?error, "Could not add entity owner");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .into_iter()
            .map(|(scope, relation)| EntityAuthorizationRelationship {
                relation,
                subject: scope,
            })
            .collect(),
    ))
}

#[utoipa::path(
    post,
    path = "/entities/{entity_id}/owners/{owner}",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The Entity to add the owner to"),
        ("owner" = OwnedById, Path, description = "The owner to add to the entity"),
    ),
    responses(
        (status = 204, description = "The owner was added to the entity"),

        (status = 403, description = "Permission denied"),
)
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn add_entity_owner<A, S>(
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
        .can_update_entity(actor_id, entity_id, Consistency::FullyConsistent)
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not check if owner can be added to entity");
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
    let scope = OwnerId::from(
        store
            .identify_owned_by_id(owned_by_id)
            .await
            .map_err(|report| {
                tracing::error!(error=?report, "Could not identify account or account group");
                StatusCode::INTERNAL_SERVER_ERROR
            })?,
    );

    authorization_api
        .add_entity_owner(scope, entity_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not add entity owner");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    delete,
    path = "/entities/{entity_id}/owners/{owner}",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The Entity to remove the owner from"),
        ("owner" = Viewer, Path, description = "The owner to remove from the entity"),
    ),
    responses(
        (status = 204, description = "The owner was removed from the entity"),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn remove_entity_owner<A, S>(
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
        .can_update_entity(actor_id, entity_id, Consistency::FullyConsistent)
        .await
        .map_err(|error| {
            tracing::error!(
                ?error,
                "Could not check if owner can be removed from entity"
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
    let scope = OwnerId::from(
        store
            .identify_owned_by_id(owned_by_id)
            .await
            .map_err(|report| {
                tracing::error!(error=?report, "Could not identify account or account group");
                StatusCode::INTERNAL_SERVER_ERROR
            })?,
    );

    authorization_api
        .remove_entity_owner(scope, entity_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not remove entity owner");
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
        .can_update_entity(actor_id, entity_id, Consistency::FullyConsistent)
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
    let scope = OwnerId::from(store.identify_owned_by_id(editor).await.map_err(|report| {
        tracing::error!(error=?report, "Could not identify account or account group");
        StatusCode::INTERNAL_SERVER_ERROR
    })?);

    authorization_api
        .add_entity_editor(scope, entity_id)
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
        .can_update_entity(actor_id, entity_id, Consistency::FullyConsistent)
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
    let scope = OwnerId::from(store.identify_owned_by_id(editor).await.map_err(|report| {
        tracing::error!(error=?report, "Could not identify account or account group");
        StatusCode::INTERNAL_SERVER_ERROR
    })?);

    authorization_api
        .remove_entity_editor(scope, entity_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not remove entity editor");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/entities/{entity_id}/viewers/{viewer}",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The Entity to add the viewer to"),
        ("viewer" = Viewer, Path, description = "The viewer to add to the entity"),
    ),
    responses(
        (status = 204, description = "The viewer was added to the entity"),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn add_entity_viewer<A, S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_id, viewer)): Path<(EntityId, Viewer)>,
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
        .can_update_entity(actor_id, entity_id, Consistency::FullyConsistent)
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not check if viewer can be added to entity");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    let scope = match viewer {
        Viewer::Public(_) => EntitySubject::Public,
        Viewer::Owner(owned_by_id) => {
            let store = store_pool.acquire().await.map_err(|report| {
                tracing::error!(error=?report, "Could not acquire store");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            store
                .identify_owned_by_id(owned_by_id)
                .await
                .map_err(|report| {
                    tracing::error!(error=?report, "Could not identify account or account group");
                    StatusCode::INTERNAL_SERVER_ERROR
                })?
                .into()
        }
    };

    authorization_api
        .add_entity_viewer(scope, entity_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not add entity viewer");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    delete,
    path = "/entities/{entity_id}/viewers/{viewer}",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The Entity to remove the viewer from"),
        ("viewer" = Viewer, Path, description = "The viewer to remove from the entity"),
    ),
    responses(
        (status = 204, description = "The viewer was removed from the entity"),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn remove_entity_viewer<A, S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_id, viewer)): Path<(EntityId, Viewer)>,
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
        .can_update_entity(actor_id, entity_id, Consistency::FullyConsistent)
        .await
        .map_err(|error| {
            tracing::error!(
                ?error,
                "Could not check if viewer can be removed from entity"
            );
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    let scope = match viewer {
        Viewer::Public(_) => EntitySubject::Public,
        Viewer::Owner(owned_by_id) => {
            let store = store_pool.acquire().await.map_err(|report| {
                tracing::error!(error=?report, "Could not acquire store");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            store
                .identify_owned_by_id(owned_by_id)
                .await
                .map_err(|report| {
                    tracing::error!(error=?report, "Could not identify account or account group");
                    StatusCode::INTERNAL_SERVER_ERROR
                })?
                .into()
        }
    };

    authorization_api
        .remove_entity_viewer(scope, entity_id)
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not remove entity viewer");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

//! Web routes for CRU operations on entities.

use std::sync::Arc;

use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::{Component, OpenApi};

use crate::{
    api::rest::api_resource::{RestApiBackend, RoutedResource},
    knowledge::{Entity, EntityId},
    ontology::{types::uri::VersionedUri, AccountId},
    store::{
        crud,
        error::{EntityDoesNotExist, QueryError},
        StorePool,
    },
};

#[derive(Component, Serialize)]
struct QualifiedEntity {
    entity_id: EntityId,
    entity: Entity,
}

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_entity,
        get_entity,
        update_entity
    ),
    components(CreateEntityRequest, UpdateEntityRequest, EntityId, QualifiedEntity),
    tags(
        (name = "Entity", description = "entity management API")
    )
)]
pub struct EntityResource;

/// Specifies the requirements to a [`Store`] for the [`Entity`] REST API.
///
/// [`Store`]: crate::store::Store
pub trait EntityBackend = crud::Read<EntityId, Entity, Output = Entity>;

impl RoutedResource for EntityResource {
    /// Create routes for interacting with entities.
    fn routes<S>() -> Router
    where
        S: StorePool + 'static,
        for<'pool> S::Store<'pool>: RestApiBackend,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/entity",
            Router::new()
                .route("/", post(create_entity::<S>).put(update_entity::<S>))
                .route("/:entity_id", get(get_entity::<S>)),
        )
    }
}

#[derive(Serialize, Deserialize, Component)]
struct CreateEntityRequest {
    #[component(value_type = Any)]
    entity: Entity,
    entity_type_uri: VersionedUri,
    account_id: AccountId,
}

#[utoipa::path(
    post,
    path = "/entity",
    request_body = CreateEntityRequest,
    tag = "Entity",
    responses(
      (status = 201, content_type = "application/json", description = "entity created successfully", body = QualifiedEntity),
      (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

      (status = 404, description = "Entity Type URI was not found"),
      (status = 500, description = "Datastore error occurred"),
    ),
    request_body = CreateEntityRequest,
)]
async fn create_entity<S>(
    body: Json<CreateEntityRequest>,
    pool: Extension<Arc<S>>,
) -> Result<Json<QualifiedEntity>, StatusCode>
where
    S: StorePool + 'static,
    for<'pool> S::Store<'pool>: EntityBackend,
{
    let Json(CreateEntityRequest {
        entity,
        entity_type_uri,
        account_id,
    }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .create_entity(&entity, entity_type_uri, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create entity");

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(|entity_id| Json(QualifiedEntity { entity_id, entity }))
}

#[utoipa::path(
    get,
    path = "/entity/{entity_id}",
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", description = "entity found", body = QualifiedEntity),
        (status = 422, content_type = "text/plain", description = "Provided entity id is invalid"),

        (status = 404, description = "entity was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    params(
        ("entity_id" = Uuid, Path, description = "The ID of the entity"),
    )
)]
async fn get_entity<S>(
    entity_id: Path<EntityId>,
    pool: Extension<Arc<S>>,
) -> Result<Json<QualifiedEntity>, impl IntoResponse>
where
    S: StorePool + 'static,
    for<'pool> S::Store<'pool>: EntityBackend,
{
    let Path(entity_id) = entity_id;

    let store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .get_entity(&entity_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not query entity");

            if report.contains::<QueryError>() {
                return StatusCode::NOT_FOUND;
            }

            // Datastore errors such as connection failure are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(|entity| Json(QualifiedEntity { entity_id, entity }))
}

#[derive(Component, Serialize, Deserialize)]
struct UpdateEntityRequest {
    #[component(value_type = Any)]
    entity: Entity,
    entity_id: EntityId,
    entity_type_uri: VersionedUri,
    account_id: AccountId,
}

#[utoipa::path(
    put,
    path = "/entity",
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", description = "entity updated successfully", body = QualifiedEntity),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity ID or Entity Type URI was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    request_body = UpdateEntityRequest,
)]
async fn update_entity<S>(
    body: Json<UpdateEntityRequest>,
    pool: Extension<Arc<S>>,
) -> Result<Json<QualifiedEntity>, StatusCode>
where
    S: StorePool + 'static,
    for<'pool> S::Store<'pool>: EntityBackend,
{
    let Json(UpdateEntityRequest {
        entity,
        entity_id,
        entity_type_uri,
        account_id,
    }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_entity(entity_id, &entity, entity_type_uri, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update entity");

            if report.contains::<QueryError>() || report.contains::<EntityDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(|_| Json(QualifiedEntity { entity_id, entity }))
}

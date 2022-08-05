//! Web routes for CRU operations on entities.

use std::sync::Arc;

use axum::{
    extract::Path,
    http::StatusCode,
    routing::{get, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::{Component, OpenApi};

use crate::{
    api::rest::{api_resource::RoutedResource, read_from_store},
    knowledge::{Entity, EntityId},
    ontology::{types::uri::VersionedUri, AccountId},
    store::{
        crud::AllLatest,
        error::{EntityDoesNotExist, QueryError},
    },
    GraphPool,
};

#[derive(Component, Serialize)]
#[serde(rename_all = "camelCase")]
struct QualifiedEntity {
    entity_id: EntityId,
    entity: Entity,
}

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_entity,
        get_entity,
        get_latest_entities,
        update_entity
    ),
    components(CreateEntityRequest, UpdateEntityRequest, EntityId, QualifiedEntity, Entity),
    tags(
        (name = "Entity", description = "entity management API")
    )
)]
pub struct EntityResource;

impl RoutedResource for EntityResource {
    /// Create routes for interacting with entities.
    fn routes<P: GraphPool>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/entities",
            Router::new()
                .route(
                    "/",
                    post(create_entity::<P>)
                        .get(get_latest_entities::<P>)
                        .put(update_entity::<P>),
                )
                .route("/:entity_id", get(get_entity::<P>)),
        )
    }
}

#[derive(Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
struct CreateEntityRequest {
    entity: Entity,
    #[component(value_type = String)]
    entity_type_uri: VersionedUri,
    account_id: AccountId,
}

#[utoipa::path(
    post,
    path = "/entities",
    request_body = CreateEntityRequest,
    tag = "Entity",
    responses(
        (status = 201, content_type = "application/json", description = "The created entity", body = QualifiedEntity),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity Type URI was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    request_body = CreateEntityRequest,
)]
async fn create_entity<P: GraphPool>(
    body: Json<CreateEntityRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<QualifiedEntity>, StatusCode> {
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
    path = "/entities/{entityId}",
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", description = "The requested entity", body = Entity),
        (status = 422, content_type = "text/plain", description = "Provided entity id is invalid"),

        (status = 404, description = "entity was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    params(
        ("entityId" = Uuid, Path, description = "The ID of the entity"),
    )
)]
async fn get_entity<P: GraphPool>(
    Path(entity_id): Path<EntityId>,
    Extension(pool): Extension<Arc<P>>,
) -> Result<Json<Entity>, StatusCode> {
    read_from_store::<Entity, _, _, _>(pool.as_ref(), entity_id)
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/entities",
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", description = "List of all entities", body = [Entity]),
        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_latest_entities<P: GraphPool>(
    pool: Extension<Arc<P>>,
) -> Result<Json<Vec<Entity>>, StatusCode> {
    read_from_store::<Entity, _, _, _>(pool.as_ref(), AllLatest)
        .await
        .map(Json)
}

#[derive(Component, Serialize, Deserialize)]
struct UpdateEntityRequest {
    entity: Entity,
    entity_id: EntityId,
    #[component(value_type = String)]
    entity_type_uri: VersionedUri,
    account_id: AccountId,
}

#[utoipa::path(
    put,
    path = "/entities",
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", description = "The updated entity", body = QualifiedEntity),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity ID or Entity Type URI was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    request_body = UpdateEntityRequest,
)]
async fn update_entity<P: GraphPool>(
    body: Json<UpdateEntityRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<QualifiedEntity>, StatusCode> {
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

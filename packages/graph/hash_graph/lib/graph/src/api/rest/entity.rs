//! Web routes for CRU operations on entities.

use std::sync::Arc;

use axum::{
    extract::Path,
    http::StatusCode,
    routing::{get, post},
    Extension, Json, Router,
};
use futures::TryFutureExt;
use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;
use utoipa::{Component, OpenApi};

use crate::{
    api::rest::{api_resource::RoutedResource, read_from_store, report_to_status_code},
    knowledge::{
        Entity, EntityId, EntityQuery, EntityRootedSubgraph, PersistedEntity,
        PersistedEntityIdentifier,
    },
    ontology::AccountId,
    store::{
        error::{EntityDoesNotExist, QueryError},
        query::Expression,
        EntityStore, StorePool,
    },
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_entity,
        get_entities_by_query,
        get_entity,
        get_latest_entities,
        update_entity
    ),
    components(
        CreateEntityRequest,
        UpdateEntityRequest,
        EntityId,
        PersistedEntityIdentifier,
        PersistedEntity,
        Entity,
        EntityQuery,
        EntityRootedSubgraph,
    ),
    tags(
        (name = "Entity", description = "entity management API")
    )
)]
pub struct EntityResource;

impl RoutedResource for EntityResource {
    /// Create routes for interacting with entities.
    fn routes<P: StorePool + Send + 'static>() -> Router {
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
                .route("/query", post(get_entities_by_query::<P>))
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
    entity_id: Option<EntityId>,
}

#[utoipa::path(
    post,
    path = "/entities",
    request_body = CreateEntityRequest,
    tag = "Entity",
    responses(
        (status = 201, content_type = "application/json", description = "The created entity", body = PersistedEntityIdentifier),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity Type URI was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = CreateEntityRequest,
)]
async fn create_entity<P: StorePool + Send>(
    body: Json<CreateEntityRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PersistedEntityIdentifier>, StatusCode> {
    let Json(CreateEntityRequest {
        entity,
        entity_type_uri,
        account_id,
        entity_id,
    }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .create_entity(entity, entity_type_uri, account_id, entity_id)
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
    request_body = EntityQuery,
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", body = [EntityTypeRootedSubgraph], description = "A list of subgraphs rooted at entities that satisfy the given query, each resolved to the requested depth."),

        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_entities_by_query<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    Json(query): Json<EntityQuery>,
) -> Result<Json<Vec<EntityRootedSubgraph>>, StatusCode> {
    pool.acquire()
        .map_err(|error| {
            tracing::error!(?error, "Could not acquire access to the store");
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .and_then(|store| async move {
            store.get_entity(&query).await.map_err(|report| {
                tracing::error!(error=?report, ?query, "Could not read entities from the store");
                report_to_status_code(&report)
            })
        })
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/entities",
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", description = "List of all entities", body = [PersistedEntity]),

        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_latest_entities<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
) -> Result<Json<Vec<PersistedEntity>>, StatusCode> {
    read_from_store(pool.as_ref(), &Expression::for_latest_version())
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/entities/{entityId}",
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", description = "The requested entity", body = PersistedEntity),

        (status = 400, content_type = "text/plain", description = "Provided entity id is invalid"),
        (status = 404, description = "Entity was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    params(
        ("entityId" = Uuid, Path, description = "The ID of the entity"),
    )
)]
async fn get_entity<P: StorePool + Send>(
    Path(entity_id): Path<EntityId>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PersistedEntity>, StatusCode> {
    read_from_store(pool.as_ref(), &Expression::for_latest_entity_id(entity_id))
        .await
        .and_then(|mut entities| entities.pop().ok_or(StatusCode::NOT_FOUND))
        .map(Json)
}

#[derive(Component, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
        (status = 200, content_type = "application/json", description = "The updated entity", body = PersistedEntityIdentifier),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity ID or Entity Type URI was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateEntityRequest,
)]
async fn update_entity<P: StorePool + Send>(
    body: Json<UpdateEntityRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PersistedEntityIdentifier>, StatusCode> {
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
        .update_entity(entity_id, entity, entity_type_uri, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update entity");

            if report.contains::<QueryError>() || report.contains::<EntityDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

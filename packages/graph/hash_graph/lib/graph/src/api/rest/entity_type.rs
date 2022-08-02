//! Web routes for CRU operations on Entity types.

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
    ontology::{
        types::{uri::VersionedUri, EntityType},
        AccountId,
    },
    store::error::{BaseUriAlreadyExists, BaseUriDoesNotExist},
    GraphPool,
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_entity_type,
        get_entity_type,
        update_entity_type
    ),
    components(CreateEntityTypeRequest, UpdateEntityTypeRequest, AccountId),
    tags(
        (name = "EntityType", description = "Entity type management API")
    )
)]
pub struct EntityTypeResource;

impl RoutedResource for EntityTypeResource {
    /// Create routes for interacting with entity types.
    fn routes<P: GraphPool>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/entity-types",
            Router::new()
                .route(
                    "/",
                    post(create_entity_type::<P>).put(update_entity_type::<P>),
                )
                .route("/:version_id", get(get_entity_type::<P>)),
        )
    }
}

#[derive(Serialize, Deserialize, Component)]
struct CreateEntityTypeRequest {
    #[component(value_type = VAR_ENTITY_TYPE)]
    schema: EntityType,
    account_id: AccountId,
}

#[utoipa::path(
    post,
    path = "/entity-types",
    request_body = CreateEntityTypeRequest,
    tag = "EntityType",
    responses(
        (status = 201, content_type = "application/json", description = "The schema of the created entity type", body = VAR_ENTITY_TYPE),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to create entity type in the datastore as the base entity type ID already exists"),
        (status = 500, description = "Datastore error occurred"),
    ),
    request_body = CreateEntityTypeRequest,
)]
async fn create_entity_type<P: GraphPool>(
    body: Json<CreateEntityTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<EntityType>, StatusCode> {
    let Json(CreateEntityTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .create_entity_type(&schema, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create entity type");

            if report.contains::<BaseUriAlreadyExists>() {
                return StatusCode::CONFLICT;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(schema))
}

#[utoipa::path(
    get,
    path = "/entity-types/{uri}",
    tag = "EntityType",
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the requested entity type", body = VAR_ENTITY_TYPE),
        (status = 422, content_type = "text/plain", description = "Provided URI is invalid"),

        (status = 404, description = "Entity type was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    params(
        ("uri" = String, Path, description = "The URI of entity type"),
    )
)]
async fn get_entity_type<P: GraphPool>(
    Path(uri): Path<VersionedUri>,
    Extension(pool): Extension<Arc<P>>,
) -> Result<Json<EntityType>, StatusCode> {
    read_from_store::<EntityType, _, _, _>(pool.as_ref(), &uri)
        .await
        .map(Json)
}

#[derive(Component, Serialize, Deserialize)]
struct UpdateEntityTypeRequest {
    #[component(value_type = VAR_ENTITY_TYPE)]
    schema: EntityType,
    account_id: AccountId,
}

#[utoipa::path(
    put,
    path = "/entity-types",
    tag = "EntityType",
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the updated entity type", body = VAR_ENTITY_TYPE),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base entity type ID was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    request_body = UpdateEntityTypeRequest,
)]
async fn update_entity_type<P: GraphPool>(
    body: Json<UpdateEntityTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<EntityType>, StatusCode> {
    let Json(UpdateEntityTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_entity_type(&schema, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update entity type");

            if report.contains::<BaseUriDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(schema))
}

//! Web routes for CRU operations on Entity types.

use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::{Component, OpenApi};
use uuid::Uuid;

use super::api_resource::RoutedResource;
use crate::{
    datastore::{BaseUriAlreadyExists, BaseUriDoesNotExist, Datastore, QueryError},
    types::{schema::EntityType, AccountId, Qualified, QualifiedEntityType, VersionId},
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_entity_type,
        get_entity_type,
        update_entity_type
    ),
    components(CreateEntityTypeRequest, UpdateEntityTypeRequest, AccountId, QualifiedEntityType),
    tags(
        (name = "EntityType", description = "Entity type management API")
    )
)]
pub struct EntityTypeResource;

impl RoutedResource for EntityTypeResource {
    /// Create routes for interacting with entity types.
    fn routes<D: Datastore>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/entity-type",
            Router::new()
                .route(
                    "/",
                    post(create_entity_type::<D>).put(update_entity_type::<D>),
                )
                .route("/:version_id", get(get_entity_type::<D>)),
        )
    }
}

#[derive(Serialize, Deserialize, Component)]
struct CreateEntityTypeRequest {
    #[component(value_type = Any)]
    schema: EntityType,
    account_id: AccountId,
}

#[utoipa::path(
    post,
    path = "/entity-type",
    request_body = CreateEntityTypeRequest,
    tag = "EntityType",
    responses(
      (status = 201, content_type = "application/json", description = "Entity type created successfully", body = QualifiedEntityType),
      (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

      (status = 409, description = "Unable to create entity type in the datastore as the base entity type ID already exists"),
      (status = 500, description = "Datastore error occurred"),
    ),
    request_body = CreateEntityTypeRequest,
)]
async fn create_entity_type<D: Datastore>(
    body: Json<CreateEntityTypeRequest>,
    datastore: Extension<D>,
) -> Result<Json<Qualified<EntityType>>, StatusCode> {
    let Json(body) = body;
    let Extension(datastore) = datastore;

    datastore
        .clone()
        .create_entity_type(body.schema, body.account_id)
        .await
        .map_err(|report| {
            if report.contains::<BaseUriAlreadyExists>() {
                return StatusCode::CONFLICT;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/entity-type/{versionId}",
    tag = "EntityType",
    responses(
        (status = 200, content_type = "application/json", description = "Entity type found", body = QualifiedEntityType),
        (status = 422, content_type = "text/plain", description = "Provided version_id is invalid"),

        (status = 404, description = "Entity type was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    params(
        ("versionId" = Uuid, Path, description = "The version ID of entity type"),
    )
)]
async fn get_entity_type<D: Datastore>(
    version_id: Path<Uuid>,
    datastore: Extension<D>,
) -> Result<Json<Qualified<EntityType>>, impl IntoResponse> {
    let Path(version_id) = version_id;
    let Extension(datastore) = datastore;

    datastore
        .get_entity_type(VersionId::new(version_id))
        .await
        .map_err(|report| {
            if report.contains::<QueryError>() {
                return StatusCode::NOT_FOUND;
            }

            // Datastore errors such as connection failure are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

#[derive(Component, Serialize, Deserialize)]
struct UpdateEntityTypeRequest {
    #[component(value_type = Any)]
    schema: EntityType,
    account_id: AccountId,
}

#[utoipa::path(
    put,
    path = "/entity-type",
    tag = "EntityType",
    responses(
        (status = 200, content_type = "application/json", description = "Entity type updated successfully", body = QualifiedEntityType),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base entity type ID was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    request_body = UpdateEntityTypeRequest,
)]
async fn update_entity_type<D: Datastore>(
    body: Json<UpdateEntityTypeRequest>,
    datastore: Extension<D>,
) -> Result<Json<Qualified<EntityType>>, StatusCode> {
    let Json(body) = body;
    let Extension(datastore) = datastore;

    datastore
        .clone()
        .update_entity_type(body.schema, body.account_id)
        .await
        .map_err(|report| {
            if report.contains::<BaseUriDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

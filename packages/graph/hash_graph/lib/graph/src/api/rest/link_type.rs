//! Web routes for CRU operations on Link types.

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
    ontology::{
        types::{LinkType, Persisted, PersistedLinkType},
        AccountId, VersionId,
    },
    store::{BaseUriAlreadyExists, BaseUriDoesNotExist, QueryError, Store},
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_link_type,
        get_link_type,
        update_link_type
    ),
    components(CreateLinkTypeRequest, UpdateLinkTypeRequest, AccountId, PersistedLinkType),
    tags(
        (name = "LinkType", description = "Link type management API")
    )
)]
pub struct LinkTypeResource;

impl RoutedResource for LinkTypeResource {
    /// Create routes for interacting with link types.
    fn routes<S: Store>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/link-type",
            Router::new()
                .route("/", post(create_link_type::<S>).put(update_link_type::<S>))
                .route("/:version_id", get(get_link_type::<S>)),
        )
    }
}

#[derive(Serialize, Deserialize, Component)]
struct CreateLinkTypeRequest {
    #[component(value_type = Any)]
    schema: LinkType,
    account_id: AccountId,
}

#[utoipa::path(
    post,
    path = "/link-type",
    request_body = CreateLinkTypeRequest,
    tag = "LinkType",
    responses(
      (status = 201, content_type = "application/json", description = "Link type created successfully", body = PersistedLinkType),
      (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

      (status = 409, description = "Unable to create link type in the store as the base link type ID already exists"),
      (status = 500, description = "Store error occurred"),
    ),
    request_body = CreateLinkTypeRequest,
)]
async fn create_link_type<S: Store>(
    body: Json<CreateLinkTypeRequest>,
    store: Extension<S>,
) -> Result<Json<Persisted<LinkType>>, StatusCode> {
    let Json(body) = body;
    let Extension(store) = store;

    store
        .clone()
        .create_link_type(body.schema, body.account_id)
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
    path = "/link-type/{versionId}",
    tag = "LinkType",
    responses(
        (status = 200, content_type = "application/json", description = "Link type found", body = PersistedLinkType),
        (status = 422, content_type = "text/plain", description = "Provided version_id is invalid"),

        (status = 404, description = "Link type was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    params(
        ("versionId" = Uuid, Path, description = "The version ID of link type"),
    )
)]
async fn get_link_type<S: Store>(
    version_id: Path<Uuid>,
    store: Extension<S>,
) -> Result<Json<Persisted<LinkType>>, impl IntoResponse> {
    let Path(version_id) = version_id;
    let Extension(store) = store;

    store
        .get_link_type(VersionId::new(version_id))
        .await
        .map_err(|report| {
            if report.contains::<QueryError>() {
                return StatusCode::NOT_FOUND;
            }

            // Store errors such as connection failure are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

#[derive(Component, Serialize, Deserialize)]
struct UpdateLinkTypeRequest {
    #[component(value_type = Any)]
    schema: LinkType,
    account_id: AccountId,
}

#[utoipa::path(
    put,
    path = "/link-type",
    tag = "LinkType",
    responses(
        (status = 200, content_type = "application/json", description = "Link type updated successfully", body = PersistedLinkType),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base link type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateLinkTypeRequest,
)]
async fn update_link_type<S: Store>(
    body: Json<UpdateLinkTypeRequest>,
    store: Extension<S>,
) -> Result<Json<Persisted<LinkType>>, StatusCode> {
    let Json(body) = body;
    let Extension(store) = store;

    store
        .clone()
        .update_link_type(body.schema, body.account_id)
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

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
    datastore::{BaseUriAlreadyExists, BaseUriDoesNotExist, Datastore, QueryError},
    types::{schema::LinkType, AccountId, Qualified, QualifiedLinkType, VersionId},
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_link_type,
        get_link_type,
        // get_link_type_many,
        update_link_type
    ),
    components(CreateLinkTypeRequest, UpdateLinkTypeRequest, AccountId, QualifiedLinkType),
    tags(
        (name = "LinkType", description = "Link type management API")
    )
)]
pub struct LinkTypeResource;

impl RoutedResource for LinkTypeResource {
    /// Create routes for interacting with link types.
    fn routes<D: Datastore>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/link-type",
            Router::new()
                .route("/", post(create_link_type::<D>).put(update_link_type::<D>))
                // .route("/query", get(get_link_type_many))
                .route("/:version_id", get(get_link_type::<D>)),
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
      (status = 201, content_type = "application/json", description = "Link type created successfully", body = QualifiedLinkType),
      (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

      (status = 409, description = "Unable to create link type in the datastore as the base link type ID already exists"),
      (status = 500, description = "Datastore error occurred"),
    ),
    request_body = CreateLinkTypeRequest,
)]
async fn create_link_type<D: Datastore>(
    body: Json<CreateLinkTypeRequest>,
    datastore: Extension<D>,
) -> Result<Json<Qualified<LinkType>>, StatusCode> {
    let Json(body) = body;
    let Extension(datastore) = datastore;

    datastore
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
        (status = 200, content_type = "application/json", description = "Link type found", body = QualifiedLinkType),
        (status = 422, content_type = "text/plain", description = "Provided version_id is invalid"),

        (status = 404, description = "Link type was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    params(
        ("versionId" = Uuid, Path, description = "The version ID of link type"),
    )
)]
async fn get_link_type<D: Datastore>(
    version_id: Path<Uuid>,
    datastore: Extension<D>,
) -> Result<Json<Qualified<LinkType>>, impl IntoResponse> {
    let Path(version_id) = version_id;
    let Extension(datastore) = datastore;

    datastore
        .get_link_type(VersionId::new(version_id))
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

// async fn get_link_type_many() -> Result<String, StatusCode> {
//     unimplemented!()
// }

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
        (status = 200, content_type = "application/json", description = "Link type updated successfully", body = QualifiedLinkType),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base link type ID was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    request_body = UpdateLinkTypeRequest,
)]
async fn update_link_type<D: Datastore>(
    body: Json<UpdateLinkTypeRequest>,
    datastore: Extension<D>,
) -> Result<Json<Qualified<LinkType>>, StatusCode> {
    let Json(body) = body;
    let Extension(datastore) = datastore;

    datastore
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

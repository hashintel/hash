//! Web routes for CRU operations on Property types.

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
    datastore::{BaseIdAlreadyExists, BaseIdDoesNotExist, Datastore, QueryError},
    types::{schema::PropertyType, AccountId, Qualified, QualifiedPropertyType, VersionId},
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_property_type,
        get_property_type,
        // get_property_type_many,
        update_property_type
    ),
    components(CreatePropertyTypeRequest, UpdatePropertyTypeRequest, AccountId, QualifiedPropertyType),
    tags(
        (name = "PropertyType", description = "Property type management API")
    )
)]
pub struct PropertyTypeResource;

impl RoutedResource for PropertyTypeResource {
    /// Create routes for interacting with property types.
    fn routes<D: Datastore>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/property-type",
            Router::new()
                .route("/", post(create_property_type::<D>).put(update_property_type::<D>))
                // .route("/query", get(get_property_type_many))
                .route("/:version_id", get(get_property_type::<D>)),
        )
    }
}

#[derive(Serialize, Deserialize, Component)]
struct CreatePropertyTypeRequest {
    #[component(value_type = Any)]
    schema: PropertyType,
    account_id: AccountId,
}

#[utoipa::path(
    post,
    path = "/property-type",
    request_body = CreatePropertyTypeRequest,
    tag = "PropertyType",
    responses(
      (status = 201, content_type = "application/json", description = "Property type created successfully", body = QualifiedPropertyType),
      (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

      (status = 409, description = "Unable to create property type in the datastore as the base property type ID already exists"),
      (status = 500, description = "Datastore error occurred"),
    ),
    request_body = CreatePropertyTypeRequest,
)]
async fn create_property_type<D: Datastore>(
    body: Json<CreatePropertyTypeRequest>,
    datastore: Extension<D>,
) -> Result<Json<Qualified<PropertyType>>, StatusCode> {
    let Json(body) = body;
    let Extension(datastore) = datastore;

    datastore
        .clone()
        .create_property_type(body.schema, body.account_id)
        .await
        .map_err(|report| {
            if report.contains::<BaseIdAlreadyExists>() {
                return StatusCode::CONFLICT;
            }

            // Insertion/upddate errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/property-type/{versionId}",
    tag = "PropertyType",
    responses(
        (status = 200, content_type = "application/json", description = "Property type found", body = QualifiedPropertyType),
        (status = 422, content_type = "text/plain", description = "Provided version_id is invalid"),

        (status = 404, description = "Property type was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    params(
        ("versionId" = Uuid, Path, description = "The version ID of property type"),
    )
)]
async fn get_property_type<D: Datastore>(
    version_id: Path<Uuid>,
    datastore: Extension<D>,
) -> Result<Json<Qualified<PropertyType>>, impl IntoResponse> {
    let Path(version_id) = version_id;
    let Extension(datastore) = datastore;

    datastore
        .get_property_type(VersionId::new(version_id))
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

// async fn get_property_type_many() -> Result<String, StatusCode> {
//     unimplemented!()
// }

#[derive(Component, Serialize, Deserialize)]
struct UpdatePropertyTypeRequest {
    #[component(value_type = Any)]
    schema: PropertyType,
    created_by: AccountId,
}

#[utoipa::path(
    put,
    path = "/property-type",
    tag = "PropertyType",
    responses(
        (status = 200, content_type = "application/json", description = "Property type updated successfully", body = QualifiedPropertyType),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base property type ID was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    request_body = UpdatePropertyTypeRequest,
)]
async fn update_property_type<D: Datastore>(
    body: Json<UpdatePropertyTypeRequest>,
    datastore: Extension<D>,
) -> Result<Json<Qualified<PropertyType>>, StatusCode> {
    let Json(body) = body;
    let Extension(datastore) = datastore;

    datastore
        .clone()
        .update_property_type(body.schema, body.created_by)
        .await
        .map_err(|report| {
            if report.contains::<BaseIdDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/upddate errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

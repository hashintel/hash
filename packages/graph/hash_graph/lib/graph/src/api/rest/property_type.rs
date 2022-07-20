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
    ontology::{
        types::{Persisted, PersistedPropertyType, PropertyType},
        AccountId, VersionId,
    },
    store::{BaseUriAlreadyExists, BaseUriDoesNotExist, QueryError, Store},
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_property_type,
        get_property_type,
        update_property_type
    ),
    components(CreatePropertyTypeRequest, UpdatePropertyTypeRequest, AccountId, PersistedPropertyType),
    tags(
        (name = "PropertyType", description = "Property type management API")
    )
)]
pub struct PropertyTypeResource;

impl RoutedResource for PropertyTypeResource {
    /// Create routes for interacting with property types.
    fn routes<D: Store>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/property-type",
            Router::new()
                .route(
                    "/",
                    post(create_property_type::<D>).put(update_property_type::<D>),
                )
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
      (status = 201, content_type = "application/json", description = "Property type created successfully", body = PersistedPropertyType),
      (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

      (status = 409, description = "Unable to create property type in the store as the base property type ID already exists"),
      (status = 500, description = "Store error occurred"),
    ),
    request_body = CreatePropertyTypeRequest,
)]
async fn create_property_type<D: Store>(
    body: Json<CreatePropertyTypeRequest>,
    store: Extension<D>,
) -> Result<Json<Persisted<PropertyType>>, StatusCode> {
    let Json(body) = body;
    let Extension(store) = store;

    store
        .clone()
        .create_property_type(body.schema, body.account_id)
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
    path = "/property-type/{versionId}",
    tag = "PropertyType",
    responses(
        (status = 200, content_type = "application/json", description = "Property type found", body = PersistedPropertyType),
        (status = 422, content_type = "text/plain", description = "Provided version_id is invalid"),

        (status = 404, description = "Property type was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    params(
        ("versionId" = Uuid, Path, description = "The version ID of property type"),
    )
)]
async fn get_property_type<D: Store>(
    version_id: Path<Uuid>,
    store: Extension<D>,
) -> Result<Json<Persisted<PropertyType>>, impl IntoResponse> {
    let Path(version_id) = version_id;
    let Extension(store) = store;

    store
        .get_property_type(VersionId::new(version_id))
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
        (status = 200, content_type = "application/json", description = "Property type updated successfully", body = PersistedPropertyType),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base property type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdatePropertyTypeRequest,
)]
async fn update_property_type<D: Store>(
    body: Json<UpdatePropertyTypeRequest>,
    store: Extension<D>,
) -> Result<Json<Persisted<PropertyType>>, StatusCode> {
    let Json(body) = body;
    let Extension(store) = store;

    store
        .clone()
        .update_property_type(body.schema, body.created_by)
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

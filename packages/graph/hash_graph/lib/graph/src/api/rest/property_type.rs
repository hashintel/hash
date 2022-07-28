//! Web routes for CRU operations on Property types.

use std::sync::Arc;

use axum::{
    extract::Path,
    http::StatusCode,
    routing::{get, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::{Component, OpenApi};

use super::api_resource::RoutedResource;
use crate::{
    api::rest::read_from_store,
    ontology::{
        types::{uri::VersionedUri, PropertyType},
        AccountId,
    },
    store::{BaseUriAlreadyExists, BaseUriDoesNotExist},
    GraphPool,
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_property_type,
        get_property_type,
        get_property_type_unfiltered,
        update_property_type
    ),
    components(CreatePropertyTypeRequest, UpdatePropertyTypeRequest, AccountId, PropertyType),
    tags(
        (name = "PropertyType", description = "Property type management API")
    )
)]
pub struct PropertyTypeResource;

impl RoutedResource for PropertyTypeResource {
    /// Create routes for interacting with property types.
    fn routes<P: GraphPool>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/property-types",
            Router::new()
                .route(
                    "/",
                    post(create_property_type::<P>)
                        .get(get_property_type_unfiltered::<P>)
                        .put(update_property_type::<P>),
                )
                .route("/:version_id", get(get_property_type::<P>)),
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
    path = "/property-types",
    request_body = CreatePropertyTypeRequest,
    tag = "PropertyType",
    responses(
      (status = 201, content_type = "application/json", description = "Property type created successfully", body = PropertyType),
      (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

      (status = 409, description = "Unable to create property type in the store as the base property type ID already exists"),
      (status = 500, description = "Store error occurred"),
    ),
    request_body = CreatePropertyTypeRequest,
)]
async fn create_property_type<P: GraphPool>(
    body: Json<CreatePropertyTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PropertyType>, StatusCode> {
    let Json(CreatePropertyTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .create_property_type(&schema, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create property type");

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
    path = "/property-types",
    tag = "PropertyType",
    responses(
        (status = 200, content_type = "application/json", description = "Property type found", body = [PropertyType]),
        (status = 422, content_type = "text/plain", description = "Provided URI is invalid"),

        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_property_type_unfiltered<P: GraphPool>(
    pool: Extension<Arc<P>>,
) -> Result<Json<Vec<PropertyType>>, StatusCode> {
    read_from_store::<PropertyType, _, _, _>(pool.as_ref(), ())
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/property-types/{uri}",
    tag = "PropertyType",
    responses(
        (status = 200, content_type = "application/json", description = "Property type found", body = PropertyType),
        (status = 422, content_type = "text/plain", description = "Provided URI is invalid"),

        (status = 404, description = "Property type was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    params(
        ("uri" = String, Path, description = "The URI of property type"),
    )
)]
async fn get_property_type<P: GraphPool>(
    Path(uri): Path<VersionedUri>,
    Extension(pool): Extension<Arc<P>>,
) -> Result<Json<PropertyType>, StatusCode> {
    read_from_store::<PropertyType, _, _, _>(pool.as_ref(), &uri)
        .await
        .map(Json)
}

#[derive(Component, Serialize, Deserialize)]
struct UpdatePropertyTypeRequest {
    #[component(value_type = Any)]
    schema: PropertyType,
    account_id: AccountId,
}

#[utoipa::path(
    put,
    path = "/property-types",
    tag = "PropertyType",
    responses(
        (status = 200, content_type = "application/json", description = "Property type updated successfully", body = PropertyType),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base property type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdatePropertyTypeRequest,
)]
async fn update_property_type<P: GraphPool>(
    body: Json<UpdatePropertyTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PropertyType>, StatusCode> {
    let Json(UpdatePropertyTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_property_type(&schema, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update property type");

            if report.contains::<BaseUriDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(schema))
}

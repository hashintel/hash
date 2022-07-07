//! Web routes for Property types CRU operations.

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

use super::{
    api_resource::RoutedResource,
    error::{modify_report_to_status_code, query_report_to_status_code},
};
use crate::{
    datastore::Datastore,
    types::{schema::PropertyType, AccountId, BaseId, Qualified, QualifiedPropertyType, VersionId},
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_property_type,
        get_property_type,
        // get_property_type_many,
        update_property_type
    ),
    components(CreatePropertyTypeRequest, UpdatePropertyTypeRequest, AccountId, BaseId, QualifiedPropertyType),
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
    Json(body): Json<CreatePropertyTypeRequest>,
    Extension(datastore): Extension<D>,
) -> Result<Json<Qualified<PropertyType>>, StatusCode> {
    datastore.clone().create_property_type(body.schema, body.account_id)
            .await
            .map_err(modify_report_to_status_code)
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
    Path(version_id): Path<Uuid>,
    Extension(datastore): Extension<D>,
) -> Result<Json<Qualified<PropertyType>>, impl IntoResponse> {
    datastore.get_property_type(VersionId::new(version_id))
            .await
            .map_err(query_report_to_status_code)
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
    Json(body): Json<UpdatePropertyTypeRequest>,
    Extension(datastore): Extension<D>,
) -> Result<Json<Qualified<PropertyType>>, StatusCode> {
    datastore.clone().update_property_type(body.schema, body.created_by)
            .await
            .map_err(modify_report_to_status_code)
            .map(Json)
}

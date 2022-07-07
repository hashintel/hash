//! Web routes for Data Types CRU operations.

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
    api_endpoint::RoutedResource,
    error::{modify_report_to_status_code, query_report_to_status_code},
};
use crate::{
    datastore::Datastore,
    types::{schema::DataType, AccountId, BaseId, Qualified, QualifiedDataType, VersionId},
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_data_type,
        get_data_type,
        // get_data_type_many,
        update_data_type
    ),
    components(CreateDataTypeRequest, UpdateDataTypeRequest, AccountId, BaseId, QualifiedDataType),
    tags(
        (name = "DataType", description = "Data Type management API")
    )
)]
pub struct DataTypeEndpoint;

impl RoutedResource for DataTypeEndpoint {
    /// Create routes for interacting with data types.
    fn routes<D: Datastore>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/data-type",
            Router::new()
                .route("/", post(create_data_type::<D>).put(update_data_type::<D>))
                // .route("/query", get(get_data_type_many))
                .route("/:version_id", get(get_data_type::<D>)),
        )
    }
}

#[derive(Serialize, Deserialize, Component)]
struct CreateDataTypeRequest {
    #[component(value_type = Any)]
    schema: DataType,
    account_id: AccountId,
}

#[utoipa::path(
    post,
    path = "/data-type",
    request_body = CreateDataTypeRequest,
    tag = "DataType",
    responses(
      (status = 201, content_type = "application/json", description = "Data type created successfully", body = QualifiedDataType),
      (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),
      
      (status = 409, description = "Unable to create data type in the datastore as the base data type ID already exists"),
      (status = 500, description = "Datastore error occurred"),
    ),
    request_body = CreateDataTypeRequest,
)]
async fn create_data_type<D: Datastore>(
    Json(body): Json<CreateDataTypeRequest>,
    Extension(datastore): Extension<D>,
) -> Result<Json<Qualified<DataType>>, StatusCode> {
    datastore.clone().create_data_type(body.schema, body.account_id)
            .await
            .map_err(modify_report_to_status_code)
            .map(Json)
}

#[utoipa::path(
    get,
    path = "/data-type/{versionId}",
    tag = "DataType",
    responses(
        (status = 200, content_type = "application/json", description = "Data type found", body = QualifiedDataType),
        (status = 422, content_type = "text/plain", description = "Provided version_id is invalid"),

        (status = 404, description = "Data type was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    params(
        ("versionId" = Uuid, Path, description = "The version ID of data type"),
    )
)]
async fn get_data_type<D: Datastore>(
    Path(version_id): Path<Uuid>,
    Extension(datastore): Extension<D>,
) -> Result<Json<Qualified<DataType>>, impl IntoResponse> {
    datastore.get_data_type(VersionId::new(version_id))
            .await
            .map_err(query_report_to_status_code)
            .map(Json)
}

// async fn get_data_type_many() -> Result<String, StatusCode> {
//     unimplemented!()
// }

#[derive(Component, Serialize, Deserialize)]
struct UpdateDataTypeRequest {
    #[component(value_type = Any)]
    schema: DataType,
    created_by: AccountId,
}

#[utoipa::path(
    put,
    path = "/data-type",
    tag = "DataType",
    responses(
        (status = 200, content_type = "application/json", description = "Data type updated successfully", body = QualifiedDataType),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base data type ID was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    request_body = UpdateDataTypeRequest,
)]
async fn update_data_type<D: Datastore>(
    Json(body): Json<UpdateDataTypeRequest>,
    Extension(datastore): Extension<D>,
) -> Result<Json<Qualified<DataType>>, StatusCode> {
    datastore.clone().update_data_type(body.schema, body.created_by)
            .await
            .map_err(modify_report_to_status_code)
            .map(Json)
}

//! Web routes for CRU operations on Data Types.

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
        types::{DataType, Persisted, PersistedDataType},
        AccountId, VersionId,
    },
    store::{BaseUriAlreadyExists, BaseUriDoesNotExist, QueryError, Store},
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_data_type,
        get_data_type,
        update_data_type
    ),
    components(CreateDataTypeRequest, UpdateDataTypeRequest, AccountId, PersistedDataType),
    tags(
        (name = "DataType", description = "Data Type management API")
    )
)]
pub struct DataTypeResource;

impl RoutedResource for DataTypeResource {
    /// Create routes for interacting with data types.
    fn routes<S: Store>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/data-type",
            Router::new()
                .route("/", post(create_data_type::<S>).put(update_data_type::<S>))
                .route("/:version_id", get(get_data_type::<S>)),
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
      (status = 201, content_type = "application/json", description = "Data type created successfully", body = PersistedDataType),
      (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

      (status = 409, description = "Unable to create data type in the store as the base data type ID already exists"),
      (status = 500, description = "Store error occurred"),
    ),
    request_body = CreateDataTypeRequest,
)]
async fn create_data_type<S: Store>(
    body: Json<CreateDataTypeRequest>,
    store: Extension<S>,
) -> Result<Json<Persisted<DataType>>, StatusCode> {
    let Json(body) = body;
    let Extension(store) = store;

    store
        .clone()
        .create_data_type(body.schema, body.account_id)
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
    path = "/data-type/{versionId}",
    tag = "DataType",
    responses(
        (status = 200, content_type = "application/json", description = "Data type found", body = PersistedDataType),
        (status = 422, content_type = "text/plain", description = "Provided version_id is invalid"),

        (status = 404, description = "Data type was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    params(
        ("versionId" = Uuid, Path, description = "The version ID of data type"),
    )
)]
async fn get_data_type<S: Store>(
    version_id: Path<Uuid>,
    store: Extension<S>,
) -> Result<Json<Persisted<DataType>>, impl IntoResponse> {
    let Path(version_id) = version_id;
    let Extension(store) = store;

    store
        .get_data_type(VersionId::new(version_id))
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
        (status = 200, content_type = "application/json", description = "Data type updated successfully", body = PersistedDataType),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base data type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateDataTypeRequest,
)]
async fn update_data_type<S: Store>(
    body: Json<UpdateDataTypeRequest>,
    store: Extension<S>,
) -> Result<Json<Persisted<DataType>>, StatusCode> {
    let Json(body) = body;
    let Extension(store) = store;

    store
        .clone()
        .update_data_type(body.schema, body.created_by)
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

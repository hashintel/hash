//! Web routes for CRU operations on Data Types.

use std::sync::Arc;

use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::{Component, OpenApi};

use super::api_resource::RoutedResource;
use crate::{
    api::rest::api_resource::RestApiBackend,
    ontology::{
        types::{uri::VersionedUri, DataType, Persisted, PersistedDataType},
        AccountId, VersionId,
    },
    store::{crud, BaseUriAlreadyExists, BaseUriDoesNotExist, QueryError, StorePool},
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

/// Specifies the requirements to a [`Store`] for the [`DataType`] REST API.
pub trait DataTypeBackend = crud::Read<VersionId, DataType, Output = Persisted<DataType>>;

impl RoutedResource for DataTypeResource {
    /// Create routes for interacting with data types.
    fn routes<S>() -> Router
    where
        S: StorePool + 'static,
        for<'pool> S::Store<'pool>: RestApiBackend,
    {
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
async fn create_data_type<S>(
    body: Json<CreateDataTypeRequest>,
    pool: Extension<Arc<S>>,
) -> Result<Json<Persisted<DataType>>, StatusCode>
where
    S: StorePool + 'static,
    for<'pool> S::Store<'pool>: DataTypeBackend,
{
    let Json(CreateDataTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .create_data_type(schema, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create data type");

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
    path = "/data-type/{uri}",
    tag = "DataType",
    responses(
        (status = 200, content_type = "application/json", description = "Data type found", body = PersistedDataType),
        (status = 422, content_type = "text/plain", description = "Provided URI is invalid"),

        (status = 404, description = "Data type was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    params(
        ("uri" = String, Path, description = "The URI of data type"),
    )
)]
async fn get_data_type<S>(
    uri: Path<VersionedUri>,
    pool: Extension<Arc<S>>,
) -> Result<Json<Persisted<DataType>>, impl IntoResponse>
where
    S: StorePool + 'static,
    for<'pool> S::Store<'pool>: DataTypeBackend,
{
    let store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let version_id = store.version_id_by_uri(&uri).await.map_err(|report| {
        tracing::error!(error=?report, "Could not resolve URI");

        if report.contains::<QueryError>() {
            return StatusCode::NOT_FOUND;
        }

        // Datastore errors such as connection failure are considered internal server errors.
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .get_data_type(&version_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not query data type");

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
    account_id: AccountId,
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
async fn update_data_type<S>(
    body: Json<UpdateDataTypeRequest>,
    pool: Extension<Arc<S>>,
) -> Result<Json<Persisted<DataType>>, StatusCode>
where
    S: StorePool + 'static,
    for<'pool> S::Store<'pool>: DataTypeBackend,
{
    let Json(UpdateDataTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_data_type(schema, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update data type");

            if report.contains::<BaseUriDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

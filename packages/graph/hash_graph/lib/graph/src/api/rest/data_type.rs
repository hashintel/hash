//! Web routes for CRU operations on Data Types.

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
        types::{uri::VersionedUri, DataType},
        AccountId,
    },
    store::{BaseUriAlreadyExists, BaseUriDoesNotExist},
    GraphPool,
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_data_type,
        get_data_type,
        update_data_type
    ),
    components(CreateDataTypeRequest, UpdateDataTypeRequest, AccountId, DataType),
    tags(
        (name = "DataType", description = "Data Type management API")
    )
)]
pub struct DataTypeResource;

impl RoutedResource for DataTypeResource {
    /// Create routes for interacting with data types.
    fn routes<P: GraphPool>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/data-types",
            Router::new()
                .route(
                    "/",
                    post(create_data_type::<P>)
                        .get(get_data_type_unfiltered::<P>)
                        .put(update_data_type::<P>),
                )
                .route("/:version_id", get(get_data_type::<P>)),
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
    path = "/data-types",
    request_body = CreateDataTypeRequest,
    tag = "DataType",
    responses(
      (status = 201, content_type = "application/json", description = "Data type created successfully", body = DataType),
      (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

      (status = 409, description = "Unable to create data type in the store as the base data type ID already exists"),
      (status = 500, description = "Store error occurred"),
    ),
    request_body = CreateDataTypeRequest,
)]
async fn create_data_type<P: GraphPool>(
    body: Json<CreateDataTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<DataType>, StatusCode> {
    let Json(CreateDataTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .create_data_type(&schema, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create data type");

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
    path = "/data-types",
    tag = "DataType",
    responses(
        (status = 200, content_type = "application/json", description = "Data type found", body = [DataType]),
        (status = 422, content_type = "text/plain", description = "Provided URI is invalid"),

        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_data_type_unfiltered<P: GraphPool>(
    pool: Extension<Arc<P>>,
) -> Result<Json<Vec<DataType>>, StatusCode> {
    read_from_store::<DataType, _, _, _>(pool.as_ref(), ())
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/data-types/{uri}",
    tag = "DataType",
    responses(
        (status = 200, content_type = "application/json", description = "Data type found", body = DataType),
        (status = 422, content_type = "text/plain", description = "Provided URI is invalid"),

        (status = 404, description = "Data type was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    params(
        ("uri" = String, Path, description = "The URI of data type"),
    )
)]
async fn get_data_type<P: GraphPool>(
    Path(uri): Path<VersionedUri>,
    Extension(pool): Extension<Arc<P>>,
) -> Result<Json<DataType>, StatusCode> {
    read_from_store::<DataType, _, _, _>(pool.as_ref(), &uri)
        .await
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
    path = "/data-types",
    tag = "DataType",
    responses(
        (status = 200, content_type = "application/json", description = "Data type updated successfully", body = DataType),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base data type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateDataTypeRequest,
)]
async fn update_data_type<P: GraphPool>(
    body: Json<UpdateDataTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<DataType>, StatusCode> {
    let Json(UpdateDataTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_data_type(&schema, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update data type");

            if report.contains::<BaseUriDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(schema))
}

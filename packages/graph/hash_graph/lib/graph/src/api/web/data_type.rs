//! Web routes for Data Types CRU operations.

use axum::{
    extract::Path,
    http::StatusCode,
    routing::{get, post, put},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::{Component, OpenApi};
use uuid::Uuid;

use crate::{
    datastore::Datastore,
    types::{AccountId, BaseId, DataType, Identifier, Qualified, QualifiedDataType},
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_data_type,
        get_data_type,
        // get_data_type_many,
        update_data_type
    ),
    components(CreateDataTypeRequest, UpdateDataTypeRequest, Identifier, AccountId, DataType, BaseId, QualifiedDataType),
    tags(
        (name = "DataType", description = "Data Type management API")
    )
)]
pub struct ApiDoc;

#[derive(Serialize, Deserialize, Component)]
struct CreateDataTypeRequest {
    schema: DataType,
    created_by: AccountId,
}

#[derive(Component, Serialize, Deserialize)]
struct UpdateDataTypeRequest {
    schema: DataType,
    updated_by: AccountId,
}

/// Create routes for interacting with data types.
pub fn routes<D: Datastore>() -> Router {
    // TODO: The URL format here is preliminary and will have to change.
    Router::new().nest(
        "/data-type",
        Router::new()
            .route("/", post(create_data_type::<D>))
            .route("/query", get(get_data_type_many))
            .route("/:base_id/", put(update_data_type::<D>))
            .route("/:base_id/:version_id", get(get_data_type::<D>)),
    )
}

#[utoipa::path(
    post,
    path = "/data-type",
    request_body = CreateDataTypeRequest,
    tag = "DataType",
    responses(
        (status = 201, description = "Data type created successfully", body = QualifiedDataType),
        (status = 400, description = "Data type could not be created")
    )
)]
async fn create_data_type<D: Datastore>(
    Json(body): Json<CreateDataTypeRequest>,
    Extension(datastore): Extension<D>,
) -> Result<Json<Qualified<DataType>>, StatusCode> {
    datastore.create_data_type(body.schema, body.created_by)
            .await
            // TODO: proper error propagation
            .map_err(|_| StatusCode::BAD_REQUEST)
            .map(Json)
}

#[utoipa::path(
    get,
    path = "/data-type/{base_id}/{version_id}",
    tag = "DataType",
    responses(
        (status = 200, description = "Data type found", body = QualifiedDataType),
        (status = 404, description = "Data type was not found")
    ),
    params(
        ("base_id" = Uuid, Path, description = "The base ID of the data type"),
        ("version_id" = Uuid, Path, description = "The version ID of data type"),
    )
)]
async fn get_data_type<D: Datastore>(
    Path((base_id, version_id)): Path<(Uuid, Uuid)>,
    Extension(datastore): Extension<D>,
) -> Result<Json<Qualified<DataType>>, StatusCode> {
    let identifier = Identifier::from_uuids(base_id, version_id);

    datastore.get_data_type(&identifier)
            .await
            // TODO: proper error propagation, although this might be okay?
            .map_err(|_| StatusCode::NOT_FOUND)
            .map(Json)
}

async fn get_data_type_many() -> Result<String, StatusCode> {
    todo!()
}

#[utoipa::path(
    put,
    path = "/data-type/{base_id}/",
    tag = "DataType",
    responses(
        (status = 200, description = "Data type updated successfully", body = QualifiedDataType),
        (status = 404, description = "Base data type ID was not found and could not be updated")
    ),
    params(
        ("base_id" = Uuid, Path, description = "The base data type ID"),
    )
)]
async fn update_data_type<D: Datastore>(
    Path(base_id): Path<BaseId>,
    Json(body): Json<UpdateDataTypeRequest>,
    Extension(datastore): Extension<D>,
) -> Result<Json<Qualified<DataType>>, StatusCode> {
    datastore.update_data_type(base_id, body.schema, body.updated_by)
            .await
            // TODO: proper error propagation
            .map_err(|_| StatusCode::BAD_REQUEST)
            .map(Json)
}

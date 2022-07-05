//! The Axum webserver for accessing the Graph API datastore operations.
//!
//! Handler methods are grouped by routes that make up the `web_api`. See [`data_type`] for a
//! grouped router example

use axum::{routing::get, Extension, Json, Router};
use utoipa::{Modify, OpenApi};

use crate::datastore::Datastore;

pub fn web_api_with_datastore<T>(datastore: T) -> Router
where
    T: Datastore,
{
    let api_doc = ApiDoc::openapi();

    Router::new()
        .merge(data_type::routes::<T>())
        // Make sure extensions are added at the end so they attach to merged routers.
        .layer(Extension(datastore))
        .route(
            "/api-doc/openapi.json",
            get({
                let doc = api_doc;
                move || async { Json(doc) }
            }),
        )
}

#[derive(OpenApi)]
#[openapi(
        tags(
            (name = "Graph", description = "Graph API")
        ),
        modifiers(&MergeAddon)
    )]
struct ApiDoc;

struct MergeAddon;

impl Modify for MergeAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        // TODO: Merge multiple docs together
        let data_type_docs: utoipa::openapi::OpenApi = data_type::ApiDoc::openapi();
        openapi.components = data_type_docs.components;
        openapi.paths = data_type_docs.paths;
    }
}

mod data_type {
    //! CRU operations through Axum routes for Data Types
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
        types::{AccountId, BaseId, DataType, Identifier, QualifiedDataType},
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
    ) -> Result<Json<QualifiedDataType>, StatusCode> {
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
    ) -> Result<Json<QualifiedDataType>, StatusCode> {
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
    ) -> Result<Json<QualifiedDataType>, StatusCode> {
        datastore.update_data_type(base_id, body.schema, body.updated_by)
                .await
                // TODO: proper error propagation
                .map_err(|_| StatusCode::BAD_REQUEST)
                .map(Json)
    }
}

//! The Axum webserver for accessing the Graph API datastore operations.
//!
//! Handler methods are grouped by routes that make up the `app`

use axum::{Extension, Router};

use crate::datastore::Datastore;

pub fn web_api_with_datastore<T>(datastore: T) -> Router
where
    T: Datastore,
{
    Router::new()
        .merge(data_type::Api::<T>::routes())
        // Make sure the extension are added at the end so they can be used by all routers.
        .layer(Extension(datastore))
}

mod data_type {
    use axum::{
        extract::Path,
        http::StatusCode,
        routing::{get, post, put},
        Extension, Json, Router,
    };
    use serde::{Deserialize, Serialize};
    use uuid::Uuid;

    use crate::{
        datastore::Datastore,
        types::{AccountId, BaseId, DataType, Identifier, Qualified},
    };

    pub struct Api<T>(std::marker::PhantomData<T>);

    #[derive(Serialize, Deserialize)]
    struct CreateDataTypeRequest {
        schema: DataType,
        created_by: AccountId,
    }

    #[derive(Serialize, Deserialize)]
    struct UpdateDataTypeRequest {
        schema: DataType,
        updated_by: AccountId,
    }

    impl<DS: Datastore> Api<DS> {
        // TODO: The URL format here is preliminary and will have to change.
        /// Create routes for interacting with data types.
        pub fn routes() -> Router {
            Router::new().nest(
                "/data-type",
                Router::new()
                    .route("/", post(Self::create_data_type))
                    .route("/query", get(Self::get_data_type_many))
                    .route("/:base_id/", put(Self::update_data_type))
                    .route("/:base_id/:version_id", get(Self::get_data_type)),
            )
        }

        async fn create_data_type(
            Json(body): Json<CreateDataTypeRequest>,
            Extension(db): Extension<DS>,
        ) -> Result<Json<Qualified<DataType>>, StatusCode> {
            db.create_data_type(body.schema, body.created_by)
                .await
                // TODO: proper error propagation
                .map_err(|_| StatusCode::BAD_REQUEST)
                .map(Json)
        }

        async fn get_data_type(
            Path((base_id, version_id)): Path<(Uuid, Uuid)>,
            Extension(db): Extension<DS>,
        ) -> Result<Json<Qualified<DataType>>, StatusCode> {
            let identifier = Identifier::from_uuids(base_id, version_id);

            db.get_data_type(&identifier)
                .await
                // TODO: proper error propagation, although this might be okay?
                .map_err(|_| StatusCode::NOT_FOUND)
                .map(Json)
        }

        async fn get_data_type_many() -> Result<String, StatusCode> {
            todo!()
        }

        async fn update_data_type(
            Path(base_id): Path<BaseId>,
            Json(body): Json<UpdateDataTypeRequest>,
            Extension(db): Extension<DS>,
        ) -> Result<Json<Qualified<DataType>>, StatusCode> {
            db.update_data_type(base_id, body.schema, body.updated_by)
                .await
                // TODO: proper error propagation
                .map_err(|_| StatusCode::BAD_REQUEST)
                .map(Json)
        }
    }
}

//! Admin API routes for database management operations.
//!
//! These routes are served on a separate admin port and provide operations like
//! entity deletion, snapshot restoration, and bulk cleanup of ontology types.

use alloc::sync::Arc;

use axum::{
    Extension, Json, Router,
    body::Body,
    routing::{delete, get, post},
};
use error_stack::Report;
use futures::TryStreamExt as _;
use hash_codec::bytes::JsonLinesDecoder;
use hash_graph_postgres_store::{snapshot::SnapshotStore, store::PostgresStorePool};
use hash_graph_store::{
    entity::{DeleteEntitiesParams, DeletionSummary, EntityStore as _},
    pool::StorePool as _,
};
use hash_status::{Status, StatusCode};
use serde::Deserialize as _;
use tokio::io;
use tokio_util::{codec::FramedRead, io::StreamReader};
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use super::{
    AuthenticatedUserHeader, http_tracing_layer,
    jwt::{JwtValidator, OptionalJwtAuthentication},
    status::{BoxedResponse, status_to_response},
};
use crate::rest::status::report_to_response;

/// Creates the admin API router.
///
/// When `jwt_validator` is `Some`, all endpoints except `/health` require a valid
/// JWT token. When `None`, JWT authentication is disabled (development mode).
pub fn routes(store_pool: PostgresStorePool, jwt_validator: Option<Arc<JwtValidator>>) -> Router {
    // Health endpoint is always public (used by load balancers and healthchecks)
    let public = Router::new().route("/health", get(async || "Healthy"));

    let mut protected = Router::new()
        .route("/snapshot", post(restore_snapshot))
        .route("/accounts", delete(delete_accounts))
        .route("/data-types", delete(delete_data_types))
        .route("/property-types", delete(delete_property_types))
        .route("/entity-types", delete(delete_entity_types))
        .route("/entities/delete", post(delete_entities));

    if let Some(validator) = jwt_validator {
        protected = protected.layer(Extension(validator));
    }

    public
        .merge(protected)
        .layer(http_tracing_layer::HttpTracingLayer)
        .layer(Extension(Arc::new(store_pool)))
}

async fn restore_snapshot(
    _jwt: OptionalJwtAuthentication,
    store_pool: Extension<Arc<PostgresStorePool>>,
    snapshot: Body,
) -> Result<BoxedResponse, BoxedResponse> {
    let store = store_pool.acquire(None).await.map_err(report_to_response)?;

    SnapshotStore::new(store)
        .restore_snapshot(
            FramedRead::new(
                StreamReader::new(snapshot.into_data_stream().map_err(io::Error::other)),
                JsonLinesDecoder::default(),
            ),
            10_000,
            false,
        )
        .await
        .map_err(report_to_response)?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Snapshot restored successfully".to_owned()),
        vec![],
    )))
}

async fn delete_accounts(
    _jwt: OptionalJwtAuthentication,
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    pool.acquire(None)
        .await
        .map_err(report_to_response)?
        .delete_principals(ActorEntityUuid::new(Uuid::nil()))
        .await
        .map_err(report_to_response)?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Accounts deleted successfully".to_owned()),
        vec![],
    )))
}

async fn delete_data_types(
    _jwt: OptionalJwtAuthentication,
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    pool.acquire(None)
        .await
        .map_err(report_to_response)?
        .delete_data_types()
        .await
        .map_err(report_to_response)?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Data types deleted successfully".to_owned()),
        vec![],
    )))
}

async fn delete_property_types(
    _jwt: OptionalJwtAuthentication,
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    pool.acquire(None)
        .await
        .map_err(report_to_response)?
        .delete_property_types()
        .await
        .map_err(report_to_response)?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Property types deleted successfully".to_owned()),
        vec![],
    )))
}

async fn delete_entity_types(
    _jwt: OptionalJwtAuthentication,
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    pool.acquire(None)
        .await
        .map_err(report_to_response)?
        .delete_entity_types()
        .await
        .map_err(report_to_response)?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Entity types deleted successfully".to_owned()),
        vec![],
    )))
}

/// Deletes entities matching the given filter and scope with full provenance tracking.
async fn delete_entities(
    _jwt: OptionalJwtAuthentication,
    pool: Extension<Arc<PostgresStorePool>>,
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<DeletionSummary>, BoxedResponse> {
    // Deserialize into `Value` first so that `DeleteEntitiesParams` (which borrows via
    // `Filter<'a>`) can reference the owned data.  `Json<DeleteEntitiesParams>` would not compile
    // because the borrowed data would be dropped before use.
    let params = DeleteEntitiesParams::deserialize(&body).map_err(|error| {
        report_to_response(Report::new(error).attach(StatusCode::InvalidArgument))
    })?;

    pool.acquire(None)
        .await
        .map_err(report_to_response)?
        .delete_entities(actor_id, params)
        .await
        .map(Json)
        .map_err(report_to_response)
}

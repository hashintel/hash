//! # HASH Graph Test Server
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]

extern crate alloc;

use alloc::sync::Arc;
use core::error::Error;
use std::collections::HashMap;

use axum::{
    Extension, Router,
    body::Body,
    response::IntoResponse as _,
    routing::{delete, get, post},
};
use error_stack::Report;
use futures::TryStreamExt as _;
use hash_codec::bytes::JsonLinesDecoder;
use hash_graph_api::rest::{
    http_tracing_layer,
    status::{BoxedResponse, status_to_response},
};
use hash_graph_postgres_store::{snapshot::SnapshotStore, store::PostgresStorePool};
use hash_graph_store::pool::StorePool as _;
use hash_graph_type_defs::error::{ErrorInfo, StatusPayloadInfo};
use hash_status::{Status, StatusCode};
use tokio::io;
use tokio_util::{codec::FramedRead, io::StreamReader};
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

/// Create routes for interacting with entities.
pub fn routes(store_pool: PostgresStorePool) -> Router {
    Router::new()
        .layer(http_tracing_layer::HttpTracingLayer)
        .route("/health", get(async || "Healthy".into_response()))
        .route("/snapshot", post(restore_snapshot))
        .route("/accounts", delete(delete_accounts))
        .route("/data-types", delete(delete_data_types))
        .route("/property-types", delete(delete_property_types))
        .route("/entity-types", delete(delete_entity_types))
        .route("/entities", delete(delete_entities))
        .layer(Extension(Arc::new(store_pool)))
}

#[expect(
    clippy::needless_pass_by_value,
    reason = "This is used inside of error-mapping functions only"
)]
fn store_acquisition_error(report: Report<impl Error + Send + Sync + 'static>) -> BoxedResponse {
    tracing::error!(error=?report, "Could not acquire store");
    status_to_response(Status::new(
        StatusCode::Internal,
        Some(format!(
            "{report}\n\nThis is an internal error, please report to the developers of the HASH \
             Graph with whatever information you can provide including request details and logs."
        )),
        vec![StatusPayloadInfo::Error(ErrorInfo::new(
            // TODO: add information from the report here
            //   see https://linear.app/hash/issue/H-3009
            HashMap::new(),
            // TODO: We should encapsulate these Reasons within the type system, perhaps
            //       requiring top level contexts to implement a trait `ErrorReason::to_reason`
            //       or perhaps as a big enum, or as an attachment
            "STORE_ACQUISITION_FAILURE".to_owned(),
        ))],
    ))
}

fn report_to_response<C>(report: &Report<C>, code: impl Into<String>) -> BoxedResponse {
    status_to_response(Status::new(
        report
            .request_ref::<StatusCode>()
            .copied()
            .next()
            .unwrap_or(StatusCode::Unknown),
        Some(report.to_string()),
        vec![StatusPayloadInfo::Error(ErrorInfo::new(
            HashMap::new(),
            code.into(),
        ))],
    ))
}

async fn restore_snapshot(
    store_pool: Extension<Arc<PostgresStorePool>>,
    snapshot: Body,
) -> Result<BoxedResponse, BoxedResponse> {
    let store = store_pool
        .acquire(None)
        .await
        .map_err(store_acquisition_error)?;

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
        .map_err(|report| {
            tracing::error!(error=?report, "Could not restore snapshot");
            report_to_response(&report, "SNAPSHOT_RESTORATION_FAILURE")
        })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Snapshot restored successfully".to_owned()),
        vec![],
    )))
}

async fn delete_accounts(
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    pool.acquire(None)
        .await
        .map_err(store_acquisition_error)?
        .delete_principals(ActorEntityUuid::new(Uuid::nil()))
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete accounts");
            report_to_response(&report, "ACCOUNT_DELETION_FAILURE")
        })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Accounts deleted successfully".to_owned()),
        vec![],
    )))
}

async fn delete_data_types(
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    pool.acquire(None)
        .await
        .map_err(store_acquisition_error)?
        .delete_data_types()
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete data types");
            status_to_response(Status::new(
                report
                    .request_ref::<StatusCode>()
                    .copied()
                    .next()
                    .unwrap_or(StatusCode::Unknown),
                Some(report.to_string()),
                vec![StatusPayloadInfo::Error(ErrorInfo::new(
                    HashMap::new(),
                    "DATA_TYPE_DELETION_FAILURE".to_owned(),
                ))],
            ))
        })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Data types deleted successfully".to_owned()),
        vec![],
    )))
}

async fn delete_property_types(
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    pool.acquire(None)
        .await
        .map_err(store_acquisition_error)?
        .delete_property_types()
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete property types");
            report_to_response(&report, "PROPERTY_TYPE_DELETION_FAILURE")
        })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Property types deleted successfully".to_owned()),
        vec![],
    )))
}

async fn delete_entity_types(
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    pool.acquire(None)
        .await
        .map_err(store_acquisition_error)?
        .delete_entity_types()
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete entity types");
            report_to_response(&report, "ENTITY_TYPE_DELETION_FAILURE")
        })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Entity types deleted successfully".to_owned()),
        vec![],
    )))
}

async fn delete_entities(
    pool: Extension<Arc<PostgresStorePool>>,
) -> Result<BoxedResponse, BoxedResponse> {
    pool.acquire(None)
        .await
        .map_err(store_acquisition_error)?
        .delete_all_entities()
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete entities");
            report_to_response(&report, "ENTITY_DELETION_FAILURE")
        })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Entities deleted successfully".to_owned()),
        vec![],
    )))
}

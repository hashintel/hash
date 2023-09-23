use std::{collections::HashMap, sync::Arc};

use authorization::NoAuthorization;
use axum::{
    extract::BodyStream,
    response::Response,
    routing::{delete, post},
    Extension, Router,
};
use error_stack::{Context, Report};
use futures::TryStreamExt;
use graph_types::account::AccountId;
use hash_status::{Status, StatusCode};
use tokio::io;
use tokio_postgres::NoTls;
use tokio_util::{codec::FramedRead, io::StreamReader};
use uuid::Uuid;

use crate::{
    api::{
        error::{ErrorInfo, StatusPayloads},
        rest::{
            middleware::{log_request_and_response, span_trace_layer},
            status::status_to_response,
        },
    },
    snapshot::SnapshotStore,
    store::{PostgresStorePool, StorePool},
};

/// Create routes for interacting with entities.
pub fn routes(pool: PostgresStorePool<NoTls>) -> Router {
    Router::new()
        .route("/snapshot", post(restore_snapshot))
        .route("/accounts", delete(delete_accounts))
        .route("/data-types", delete(delete_data_types))
        .route("/property-types", delete(delete_property_types))
        .route("/entity-types", delete(delete_entity_types))
        .route("/entities", delete(delete_entities))
        .layer(Extension(Arc::new(pool)))
        .layer(axum::middleware::from_fn(log_request_and_response))
        .layer(span_trace_layer())
}

#[expect(
    clippy::needless_pass_by_value,
    reason = "This is used inside of error-mapping functions only"
)]
fn store_acquisition_error(report: Report<impl Context>) -> Response {
    tracing::error!(error=?report, "Could not acquire store");
    status_to_response(Status::new(
        StatusCode::Internal,
        Some(format!(
            "{report}\n\nThis is an internal error, please report to the developers of the HASH \
             Graph with whatever information you can provide including request details and logs."
        )),
        vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
            // TODO: add information from the report here
            //   https://app.asana.com/0/1203363157432094/1203639884730779/f
            HashMap::new(),
            // TODO: We should encapsulate these Reasons within the type system, perhaps
            //  requiring top level contexts to implement a trait `ErrorReason::to_reason`
            //  or perhaps as a big enum, or as an attachment
            "STORE_ACQUISITION_FAILURE".to_owned(),
        ))],
    ))
}

async fn restore_snapshot(
    pool: Extension<Arc<PostgresStorePool<NoTls>>>,
    snapshot: BodyStream,
) -> Result<Response, Response> {
    let store = pool.acquire().await.map_err(store_acquisition_error)?;

    SnapshotStore::new(store)
        .restore_snapshot(
            FramedRead::new(
                StreamReader::new(
                    snapshot.map_err(|err| io::Error::new(io::ErrorKind::Other, err)),
                ),
                codec::bytes::JsonLinesDecoder::default(),
            ),
            10_000,
        )
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not restore snapshot");
            status_to_response(Status::new(
                report
                    .request_ref::<StatusCode>()
                    .copied()
                    .next()
                    .unwrap_or(StatusCode::Unknown),
                Some(report.to_string()),
                vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
                    // TODO: add information from the report here
                    //   https://app.asana.com/0/1203363157432094/1203639884730779/f
                    HashMap::new(),
                    // TODO: We should encapsulate these Reasons within the type system, perhaps
                    //  requiring top level contexts to implement a trait `ErrorReason::to_reason`
                    //  or perhaps as a big enum, or as an attachment
                    "SNAPSHOT_RESTORATION_FAILURE".to_owned(),
                ))],
            ))
        })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Snapshot restored successfully".to_owned()),
        vec![],
    )))
}

async fn delete_accounts(
    pool: Extension<Arc<PostgresStorePool<NoTls>>>,
) -> Result<Response, Response> {
    let mut store = pool.acquire().await.map_err(store_acquisition_error)?;

    store
        .delete_accounts(AccountId::new(Uuid::nil()), &NoAuthorization)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not delete accounts");
            status_to_response(Status::new(
                report
                    .request_ref::<StatusCode>()
                    .copied()
                    .next()
                    .unwrap_or(StatusCode::Unknown),
                Some(report.to_string()),
                vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
                    HashMap::new(),
                    "ACCOUNT_DELETION_FAILURE".to_owned(),
                ))],
            ))
        })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Accounts deleted successfully".to_owned()),
        vec![],
    )))
}

async fn delete_data_types(
    pool: Extension<Arc<PostgresStorePool<NoTls>>>,
) -> Result<Response, Response> {
    let mut store = pool.acquire().await.map_err(store_acquisition_error)?;

    store.delete_data_types().await.map_err(|report| {
        tracing::error!(error=?report, "Could not delete data types");
        status_to_response(Status::new(
            report
                .request_ref::<StatusCode>()
                .copied()
                .next()
                .unwrap_or(StatusCode::Unknown),
            Some(report.to_string()),
            vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
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
    pool: Extension<Arc<PostgresStorePool<NoTls>>>,
) -> Result<Response, Response> {
    let mut store = pool.acquire().await.map_err(store_acquisition_error)?;

    store.delete_property_types().await.map_err(|report| {
        tracing::error!(error=?report, "Could not delete property types");
        status_to_response(Status::new(
            report
                .request_ref::<StatusCode>()
                .copied()
                .next()
                .unwrap_or(StatusCode::Unknown),
            Some(report.to_string()),
            vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
                HashMap::new(),
                "PROPERTY_TYPE_DELETION_FAILURE".to_owned(),
            ))],
        ))
    })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Property types deleted successfully".to_owned()),
        vec![],
    )))
}

async fn delete_entity_types(
    pool: Extension<Arc<PostgresStorePool<NoTls>>>,
) -> Result<Response, Response> {
    let mut store = pool.acquire().await.map_err(store_acquisition_error)?;

    store.delete_entity_types().await.map_err(|report| {
        tracing::error!(error=?report, "Could not delete entity types");
        status_to_response(Status::new(
            report
                .request_ref::<StatusCode>()
                .copied()
                .next()
                .unwrap_or(StatusCode::Unknown),
            Some(report.to_string()),
            vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
                HashMap::new(),
                "ENTITY_TYPE_DELETION_FAILURE".to_owned(),
            ))],
        ))
    })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Entity types deleted successfully".to_owned()),
        vec![],
    )))
}

async fn delete_entities(
    pool: Extension<Arc<PostgresStorePool<NoTls>>>,
) -> Result<Response, Response> {
    let mut store = pool.acquire().await.map_err(store_acquisition_error)?;

    store.delete_entities().await.map_err(|report| {
        tracing::error!(error=?report, "Could not delete entities");
        status_to_response(Status::new(
            report
                .request_ref::<StatusCode>()
                .copied()
                .next()
                .unwrap_or(StatusCode::Unknown),
            Some(report.to_string()),
            vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
                HashMap::new(),
                "ENTITY_DELETION_FAILURE".to_owned(),
            ))],
        ))
    })?;

    Ok(status_to_response(Status::<()>::new(
        StatusCode::Ok,
        Some("Entities deleted successfully".to_owned()),
        vec![],
    )))
}

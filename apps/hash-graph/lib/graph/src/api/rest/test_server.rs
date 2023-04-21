use std::{collections::HashMap, sync::Arc};

use axum::{extract::BodyStream, response::Response, routing::post, Extension, Router};
use futures::TryStreamExt;
use hash_status::{Status, StatusCode};
use tokio::io;
use tokio_postgres::NoTls;
use tokio_util::{codec::FramedRead, io::StreamReader};

use crate::{
    api::{
        error::{ErrorInfo, StatusPayloads},
        rest::{
            middleware::{log_request_and_response, span_trace_layer},
            status::status_to_response,
        },
    },
    snapshot::{codec, SnapshotStore},
    store::{PostgresStorePool, StorePool},
};

/// Create routes for interacting with entities.
pub fn routes(pool: PostgresStorePool<NoTls>) -> Router {
    Router::new()
        .route("/snapshot", post(restore_snapshot))
        .layer(Extension(Arc::new(pool)))
        .layer(axum::middleware::from_fn(log_request_and_response))
        .layer(span_trace_layer())
}

async fn restore_snapshot(
    pool: Extension<Arc<PostgresStorePool<NoTls>>>,
    snapshot: BodyStream,
) -> Result<Response, Response> {
    let store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        status_to_response(Status::new(
            StatusCode::Internal,
            Some(format!(
                "{report}\n\nThis is an internal error, please report to the developers of the \
                 HASH Graph with whatever information you can provide including request details \
                 and logs."
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
    })?;

    SnapshotStore::new(store)
        .restore_snapshot(
            FramedRead::new(
                StreamReader::new(
                    snapshot.map_err(|err| io::Error::new(io::ErrorKind::Other, err)),
                ),
                codec::JsonLinesDecoder::default(),
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

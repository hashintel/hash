use std::fmt::Debug;

use axum::{
    response::{IntoResponse, Response},
    Json,
};
use error_stack::{Context, Report};
use hash_status::{Status, StatusCode};
use serde::Serialize;

pub(crate) fn status_to_response<T>(status: Status<T>) -> Response
where
    T: Serialize + Send + Sync + Debug,
{
    let status_code = axum::http::StatusCode::from_u16(status.code().to_http_code())
        .expect("HASH Status code should map to a valid HTTP status code");
    let mut response = Json(status).into_response();
    *response.status_mut() = status_code;
    response
}

pub(crate) fn report_to_response<C>(report: impl Into<Report<C>>) -> Response
where
    C: Context,
{
    let report = report.into();
    tracing::error!(error = ?report);
    let status_code = report
        .request_ref::<StatusCode>()
        .next()
        .copied()
        .or_else(|| report.request_value::<StatusCode>().next())
        .unwrap_or(StatusCode::Internal);

    status_to_response(Status::new(
        status_code,
        Some(report.to_string()),
        vec![report],
    ))
}

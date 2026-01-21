use core::{error::Error, fmt::Debug, mem};
use std::collections::HashMap;

use axum::{
    Json,
    response::{IntoResponse, Response},
};
use error_stack::Report;
use hash_graph_postgres_store::store::error::BaseUrlAlreadyExists;
use hash_graph_store::entity::EntityValidationReport;
use hash_status::{Status, StatusCode};
use serde::Serialize;

pub struct BoxedResponse(Box<Response>);

impl IntoResponse for BoxedResponse {
    fn into_response(self) -> Response {
        *self.0
    }
}

impl From<Response> for BoxedResponse {
    fn from(response: Response) -> Self {
        Self(Box::new(response))
    }
}

/// Converts a `Status` into an `axum::Response`.
///
/// # Panics
///
/// Panics if the `Status` code does not map to a valid HTTP status code.
#[must_use]
pub fn status_to_response<T>(status: Status<T>) -> BoxedResponse
where
    T: Serialize + Send + Sync + Debug,
{
    let status_code = axum::http::StatusCode::from_u16(status.code().to_http_code())
        .expect("HASH Status code should map to a valid HTTP status code");
    let mut response = Json(status).into_response();
    *response.status_mut() = status_code;

    response.into()
}

#[derive(Debug, Serialize)]
#[serde(bound = "C: Error + Send + Sync + 'static")]
struct ValidationContent<C> {
    validation: HashMap<usize, EntityValidationReport>,
    report: Report<[C]>,
}

pub(crate) fn report_to_response<C>(report: impl Into<Report<[C]>>) -> BoxedResponse
where
    C: Error + Send + Sync + 'static,
{
    let mut report = report.into();
    let status_code = report
        .request_ref::<StatusCode>()
        .next()
        .copied()
        .or_else(|| report.request_value::<StatusCode>().next())
        .unwrap_or_else(|| {
            if report.contains::<BaseUrlAlreadyExists>() {
                StatusCode::AlreadyExists
            } else {
                StatusCode::Unknown
            }
        });

    // TODO: Currently, this mostly duplicates the error printed below, when more information is
    //       added to the `Report` event consider commenting in this line again.
    // hash_telemetry::sentry::capture_report(&report);

    let message = report.to_string();
    if let Some(validation) = report
        .downcast_mut::<HashMap<usize, EntityValidationReport>>()
        .map(mem::take)
    {
        tracing::error!(error = ?report, ?validation, tags.code = ?status_code.to_http_code());
        let status_code = if !validation.is_empty() && status_code == StatusCode::Unknown {
            StatusCode::InvalidArgument
        } else {
            status_code
        };

        status_to_response(Status::new(
            status_code,
            Some(message),
            vec![ValidationContent { validation, report }],
        ))
    } else {
        tracing::error!(error = ?report, tags.code = ?status_code.to_http_code());
        status_to_response(Status::new(status_code, Some(message), vec![report]))
    }
}

//! The status payloads the REST API answers with, and their conversion into responses.
//!
//! The payload types follow the [Google Cloud error model].
//!
//! [Google Cloud error model]: https://github.com/googleapis/googleapis/blob/master/google/rpc/error_details.proto

use core::{error::Error, mem};
use std::collections::HashMap;

use axum::response::{IntoResponse, Response};
use error_stack::Report;
use hash_graph_postgres_store::store::error::BaseUrlAlreadyExists;
use hash_graph_store::entity::EntityValidationReport;
use hash_status::{Status as HashStatus, StatusCode};
use serde::{Deserialize, Serialize};

/// Generalized information about an error, covering its cause, its origin and a collection of
/// weakly-typed metadata.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorInfo {
    /// The proximate cause of the error.
    ///
    /// A constant value, unique within its [`domain`], of at most 63 characters matching
    /// `[A-Z][A-Z0-9_]+[A-Z0-9]`.
    ///
    /// [`domain`]: Self::domain
    pub reason: String,
    /// The logical grouping the [`reason`] belongs to, typically the registered service name of
    /// the tool or product raising the error.
    ///
    /// [`reason`]: Self::reason
    pub domain: String,
    /// Additional structured details about this error.
    ///
    /// Keys match `[a-zA-Z0-9-_]` and are limited to 64 characters. Units belong in the key
    /// rather than the value, so an exceeded limit reads `{"instanceLimitPerRequest": "100"}`
    /// rather than `{"instanceLimit": "100/request"}`.
    pub metadata: HashMap<String, serde_json::Value>,
}

impl ErrorInfo {
    #[must_use]
    pub fn new(metadata: HashMap<String, serde_json::Value>, reason: String) -> Self {
        Self {
            domain: "HASH Graph".to_owned(),
            metadata,
            reason,
        }
    }
}

/// The status the REST API answers errors with.
pub type Status = HashStatus<ErrorInfo>;

/// A boxed [`Response`], keeping the types that carry one small.
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

/// Converts a [`HashStatus`] into the response it answers with.
///
/// # Panics
///
/// Panics if the [`HashStatus`] code does not map to a valid HTTP status code.
#[must_use]
pub fn status_to_response<T>(status: HashStatus<T>) -> BoxedResponse
where
    T: Serialize + Send + Sync + core::fmt::Debug,
{
    let status_code = axum::http::StatusCode::from_u16(status.code().to_http_code())
        .expect("HASH Status code should map to a valid HTTP status code");
    let mut response = axum::Json(status).into_response();
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

        status_to_response(HashStatus::new(
            status_code,
            Some(message),
            vec![ValidationContent { validation, report }],
        ))
    } else {
        tracing::error!(error = ?report, tags.code = ?status_code.to_http_code());
        status_to_response(HashStatus::new(status_code, Some(message), vec![report]))
    }
}

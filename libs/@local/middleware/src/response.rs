//! The error documents the middlewares answer rejections with.

use alloc::borrow::Cow;

use axum::{body::Body, response::Response};
use http::{HeaderValue, header::CONTENT_TYPE};
use serde::Serialize;

/// The error document a middleware rejection answers with.
///
/// The client-safe message alone; the HTTP status line carries the classification.
#[derive(Serialize)]
struct ErrorDocument {
    message: Cow<'static, str>,
}

/// Serializes the error document for a rejection.
pub(crate) fn error_body(message: impl Into<Cow<'static, str>>) -> Vec<u8> {
    serde_json::to_vec(&ErrorDocument {
        message: message.into(),
    })
    .expect("the error document should serialize")
}

/// Answers a rejection with its error document.
pub(crate) fn error_response(
    status: http::StatusCode,
    message: impl Into<Cow<'static, str>>,
) -> Response {
    let mut response = Response::new(Body::from(error_body(message)));
    *response.status_mut() = status;
    response
        .headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    response
}

//! The health probe endpoint shared by the HASH services.

use axum::{Router, response::IntoResponse as _, routing::get};
use http::header;

/// Path every HASH service answers health probes on.
///
/// [`HttpTracingLayer`] skips it: a probe answered every few seconds per task carries no signal,
/// and tracing it only inflates the RED metrics derived from spans.
///
/// [`HttpTracingLayer`]: crate::rest::http_tracing_layer::HttpTracingLayer
pub const HEALTH_PATH: &str = "/health";

const HEALTH_MEDIA_TYPE: &str = "application/health+json";

const HEALTH_BODY: &str = r#"{"status":"pass"}"#;

/// A [`Router`] serving [`HEALTH_PATH`].
///
/// Deliberately free of dependency checks. A probe that reaches through to Postgres takes every
/// task out of rotation the moment Postgres is slow, which turns a degraded dependency into an
/// outage.
pub fn router() -> Router {
    Router::new().route(
        HEALTH_PATH,
        get(async || ([(header::CONTENT_TYPE, HEALTH_MEDIA_TYPE)], HEALTH_BODY).into_response()),
    )
}

//! The graph's request tracing, over [`hash_middleware`]'s layer.

pub use hash_middleware::telemetry::HttpTracingLayer;

use crate::rest::probe;

/// The graph's tracing layer: every request produces a span, except the health probe.
#[must_use]
pub fn layer() -> HttpTracingLayer {
    HttpTracingLayer::new(|path| path == probe::HEALTH_PATH)
}

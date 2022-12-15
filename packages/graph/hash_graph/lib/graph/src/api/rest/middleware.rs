use axum::{
    body::{Body, Bytes, HttpBody},
    http::{self, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use opentelemetry::{
    propagation::Extractor,
    sdk::trace::{IdGenerator, RandomIdGenerator},
    trace::{SpanContext, SpanId, TraceContextExt},
};
use tower_http::{
    classify::{ServerErrorsAsFailures, SharedClassifier},
    trace::TraceLayer,
};
use tracing::{enabled, Level};

// *Heavily* inspired by
// https://github.com/tokio-rs/axum/blob/main/examples/print-request-response/src/main.rs

/// A development-environment-focused `axum` Handler function to buffer the body of requests and
/// responses and log them. Overhead should be minimal when not in `Level::Trace`
pub(super) async fn log_request_and_response(
    request: Request<Body>,
    next: Next<Body>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut request = request;
    if enabled!(Level::TRACE) {
        // Destructure the request and pass the stream buffer
        let (parts, body) = request.into_parts();
        let bytes = buffer_and_log("request", body, None).await?;
        request = Request::from_parts(parts, Body::from(bytes));
    }

    // Run the rest of the layers
    let response = next.run(request).await;

    if enabled!(Level::TRACE) {
        // Destructure the response and pass the stream buffer
        let (parts, body) = response.into_parts();
        let bytes = buffer_and_log("response", body, Some(parts.status)).await?;
        let new_response = Response::from_parts(parts, Body::from(bytes));
        Ok(new_response.into_response())
    } else {
        Ok(response)
    }
}

async fn buffer_and_log<B>(
    direction: &str,
    body: B,
    status_code: Option<StatusCode>,
) -> Result<Bytes, (StatusCode, String)>
where
    B: HttpBody<Data = Bytes> + Send,
    B::Error: std::fmt::Display,
{
    let bytes = match hyper::body::to_bytes(body).await {
        Ok(bytes) => bytes,
        Err(err) => {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("failed to read {direction} body: {err}"),
            ));
        }
    };

    if let Ok(body) = std::str::from_utf8(&bytes) {
        #[expect(
            clippy::option_if_let_else,
            reason = "would be nice to use `let_guard`s here"
        )]
        if let Some(status_code) = status_code {
            if status_code.is_success() {
                tracing::trace!("{direction} body = {body:?}");
            } else {
                tracing::error!("{direction} body = {body:?}");
            }
        } else {
            tracing::trace!("{direction} body = {body:?}");
        }
    }

    Ok(bytes)
}

struct HeaderExtractor<'a>(&'a http::HeaderMap);
// Let OpenTelemetry pick the field names to make our headers "standardized".
// We would have to set `traceparent` and
impl<'a> Extractor for HeaderExtractor<'a> {
    fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).and_then(|value| value.to_str().ok())
    }

    fn keys(&self) -> Vec<&str> {
        self.0
            .keys()
            .map(hyper::header::HeaderName::as_str)
            .collect()
    }
}

fn extract_header_remote_context(headers: &http::HeaderMap) -> opentelemetry::Context {
    let extractor = HeaderExtractor(headers);
    let ctx =
        opentelemetry::global::get_text_map_propagator(|propagator| propagator.extract(&extractor));

    if ctx.span().span_context().is_valid() {
        // Remote context
        ctx
    } else {
        // New, local context
        ctx.with_remote_span_context(SpanContext::new(
            RandomIdGenerator::default().new_trace_id(),
            SpanId::INVALID,
            ctx.span().span_context().trace_flags(),
            // explicitly make it non-remote
            false,
            ctx.span().span_context().trace_state().clone(),
        ))
    }
}

// Based on https://github.com/tokio-rs/axum/pull/769
pub fn span_maker(request: &hyper::Request<hyper::Body>) -> tracing::Span {
    let span = tracing::info_span!("http-request", http.status_method = %request.method(), http.target = %request.uri());
    let remote_context = extract_header_remote_context(request.headers());
    tracing_opentelemetry::OpenTelemetrySpanExt::set_parent(&span, remote_context);
    span
}

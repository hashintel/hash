use std::{borrow::Cow, net::SocketAddr};

use axum::{
    body::{Body, Bytes, HttpBody},
    extract::ConnectInfo,
    http::{self, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use hyper::header;
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
// We would have to set `traceparent` in a header to correlate spans.
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
        // Remote context where the trace is correlated.
        ctx
    } else {
        // New, local context with generated ids.
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

fn parse_x_forwarded_for(headers: &http::HeaderMap) -> Option<Cow<'_, str>> {
    let value = headers.get("x-forwarded-for")?;
    let value = value.to_str().ok()?;
    let mut ips = value.split(',');
    Some(ips.next()?.trim().into())
}

// Based on https://github.com/tokio-rs/axum/pull/769
pub fn span_maker(request: &hyper::Request<hyper::Body>) -> tracing::Span {
    let method = request.method();
    let route = request.uri();

    let user_agent = request
        .headers()
        .get(header::USER_AGENT)
        .map_or("", |h| h.to_str().unwrap_or(""));

    let host = request
        .headers()
        .get(header::HOST)
        .map_or("", |h| h.to_str().unwrap_or(""));

    let client_ip = parse_x_forwarded_for(request.headers())
        .or_else(|| {
            request
                .extensions()
                .get::<ConnectInfo<SocketAddr>>()
                .map(|ConnectInfo(client_ip)| Cow::from(client_ip.to_string()))
        })
        .unwrap_or_default();

    let remote_context = extract_header_remote_context(request.headers());
    let trace_id = remote_context.span().span_context().trace_id();

    let span = tracing::info_span!("http-request",
        trace_id = %trace_id,
        otel.kind = "server",
        otel.name = %format!("{method} {route}"),
        http.method = %method,
        http.route = %route,
        http.user_agent = %user_agent,
        http.host = %host,
        http.client_ip = %client_ip,
    );
    tracing_opentelemetry::OpenTelemetrySpanExt::set_parent(&span, remote_context);
    span
}

use std::{borrow::Cow, net::SocketAddr, time::Duration};

use axum::{
    body::{Body, Bytes, HttpBody},
    extract::{ConnectInfo, MatchedPath, OriginalUri},
    http::{self, uri::Scheme, Request, StatusCode},
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
    classify::{ServerErrorsAsFailures, ServerErrorsFailureClass, SharedClassifier},
    trace::{DefaultOnBodyChunk, DefaultOnEos, DefaultOnRequest, TraceLayer},
};
use tracing::{enabled, field::Empty, Level};

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

pub fn span_trace_layer() -> TraceLayer<
    SharedClassifier<ServerErrorsAsFailures>,
    impl Fn(&Request<Body>) -> tracing::Span + Clone,
    DefaultOnRequest,
    impl Fn(&Response<axum::body::BoxBody>, Duration, &tracing::Span) + Clone,
    DefaultOnBodyChunk,
    DefaultOnEos,
    impl Fn(ServerErrorsFailureClass, Duration, &tracing::Span) + Clone,
> {
    TraceLayer::new_for_http()
        .make_span_with(span_maker)
        .on_failure(span_on_failure)
        .on_response(span_on_response)
}

struct HeaderExtractor<'a>(&'a http::HeaderMap);
// Let OpenTelemetry pick the field names to make our headers "standardized".
// We would have to set `traceparent` in a header to correlate spans.
impl<'a> Extractor for HeaderExtractor<'a> {
    fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).and_then(|value| value.to_str().ok())
    }

    fn keys(&self) -> Vec<&str> {
        self.0.keys().map(header::HeaderName::as_str).collect()
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
fn span_maker(request: &Request<Body>) -> tracing::Span {
    let target = request.uri();
    let scheme: Cow<'static, str> = target.scheme().map_or_else(
        || "HTTP".into(),
        |scheme| {
            if scheme == &Scheme::HTTP {
                "http".into()
            } else if scheme == &Scheme::HTTPS {
                "https".into()
            } else {
                scheme.to_string().into()
            }
        },
    );

    let method = request.method();

    // Because of https://github.com/tokio-rs/axum/issues/1441 and our usage of nested routes we
    // need to fall back to using the `OriginalUri`.
    // As we are to remove any routes that have URI path parameters, we shouldn't run into
    // high-cardinality name problems in the OpenTelemetry traces we send.
    let route = request.extensions().get::<MatchedPath>().map_or_else(
        || {
            request.extensions().get::<OriginalUri>().map_or_else(
                || request.uri().path().to_owned(),
                |uri| uri.0.path().to_owned(),
            )
        },
        |matched_path| matched_path.as_str().to_owned(),
    );

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

    // Implementing the args outlined by
    // - https://github.com/open-telemetry/opentelemetry-specification/blob/5b6d22512ef72214f7cbd52747a1fbfe49f8121f/specification/trace/semantic_conventions/http.md#http-server-semantic-conventions
    // - https://github.com/open-telemetry/opentelemetry-specification/blob/5b6d22512ef72214f7cbd52747a1fbfe49f8121f/specification/trace/semantic_conventions/http.md#common-attributes
    let span = tracing::info_span!("http-request",
        trace_id = %trace_id,
        otel.kind = "server",
        otel.name = %format!("{method} {route}"),
        http.scheme = %scheme,
        http.target = %target,
        http.route = %route,
        http.method = %method,
        http.client_ip = %client_ip,
        http.user_agent = %user_agent,
        http.host = %host,
        http.status_code = Empty,
        otel.status_code = Empty,
    );
    tracing_opentelemetry::OpenTelemetrySpanExt::set_parent(&span, remote_context);
    span
}

fn span_on_response(
    response: &Response<axum::body::BoxBody>,
    _latency: Duration,
    span: &tracing::Span,
) {
    let status = response.status().as_u16();
    span.record("http.status_code", &tracing::field::display(status));
    span.record("otel.status_code", "OK");
}

#[expect(
    clippy::needless_pass_by_value,
    reason = "The failure argument isn't consumed, but passed by value from the TraceLayer."
)]
fn span_on_failure(failure: ServerErrorsFailureClass, _duration: Duration, span: &tracing::Span) {
    match failure {
        ServerErrorsFailureClass::StatusCode(status) => {
            if status.is_server_error() {
                span.record("otel.status_code", "ERROR");
            }
        }
        ServerErrorsFailureClass::Error(_) => {
            span.record("otel.status_code", "ERROR");
        }
    }
}

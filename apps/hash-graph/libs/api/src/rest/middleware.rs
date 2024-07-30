use alloc::borrow::Cow;
use core::{net::SocketAddr, time::Duration};

use axum::{
    body::Body,
    extract::{ConnectInfo, MatchedPath, OriginalUri},
    http::{self, uri::Scheme, Request},
    response::Response,
};
use hyper::header;
use opentelemetry::{
    propagation::Extractor,
    trace::{SpanContext, SpanId, TraceContextExt},
};
use opentelemetry_sdk::trace::{IdGenerator, RandomIdGenerator};
use tower_http::{
    classify::{ServerErrorsAsFailures, ServerErrorsFailureClass, SharedClassifier},
    trace::{DefaultOnBodyChunk, DefaultOnEos, DefaultOnRequest, TraceLayer},
};
use tracing::field::Empty;

pub fn span_trace_layer() -> TraceLayer<
    SharedClassifier<ServerErrorsAsFailures>,
    impl Fn(&Request<Body>) -> tracing::Span + Clone,
    DefaultOnRequest,
    impl Fn(&Response<Body>, Duration, &tracing::Span) + Clone,
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
    // As we are to remove any routes that have URL path parameters, we shouldn't run into
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

fn span_on_response(response: &Response<Body>, _latency: Duration, span: &tracing::Span) {
    let status = response.status().as_u16();
    span.record("http.status_code", tracing::field::display(status));
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

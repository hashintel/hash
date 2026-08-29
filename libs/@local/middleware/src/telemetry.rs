//! An HTTP server span per request, joined to the caller's OpenTelemetry trace.

use core::{future::Future, net::SocketAddr};

use axum::extract::{ConnectInfo, MatchedPath, Request};
use http::Response;
use opentelemetry::{
    Context, global,
    propagation::{Extractor, Injector},
};
use opentelemetry_semantic_conventions::trace;
use tower::{Layer, Service};
use tracing::{Instrument as _, Span, field::Empty};
use tracing_opentelemetry::OpenTelemetrySpanExt as _;

struct HeaderExtractor<'a>(&'a http::HeaderMap);

impl Extractor for HeaderExtractor<'_> {
    fn get(&self, key: &str) -> Option<&str> {
        let value = self.0.get(key)?;
        value.to_str().ok()
    }

    fn keys(&self) -> Vec<&str> {
        self.0.keys().map(http::HeaderName::as_str).collect()
    }
}

struct HeaderInjector<'a>(&'a mut http::HeaderMap);

impl Injector for HeaderInjector<'_> {
    fn set(&mut self, key: &str, value: String) {
        if let Ok(name) = http::header::HeaderName::from_bytes(key.as_bytes())
            && let Ok(val) = http::header::HeaderValue::from_str(&value)
        {
            self.0.insert(name, val);
        }
    }
}

fn extract_context_from_headers(headers: &http::HeaderMap) -> Context {
    let extractor = HeaderExtractor(headers);
    global::get_text_map_propagator(|propagator| propagator.extract(&extractor))
}

fn create_http_span<B>(request: &Request<B>, skip: fn(&str) -> bool) -> Span {
    // Use MatchedPath if available (route template like /entities/{id}),
    // fallback to actual URI path for unmatched requests
    let path = request
        .extensions()
        .get::<MatchedPath>()
        .map_or_else(|| request.uri().path(), MatchedPath::as_str);

    if skip(path) {
        return Span::none();
    }

    let http_span = tracing::info_span!(
        "HTTP request",
        otel.kind = "server",
        otel.name = format!("{} {}", request.method(), path),
        { trace::HTTP_REQUEST_METHOD } = %request.method(),
        { trace::URL_PATH } = path,
        { trace::URL_SCHEME } = Empty,
        { trace::USER_AGENT_ORIGINAL } = Empty,
        { trace::SERVER_ADDRESS } = Empty,
        { trace::HTTP_REQUEST_BODY_SIZE } = Empty,
        { trace::NETWORK_PEER_ADDRESS } = Empty,
        { trace::NETWORK_PEER_PORT } = Empty,
        { trace::HTTP_RESPONSE_STATUS_CODE } = Empty,
        { trace::HTTP_RESPONSE_BODY_SIZE } = Empty,
        // The authentication middleware records this field.
        { "actor_entity_uuid" } = Empty,
    );

    // `set_parent` returns an error if no OpenTelemetry layer is registered with the subscriber,
    // e.g. when OTLP export is disabled. In that case the span simply has no remote parent.
    if let Err(error) = http_span.set_parent(extract_context_from_headers(request.headers())) {
        tracing::debug!(%error, "could not set parent OpenTelemetry context on HTTP span");
    }

    if let Some(schema) = request.uri().scheme_str() {
        http_span.record(trace::URL_SCHEME, schema);
    }

    if let Some(user_agent) = request.headers().get("user-agent")
        && let Ok(user_agent_str) = user_agent.to_str()
    {
        http_span.record(trace::USER_AGENT_ORIGINAL, user_agent_str);
    }

    if let Some(host) = request.headers().get("host")
        && let Ok(host_str) = host.to_str()
    {
        http_span.record(trace::SERVER_ADDRESS, host_str);
    }

    let headers = request.headers();
    if let Some(content_length) = headers.get("content-length")
        && let Ok(content_length_str) = content_length.to_str()
        && let Ok(body_size) = content_length_str.parse::<i64>()
    {
        http_span.record(trace::HTTP_REQUEST_BODY_SIZE, body_size);
    }

    if let Some(ConnectInfo(addr)) = request.extensions().get::<ConnectInfo<SocketAddr>>() {
        http_span.record(trace::NETWORK_PEER_ADDRESS, addr.ip().to_string());
        http_span.record(trace::NETWORK_PEER_PORT, i64::from(addr.port()));
    }

    http_span
}

// Record response-specific attributes on the span
fn record_response_attributes<B>(span: &Span, response: &http::Response<B>) {
    let status_code = response.status().as_u16();
    span.record(trace::HTTP_RESPONSE_STATUS_CODE, i64::from(status_code));

    if let Some(content_length) = response.headers().get("content-length")
        && let Ok(content_length_str) = content_length.to_str()
        && let Ok(body_size) = content_length_str.parse::<i64>()
    {
        span.record(trace::HTTP_RESPONSE_BODY_SIZE, body_size);
    }

    if status_code >= 400 {
        span.set_status(opentelemetry::trace::Status::error(format!(
            "HTTP {status_code}",
        )));
    } else {
        span.set_status(opentelemetry::trace::Status::Ok);
    }
}

// Inject OpenTelemetry context into HTTP headers
fn inject_context_to_headers(context: &Context, headers: &mut http::HeaderMap) {
    let mut injector = HeaderInjector(headers);
    global::get_text_map_propagator(|propagator| {
        propagator.inject_context(context, &mut injector);
    });
}

/// Spans every request the wrapped service serves, except the paths `skip` names.
///
/// A skipped path — typically a health probe answered every few seconds — produces no span at
/// all rather than a noisy one.
///
/// # Example
///
/// ```
/// use axum::{Router, routing::get};
/// use hash_middleware::telemetry::HttpTracingLayer;
///
/// let router: Router = Router::new()
///     .route("/entities", get(async || "ok"))
///     .route("/health", get(async || "ok"))
///     .layer(HttpTracingLayer::new(|path| path == "/health"));
/// ```
#[derive(Clone, Debug)]
pub struct HttpTracingLayer {
    skip: fn(&str) -> bool,
}

impl HttpTracingLayer {
    /// Creates the layer, skipping the paths `skip` names.
    #[must_use]
    pub const fn new(skip: fn(&str) -> bool) -> Self {
        Self { skip }
    }
}

impl<S> Layer<S> for HttpTracingLayer {
    type Service = HttpTracingService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        HttpTracingService {
            inner,
            skip: self.skip,
        }
    }
}

/// The service [`HttpTracingLayer`] wraps its inner service into.
#[derive(Clone, Debug)]
pub struct HttpTracingService<S> {
    inner: S,
    skip: fn(&str) -> bool,
}

impl<S, Req, Res> Service<Request<Req>> for HttpTracingService<S>
where
    S: Service<Request<Req>, Response = Response<Res>, Future: Send> + Send,
{
    type Error = S::Error;
    type Response = S::Response;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>> + Send;

    fn poll_ready(
        &mut self,
        cx: &mut core::task::Context<'_>,
    ) -> core::task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<Req>) -> Self::Future {
        let http_span = create_http_span(&req, self.skip);
        let future = self.inner.call(req);

        async move {
            let mut result = future.await;

            // Record response attributes and inject headers when the service produced a response.
            if let Ok(response) = &mut result {
                let current_span = Span::current();
                record_response_attributes(&current_span, response);

                let otel_context = current_span.context();
                inject_context_to_headers(&otel_context, response.headers_mut());
            }

            result
        }
        .instrument(http_span)
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use std::sync::Mutex;

    use axum::{Router, body::Body, routing::get};
    use http::Request;
    use tower::ServiceExt as _;
    use tracing::instrument::WithSubscriber as _;
    use tracing_subscriber::layer::SubscriberExt as _;

    use super::HttpTracingLayer;

    /// Records the name of every span opened under the subscriber it is layered onto.
    #[derive(Clone, Default)]
    struct SpanNames(Arc<Mutex<Vec<&'static str>>>);

    impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for SpanNames {
        fn on_new_span(
            &self,
            attrs: &tracing::span::Attributes<'_>,
            _id: &tracing::span::Id,
            _ctx: tracing_subscriber::layer::Context<'_, S>,
        ) {
            self.0
                .lock()
                .expect("the span log should lock")
                .push(attrs.metadata().name());
        }
    }

    #[tokio::test]
    async fn only_unskipped_paths_open_spans() {
        let names = SpanNames::default();
        let subscriber = tracing_subscriber::registry().with(names.clone());

        let router: Router = Router::new()
            .route("/entities", get(async || "ok"))
            .route("/health", get(async || "ok"))
            .layer(HttpTracingLayer::new(|path| path == "/health"));

        async {
            for uri in ["/health", "/entities"] {
                let response = router
                    .clone()
                    .oneshot(
                        Request::builder()
                            .uri(uri)
                            .body(Body::empty())
                            .expect("the request should build"),
                    )
                    .await
                    .expect("the router should respond");
                assert_eq!(response.status(), http::StatusCode::OK);
            }
        }
        .with_subscriber(subscriber)
        .await;

        let names = names.0.lock().expect("the span log should lock");
        assert_eq!(
            names.as_slice(),
            ["HTTP request"],
            "the skipped path should open no span, the other path exactly one"
        );
    }
}

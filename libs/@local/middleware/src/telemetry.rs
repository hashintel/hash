//! An HTTP server span per request, joined to the caller's OpenTelemetry trace.

use core::{future::Future, net::SocketAddr};

use axum::extract::{ConnectInfo, MatchedPath, Request};
use http::{Response, StatusCode};
use opentelemetry::{
    Context, KeyValue, global,
    propagation::{Extractor, Injector},
    trace::TraceContextExt as _,
};
use opentelemetry_semantic_conventions::trace;
use problematic::{ProblemType, Rejected};
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
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(MatchedPath::as_str);
    let path = route.unwrap_or_else(|| request.uri().path());

    if skip(path) {
        return Span::none();
    }

    let name = route.map_or_else(
        || request.method().to_string(),
        |route| format!("{} {route}", request.method()),
    );

    let http_span = tracing::info_span!(
        "HTTP request",
        otel.kind = "server",
        otel.name = name,
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
        { "problem.type" } = Empty,
        { trace::ERROR_TYPE } = Empty,
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
}

/// Marks the span as failed for a server error, and sets no status for any other response.
///
/// The description is the `detail` the client of a rejection received, and empty without one.
fn record_status(span: &Span, status: StatusCode, rejected: Option<&Rejected>) {
    if status.is_server_error() {
        let description = rejected
            .and_then(Rejected::detail)
            .unwrap_or_default()
            .to_owned();
        span.set_status(opentelemetry::trace::Status::error(description));
    }
}

/// Records the rejection a problem details response was created from on the request span.
///
/// Every rejection sets `problem.type`. A client error adds its error to the span as an event,
/// which reaches the trace but neither the logs nor the error attributes of the span. A server
/// error, and a rejection whose details failed to serialize, set `error.type` and log the error at
/// `ERROR`, which also reaches the trace as an event.
fn record_rejection(span: &Span, status: StatusCode, rejected: &Rejected) {
    let problem_type = rejected.problem_type();
    span.record("problem.type", problem_type.type_uri.as_ref());

    if let Some(serialization_error) = rejected.serialization_error() {
        span.record(trace::ERROR_TYPE, error_type(problem_type).as_str());
        tracing::error!(
            error = ?rejected.error(),
            %serialization_error,
            "problem details failed to serialize, answered with an internal server error"
        );
    } else if status.is_server_error() {
        span.record(trace::ERROR_TYPE, error_type(problem_type).as_str());
        tracing::error!(
            problem.type = %problem_type.type_uri,
            error = ?rejected.error(),
            "request failed with a server error"
        );
    } else {
        // A span that is not recorded drops the event, so its error is not formatted.
        let context = span.context();
        if context.span().is_recording() {
            span.add_event(
                "request rejected with a client error",
                vec![KeyValue::new("error", format!("{:?}", rejected.error()))],
            );
        }
    }
}

/// The `error.type` of a server error: its type URI, or its status code for `about:blank`, whose
/// status describes the problem.
fn error_type(problem_type: &ProblemType) -> String {
    if problem_type.type_uri == "about:blank" {
        problem_type.status.as_str().to_owned()
    } else {
        problem_type.type_uri.to_string()
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
/// all rather than a noisy one. A server error marks the span as failed. A response a
/// [`Rejection`] became carries the error behind it, which the span records: a server error is
/// logged as well, a client error reaches the trace only.
///
/// [`Rejection`]: problematic::Rejection
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
                let rejected = response.extensions().get::<Rejected>();
                record_status(&current_span, response.status(), rejected);
                if let Some(rejected) = rejected {
                    record_rejection(&current_span, response.status(), rejected);
                }

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
    use alloc::{borrow::Cow, sync::Arc};
    use std::sync::Mutex;

    use axum::{Router, body::Body, routing::get};
    use http::{Request, StatusCode};
    use opentelemetry::trace::Status;
    use opentelemetry_sdk::trace::SpanData;
    use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Rejection, Variant};
    use tower::ServiceExt as _;
    use tracing::instrument::WithSubscriber as _;
    use tracing_subscriber::layer::SubscriberExt as _;

    use super::HttpTracingLayer;
    use crate::{problem::InternalServerError, test_tracing::RecordedTrace};

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

    /// The limit is not a number.
    #[derive(serde::Serialize, schemars::JsonSchema, derive_more::Display)]
    #[display("The limit is not a number.")]
    struct InvalidLimit;

    impl ProblemVariant for InvalidLimit {
        const TYPE: ProblemType = ProblemType {
            type_uri: Cow::Borrowed("https://example.com/problems/invalid-limit"),
            title: Cow::Borrowed("Invalid limit"),
            status: StatusCode::BAD_REQUEST,
        };
    }

    struct ListEntitiesProblem;

    impl Problem for ListEntitiesProblem {
        const VARIANTS: &'static [Variant] = &[
            Variant::of::<InvalidLimit>(),
            Variant::of::<InternalServerError>(),
        ];
    }

    #[derive(Debug, Clone, Copy, derive_more::Display)]
    enum ListEntitiesError {
        #[display("the limit `many` is not a number")]
        Limit,
        #[display("the entity store is unreachable")]
        Store,
    }

    impl core::error::Error for ListEntitiesError {}

    impl Expose<ListEntitiesProblem> for ListEntitiesError {
        fn expose(&self) -> Answer<'_, ListEntitiesProblem> {
            match self {
                Self::Limit => Answer::new(InvalidLimit),
                Self::Store => Answer::new(InternalServerError),
            }
        }
    }

    /// Serves one request to `uri` through the tracing layer, and returns what it traced and
    /// logged together with the span of the request.
    async fn serve(router: Router, uri: &str) -> (RecordedTrace, SpanData) {
        let trace = RecordedTrace::new();
        router
            .layer(HttpTracingLayer::new(|_| false))
            .oneshot(
                Request::builder()
                    .uri(uri)
                    .body(Body::empty())
                    .expect("the request should build"),
            )
            .with_subscriber(trace.dispatch())
            .await
            .expect("the router should respond");

        let span = trace
            .spans()
            .pop()
            .expect("the request should export its span");
        (trace, span)
    }

    /// Serves one request whose handler fails with `error`, and returns what it traced and logged
    /// together with the span of the request.
    async fn serve_failing(error: ListEntitiesError) -> (RecordedTrace, SpanData) {
        let handler = move || {
            core::future::ready(Err::<(), _>(Rejection::<ListEntitiesProblem>::from(error)))
        };
        serve(Router::new().route("/entities", get(handler)), "/entities").await
    }

    fn attribute(span: &SpanData, key: &str) -> Option<String> {
        span.attributes
            .iter()
            .find(|attribute| attribute.key.as_str() == key)
            .map(|attribute| attribute.value.as_str().into_owned())
    }

    #[tokio::test]
    async fn rejection_server_error() {
        let (trace, span) = serve_failing(ListEntitiesError::Store).await;

        assert_eq!(
            trace
                .levels()
                .iter()
                .filter(|level| **level == tracing::Level::ERROR)
                .count(),
            1,
            "a server error should be logged once, at `ERROR`"
        );
        assert!(
            trace.traces_error("Store"),
            "the trace should carry the error behind the rejection"
        );
        assert_eq!(
            attribute(&span, "error.type").as_deref(),
            Some("500"),
            "the error type of an `about:blank` problem should be its status"
        );
        assert_eq!(
            span.status,
            Status::error(InternalServerError.to_string()),
            "a server error should mark the span as failed with the detail the client received"
        );
    }

    #[tokio::test]
    async fn rejection_client_error() {
        let (trace, span) = serve_failing(ListEntitiesError::Limit).await;

        assert!(
            trace.levels().is_empty(),
            "a client error should not be logged"
        );
        assert_eq!(
            attribute(&span, "error.type"),
            None,
            "a client error should set no error type"
        );
        assert_eq!(
            span.status,
            Status::Unset,
            "a client error should leave the status of the server span unset"
        );
        assert_eq!(
            attribute(&span, "problem.type").as_deref(),
            Some("https://example.com/problems/invalid-limit"),
            "the span should name the problem type the client received"
        );
        assert!(
            trace.traces_error("Limit"),
            "the trace should carry the error behind the rejection"
        );
    }

    #[tokio::test]
    async fn span_status_bare_server_error() {
        let (_, span) = serve(
            Router::new().route("/entities", get(async || StatusCode::SERVICE_UNAVAILABLE)),
            "/entities",
        )
        .await;

        assert_eq!(
            span.status,
            Status::error(""),
            "a server error without a rejection should mark the span as failed without a \
             description"
        );
    }

    #[tokio::test]
    async fn span_name_matched_route() {
        let (_, span) = serve(
            Router::new().route("/entities/{id}", get(async || "ok")),
            "/entities/42",
        )
        .await;

        assert_eq!(
            span.name, "GET /entities/{id}",
            "a matched request should be named by its method and route"
        );
    }

    #[tokio::test]
    async fn span_name_unmatched_route() {
        let (_, span) = serve(
            Router::new()
                .route("/entities", get(async || "ok"))
                .fallback(async || StatusCode::NOT_FOUND),
            "/wp-admin/setup-config.php",
        )
        .await;

        assert_eq!(
            span.name, "GET",
            "a request no route matched should be named by its method alone"
        );
    }
}

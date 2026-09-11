//! RFC 9457 problem documents, the error surface of every handler.
//!
//! The `type` member carries Surface v1's stable root-relative URIs, the body serializes as
//! `application/problem+json`, and the shared rejections - foreign generation, foreign variant -
//! live here beside the document they produce. Requests that fail before a handler runs - malformed
//! bodies, wrong content types, unparsable tile addresses - route through [`super::extract`]'s
//! wrappers and answer problem documents too. Only the router's own rejections (an unmatched route,
//! a wrong method) stay plain.

use alloc::borrow::Cow;
use core::{num::NonZero, task};

use aide::{OperationOutput, generate::GenContext, openapi};
use axum::{
    Json,
    http::{self, StatusCode, header},
    response::{IntoResponse, Response},
};
use error_stack::Report;
use futures::TryFutureExt as _;
use hash_middleware::{
    authentication::{AuthenticationRejection, request::AuthenticationError},
    rate_limit::{RateLimitRejection, TooManyRequests},
};

use crate::serve::{
    document::{EdgesDocumentError, LocateDocumentError, VARIANTS},
    runtime::registry::ObserveError,
};

// shared diagnostic assertions for the locate and edges document tests.
#[cfg(test)]
pub(crate) mod tests {
    use alloc::collections::BTreeMap;
    use core::{fmt, panic::AssertUnwindSafe};
    use std::sync::mpsc;

    use axum::{
        body::to_bytes,
        http::{StatusCode, header},
        response::IntoResponse as _,
    };
    use tracing::{
        Dispatch, Event, Level, Subscriber,
        field::{Field, Visit},
        span::Id,
    };
    use tracing_subscriber::{
        Layer, Registry,
        layer::{Context, SubscriberExt as _},
        registry::LookupSpan,
    };

    use super::{Problem, ProblemType};
    use crate::offload;

    #[derive(Default)]
    struct Fields(BTreeMap<String, String>);

    impl Visit for Fields {
        fn record_debug(&mut self, field: &Field, value: &dyn fmt::Debug) {
            self.0.insert(field.name().to_owned(), format!("{value:?}"));
        }
    }

    struct Diagnostics(mpsc::Sender<(Level, Fields, Vec<Id>)>);

    impl<S: Subscriber + for<'lookup> LookupSpan<'lookup>> Layer<S> for Diagnostics {
        fn on_event(&self, event: &Event<'_>, context: Context<'_, S>) {
            let mut fields = Fields::default();
            event.record(&mut fields);
            let scope = context.event_scope(event).map_or_else(Vec::new, |scope| {
                scope.from_root().map(|span| span.id()).collect()
            });
            self.0
                .send((*event.metadata().level(), fields, scope))
                .expect("should retain the diagnostic receiver");
        }
    }

    /// Checks one offloaded error event and its sanitized HTTP response.
    ///
    /// `expected_source` is the log's `source` field. `detail` supplies its `message` and the
    /// debug-build response detail.
    ///
    /// # Panics
    ///
    /// Panics if worker setup, `produce` or response collection fails. Also panics if the log or
    /// response differs from the expected values.
    #[track_caller]
    pub(crate) fn assert_internal_diagnostic(
        produce: impl FnOnce() -> Problem<'static> + Send + 'static,
        expected_source: &str,
        detail: &'static str,
    ) {
        let (events, received) = mpsc::channel();
        let dispatch = Dispatch::new(Registry::default().with(Diagnostics(events)));
        let worker_dispatch = dispatch.clone();
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(1)
            .spawn_handler(move |thread| {
                let dispatch = worker_dispatch.clone();
                std::thread::spawn(move || {
                    tracing::dispatcher::with_default(&dispatch, || thread.run());
                });
                Ok(())
            })
            .build()
            .expect("should build the diagnostic worker");
        let (problem, request_id) = tracing::dispatcher::with_default(&dispatch, || {
            let request = tracing::info_span!("request");
            let id = request.id().expect("should enable the request span");
            let handle =
                pool.install(|| request.in_scope(|| offload::run(AssertUnwindSafe(produce))));
            (
                futures::executor::block_on(handle).expect("should finish the problem conversion"),
                id,
            )
        });
        let events: Vec<_> = received.try_iter().collect();
        assert_eq!(events.len(), 1, "should report the failure exactly once");
        let (level, fields, scope) = &events[0];
        assert_eq!(*level, Level::ERROR);
        assert_eq!(scope, &[request_id]);
        assert_eq!(
            fields.0,
            BTreeMap::from([
                ("source".to_owned(), expected_source.to_owned()),
                ("message".to_owned(), detail.to_owned()),
            ]),
            "should log exactly the supplied source and fixed detail"
        );

        let response = problem.into_response();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(
            response.headers()[header::CONTENT_TYPE],
            "application/problem+json"
        );
        let bytes = futures::executor::block_on(to_bytes(response.into_body(), usize::MAX))
            .expect("should read the problem body");
        let body: serde_json::Value =
            serde_json::from_slice(&bytes).expect("should parse the problem body");
        assert_eq!(
            body,
            serde_json::json!({
                "type": "/problems/atlas/internal",
                "title": "Internal Server Error",
                "status": 500,
                "detail": if cfg!(debug_assertions) { detail } else { "internal server error" },
            })
        );
    }

    #[test]
    fn type_root_relative_uri() {
        let problem = Problem::new(
            StatusCode::NOT_FOUND,
            ProblemType::UnknownGeneration,
            "re-bootstrap via /v1/atlas/current",
        );
        let document = serde_json::to_value(&problem).expect("problem documents serialize");

        assert_eq!(document["type"], "/problems/atlas/unknown-generation");
        assert_eq!(document["status"], 404);
    }

    #[test]
    fn internal_source_redacted() {
        assert_internal_diagnostic(
            || {
                Problem::internal(
                    "private-store-message: private-property-value",
                    "the detail hydration failed",
                )
            },
            "private-store-message: private-property-value",
            "the detail hydration failed",
        );
    }
}

/// The `type` member of one problem document: Surface v1's stable root-relative URIs.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, schemars::JsonSchema)]
pub(super) enum ProblemType {
    /// A producer bug surfacing as a 500: the assembly panicked or its worker vanished.
    #[serde(rename = "/problems/atlas/internal")]
    InternalError,
    /// The route names a generation this process does not serve.
    #[serde(rename = "/problems/atlas/unknown-generation")]
    UnknownGeneration,
    /// The route names a variant outside the manifest's list.
    #[serde(rename = "/problems/atlas/unknown-variant")]
    UnknownVariant,
    /// A tile coordinate outside the zoom range or off its grid.
    #[serde(rename = "/problems/atlas/invalid-coordinate")]
    InvalidCoordinate,
    /// A generation path segment that is not a sha256 generation id.
    #[serde(rename = "/problems/atlas/invalid-generation")]
    InvalidGeneration,
    /// An edges body listing more tiles than the manifest's cap.
    #[serde(rename = "/problems/atlas/too-many-tiles")]
    TooManyTiles,
    /// A tile body carrying more `coloredTypeIds` than the manifest's cap.
    #[serde(rename = "/problems/atlas/too-many-types")]
    TooManyTypes,
    /// A translate body listing more entity ids than the manifest's cap.
    #[serde(rename = "/problems/atlas/too-many-entity-ids")]
    TooManyEntityIds,
    /// A locate source id that does not name a visible node.
    ///
    /// Nonexistent, denied, and unparsable answer identically (missing = denied).
    #[serde(rename = "/problems/atlas/unknown-entity")]
    UnknownEntity,
    /// A locate body that does not name exactly one source: `entityId` XOR `row`.
    #[serde(rename = "/problems/atlas/invalid-source")]
    InvalidSource,
    /// A required request body that did not arrive.
    #[serde(rename = "/problems/atlas/missing-body")]
    MissingBody,
    /// A request body that is not the operation's JSON, whether wrong content type, syntax error,
    /// shape mismatch, or oversize.
    #[serde(rename = "/problems/atlas/invalid-body")]
    InvalidBody,
    /// A caller the authentication middleware could not resolve.
    ///
    /// The status and detail are the middleware's own client-safe reading of the failure.
    #[serde(rename = "/problems/atlas/unauthenticated")]
    Unauthenticated,
    /// A request whose authority token is absent, malformed, foreign, or stale.
    #[serde(rename = "/problems/atlas/unauthorized")]
    Unauthorized,
    /// Resolving the caller's scope failed. The process cannot say what they may see.
    #[serde(rename = "/problems/atlas/visibility-unavailable")]
    VisibilityUnavailable,
    /// The caller is over its request budget, and `Retry-After` states when it admits again.
    #[serde(rename = "/problems/atlas/too-many-requests")]
    TooManyRequests,
}

/// Serializes the problem's `status` member as its integer form.
#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "serde's serialize_with contract passes fields by reference"
)]
fn status_as_u16<S: serde::Serializer>(
    status: &StatusCode,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    serializer.serialize_u16(status.as_u16())
}

/// One RFC 9457 problem document.
#[derive(Debug, serde::Serialize, schemars::JsonSchema)]
pub(crate) struct Problem<'content> {
    r#type: ProblemType,
    title: Cow<'content, str>,
    #[serde(serialize_with = "status_as_u16")]
    #[schemars(with = "u16")]
    status: StatusCode,
    detail: Cow<'content, str>,
}

impl<'content> Problem<'content> {
    pub(super) fn new(
        status: StatusCode,
        r#type: ProblemType,
        detail: impl Into<Cow<'content, str>>,
    ) -> Self {
        Self {
            r#type,
            title: Cow::Borrowed(status.canonical_reason().unwrap_or("error")),
            status,
            detail: detail.into(),
        }
    }

    /// Records `source` at error level and returns a 500 problem.
    ///
    /// With debug assertions enabled, responses use `detail`, which must contain only client-safe
    /// text. Otherwise they use `internal server error`. Neither form copies `source` into the
    /// document.
    pub(super) fn internal(
        source: impl core::fmt::Display,
        detail: impl Into<Cow<'content, str>>,
    ) -> Self {
        let detail = detail.into();
        tracing::error!(source = %source, "{detail}");
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            ProblemType::InternalError,
            if cfg!(debug_assertions) {
                detail
            } else {
                Cow::Borrowed("internal server error")
            },
        )
    }
}

/// The uniform refusal for a source that does not name a visible node.
///
/// Nonexistent, inaccessible, unparsable, and out-of-range values are indistinguishable by design:
/// missing equals denied, and an id that cannot name an entity is an entity that does not exist.
pub(super) fn unknown_entity() -> Problem<'static> {
    Problem::new(
        StatusCode::NOT_FOUND,
        ProblemType::UnknownEntity,
        "the source does not name a visible node",
    )
}

impl From<ObserveError> for Problem<'static> {
    fn from(error: ObserveError) -> Self {
        match error {
            ObserveError::Unavailable(generation) => Self::new(
                StatusCode::NOT_FOUND,
                ProblemType::UnknownGeneration,
                format!(
                    "generation {generation} is not served; re-read /v1/atlas/current and retry"
                ),
            ),
            ObserveError::Empty | ObserveError::Closed => Self::new(
                StatusCode::SERVICE_UNAVAILABLE,
                ProblemType::VisibilityUnavailable,
                "no generation is ready to serve requests",
            ),
        }
    }
}

impl From<Report<EdgesDocumentError>> for Problem<'static> {
    fn from(error: Report<EdgesDocumentError>) -> Self {
        match error.current_context() {
            EdgesDocumentError::Tiles { .. } => Self::new(
                StatusCode::BAD_REQUEST,
                ProblemType::TooManyTiles,
                error.to_string(),
            ),
            EdgesDocumentError::Zoom { .. } | EdgesDocumentError::Coordinate { .. } => Self::new(
                StatusCode::BAD_REQUEST,
                ProblemType::InvalidCoordinate,
                error.to_string(),
            ),
            // a delivered edge requires a display payload, independently of the request's fields.
            EdgesDocumentError::Display => {
                tracing::error!(?error, "unable to read a delivered edge's captured data");
                Self::internal(
                    error,
                    "the edges assembly could not read a delivered edge's captured data",
                )
            }
            // hydration failures describe store availability or data, independently of request
            // validity.
            EdgesDocumentError::Hydrate(_) => {
                tracing::error!(?error, "unable to hydrate the edges document");
                Self::internal(error, "the detail hydration failed")
            }
        }
    }
}

impl From<Report<LocateDocumentError>> for Problem<'static> {
    fn from(error: Report<LocateDocumentError>) -> Self {
        match error.current_context() {
            LocateDocumentError::Types { .. } => Self::new(
                StatusCode::BAD_REQUEST,
                ProblemType::TooManyTypes,
                error.to_string(),
            ),
            LocateDocumentError::UnknownEntity => unknown_entity(),
            // a delivered row requires captured data, independently of the request's fields.
            LocateDocumentError::Node { .. }
            | LocateDocumentError::NodeDisplay { .. }
            | LocateDocumentError::LinkDisplay { .. } => {
                tracing::error!(?error, "unable to read delivered row's captured data");
                Self::internal(
                    error,
                    "the locate assembly could not read a delivered row's captured data",
                )
            }
            // hydration failures describe store availability or data, independently of request
            // validity.
            LocateDocumentError::Hydrate(_) => {
                tracing::error!(?error, "unable to hydrate locate document");
                Self::internal(error, "the detail hydration failed")
            }
        }
    }
}

/// Carries an authentication failure as this crate's problem document.
///
/// The status and detail are [`AuthenticationError`]'s own client-safe readings. This crate
/// never restates the middleware's status map.
impl From<AuthenticationError> for Problem<'static> {
    fn from(error: AuthenticationError) -> Self {
        Self::new(
            error.status_code(),
            ProblemType::Unauthenticated,
            error.kind().client_message(),
        )
    }
}

impl From<&AuthenticationError> for Problem<'static> {
    fn from(error: &AuthenticationError) -> Self {
        Self::new(
            error.status_code(),
            ProblemType::Unauthenticated,
            error.kind().client_message(),
        )
    }
}

impl IntoResponse for Problem<'_> {
    fn into_response(self) -> Response {
        (
            self.status,
            [(header::CONTENT_TYPE, "application/problem+json")],
            Json(self),
        )
            .into_response()
    }
}

impl OperationOutput for Problem<'_> {
    type Inner = Self;

    fn operation_response(
        ctx: &mut GenContext,
        _operation: &mut openapi::Operation,
    ) -> Option<openapi::Response> {
        let json_schema = ctx.schema.subschema_for::<Problem<'static>>();
        let mut response = openapi::Response {
            description: "an RFC 9457 problem document".into(),
            ..Default::default()
        };
        response.content.insert(
            "application/problem+json".into(),
            openapi::MediaType {
                schema: Some(openapi::SchemaObject {
                    json_schema,
                    example: None,
                    external_docs: None,
                }),
                ..Default::default()
            },
        );

        Some(response)
    }

    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut openapi::Operation,
    ) -> Vec<(Option<openapi::StatusCode>, openapi::Response)> {
        // One default response suffices because a problem carries its own status.
        let response = Self::operation_response(ctx, operation)
            .unwrap_or_else(|| unreachable!("`operation_response` answers every operation"));

        vec![(None, response)]
    }
}

pub(crate) struct ProblemResponse<'content> {
    problem: Problem<'content>,
    retry_after: Option<NonZero<u64>>,
}

impl<'content, T> From<T> for ProblemResponse<'content>
where
    T: Into<Problem<'content>>,
{
    fn from(problem: T) -> Self {
        Self {
            problem: problem.into(),
            retry_after: None,
        }
    }
}

impl From<TooManyRequests> for ProblemResponse<'static> {
    fn from(TooManyRequests { retry_after }: TooManyRequests) -> Self {
        Self {
            problem: Problem::new(
                StatusCode::TOO_MANY_REQUESTS,
                ProblemType::TooManyRequests,
                "rate limit exceeded",
            ),
            retry_after: Some(retry_after),
        }
    }
}

impl From<RateLimitRejection> for ProblemResponse<'static> {
    fn from(error: RateLimitRejection) -> Self {
        match error {
            RateLimitRejection::TooManyRequests(too_many_requests) => too_many_requests.into(),
            RateLimitRejection::InternalError => Problem::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                ProblemType::InternalError,
                "internal server error",
            )
            .into(),
        }
    }
}

impl From<AuthenticationRejection> for ProblemResponse<'static> {
    fn from(error: AuthenticationRejection) -> Self {
        match error {
            AuthenticationRejection::Authentication {
                ref report,
                metrics: _,
                recorded: _,
            } => Problem::from(report.current_context()).into(),
            AuthenticationRejection::Misconfigured => Problem::internal(
                "`Actor` extracted on a route without the authentication middleware",
                "the caller's authentication was never resolved",
            )
            .into(),
        }
    }
}

impl IntoResponse for ProblemResponse<'_> {
    fn into_response(self) -> Response {
        let mut response = self.problem.into_response();
        if let Some(retry_after) = self.retry_after {
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, retry_after.get().into());
        }
        response
    }
}

#[derive(Debug, Copy, Clone)]
pub(crate) struct IntoProblemLayer;

impl<S> tower::Layer<S> for IntoProblemLayer {
    type Service = IntoProblemService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        IntoProblemService { inner }
    }
}

#[derive(Debug, Copy, Clone)]
pub(crate) struct IntoProblemService<S> {
    inner: S,
}

impl<S, B, T, U> tower::Service<http::Request<B>> for IntoProblemService<S>
where
    S: tower::Service<http::Request<B>, Response = Result<T, U>>,
    U: Into<ProblemResponse<'static>>,
{
    type Error = S::Error;
    type Response = Result<T, ProblemResponse<'static>>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut task::Context<'_>) -> task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: http::Request<B>) -> Self::Future {
        self.inner
            .call(req)
            .map_ok(|result| result.map_err(Into::into))
    }
}

/// Refuses a request that presents no acceptable authority token.
///
/// One uniform answer covers every cause (an absent header, a malformed encoding, a failed tag,
/// a stale issue time, or an actor mismatch). A caller learns only that the server refused its
/// presentation and nothing about why.
pub(super) fn unauthorized() -> Problem<'static> {
    Problem::new(
        StatusCode::UNAUTHORIZED,
        ProblemType::Unauthorized,
        "the request presents no acceptable authority token; re-fetch the manifest presenting the \
         held token to renew, or without one to bootstrap afresh",
    )
}

/// Refuses a request whose scope resolution failed.
///
/// The caller's permissions are unknown. The answer is a 503. This process cannot say what the
/// caller may see, and a later attempt may succeed. The server logs the cause, which can include
/// store internals. The client reads that the scope is unavailable.
pub(super) fn visibility_unavailable(error: &(impl core::fmt::Debug + ?Sized)) -> Problem<'static> {
    tracing::error!(?error, "resolving the caller's visibility failed");

    Problem::new(
        StatusCode::SERVICE_UNAVAILABLE,
        ProblemType::VisibilityUnavailable,
        "the caller's scope could not be resolved",
    )
}

/// Rejects a route naming a variant this generation does not serve.
///
/// # Errors
///
/// Returns a 404 [`Problem`] with [`ProblemType::UnknownVariant`] when `variant` is absent from
/// [`VARIANTS`].
pub(super) fn reject_variant(variant: &str) -> Result<(), Problem<'static>> {
    if VARIANTS.contains(&variant) {
        return Ok(());
    }

    Err(Problem::new(
        StatusCode::NOT_FOUND,
        ProblemType::UnknownVariant,
        format!("variant {variant} is not served. The manifest lists {VARIANTS:?}"),
    ))
}

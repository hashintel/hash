//! Request authentication for axum routers.
//!
//! A service layers [`authentication_middleware`] over its routes with the provider chain it
//! builds, and handlers receive the acting actor through the [`AuthenticatedActorId`] extractor —
//! taking it as an `Option` is how a handler serves anonymous callers. A request with an invalid
//! credential never reaches a handler, and a request without credentials resolves through the
//! chain's [`Caller`] type: a chain over [`ActorId`] rejects it, a chain over `Option<ActorId>`
//! verifies it as anonymous.
//!
//! Bootstrap routes — the paths the service names through the middleware's predicate — require
//! the service secret regardless of the chain and pass even when no actor resolves. Routes that
//! take no
//! actor at all are gated by [`service_secret_middleware`] instead.

pub mod provider;
pub mod request;
pub mod service_secret;

use alloc::sync::Arc;

use axum::{
    extract::{FromRequestParts, OptionalFromRequestParts, Request},
    http::request::Parts,
    middleware::Next,
    response::Response,
};
use error_stack::Report;
use opentelemetry::{
    KeyValue,
    metrics::{Counter, Meter},
};
use opentelemetry_semantic_conventions::attribute::HTTP_RESPONSE_STATUS_CODE;
use type_system::principal::actor::ActorId;

use self::{
    provider::{AuthenticationProvider, Caller},
    request::{AuthenticationError, log_rejection, resolve_request_actor},
    service_secret::{presents_service_secret, service_credential},
};
use crate::response::error_response;

/// Instruments recording authentication rejections.
///
/// A route wired without the middleware answers with an internal error that is not counted here.
pub struct AuthenticationMetrics {
    rejections: Counter<u64>,
}

impl AuthenticationMetrics {
    #[must_use]
    pub fn new(meter: &Meter) -> Self {
        Self {
            rejections: meter
                .u64_counter("hash.authentication.rejections")
                .with_description("Requests rejected for their credentials")
                .with_unit("{request}")
                .build(),
        }
    }

    fn record_rejection(&self, error: &AuthenticationError) {
        self.rejections.add(
            1,
            &[
                KeyValue::new(
                    HTTP_RESPONSE_STATUS_CODE,
                    i64::from(error.status_code().as_u16()),
                ),
                KeyValue::new("fault_domain", error.fault_domain().as_str()),
            ],
        );
    }
}

/// The resolved authentication of a request, stored as a request extension, alongside the
/// metrics the rejections it leads to are recorded on.
///
/// A rejection carries the full report. The [`Arc`] is what lets it live in an extension:
/// [`Report`] is not [`Clone`], and an extension value has to be.
#[derive(Clone)]
pub(crate) struct ResolvedAuthentication {
    outcome: Result<Option<ActorId>, Arc<Report<AuthenticationError>>>,
    metrics: Arc<AuthenticationMetrics>,
}

impl ResolvedAuthentication {
    #[cfg(test)]
    pub(crate) const fn new(
        outcome: Result<Option<ActorId>, Arc<Report<AuthenticationError>>>,
        metrics: Arc<AuthenticationMetrics>,
    ) -> Self {
        Self { outcome, metrics }
    }

    pub(crate) const fn outcome(
        &self,
    ) -> &Result<Option<ActorId>, Arc<Report<AuthenticationError>>> {
        &self.outcome
    }
}

/// Converts an authentication failure into the response returned to the client, counting it.
///
/// The response carries the client-safe message. Identifiers and the report's attachments stay in
/// the server-side logs, where [`log_rejection`] has already reported them.
fn rejection(metrics: &AuthenticationMetrics, report: &Report<AuthenticationError>) -> Response {
    let error = report.current_context();
    metrics.record_rejection(error);
    error_response(error.status_code(), error.client_message().to_owned())
}

/// Reports a rejection and converts it into the response returned to the client.
fn logged_rejection(metrics: &AuthenticationMetrics, error: AuthenticationError) -> Response {
    let report = Report::new(error);
    log_rejection(&report);
    rejection(metrics, &report)
}

/// Returns the rejection for a request that does not carry the service secret, [`None`] when it
/// does.
fn service_secret_rejection(
    headers: &http::HeaderMap,
    service_secret: &str,
    metrics: &AuthenticationMetrics,
) -> Option<Response> {
    if presents_service_secret(headers, service_secret) {
        return None;
    }

    // A presented credential that does not match says the sender believed it had one, which the
    // fault domain separates from a request carrying none at all.
    Some(logged_rejection(
        metrics,
        if service_credential(headers).is_some() {
            AuthenticationError::InvalidServiceSecret
        } else {
            AuthenticationError::MissingServiceSecret
        },
    ))
}

/// Rejects requests that do not carry the service secret.
///
/// No credential is resolved, so no actor reaches the handler.
///
/// # Example
///
/// ```
/// # use std::sync::Arc;
/// # use axum::{Router, middleware, routing::get};
/// use hash_middleware::authentication::{AuthenticationMetrics, service_secret_middleware};
///
/// # let meter = opentelemetry::global::meter("doc");
/// let service_secret: Arc<str> = Arc::from("service-secret");
/// let metrics = Arc::new(AuthenticationMetrics::new(&meter));
/// let router: Router = Router::new()
///     .route("/snapshot", get(async || "gated"))
///     .route_layer(middleware::from_fn(move |request, next| {
///         service_secret_middleware(
///             Arc::clone(&service_secret),
///             Arc::clone(&metrics),
///             request,
///             next,
///         )
///     }));
/// ```
pub async fn service_secret_middleware(
    service_secret: Arc<str>,
    metrics: Arc<AuthenticationMetrics>,
    request: Request,
    next: Next,
) -> Response {
    if let Some(rejection) = service_secret_rejection(request.headers(), &service_secret, &metrics)
    {
        return rejection;
    }

    next.run(request).await
}

/// Records the authenticated actor on the request span and stores the outcome as a request
/// extension.
fn store_outcome(
    request: &mut Request,
    outcome: Result<Option<ActorId>, Arc<Report<AuthenticationError>>>,
    metrics: Arc<AuthenticationMetrics>,
) {
    if let Ok(Some(actor_id)) = &outcome {
        tracing::Span::current().record("actor_entity_uuid", tracing::field::display(actor_id));
    }
    request
        .extensions_mut()
        .insert(ResolvedAuthentication { outcome, metrics });
}

/// Resolves the request's credentials against `provider` and rejects the request when they are
/// invalid.
///
/// Layer it over every route whose handlers take [`AuthenticatedActorId`] — the extractor serves
/// only routes this middleware covers. A request without credentials resolves through the chain's
/// [`Caller`] type: a chain over [`ActorId`] rejects it, a chain over `Option<ActorId>` verifies
/// it as anonymous, and whether an anonymous caller may proceed is the handler's to state,
/// through which extractor it takes.
///
/// Bootstrap routes are service operations: `bootstrap_route` names their paths, they require the
/// service secret regardless of any actor credential, and they pass even when no actor resolves.
/// A service
/// without such routes passes `|_| false`.
///
/// Routes that take no actor are gated by [`service_secret_middleware`] instead.
///
/// # Example
///
/// ```
/// # use core::ops::ControlFlow;
/// # use std::sync::Arc;
/// # use axum::{Router, middleware, routing::get};
/// # use error_stack::Report;
/// # use hash_middleware::authentication::{
/// #     provider::{AuthenticationProvider, Caller},
/// #     request::AuthenticationError,
/// # };
/// # use http::HeaderMap;
/// use hash_middleware::authentication::{
///     AuthenticatedActorId, AuthenticationMetrics, authentication_middleware,
/// };
/// use type_system::principal::actor::ActorId;
///
/// # struct Verifier;
/// # impl<C: Caller> AuthenticationProvider<C> for Verifier {
/// #     async fn authenticate(
/// #         &self,
/// #         _headers: &HeaderMap,
/// #     ) -> ControlFlow<Result<C, Report<AuthenticationError>>> {
/// #         ControlFlow::Continue(())
/// #     }
/// # }
/// async fn whoami(AuthenticatedActorId(actor): AuthenticatedActorId) -> String {
///     actor.to_string()
/// }
///
/// # let meter = opentelemetry::global::meter("doc");
/// let provider = Arc::new(Verifier);
/// let service_secret: Arc<str> = Arc::from("service-secret");
/// let metrics = Arc::new(AuthenticationMetrics::new(&meter));
/// let router: Router =
///     Router::new()
///         .route("/whoami", get(whoami))
///         .route_layer(middleware::from_fn(move |request, next| {
///             authentication_middleware::<_, ActorId>(
///                 Arc::clone(&provider),
///                 Arc::clone(&service_secret),
///                 Arc::clone(&metrics),
///                 |_path| false,
///                 request,
///                 next,
///             )
///         }));
/// ```
pub async fn authentication_middleware<P, C>(
    provider: Arc<P>,
    service_secret: Arc<str>,
    metrics: Arc<AuthenticationMetrics>,
    bootstrap_route: fn(&str) -> bool,
    mut request: Request,
    next: Next,
) -> Response
where
    P: AuthenticationProvider<C>,
    C: Caller,
{
    let bootstrap = bootstrap_route(request.uri().path());
    if bootstrap
        && let Some(rejection) =
            service_secret_rejection(request.headers(), &service_secret, &metrics)
    {
        return rejection;
    }

    let outcome = resolve_request_actor(&*provider, request.headers())
        .await
        .map(Caller::into_actor)
        .map_err(Arc::new);

    match &outcome {
        Err(report)
            if bootstrap
                && matches!(
                    report.current_context(),
                    AuthenticationError::MissingDelegatedActor
                ) => {}
        Err(report) => return rejection(&metrics, report),
        Ok(_) => {}
    }

    store_outcome(&mut request, outcome, metrics);
    next.run(request).await
}

/// Axum extractor providing the acting principal resolved by [`authentication_middleware`].
///
/// Taking this extractor is how a handler states that it requires an actor: an anonymous caller
/// is rejected here rather than reaching the handler. Handlers that serve callers without an
/// actor take `Option<AuthenticatedActorId>` instead.
///
/// Rejects the request on routes without the middleware.
pub struct AuthenticatedActorId(pub ActorId);

impl<S: Sync> FromRequestParts<S> for AuthenticatedActorId {
    type Rejection = Response;

    fn from_request_parts(
        parts: &mut Parts,
        _state: &S,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        core::future::ready(match parts.extensions.get::<ResolvedAuthentication>() {
            Some(ResolvedAuthentication {
                outcome: Ok(Some(actor_id)),
                ..
            }) => Ok(Self(*actor_id)),
            // Resolution succeeded and found no actor; the rejection originates here, in the
            // handler's requirement, so this is the site that reports it.
            Some(ResolvedAuthentication {
                outcome: Ok(None),
                metrics,
            }) => Err(logged_rejection(
                metrics,
                AuthenticationError::MissingCredentials,
            )),
            Some(ResolvedAuthentication {
                outcome: Err(report),
                metrics,
            }) => Err(rejection(metrics, report)),
            None => {
                tracing::error!(
                    "`AuthenticatedActorId` extracted on a route without authentication middleware"
                );
                Err(error_response(
                    http::StatusCode::INTERNAL_SERVER_ERROR,
                    "internal server error".to_owned(),
                ))
            }
        })
    }
}

/// `Option<AuthenticatedActorId>` yields [`None`] for an anonymous caller.
///
/// Writing the extractor as an [`Option`] is how a handler states that it serves callers without an
/// actor. An invalid credential is still rejected — [`None`] means the chain resolved the request
/// as anonymous, never that a credential failed.
impl<S: Sync> OptionalFromRequestParts<S> for AuthenticatedActorId {
    type Rejection = Response;

    fn from_request_parts(
        parts: &mut Parts,
        _state: &S,
    ) -> impl Future<Output = Result<Option<Self>, Self::Rejection>> + Send {
        core::future::ready(match parts.extensions.get::<ResolvedAuthentication>() {
            Some(ResolvedAuthentication {
                outcome: Ok(caller),
                ..
            }) => Ok(caller.map(Self)),
            Some(ResolvedAuthentication {
                outcome: Err(report),
                metrics,
            }) => Err(rejection(metrics, report)),
            None => {
                tracing::error!(
                    "`AuthenticatedActorId` extracted on a route without authentication middleware"
                );
                Err(error_response(
                    http::StatusCode::INTERNAL_SERVER_ERROR,
                    "internal server error".to_owned(),
                ))
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;

    use axum::{Router, body::Body, middleware, routing::get};
    use http::{Request, StatusCode};
    use tower::ServiceExt as _;
    use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};
    use uuid::Uuid;

    use super::{AuthenticatedActorId, AuthenticationMetrics, authentication_middleware};
    use crate::{
        authentication::provider::StaticAuthenticationProvider,
        test_metrics::{RecordedMetrics, noop_meter},
    };

    async fn protected(AuthenticatedActorId(actor_id): AuthenticatedActorId) -> String {
        actor_id.to_string()
    }

    async fn anonymous_allowed(actor_id: Option<AuthenticatedActorId>) -> String {
        actor_id.map_or_else(
            || "anonymous".to_owned(),
            |AuthenticatedActorId(actor_id)| actor_id.to_string(),
        )
    }

    async fn bootstrap() -> &'static str {
        "bootstrap"
    }

    const SERVICE_SECRET: &str = "hash-svc-test-secret";

    /// The bootstrap predicate the test routers pass, naming the one bootstrap route they serve.
    fn is_bootstrap_route(path: &str) -> bool {
        path == "/bootstrap"
    }

    fn routes() -> Router {
        Router::new()
            .route("/protected", get(protected))
            .route("/anonymous-allowed", get(anonymous_allowed))
            .route("/bootstrap", get(bootstrap))
    }

    fn router(provider: StaticAuthenticationProvider) -> Router {
        router_recording(
            provider,
            Arc::new(AuthenticationMetrics::new(&noop_meter())),
        )
    }

    fn router_recording(
        provider: StaticAuthenticationProvider,
        metrics: Arc<AuthenticationMetrics>,
    ) -> Router {
        let provider = Arc::new(provider);
        let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
        routes().layer(middleware::from_fn(move |request, next| {
            let provider = Arc::clone(&provider);
            let service_secret = Arc::clone(&service_secret);
            let metrics = Arc::clone(&metrics);
            authentication_middleware::<_, Option<ActorId>>(
                provider,
                service_secret,
                metrics,
                is_bootstrap_route,
                request,
                next,
            )
        }))
    }

    fn request(uri: &str) -> Request<Body> {
        Request::builder()
            .uri(uri)
            .body(Body::empty())
            .expect("the request should build")
    }

    fn request_with_actor_header(uri: &str, value: &str) -> Request<Body> {
        Request::builder()
            .uri(uri)
            .header("X-Authenticated-User-Actor-Id", value)
            .body(Body::empty())
            .expect("the request should build")
    }

    fn request_with_secret(uri: &str, secret: &str) -> Request<Body> {
        Request::builder()
            .uri(uri)
            .header("Authorization", format!("HASH-Service {secret}"))
            .body(Body::empty())
            .expect("the request should build")
    }

    #[tokio::test]
    async fn anonymous_caller_does_not_reach_a_handler_requiring_an_actor() {
        let response = router(StaticAuthenticationProvider::NotRecognized)
            .oneshot(request("/protected"))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn anonymous_caller_reaches_a_handler_allowing_no_actor() {
        let response = router(StaticAuthenticationProvider::NotRecognized)
            .oneshot(request("/anonymous-allowed"))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .expect("the response body should be readable");
        assert_eq!(body, b"anonymous".as_slice());
    }

    #[tokio::test]
    async fn verified_actor_reaches_an_anonymous_handler_as_itself() {
        let actor_id = ActorEntityUuid::new(Uuid::new_v4());
        let response = router(StaticAuthenticationProvider::Verified(ActorId::User(
            UserId::new(actor_id),
        )))
        .oneshot(request("/anonymous-allowed"))
        .await
        .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .expect("the response body should be readable");
        assert_eq!(body, actor_id.to_string().as_bytes());
    }

    #[tokio::test]
    async fn middleware_rejects_requests_without_credentials() {
        let response = router(StaticAuthenticationProvider::NotRecognized)
            .oneshot(request("/protected"))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn middleware_passes_verified_actors_to_handlers() {
        let actor_id = ActorEntityUuid::new(Uuid::new_v4());
        let response = router(StaticAuthenticationProvider::Verified(ActorId::User(
            UserId::new(actor_id),
        )))
        .oneshot(request("/protected"))
        .await
        .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .expect("the response body should be readable");
        assert_eq!(body, actor_id.to_string().as_bytes());
    }

    #[tokio::test]
    async fn middleware_rejects_rejected_credentials_despite_actor_header() {
        let response = router(StaticAuthenticationProvider::Rejected)
            .oneshot(request_with_actor_header(
                "/protected",
                &Uuid::new_v4().to_string(),
            ))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn middleware_admits_bootstrap_routes_with_service_secret() {
        let response = router(StaticAuthenticationProvider::NotRecognized)
            .oneshot(request_with_secret("/bootstrap", SERVICE_SECRET))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn middleware_rejects_bootstrap_routes_without_service_secret() {
        let response = router(StaticAuthenticationProvider::NotRecognized)
            .oneshot(request("/bootstrap"))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn middleware_rejects_bootstrap_routes_with_wrong_service_secret() {
        let response = router(StaticAuthenticationProvider::NotRecognized)
            .oneshot(request_with_secret("/bootstrap", "hash-svc-wrong"))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn middleware_rejects_authenticated_bootstrap_requests_without_secret() {
        let actor_id = ActorEntityUuid::new(Uuid::new_v4());
        let response = router(StaticAuthenticationProvider::Verified(ActorId::User(
            UserId::new(actor_id),
        )))
        .oneshot(request("/bootstrap"))
        .await
        .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn middleware_admits_authenticated_bootstrap_requests_with_secret() {
        let actor_id = ActorEntityUuid::new(Uuid::new_v4());
        let response = router(StaticAuthenticationProvider::Verified(ActorId::User(
            UserId::new(actor_id),
        )))
        .oneshot(request_with_secret("/bootstrap", SERVICE_SECRET))
        .await
        .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn middleware_rejects_unverifiable_credentials_on_bootstrap_routes() {
        let response = router(StaticAuthenticationProvider::Unreachable)
            .oneshot(request_with_secret("/bootstrap", SERVICE_SECRET))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    /// A router requiring an actor.
    fn actor_required_router(provider: StaticAuthenticationProvider) -> Router {
        let provider = Arc::new(provider);
        let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
        let metrics = Arc::new(AuthenticationMetrics::new(&noop_meter()));
        routes().layer(middleware::from_fn(move |request, next| {
            let provider = Arc::clone(&provider);
            let service_secret = Arc::clone(&service_secret);
            let metrics = Arc::clone(&metrics);
            authentication_middleware::<_, ActorId>(
                provider,
                service_secret,
                metrics,
                is_bootstrap_route,
                request,
                next,
            )
        }))
    }

    #[tokio::test]
    async fn verified_rejection_degrades_to_anonymous() {
        let response = router(StaticAuthenticationProvider::Rejected)
            .oneshot(request("/anonymous-allowed"))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .expect("the response body should be readable");
        assert_eq!(
            body,
            b"anonymous".as_slice(),
            "the expired credential should serve the request anonymously, not as an actor"
        );
    }

    #[tokio::test]
    async fn failure_to_verify_does_not_degrade_to_anonymous() {
        let response = router(StaticAuthenticationProvider::Unreachable)
            .oneshot(request("/anonymous-allowed"))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn actor_requiring_chain_rejects_uncredentialed_requests_before_handlers() {
        let response = actor_required_router(StaticAuthenticationProvider::NotRecognized)
            .oneshot(request("/anonymous-allowed"))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn actor_requiring_chain_passes_verified_actors_to_handlers() {
        let actor_id = ActorEntityUuid::new(Uuid::new_v4());
        let response = actor_required_router(StaticAuthenticationProvider::Verified(
            ActorId::User(UserId::new(actor_id)),
        ))
        .oneshot(request("/protected"))
        .await
        .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
    }

    /// A router gated by the service secret alone, as bulk-destructive admin routes are.
    fn secret_gated_router() -> Router {
        let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
        let metrics = Arc::new(AuthenticationMetrics::new(&noop_meter()));
        routes().layer(middleware::from_fn(move |request, next| {
            let service_secret = Arc::clone(&service_secret);
            let metrics = Arc::clone(&metrics);
            super::service_secret_middleware(service_secret, metrics, request, next)
        }))
    }

    #[tokio::test]
    async fn secret_gate_rejects_requests_without_the_secret() {
        let response = secret_gated_router()
            .oneshot(request("/protected"))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn secret_gate_reports_a_wrong_secret_as_invalid() {
        let response = secret_gated_router()
            .oneshot(request_with_secret("/protected", "hash-svc-wrong"))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .expect("the response body should be readable");
        let body = String::from_utf8_lossy(&body);
        assert!(
            body.contains("invalid"),
            "a wrong secret should be reported as invalid, not missing, got {body}"
        );
    }

    #[tokio::test]
    async fn secret_gate_passes_requests_with_the_secret_without_an_actor() {
        // The gate stores no authentication result, so the routes behind it take no actor
        // extractor — mirrored by the `/bootstrap` test handler.
        let response = secret_gated_router()
            .oneshot(request_with_secret("/bootstrap", SERVICE_SECRET))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn middleware_rejects_bare_actor_id_headers() {
        let response = router(StaticAuthenticationProvider::NotRecognized)
            .oneshot(request_with_actor_header(
                "/protected",
                &Uuid::new_v4().to_string(),
            ))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    /// The rejection the extractor produces counts too — on an anonymous-serving chain, an
    /// uncredentialed request on an actor-requiring handler is rejected nowhere else.
    #[tokio::test]
    async fn extractor_rejections_count_with_status_and_fault_domain() {
        let recorded = RecordedMetrics::new();
        let router = router_recording(
            StaticAuthenticationProvider::NotRecognized,
            Arc::new(AuthenticationMetrics::new(&recorded.meter())),
        );

        let response = router
            .oneshot(request("/protected"))
            .await
            .expect("the router should respond");
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        assert_eq!(
            recorded.counter(
                "hash.authentication.rejections",
                &[
                    ("http.response.status_code", "401"),
                    ("fault_domain", "caller"),
                ],
            ),
            1,
            "the extractor's rejection should count with its status code and fault domain"
        );
    }

    #[tokio::test]
    async fn middleware_rejections_count_with_status_and_fault_domain() {
        let recorded = RecordedMetrics::new();
        let router = router_recording(
            StaticAuthenticationProvider::Unreachable,
            Arc::new(AuthenticationMetrics::new(&recorded.meter())),
        );

        let response = router
            .oneshot(request("/anonymous-allowed"))
            .await
            .expect("the router should respond");
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);

        assert_eq!(
            recorded.counter(
                "hash.authentication.rejections",
                &[
                    ("http.response.status_code", "503"),
                    ("fault_domain", "service"),
                ],
            ),
            1,
            "the middleware's rejection should count with its status code and fault domain"
        );
    }

    /// Every error variant lands at its own status-code and fault-domain pair.
    ///
    /// Runs over [`every_error`], so a new variant stops compiling until it is added here, and
    /// pins the label strings dashboards query.
    ///
    /// [`every_error`]: crate::authentication::request::every_error
    #[test]
    fn every_rejection_counts_at_its_status_and_fault_domain() {
        use type_system::principal::actor::ActorEntityUuid;

        use crate::{authentication::request::every_error, test_metrics::RecordedMetrics};

        for error in every_error("identity-id", ActorEntityUuid::new(Uuid::new_v4())) {
            let recorded = RecordedMetrics::new();
            let metrics = AuthenticationMetrics::new(&recorded.meter());

            metrics.record_rejection(&error);

            assert_eq!(
                recorded.counter(
                    "hash.authentication.rejections",
                    &[
                        ("http.response.status_code", error.status_code().as_str(),),
                        ("fault_domain", error.fault_domain().as_str()),
                    ],
                ),
                1,
                "`{error}` should count at status {} in the {} domain",
                error.status_code(),
                error.fault_domain().as_str()
            );
        }
    }

    /// A served request records nothing — the rejection counter is not a request counter.
    #[tokio::test]
    async fn served_requests_count_no_rejection() {
        let recorded = RecordedMetrics::new();
        let router = router_recording(
            StaticAuthenticationProvider::NotRecognized,
            Arc::new(AuthenticationMetrics::new(&recorded.meter())),
        );

        let response = router
            .oneshot(request("/anonymous-allowed"))
            .await
            .expect("the router should respond");
        assert_eq!(response.status(), StatusCode::OK);

        assert_eq!(
            recorded.counter("hash.authentication.rejections", &[]),
            0,
            "an anonymously served request should not count as a rejection"
        );
    }

    #[tokio::test]
    async fn extractor_rejects_routes_without_middleware() {
        let router = Router::new().route("/protected", get(protected));

        let response = router
            .oneshot(request_with_actor_header(
                "/protected",
                &Uuid::new_v4().to_string(),
            ))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }
}

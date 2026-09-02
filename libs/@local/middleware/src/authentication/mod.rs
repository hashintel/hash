//! Request authentication for axum routers.
//!
//! A service layers [`AuthenticationLayer`] over its routes with the provider chain it builds,
//! and handlers receive the acting actor through the [`AuthenticatedActorId`] extractor — taking
//! it as an `Option` is how a handler serves anonymous callers. A request with an invalid
//! credential never reaches a handler, and a request without credentials resolves through the
//! chain's [`Caller`] type: a chain over [`ActorId`] rejects it, a chain over `Option<ActorId>`
//! verifies it as anonymous.
//!
//! Bootstrap routes, the paths the service names through the layer's predicate, require the
//! service secret regardless of the chain. With the secret presented they tolerate exactly one
//! failure: a verified service credential that names no delegated actor. Every other rejection
//! still fails the request. Routes that take no actor at all use [`ServiceSecretLayer`]
//! instead.

pub mod provider;
pub mod request;
pub mod service_secret;

use alloc::sync::Arc;
use core::{future, marker::PhantomData, task};

use axum::{
    extract::{FromRequestParts, OptionalFromRequestParts},
    http::request::Parts,
    response::{IntoResponse, Response},
};
use error_stack::Report;
use futures::{TryFutureExt as _, future::Either};
use opentelemetry::{
    KeyValue,
    metrics::{Counter, Meter},
};
use opentelemetry_semantic_conventions::attribute::HTTP_RESPONSE_STATUS_CODE;
use type_system::principal::actor::ActorId;

use self::{
    provider::{AuthenticationProvider, Caller},
    request::{AuthenticationError, AuthenticationErrorKind, resolve_request_actor},
    service_secret::{presents_service_secret, service_credential},
};
use crate::response::error_response;

/// How a request proceeded although its credential resolution failed.
#[derive(Copy, Clone)]
enum Degradation {
    /// A verified rejection resolved as anonymous on a chain serving anonymous callers.
    Anonymous,
    /// A bootstrap route admitted the service credential without its delegated actor.
    Bootstrap,
}

impl Degradation {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Anonymous => "anonymous",
            Self::Bootstrap => "bootstrap",
        }
    }
}

/// Instruments recording credential failures.
///
/// A route wired without the middleware answers with an internal error that is not counted here.
pub struct AuthenticationMetrics {
    rejections: Counter<u64>,
    degradations: Counter<u64>,
}

impl AuthenticationMetrics {
    /// Creates the instruments on `meter`.
    #[must_use]
    pub fn new(meter: &Meter) -> Self {
        Self {
            rejections: meter
                .u64_counter("hash.authentication.rejections")
                .with_description("Requests rejected for their credentials")
                .with_unit("{request}")
                .build(),
            degradations: meter
                .u64_counter("hash.authentication.degradations")
                .with_description("Requests served although their credential failed")
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

    fn record_degradation(&self, error: &AuthenticationError, degradation: Degradation) {
        self.degradations.add(
            1,
            &[
                KeyValue::new("mechanism", degradation.as_str()),
                KeyValue::new("fault_domain", error.fault_domain().as_str()),
            ],
        );
    }
}

/// The response a request that failed authentication is answered with.
///
/// A rejection records itself when it drops, whether or not a response was rendered from it,
/// so no holder logs or counts one. The log and the count are latched on the shared error, so
/// a rejection cloned or rebuilt over the same report still reaches the log and the meter once.
#[derive(Clone)]
pub enum AuthenticationRejection {
    /// The credentials did not resolve to a caller the route admits.
    Authentication {
        /// Why the credentials were rejected.
        report: Arc<Report<AuthenticationError>>,
        /// The instruments the rejection is counted on.
        metrics: Arc<AuthenticationMetrics>,
    },
    /// [`AuthenticatedActorId`] was extracted on a route without [`AuthenticationLayer`].
    ///
    /// Answered as an internal error: the fault is the router's wiring, never the request.
    Misconfigured,
}

impl IntoResponse for AuthenticationRejection {
    fn into_response(self) -> Response {
        match &self {
            Self::Authentication { report, .. } => {
                let error = report.current_context();
                error_response(error.status_code(), error.kind().client_message())
            }
            Self::Misconfigured => error_response(
                http::StatusCode::INTERNAL_SERVER_ERROR,
                "internal server error",
            ),
        }
    }
}

impl Drop for AuthenticationRejection {
    fn drop(&mut self) {
        match self {
            Self::Authentication { report, metrics } => {
                AuthenticationError::ensure_logged(report);
                AuthenticationError::ensure_rejection_recorded(report, metrics);
            }
            Self::Misconfigured => {
                tracing::error!(
                    "`AuthenticatedActorId` extracted on a route without authentication middleware"
                );
            }
        }
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

/// Returns the rejection for a request that does not carry the service secret, [`None`] when it
/// does.
fn service_secret_rejection(
    headers: &http::HeaderMap,
    service_secret: &str,
    metrics: &Arc<AuthenticationMetrics>,
) -> Option<AuthenticationRejection> {
    if presents_service_secret(headers, service_secret) {
        return None;
    }

    // A presented credential that does not match says the sender believed it had one, which the
    // fault domain separates from a request carrying none at all.
    let kind = if service_credential(headers).is_some() {
        AuthenticationErrorKind::InvalidServiceSecret
    } else {
        AuthenticationErrorKind::MissingServiceSecret
    };

    let report = Report::new(AuthenticationError::new(kind));
    Some(AuthenticationRejection::Authentication {
        report: Arc::new(report),
        metrics: Arc::clone(metrics),
    })
}
/// Rejects requests that do not carry the service secret.
///
/// No credential is resolved, so no actor reaches the handler.
///
/// # Example
///
/// ```
/// # use std::sync::Arc;
/// # use axum::{Router, routing::get};
/// use hash_middleware::authentication::{AuthenticationMetrics, ServiceSecretLayer};
///
/// # let meter = opentelemetry::global::meter("doc");
/// let router: Router = Router::new()
///     .route("/snapshot", get(async || "gated"))
///     .route_layer(ServiceSecretLayer {
///         service_secret: Arc::from("service-secret"),
///         metrics: Arc::new(AuthenticationMetrics::new(&meter)),
///     });
/// ```
#[derive(Clone)]
pub struct ServiceSecretLayer {
    /// The secret a request must present.
    pub service_secret: Arc<str>,
    /// The instruments rejections are counted on.
    pub metrics: Arc<AuthenticationMetrics>,
}

impl<S> tower::Layer<S> for ServiceSecretLayer {
    type Service = ServiceSecretService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        ServiceSecretService {
            service_secret: Arc::clone(&self.service_secret),
            metrics: Arc::clone(&self.metrics),
            inner,
        }
    }
}

/// The service [`ServiceSecretLayer`] wraps its inner service into.
#[derive(Clone)]
pub struct ServiceSecretService<S> {
    service_secret: Arc<str>,
    metrics: Arc<AuthenticationMetrics>,
    inner: S,
}

impl<B, S> tower::Service<axum::http::Request<B>> for ServiceSecretService<S>
where
    S: tower::Service<axum::http::Request<B>>,
{
    type Error = S::Error;
    type Response = Result<S::Response, AuthenticationRejection>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut task::Context<'_>) -> task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: axum::http::Request<B>) -> Self::Future {
        if let Some(rejection) =
            service_secret_rejection(req.headers(), &self.service_secret, &self.metrics)
        {
            Either::Right(future::ready(Ok(Err(rejection))))
        } else {
            Either::Left(self.inner.call(req).map_ok(Ok))
        }
    }
}

/// Records the authenticated actor on the request span and stores the outcome as a request
/// extension.
fn store_outcome<B>(
    request: &mut http::Request<B>,
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

/// Resolves the request's credentials against the provider chain and rejects the request when
/// they are invalid.
///
/// Layer it over every route whose handlers take [`AuthenticatedActorId`] — the extractor serves
/// only routes this layer covers. A request without credentials resolves through the chain's
/// [`Caller`] type: a chain over [`ActorId`] rejects it, a chain over `Option<ActorId>` verifies
/// it as anonymous, and whether an anonymous caller may proceed is the handler's to state,
/// through which extractor it takes.
///
/// Bootstrap routes are service operations: `bootstrap_route` names their paths and they require
/// the service secret regardless of any actor credential. With the secret presented, the one
/// rejection they tolerate is a verified service credential that names no delegated actor, and
/// every other failure still rejects the request. A service without such routes passes
/// `|_| false`.
///
/// Routes that take no actor are gated by [`ServiceSecretLayer`] instead.
///
/// # Example
///
/// ```
/// # use core::{marker::PhantomData, ops::ControlFlow};
/// # use std::sync::Arc;
/// # use axum::{Router, routing::get};
/// # use error_stack::Report;
/// # use hash_middleware::authentication::{
/// #     provider::{AuthenticationProvider, Caller},
/// #     request::AuthenticationError,
/// # };
/// # use http::HeaderMap;
/// use hash_middleware::authentication::{
///     AuthenticatedActorId, AuthenticationLayer, AuthenticationMetrics,
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
/// let router: Router = Router::new().route("/whoami", get(whoami)).route_layer(
///     AuthenticationLayer::<_, ActorId> {
///         provider: Arc::new(Verifier),
///         service_secret: Arc::from("service-secret"),
///         metrics: Arc::new(AuthenticationMetrics::new(&meter)),
///         bootstrap_route: |_path| false,
///         caller: PhantomData,
///     },
/// );
/// ```
pub struct AuthenticationLayer<P, C> {
    /// The provider chain requests resolve against.
    pub provider: Arc<P>,
    /// The secret bootstrap routes require.
    pub service_secret: Arc<str>,
    /// The instruments rejections are counted on.
    pub metrics: Arc<AuthenticationMetrics>,
    /// Names the bootstrap routes by path.
    pub bootstrap_route: fn(&str) -> bool,

    /// Selects the caller type the chain resolves to: [`ActorId`] rejects uncredentialed
    /// requests, `Option<ActorId>` serves them anonymously.
    pub caller: PhantomData<fn() -> C>,
}

impl<P, C> Clone for AuthenticationLayer<P, C> {
    fn clone(&self) -> Self {
        Self {
            provider: Arc::clone(&self.provider),
            service_secret: Arc::clone(&self.service_secret),
            metrics: Arc::clone(&self.metrics),
            bootstrap_route: self.bootstrap_route,
            caller: PhantomData,
        }
    }
}

impl<P, C, S> tower::Layer<S> for AuthenticationLayer<P, C> {
    type Service = AuthenticationService<P, C, S>;

    fn layer(&self, inner: S) -> Self::Service {
        AuthenticationService {
            inner,
            _caller: PhantomData,
            provider: Arc::clone(&self.provider),
            service_secret: Arc::clone(&self.service_secret),
            metrics: Arc::clone(&self.metrics),
            bootstrap_route: self.bootstrap_route,
        }
    }
}

/// The service [`AuthenticationLayer`] wraps its inner service into.
pub struct AuthenticationService<P, C, S> {
    inner: S,
    _caller: PhantomData<fn() -> C>,

    provider: Arc<P>,
    service_secret: Arc<str>,
    metrics: Arc<AuthenticationMetrics>,
    bootstrap_route: fn(&str) -> bool,
}

impl<P, C, S: Clone> Clone for AuthenticationService<P, C, S> {
    fn clone(&self) -> Self {
        Self {
            inner: self.inner.clone(),
            _caller: PhantomData,
            provider: Arc::clone(&self.provider),
            service_secret: Arc::clone(&self.service_secret),
            metrics: Arc::clone(&self.metrics),
            bootstrap_route: self.bootstrap_route,
        }
    }
}

impl<B, P, C, S> tower::Service<http::Request<B>> for AuthenticationService<P, C, S>
where
    S: tower::Service<http::Request<B>> + Clone,
    C: Caller,
    P: AuthenticationProvider<C>,
{
    type Error = S::Error;
    type Response = Result<S::Response, AuthenticationRejection>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut task::Context<'_>) -> task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, mut req: http::Request<B>) -> Self::Future {
        let clone = self.inner.clone();
        let mut next = core::mem::replace(&mut self.inner, clone);

        let bootstrap = (self.bootstrap_route)(req.uri().path());
        if bootstrap
            && let Some(rejection) =
                service_secret_rejection(req.headers(), &self.service_secret, &self.metrics)
        {
            return Either::Right(future::ready(Ok(Err(rejection))));
        }

        let provider = Arc::clone(&self.provider);
        let metrics = Arc::clone(&self.metrics);

        Either::Left(async move {
            let outcome = resolve_request_actor(&*provider, req.headers(), &metrics)
                .await
                .map(Caller::into_actor)
                .map_err(Arc::new);

            let outcome = match outcome {
                Err(report)
                    if bootstrap
                        && matches!(
                            report.current_context().kind(),
                            AuthenticationErrorKind::MissingDelegatedActor
                        ) =>
                {
                    metrics.record_degradation(report.current_context(), Degradation::Bootstrap);
                    Err(report)
                }
                Err(report) => {
                    return Ok(Err(AuthenticationRejection::Authentication {
                        report,
                        metrics,
                    }));
                }
                Ok(value) => Ok(value),
            };

            store_outcome(&mut req, outcome, metrics);

            next.call(req).await.map(Ok)
        })
    }
}

/// Axum extractor providing the acting principal resolved by [`AuthenticationLayer`].
///
/// Taking this extractor is how a handler states that it requires an actor: an anonymous caller
/// is rejected here rather than reaching the handler. Handlers that serve callers without an
/// actor take `Option<AuthenticatedActorId>` instead.
///
/// Rejects the request on routes without the middleware.
pub struct AuthenticatedActorId(pub ActorId);

impl<S: Sync> FromRequestParts<S> for AuthenticatedActorId {
    type Rejection = AuthenticationRejection;

    fn from_request_parts(
        parts: &mut Parts,
        _state: &S,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        future::ready(match parts.extensions.get::<ResolvedAuthentication>() {
            Some(ResolvedAuthentication {
                outcome: Ok(Some(actor_id)),
                ..
            }) => Ok(Self(*actor_id)),

            Some(ResolvedAuthentication {
                outcome: Ok(None),
                metrics,
            }) => Err(AuthenticationRejection::Authentication {
                report: Arc::new(Report::new(AuthenticationError::new(
                    AuthenticationErrorKind::MissingCredentials,
                ))),
                metrics: Arc::clone(metrics),
            }),
            Some(ResolvedAuthentication {
                outcome: Err(report),
                metrics,
            }) => Err(AuthenticationRejection::Authentication {
                report: Arc::clone(report),
                metrics: Arc::clone(metrics),
            }),
            None => Err(AuthenticationRejection::Misconfigured),
        })
    }
}

/// `Option<AuthenticatedActorId>` yields [`None`] for an anonymous caller.
///
/// Writing the extractor as an [`Option`] is how a handler states that it serves callers without an
/// actor. An invalid credential is still rejected — [`None`] means the chain resolved the request
/// as anonymous, never that a credential failed.
impl<S: Sync> OptionalFromRequestParts<S> for AuthenticatedActorId {
    type Rejection = AuthenticationRejection;

    fn from_request_parts(
        parts: &mut Parts,
        _state: &S,
    ) -> impl Future<Output = Result<Option<Self>, Self::Rejection>> + Send {
        future::ready(match parts.extensions.get::<ResolvedAuthentication>() {
            Some(ResolvedAuthentication {
                outcome: Ok(caller),
                ..
            }) => Ok(caller.map(Self)),
            Some(ResolvedAuthentication {
                outcome: Err(report),
                metrics,
            }) => Err(AuthenticationRejection::Authentication {
                report: Arc::clone(report),
                metrics: Arc::clone(metrics),
            }),
            None => Err(AuthenticationRejection::Misconfigured),
        })
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::{future::Future, marker::PhantomData, ops::ControlFlow};

    use axum::{Router, body::Body, routing::get};
    use error_stack::Report;
    use http::{HeaderMap, Request, StatusCode};
    use tower::ServiceExt as _;
    use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};
    use uuid::Uuid;

    use super::{
        AuthenticatedActorId, AuthenticationLayer, AuthenticationMetrics, AuthenticationRejection,
        ServiceSecretLayer,
    };
    use crate::{
        authentication::{
            provider::{AuthenticationProvider, Caller, StaticAuthenticationProvider},
            request::{AuthenticationError, AuthenticationErrorKind},
        },
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
        routes().layer(AuthenticationLayer::<_, Option<ActorId>> {
            provider: Arc::new(provider),
            service_secret: Arc::from(SERVICE_SECRET),
            metrics,
            bootstrap_route: is_bootstrap_route,
            caller: PhantomData,
        })
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

    /// A provider chain whose service credential verified without naming a delegated actor.
    struct MissingDelegation;

    impl<C: Caller> AuthenticationProvider<C> for MissingDelegation {
        fn authenticate(
            &self,
            _headers: &HeaderMap,
        ) -> impl Future<Output = ControlFlow<Result<C, Report<AuthenticationError>>>> + Send
        {
            core::future::ready(ControlFlow::Break(Err(Report::new(
                AuthenticationError::missing_delegated_actor(),
            ))))
        }
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
        routes().layer(AuthenticationLayer::<_, ActorId> {
            provider: Arc::new(provider),
            service_secret: Arc::from(SERVICE_SECRET),
            metrics: Arc::new(AuthenticationMetrics::new(&noop_meter())),
            bootstrap_route: is_bootstrap_route,
            caller: PhantomData,
        })
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
        routes().layer(ServiceSecretLayer {
            service_secret: Arc::from(SERVICE_SECRET),
            metrics: Arc::new(AuthenticationMetrics::new(&noop_meter())),
        })
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

    /// A verified rejection that resolves as anonymous counts as a degradation, never as a
    /// rejection: the request was served.
    #[tokio::test]
    async fn anonymous_degrade_counts_as_degradation() {
        let recorded = RecordedMetrics::new();
        let router = router_recording(
            StaticAuthenticationProvider::Rejected,
            Arc::new(AuthenticationMetrics::new(&recorded.meter())),
        );

        let response = router
            .oneshot(request("/anonymous-allowed"))
            .await
            .expect("the router should respond");
        assert_eq!(response.status(), StatusCode::OK);

        assert_eq!(
            recorded.counter(
                "hash.authentication.degradations",
                &[("mechanism", "anonymous"), ("fault_domain", "caller")],
            ),
            1,
            "the anonymous degrade should count with its mechanism and fault domain"
        );
        assert_eq!(
            recorded.counter("hash.authentication.rejections", &[]),
            0,
            "a degraded request should not count as a rejection"
        );
    }

    /// The tolerated bootstrap failure counts as a degradation, never as a rejection: the
    /// request was served.
    #[tokio::test]
    async fn bootstrap_toleration_counts_as_degradation() {
        let recorded = RecordedMetrics::new();
        let router = routes().layer(AuthenticationLayer::<_, Option<ActorId>> {
            provider: Arc::new(MissingDelegation),
            service_secret: Arc::from(SERVICE_SECRET),
            metrics: Arc::new(AuthenticationMetrics::new(&recorded.meter())),
            bootstrap_route: is_bootstrap_route,
            caller: PhantomData,
        });

        let response = router
            .oneshot(request_with_secret("/bootstrap", SERVICE_SECRET))
            .await
            .expect("the router should respond");
        assert_eq!(response.status(), StatusCode::OK);

        assert_eq!(
            recorded.counter(
                "hash.authentication.degradations",
                &[("mechanism", "bootstrap"), ("fault_domain", "caller")],
            ),
            1,
            "the tolerated bootstrap failure should count with its mechanism and fault domain"
        );
        assert_eq!(
            recorded.counter("hash.authentication.rejections", &[]),
            0,
            "a tolerated request should not count as a rejection"
        );
    }

    /// Recording rides the rejection's drop, so a path that builds one and never renders it
    /// still reaches the meter.
    #[test]
    fn unrendered_rejection_counts() {
        let recorded = RecordedMetrics::new();
        let metrics = Arc::new(AuthenticationMetrics::new(&recorded.meter()));

        drop(AuthenticationRejection::Authentication {
            report: Arc::new(Report::new(AuthenticationError::new(
                AuthenticationErrorKind::MissingCredentials,
            ))),
            metrics: Arc::clone(&metrics),
        });

        assert_eq!(
            recorded.counter(
                "hash.authentication.rejections",
                &[
                    ("http.response.status_code", "401"),
                    ("fault_domain", "caller"),
                ],
            ),
            1,
            "a dropped rejection should count without being rendered"
        );
    }

    /// A clone copies the [`Arc`]s, so both drops see one error and the count latches on it.
    #[test]
    fn cloned_rejection_counts_once() {
        let recorded = RecordedMetrics::new();
        let metrics = Arc::new(AuthenticationMetrics::new(&recorded.meter()));

        let rejection = AuthenticationRejection::Authentication {
            report: Arc::new(Report::new(AuthenticationError::new(
                AuthenticationErrorKind::MissingCredentials,
            ))),
            metrics: Arc::clone(&metrics),
        };
        let clone = rejection.clone();
        drop(rejection);
        drop(clone);

        assert_eq!(
            recorded.counter(
                "hash.authentication.rejections",
                &[
                    ("http.response.status_code", "401"),
                    ("fault_domain", "caller"),
                ],
            ),
            1,
            "clones share one error, which counts one rejected request"
        );
    }

    /// Extractors rebuild a rejection from the report the extension stores, so several
    /// extractions on one request drop several rejections over one error.
    #[test]
    fn rebuilt_rejection_counts_once() {
        let recorded = RecordedMetrics::new();
        let metrics = Arc::new(AuthenticationMetrics::new(&recorded.meter()));
        let report = Arc::new(Report::new(AuthenticationError::new(
            AuthenticationErrorKind::MissingCredentials,
        )));

        drop(AuthenticationRejection::Authentication {
            report: Arc::clone(&report),
            metrics: Arc::clone(&metrics),
        });
        drop(AuthenticationRejection::Authentication {
            report,
            metrics: Arc::clone(&metrics),
        });

        assert_eq!(
            recorded.counter(
                "hash.authentication.rejections",
                &[
                    ("http.response.status_code", "401"),
                    ("fault_domain", "caller"),
                ],
            ),
            1,
            "rejections over one report are one rejected request"
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

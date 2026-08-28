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
use type_system::principal::actor::ActorId;

use self::{
    provider::{AuthenticationProvider, Caller},
    request::{AuthenticationError, resolve_request_actor},
    service_secret::{presents_service_secret, service_credential},
};
use crate::response::error_response;

/// The resolved authentication of a request, stored as a request extension.
#[derive(Clone)]
pub(crate) struct ResolvedAuthentication(Result<Option<ActorId>, AuthenticationError>);

impl ResolvedAuthentication {
    #[cfg(test)]
    pub(crate) const fn new(outcome: Result<Option<ActorId>, AuthenticationError>) -> Self {
        Self(outcome)
    }

    pub(crate) const fn outcome(&self) -> &Result<Option<ActorId>, AuthenticationError> {
        &self.0
    }
}

/// Converts an authentication failure into the response returned to the client.
///
/// The response carries the client-safe message. Identifiers stay in the server-side logs. Only
/// logs at debug level: a rejection is the caller's to repair, and where verification itself
/// failed, [`resolve_request_actor`] has already logged the report at the level matching the
/// fault domain.
fn rejection(error: &AuthenticationError) -> Response {
    tracing::debug!(%error, "request rejected");
    error_response(error.status_code(), error.client_message().to_owned())
}

/// Returns the rejection for a request that does not carry the service secret, [`None`] when it
/// does.
fn service_secret_rejection(headers: &http::HeaderMap, service_secret: &str) -> Option<Response> {
    if presents_service_secret(headers, service_secret) {
        return None;
    }

    if service_credential(headers).is_some() {
        tracing::warn!("request rejected due to a service credential mismatch");
        return Some(rejection(&AuthenticationError::InvalidServiceSecret));
    }
    tracing::debug!("request rejected without a service credential");
    Some(rejection(&AuthenticationError::MissingServiceSecret))
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
/// use hash_middleware::authentication::service_secret_middleware;
///
/// let service_secret: Arc<str> = Arc::from("service-secret");
/// let router: Router = Router::new()
///     .route("/snapshot", get(async || "gated"))
///     .route_layer(middleware::from_fn(move |request, next| {
///         service_secret_middleware(Arc::clone(&service_secret), request, next)
///     }));
/// ```
pub async fn service_secret_middleware(
    service_secret: Arc<str>,
    request: Request,
    next: Next,
) -> Response {
    if let Some(rejection) = service_secret_rejection(request.headers(), &service_secret) {
        return rejection;
    }

    next.run(request).await
}

/// Records the authenticated actor on the request span and stores the outcome as a request
/// extension.
fn store_outcome(request: &mut Request, outcome: Result<Option<ActorId>, AuthenticationError>) {
    if let Ok(Some(actor_id)) = &outcome {
        tracing::Span::current().record("actor_entity_uuid", tracing::field::display(actor_id));
    }
    request
        .extensions_mut()
        .insert(ResolvedAuthentication(outcome));
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
/// use hash_middleware::authentication::{AuthenticatedActorId, authentication_middleware};
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
/// let provider = Arc::new(Verifier);
/// let service_secret: Arc<str> = Arc::from("service-secret");
/// let router: Router =
///     Router::new()
///         .route("/whoami", get(whoami))
///         .route_layer(middleware::from_fn(move |request, next| {
///             authentication_middleware::<_, ActorId>(
///                 Arc::clone(&provider),
///                 Arc::clone(&service_secret),
///                 |_path| false,
///                 request,
///                 next,
///             )
///         }));
/// ```
pub async fn authentication_middleware<P, C>(
    provider: Arc<P>,
    service_secret: Arc<str>,
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
        && let Some(rejection) = service_secret_rejection(request.headers(), &service_secret)
    {
        return rejection;
    }

    let outcome = resolve_request_actor(&*provider, request.headers())
        .await
        .map(Caller::into_actor);

    match &outcome {
        Err(AuthenticationError::MissingDelegatedActor) if bootstrap => {}
        Err(error) => return rejection(error),
        Ok(_) => {}
    }

    store_outcome(&mut request, outcome);
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
            Some(ResolvedAuthentication(Ok(Some(actor_id)))) => Ok(Self(*actor_id)),
            Some(ResolvedAuthentication(Ok(None))) => {
                Err(rejection(&AuthenticationError::MissingCredentials))
            }
            Some(ResolvedAuthentication(Err(error))) => Err(rejection(error)),
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
            Some(ResolvedAuthentication(Ok(caller))) => Ok(caller.map(Self)),
            Some(ResolvedAuthentication(Err(error))) => Err(rejection(error)),
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

    use super::{AuthenticatedActorId, authentication_middleware};
    use crate::authentication::provider::StaticAuthenticationProvider;

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
        let provider = Arc::new(provider);
        let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
        routes().layer(middleware::from_fn(move |request, next| {
            let provider = Arc::clone(&provider);
            let service_secret = Arc::clone(&service_secret);
            authentication_middleware::<_, Option<ActorId>>(
                provider,
                service_secret,
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
    async fn middleware_rejects_rejected_credentials_on_bootstrap_routes() {
        let response = router(StaticAuthenticationProvider::Rejected)
            .oneshot(request_with_secret("/bootstrap", SERVICE_SECRET))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    /// A router requiring an actor.
    fn actor_required_router(provider: StaticAuthenticationProvider) -> Router {
        let provider = Arc::new(provider);
        let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
        routes().layer(middleware::from_fn(move |request, next| {
            let provider = Arc::clone(&provider);
            let service_secret = Arc::clone(&service_secret);
            authentication_middleware::<_, ActorId>(
                provider,
                service_secret,
                is_bootstrap_route,
                request,
                next,
            )
        }))
    }

    #[tokio::test]
    async fn rejected_credential_does_not_degrade_to_anonymous() {
        let response = router(StaticAuthenticationProvider::Rejected)
            .oneshot(request("/anonymous-allowed"))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
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
        routes().layer(middleware::from_fn(move |request, next| {
            let service_secret = Arc::clone(&service_secret);
            super::service_secret_middleware(service_secret, request, next)
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

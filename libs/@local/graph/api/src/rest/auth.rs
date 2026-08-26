//! Axum bindings for Graph authentication.
//!
//! Bridges [`hash_graph_authentication`] into the REST layer: [`authentication_middleware`]
//! resolves the request's credentials once — a Kratos session, a Cloudflare Access JWT, or the
//! service secret with its actor header — and rejects the request when they are invalid. A
//! request without credentials resolves through the chain's [`Caller`] type: a chain over
//! [`ActorId`] rejects it, a chain over `Option<ActorId>` verifies it as anonymous. The
//! resolution is stored as a request extension. The [`AuthenticatedActorId`] extractor
//! hands the acting actor to handlers that need it, and taking it as an `Option` is how a handler
//! serves anonymous callers.
//!
//! The bootstrap routes require the service secret regardless of the chain. The OpenAPI routes
//! carry no credential and resolve as anonymous. The probe route is served outside the
//! middleware.

use alloc::sync::Arc;

use axum::{
    extract::{FromRequestParts, OptionalFromRequestParts, Request},
    http::request::Parts,
    middleware::Next,
    response::{IntoResponse as _, Response},
};
use hash_graph_authentication::{
    actor::StorePoolActorResolver,
    delegation::{ServiceDelegationProvider, presents_service_secret, service_credential},
    kratos::{KratosEmailActorResolver, KratosSessionProvider},
    provider::{AuthenticationProvider, Caller},
    request::{AuthenticationError, resolve_request_actor},
};
pub use hash_graph_authentication::{
    cloudflare::CloudflareAccessProvider,
    jwt::{JwtValidator, JwtValidatorConfig},
    kratos::{KratosAdminConfig, KratosSessionConfig},
};
use hash_graph_authorization::policies::store::PrincipalStore;
use hash_graph_store::pool::StorePool;
use hash_status::{Status, StatusCode};
use type_system::principal::actor::ActorId;

use crate::rest::status::{BoxedResponse, status_to_response};

/// Configuration for Cloudflare Access authentication.
#[derive(Debug, Clone)]
pub struct CloudflareAccessConfig {
    /// JWT validation parameters for the Access team.
    pub jwt: JwtValidatorConfig,
    /// Kratos admin API access for resolving token emails to actors.
    pub kratos_admin: KratosAdminConfig,
}

/// The operator-facing provider chain: Cloudflare Access JWT (when configured), then service
/// delegation.
pub type OperatorChain<S> = (
    Option<CloudflareAccessProvider<KratosEmailActorResolver<StorePoolActorResolver<S>>>>,
    ServiceDelegationProvider<StorePoolActorResolver<S>>,
);

/// The provider chain of the REST router.
pub type ProviderChain<S> = (
    KratosSessionProvider<StorePoolActorResolver<S>>,
    OperatorChain<S>,
);

/// Builds the chain the admin API authenticates with: Cloudflare Access JWT (when configured),
/// then service delegation.
///
/// Deliberately without the Kratos session provider. The admin API deletes users and erases
/// entities, and its handlers do not authorize beyond "some actor", so an end-user session must
/// not reach it — operators arrive through Access, internal services through the shared secret.
pub fn build_operator_provider<S>(
    cloudflare_access: Option<CloudflareAccessConfig>,
    service_secret: String,
    store: &Arc<S>,
) -> OperatorChain<S>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: PrincipalStore,
{
    (
        cloudflare_access.map(|config| {
            CloudflareAccessProvider::new(
                JwtValidator::new(config.jwt),
                KratosEmailActorResolver::new(
                    config.kratos_admin,
                    StorePoolActorResolver::new(Arc::clone(store)),
                ),
            )
        }),
        ServiceDelegationProvider::new(
            service_secret,
            StorePoolActorResolver::new(Arc::clone(store)),
        ),
    )
}

/// Builds the chain the REST router authenticates with: Kratos session, then the operator
/// credentials.
pub fn build_authentication_provider<S>(
    session: KratosSessionConfig,
    cloudflare_access: Option<CloudflareAccessConfig>,
    service_secret: String,
    store: &Arc<S>,
) -> ProviderChain<S>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: PrincipalStore,
{
    (
        KratosSessionProvider::new(session, StorePoolActorResolver::new(Arc::clone(store))),
        build_operator_provider(cloudflare_access, service_secret, store),
    )
}

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
/// logs at debug level: [`resolve_request_actor`] already logs failures with their full report at
/// the level matching the fault domain.
fn rejection(error: &AuthenticationError) -> BoxedResponse {
    let status_code = error.status_code();
    tracing::debug!(%error, "request rejected");
    status_to_response(Status::<()>::new(
        status_code,
        Some(error.client_message().to_owned()),
        vec![],
    ))
}

/// Returns the rejection for a request that does not carry the service secret, [`None`] when it
/// does.
fn service_secret_rejection(
    headers: &axum::http::HeaderMap,
    service_secret: &str,
) -> Option<BoxedResponse> {
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
pub async fn service_secret_middleware(
    service_secret: Arc<str>,
    request: Request,
    next: Next,
) -> Response {
    if let Some(rejection) = service_secret_rejection(request.headers(), &service_secret) {
        return rejection.into_response();
    }

    next.run(request).await
}

/// Returns whether the path is a bootstrap route.
fn is_bootstrap_route(path: &str) -> bool {
    if path == "/policies/seed" {
        return true;
    }

    path.strip_prefix("/actors/machine/identifier/system/")
        .is_some_and(|identifier| !identifier.is_empty() && !identifier.contains('/'))
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

/// Rejects requests with invalid credentials and stores the resolution as a request extension.
///
/// A request without credentials resolves through the chain's [`Caller`] type: a chain over
/// [`ActorId`] rejects it, a chain over `Option<ActorId>` verifies it as anonymous, and whether an
/// anonymous caller may proceed is the handler's to state, through which extractor it takes.
///
/// Bootstrap routes are service operations: they require the service secret regardless of any
/// actor credential, and pass without an actor.
///
/// Routes that take no actor are gated by [`service_secret_middleware`] instead.
pub async fn authentication_middleware<P, C>(
    provider: Arc<P>,
    service_secret: Arc<str>,
    mut request: Request,
    next: Next,
) -> Response
where
    P: AuthenticationProvider<C>,
    C: Caller,
{
    let bootstrap = is_bootstrap_route(request.uri().path());
    if bootstrap
        && let Some(rejection) = service_secret_rejection(request.headers(), &service_secret)
    {
        return rejection.into_response();
    }

    let outcome = resolve_request_actor(&*provider, request.headers())
        .await
        .map(Caller::into_actor);

    match &outcome {
        Err(AuthenticationError::MissingDelegatedActor) if bootstrap => {}
        Err(error) => return rejection(error).into_response(),
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
    type Rejection = BoxedResponse;

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
                Err(status_to_response(Status::<()>::new(
                    StatusCode::Internal,
                    Some("internal server error".to_owned()),
                    vec![],
                )))
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
    type Rejection = BoxedResponse;

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
                Err(status_to_response(Status::<()>::new(
                    StatusCode::Internal,
                    Some("internal server error".to_owned()),
                    vec![],
                )))
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use std::collections::HashMap;

    use axum::{Router, body::Body, middleware, routing::get};
    use hash_graph_authentication::{
        actor::tests::FixedActorResolver, delegation::ServiceDelegationProvider,
        provider::StaticAuthenticationProvider,
    };
    use http::{Request, StatusCode};
    use tower::ServiceExt as _;
    use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};
    use uuid::Uuid;

    use super::{AuthenticatedActorId, authentication_middleware, is_bootstrap_route};

    #[test]
    fn bootstrap_routes_match() {
        assert!(is_bootstrap_route("/policies/seed"));
        assert!(is_bootstrap_route("/actors/machine/identifier/system/h"));
    }

    #[test]
    fn other_routes_do_not_match() {
        assert!(!is_bootstrap_route("/policies/query"));
        assert!(!is_bootstrap_route("/policies/seed/extra"));
        assert!(!is_bootstrap_route("/actors/machine/identifier/h"));
        assert!(!is_bootstrap_route("/actors/machine/identifier/system/"));
        assert!(!is_bootstrap_route(
            "/actors/machine/identifier/system/h/extra"
        ));
        assert!(!is_bootstrap_route("/hashql"));
    }

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

    fn routes() -> Router {
        Router::new()
            .route("/protected", get(protected))
            .route("/anonymous-allowed", get(anonymous_allowed))
            .route("/policies/seed", get(bootstrap))
    }

    fn router(provider: StaticAuthenticationProvider) -> Router {
        let provider = Arc::new(provider);
        let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
        routes().layer(middleware::from_fn(move |request, next| {
            let provider = Arc::clone(&provider);
            let service_secret = Arc::clone(&service_secret);
            authentication_middleware::<_, Option<ActorId>>(provider, service_secret, request, next)
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
            .oneshot(request_with_secret("/policies/seed", SERVICE_SECRET))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn middleware_rejects_bootstrap_routes_without_service_secret() {
        let response = router(StaticAuthenticationProvider::NotRecognized)
            .oneshot(request("/policies/seed"))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn middleware_rejects_bootstrap_routes_with_wrong_service_secret() {
        let response = router(StaticAuthenticationProvider::NotRecognized)
            .oneshot(request_with_secret("/policies/seed", "hash-svc-wrong"))
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
        .oneshot(request("/policies/seed"))
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
        .oneshot(request_with_secret("/policies/seed", SERVICE_SECRET))
        .await
        .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn middleware_rejects_rejected_credentials_on_bootstrap_routes() {
        let response = router(StaticAuthenticationProvider::Rejected)
            .oneshot(request_with_secret("/policies/seed", SERVICE_SECRET))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    /// The REST chain shape around service delegation, serving anonymous callers.
    fn delegation_router() -> Router {
        let provider = Arc::new(ServiceDelegationProvider::new(
            SERVICE_SECRET.to_owned(),
            FixedActorResolver::new(HashMap::new()),
        ));
        let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
        routes().layer(middleware::from_fn(move |request, next| {
            let provider = Arc::clone(&provider);
            let service_secret = Arc::clone(&service_secret);
            authentication_middleware::<_, Option<ActorId>>(provider, service_secret, request, next)
        }))
    }

    #[tokio::test]
    async fn middleware_rejects_malformed_actor_headers_on_bootstrap_routes() {
        let request = Request::builder()
            .uri("/policies/seed")
            .header("Authorization", format!("HASH-Service {SERVICE_SECRET}"))
            .header("X-Authenticated-User-Actor-Id", "not-a-uuid")
            .body(Body::empty())
            .expect("the request should build");

        let response = delegation_router()
            .oneshot(request)
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    /// A router requiring an actor.
    fn actor_required_router(provider: StaticAuthenticationProvider) -> Router {
        let provider = Arc::new(provider);
        let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
        routes().layer(middleware::from_fn(move |request, next| {
            let provider = Arc::clone(&provider);
            let service_secret = Arc::clone(&service_secret);
            authentication_middleware::<_, ActorId>(provider, service_secret, request, next)
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

    #[tokio::test]
    async fn bootstrap_route_passes_with_secret_only_on_the_delegation_chain() {
        // Bootstrap admission hinges on the delegation provider resolving "secret without an
        // actor header" to the missing-delegated-actor error the bootstrap arm admits.
        let response = delegation_router()
            .oneshot(request_with_secret("/policies/seed", SERVICE_SECRET))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn bootstrap_route_reports_a_wrong_secret_as_invalid() {
        let response = delegation_router()
            .oneshot(request_with_secret("/policies/seed", "hash-svc-wrong"))
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

    /// A router gated by the service secret alone, as the bulk-destructive admin routes are.
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
        // extractor — mirrored by the `/policies/seed` test handler.
        let response = secret_gated_router()
            .oneshot(request_with_secret("/policies/seed", SERVICE_SECRET))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn bare_actor_id_header_does_not_impersonate() {
        // Without the service secret the delegation provider recognizes no credential, so the
        // header's actor must never be honored — the request is served as anonymous.
        let response = delegation_router()
            .oneshot(request_with_actor_header(
                "/anonymous-allowed",
                &Uuid::new_v4().to_string(),
            ))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .expect("the response body should be readable");
        assert_eq!(body, b"anonymous".as_slice());
    }

    #[tokio::test]
    async fn nil_actor_header_is_read_as_no_actor() {
        // The resolver knows no actor, so resolving the nil UUID would fail — an anonymous
        // response proves the delegation provider reads it as "acting for nobody".
        let request = Request::builder()
            .uri("/anonymous-allowed")
            .header("Authorization", format!("HASH-Service {SERVICE_SECRET}"))
            .header("X-Authenticated-User-Actor-Id", &Uuid::nil().to_string())
            .body(Body::empty())
            .expect("the request should build");

        let response = delegation_router()
            .oneshot(request)
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .expect("the response body should be readable");
        assert_eq!(body, b"anonymous".as_slice());
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

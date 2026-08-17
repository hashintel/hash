//! Axum bindings for Graph authentication.
//!
//! Bridges [`hash_graph_authentication`] into the REST layer: [`authentication_middleware`]
//! resolves the request's credentials once — a Kratos session or a service delegation pair —
//! and rejects the request when they are missing or invalid, so every route behind it requires
//! authentication by default. The resolved [`AuthenticationOutcome`] is stored as a private
//! request extension; the [`AuthenticatedActorId`] extractor hands the acting actor to handlers
//! that need it.
//!
//! The only routes behind the middleware reachable without an actor are the bootstrap routes,
//! which still require the service secret. The OpenAPI and probe routes are served outside the
//! middleware.
//!
//! Routers whose callers are authenticated by other means and carry the acting actor only in the
//! `X-Authenticated-User-Actor-Id` header use [`actor_id_header_middleware`] instead. The
//! extractor rejects requests on routes without either middleware.

use alloc::sync::Arc;

use axum::{
    extract::{FromRequestParts, Request},
    http::request::Parts,
    middleware::Next,
    response::{IntoResponse as _, Response},
};
pub use hash_graph_authentication::{
    actor::StorePoolActorResolver,
    delegation::ServiceDelegationProvider,
    kratos::{KratosSessionConfig, KratosSessionProvider},
};
use hash_graph_authentication::{
    delegation::presents_service_secret,
    provider::AuthenticationProvider,
    request::{
        AuthenticationError, AuthenticationOutcome, actor_id_from_header, resolve_request_actor,
    },
};
use hash_status::{Status, StatusCode};
use type_system::principal::actor::ActorEntityUuid;

use crate::rest::status::{BoxedResponse, status_to_response};

/// The resolved authentication of a request, stored as a request extension.
#[derive(Clone)]
struct ResolvedAuthentication(AuthenticationOutcome);

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

/// Returns whether the request may pass without an actor.
///
/// Bootstrap routes run before any actor exists, so they cannot demand actor credentials. They
/// still require the service secret, and a rejected credential stays rejected: only a request
/// carrying no credential at all passes the gate.
fn passes_bootstrap_gate(
    error: &AuthenticationError,
    request: &Request,
    service_secret: &str,
) -> bool {
    matches!(error, AuthenticationError::MissingCredentials)
        && is_bootstrap_route(request.uri().path())
        && presents_service_secret(request.headers(), service_secret)
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
fn store_outcome(request: &mut Request, outcome: AuthenticationOutcome) {
    if let AuthenticationOutcome::Authenticated(actor_id) = &outcome {
        tracing::Span::current().record("actor_entity_uuid", tracing::field::display(actor_id));
    }
    request
        .extensions_mut()
        .insert(ResolvedAuthentication(outcome));
}

/// Rejects requests without valid credentials and stores the resolved
/// [`AuthenticationOutcome`] as a request extension.
///
/// Bootstrap routes pass through without an actor when the request carries the service secret
/// and no rejected credential. Every other route never reaches its handler unauthenticated.
pub async fn authentication_middleware<P>(
    provider: Arc<P>,
    service_secret: Arc<str>,
    mut request: Request,
    next: Next,
) -> Response
where
    P: AuthenticationProvider,
{
    let outcome = resolve_request_actor(&*provider, request.headers()).await;

    if let AuthenticationOutcome::Failed(error) = &outcome
        && !passes_bootstrap_gate(error, &request, &service_secret)
    {
        return rejection(error).into_response();
    }

    store_outcome(&mut request, outcome);
    next.run(request).await
}

/// Resolves the unverified `X-Authenticated-User-Actor-Id` header and stores the outcome as a
/// request extension.
///
/// Never rejects a request: handlers opt into the actor through the [`AuthenticatedActorId`]
/// extractor.
pub async fn actor_id_header_middleware(mut request: Request, next: Next) -> Response {
    let outcome = match actor_id_from_header(request.headers()) {
        Ok(actor_id) => AuthenticationOutcome::Authenticated(actor_id),
        Err(error) => AuthenticationOutcome::Failed(error),
    };

    store_outcome(&mut request, outcome);
    next.run(request).await
}

/// Axum extractor providing the acting principal resolved by [`authentication_middleware`] or
/// [`actor_id_header_middleware`].
///
/// Rejects the request on routes without either middleware.
pub struct AuthenticatedActorId(pub ActorEntityUuid);

impl<S: Sync> FromRequestParts<S> for AuthenticatedActorId {
    type Rejection = BoxedResponse;

    fn from_request_parts(
        parts: &mut Parts,
        _state: &S,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        core::future::ready(match parts.extensions.get::<ResolvedAuthentication>() {
            Some(ResolvedAuthentication(AuthenticationOutcome::Authenticated(actor_id))) => {
                Ok(Self(*actor_id))
            }
            Some(ResolvedAuthentication(AuthenticationOutcome::Failed(error))) => {
                Err(rejection(error))
            }
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

    use axum::{Router, body::Body, middleware, routing::get};
    use hash_graph_authentication::provider::StaticAuthenticationProvider;
    use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
    use http::{Request, StatusCode};
    use tower::ServiceExt as _;
    use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};
    use uuid::Uuid;

    use super::{
        AuthenticatedActorId, ServiceDelegationProvider, actor_id_header_middleware,
        authentication_middleware, is_bootstrap_route,
    };

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

    async fn bootstrap() -> &'static str {
        "bootstrap"
    }

    const SERVICE_SECRET: &str = "hash-svc-test-secret";

    fn router(provider: StaticAuthenticationProvider) -> Router {
        let provider = Arc::new(provider);
        let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
        Router::new()
            .route("/protected", get(protected))
            .route("/policies/seed", get(bootstrap))
            .layer(middleware::from_fn(move |request, next| {
                let provider = Arc::clone(&provider);
                let service_secret = Arc::clone(&service_secret);
                authentication_middleware(provider, service_secret, request, next)
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
            .header("X-HASH-Service-Secret", secret)
            .body(Body::empty())
            .expect("the request should build")
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
        let response = router(StaticAuthenticationProvider::Verified(
            AuthenticatedActor::Id(ActorId::User(UserId::new(actor_id))),
        ))
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
    async fn middleware_rejects_rejected_credentials_on_bootstrap_routes() {
        let response = router(StaticAuthenticationProvider::Rejected)
            .oneshot(request_with_secret("/policies/seed", SERVICE_SECRET))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn middleware_rejects_malformed_actor_headers_on_bootstrap_routes() {
        let provider = Arc::new(ServiceDelegationProvider::new(SERVICE_SECRET.to_owned()));
        let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
        let router =
            Router::new()
                .route("/policies/seed", get(bootstrap))
                .layer(middleware::from_fn(move |request, next| {
                    let provider = Arc::clone(&provider);
                    let service_secret = Arc::clone(&service_secret);
                    authentication_middleware(provider, service_secret, request, next)
                }));

        let request = Request::builder()
            .uri("/policies/seed")
            .header("X-HASH-Service-Secret", SERVICE_SECRET)
            .header("X-Authenticated-User-Actor-Id", "not-a-uuid")
            .body(Body::empty())
            .expect("the request should build");

        let response = router
            .oneshot(request)
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
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

    #[tokio::test]
    async fn header_middleware_resolves_actor_id_headers() {
        let actor_id = Uuid::new_v4();
        let router = Router::new()
            .route("/protected", get(protected))
            .layer(middleware::from_fn(actor_id_header_middleware));

        let response = router
            .oneshot(request_with_actor_header(
                "/protected",
                &actor_id.to_string(),
            ))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .expect("the response body should be readable");
        assert_eq!(body, actor_id.to_string().as_bytes());
    }

    #[tokio::test]
    async fn header_middleware_rejects_missing_headers_at_extraction() {
        let router = Router::new()
            .route("/protected", get(protected))
            .layer(middleware::from_fn(actor_id_header_middleware));

        let response = router
            .oneshot(request("/protected"))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}

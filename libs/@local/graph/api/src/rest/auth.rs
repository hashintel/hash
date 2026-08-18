//! Axum bindings for Graph authentication.
//!
//! Bridges [`hash_graph_authentication`] into the REST layer: [`authentication_middleware`]
//! resolves the request's credentials once — a Kratos session, a Cloudflare Access JWT, or a
//! service delegation pair — and rejects the request when they are missing or invalid, so every
//! route behind it requires authentication by default. The resolved [`AuthenticationOutcome`] is
//! stored as a private request extension; the [`AuthenticatedActorId`] extractor hands the acting
//! actor to handlers that need it.
//!
//! The only routes behind the middleware reachable without an actor are the bootstrap routes,
//! which still require the service secret. The OpenAPI and probe routes are served outside the
//! middleware.

use alloc::sync::Arc;

use axum::{
    extract::{FromRequestParts, Request},
    http::request::Parts,
    middleware::Next,
    response::{IntoResponse as _, Response},
};
use hash_graph_authentication::{
    actor::StorePoolActorResolver,
    delegation::{ServiceDelegationProvider, presents_service_secret},
    kratos::{KratosEmailActorResolver, KratosSessionProvider},
    provider::AuthenticationProvider,
    request::{AuthenticationError, AuthenticationOutcome, resolve_request_actor},
};
pub use hash_graph_authentication::{
    cloudflare::CloudflareAccessProvider,
    jwt::{JwtValidator, JwtValidatorConfig},
    kratos::{KratosAdminConfig, KratosSessionConfig},
};
use hash_graph_authorization::policies::store::PrincipalStore;
use hash_graph_store::pool::StorePool;
use hash_status::{Status, StatusCode};
use type_system::principal::actor::ActorEntityUuid;

use crate::rest::status::{BoxedResponse, status_to_response};

/// Configuration for Cloudflare Access authentication.
#[derive(Debug, Clone)]
pub struct CloudflareAccessConfig {
    /// JWT validation parameters for the Access team.
    pub jwt: JwtValidatorConfig,
    /// Kratos admin API access for resolving token emails to actors.
    pub kratos_admin: KratosAdminConfig,
}

/// The provider chain shared by the REST and admin routers.
pub type ProviderChain<S> = (
    KratosSessionProvider<StorePoolActorResolver<S>>,
    (
        Option<CloudflareAccessProvider<KratosEmailActorResolver<StorePoolActorResolver<S>>>>,
        ServiceDelegationProvider,
    ),
);

/// Builds the authentication provider chain: Kratos session, Cloudflare Access JWT (when
/// configured), and service delegation, in that order.
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
            ServiceDelegationProvider::new(service_secret),
        ),
    )
}

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
/// Bootstrap routes are service operations: they require the service secret regardless of any
/// actor credential, and pass without an actor. Every other route never reaches its handler
/// unauthenticated.
pub async fn authentication_middleware<P>(
    provider: Arc<P>,
    service_secret: Arc<str>,
    mut request: Request,
    next: Next,
) -> Response
where
    P: AuthenticationProvider,
{
    let bootstrap = is_bootstrap_route(request.uri().path());
    if bootstrap && !presents_service_secret(request.headers(), &service_secret) {
        return rejection(&AuthenticationError::MissingServiceSecret).into_response();
    }

    let outcome = resolve_request_actor(&*provider, request.headers()).await;

    match &outcome {
        AuthenticationOutcome::Failed(AuthenticationError::MissingCredentials) if bootstrap => {}
        AuthenticationOutcome::Failed(error) => return rejection(error).into_response(),
        AuthenticationOutcome::Authenticated(_) => {}
    }

    store_outcome(&mut request, outcome);
    next.run(request).await
}

/// Axum extractor providing the acting principal resolved by [`authentication_middleware`].
///
/// Rejects the request on routes without the middleware.
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
    use hash_graph_authentication::{
        delegation::ServiceDelegationProvider, provider::StaticAuthenticationProvider,
    };
    use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
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
            .header("Authorization", format!("HASH-Service {secret}"))
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
    async fn middleware_rejects_authenticated_bootstrap_requests_without_secret() {
        let actor_id = ActorEntityUuid::new(Uuid::new_v4());
        let response = router(StaticAuthenticationProvider::Verified(
            AuthenticatedActor::Id(ActorId::User(UserId::new(actor_id))),
        ))
        .oneshot(request("/policies/seed"))
        .await
        .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn middleware_admits_authenticated_bootstrap_requests_with_secret() {
        let actor_id = ActorEntityUuid::new(Uuid::new_v4());
        let response = router(StaticAuthenticationProvider::Verified(
            AuthenticatedActor::Id(ActorId::User(UserId::new(actor_id))),
        ))
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
            .header("Authorization", format!("HASH-Service {SERVICE_SECRET}"))
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
}

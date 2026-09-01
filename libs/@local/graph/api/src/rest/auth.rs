//! The graph's authentication wiring over [`hash_middleware`]'s middleware.
//!
//! [`build_authentication_provider`] and [`build_operator_provider`] assemble the provider chains
//! the routers authenticate with — a Kratos session, a Cloudflare Access JWT, or the service
//! secret with its actor header. [`is_bootstrap_route`] names the routes that require the service
//! secret regardless of the chain. The middleware and the [`AuthenticatedActorId`] extractor come
//! from [`hash_middleware::authentication`] and are re-exported here.

use alloc::sync::Arc;

use hash_graph_authentication::{
    actor::StorePoolActorResolver,
    delegation::ServiceDelegationProvider,
    kratos::{KratosEmailActorResolver, KratosSessionProvider},
};
pub use hash_graph_authentication::{
    cloudflare::CloudflareAccessProvider,
    jwt::{JwtValidator, JwtValidatorConfig},
    kratos::{KratosAdminConfig, KratosSessionConfig, SessionCacheConfig},
};
use hash_graph_authorization::policies::store::PrincipalStore;
use hash_graph_store::pool::StorePool;
pub use hash_middleware::authentication::{AuthenticatedActorId, AuthenticationMetrics};

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
    meter: &opentelemetry::metrics::Meter,
) -> ProviderChain<S>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: PrincipalStore,
{
    (
        KratosSessionProvider::new(
            session,
            StorePoolActorResolver::new(Arc::clone(store)),
            meter,
        ),
        build_operator_provider(cloudflare_access, service_secret, store),
    )
}

/// Returns whether the path is a bootstrap route.
///
/// [`AuthenticationLayer`] takes this as its bootstrap predicate: these routes require the
/// service secret regardless of any actor credential, and pass without an actor.
///
/// [`AuthenticationLayer`]: hash_middleware::authentication::AuthenticationLayer
#[must_use]
pub fn is_bootstrap_route(path: &str) -> bool {
    if path == "/policies/seed" {
        return true;
    }

    path.strip_prefix("/actors/machine/identifier/system/")
        .is_some_and(|identifier| !identifier.is_empty() && !identifier.contains('/'))
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::ops::ControlFlow;
    use std::collections::HashMap;

    use axum::{Router, body::Body, routing::get};
    use error_stack::Report;
    use hash_graph_authentication::{
        actor::tests::FixedActorResolver, delegation::ServiceDelegationProvider,
    };
    use hash_middleware::authentication::{
        AuthenticationLayer,
        provider::{AuthenticationProvider, Caller},
        request::{AuthenticationError, AuthenticationErrorKind},
    };
    use http::{HeaderMap, Request, StatusCode};
    use tower::ServiceExt as _;
    use type_system::principal::actor::ActorId;
    use uuid::Uuid;

    use super::{AuthenticatedActorId, AuthenticationMetrics, is_bootstrap_route};

    fn request(uri: &str) -> Request<Body> {
        Request::builder()
            .uri(uri)
            .body(Body::empty())
            .expect("the request should build")
    }

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

    /// The REST chain shape around service delegation, serving anonymous callers.
    ///
    /// The graph's own [`is_bootstrap_route`] gates the bootstrap paths, so these tests read the
    /// production predicate through the production middleware.
    fn delegation_router() -> Router {
        let provider = Arc::new(ServiceDelegationProvider::new(
            SERVICE_SECRET.to_owned(),
            FixedActorResolver::new(HashMap::new()),
        ));
        let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
        let metrics = Arc::new(AuthenticationMetrics::new(&opentelemetry::global::meter(
            "test",
        )));
        routes().layer(AuthenticationLayer::<_, Option<ActorId>> {
            provider,
            service_secret,
            metrics,
            bootstrap_route: is_bootstrap_route,
            caller: core::marker::PhantomData,
        })
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

    /// A provider rejecting every request with the error under test.
    struct FailingProvider(AuthenticationErrorKind);

    impl<C: Caller> AuthenticationProvider<C> for FailingProvider {
        fn authenticate(
            &self,
            _headers: &HeaderMap,
        ) -> impl Future<Output = ControlFlow<Result<C, Arc<Report<AuthenticationError>>>>> + Send
        {
            core::future::ready(ControlFlow::Break(Err(Arc::new(Report::new(
                AuthenticationError::new(self.0.clone()),
            )))))
        }
    }

    /// Every rejection answers its error's status code and carries the client message alone.
    #[tokio::test]
    async fn rejection_bodies_carry_the_client_message() {
        let cases = [
            (AuthenticationErrorKind::InvalidActorIdHeader, 400),
            (AuthenticationErrorKind::InvalidSession, 401),
            (AuthenticationErrorKind::ProviderUnreachable, 503),
            (AuthenticationErrorKind::InvalidProviderResponse, 500),
        ];

        for (error, status) in cases {
            let expected = serde_json::to_vec(&serde_json::json!({
                "message": error.client_message(),
            }))
            .expect("the error document should serialize");

            let router = routes().layer(AuthenticationLayer::<_, ActorId> {
                provider: Arc::new(FailingProvider(error)),
                service_secret: Arc::from(SERVICE_SECRET),
                metrics: Arc::new(AuthenticationMetrics::new(&opentelemetry::global::meter(
                    "test",
                ))),
                bootstrap_route: is_bootstrap_route,
                caller: core::marker::PhantomData,
            });

            let response = router
                .oneshot(request("/protected"))
                .await
                .expect("the router should respond");

            assert_eq!(
                response.status().as_u16(),
                status,
                "the rejection should keep its HTTP status"
            );
            let body = axum::body::to_bytes(response.into_body(), 1024)
                .await
                .expect("the response body should be readable");
            assert_eq!(
                body.as_ref(),
                expected.as_slice(),
                "the {status} rejection body should carry the client message alone"
            );
        }
    }
}

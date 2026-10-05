//! The bootstrap routes of the legacy API.

/// Returns whether the path is a bootstrap route.
///
/// [`AuthenticationLayer`] takes this as its bootstrap predicate: these routes require the
/// service secret regardless of any actor credential, and pass without an actor.
///
/// [`AuthenticationLayer`]: hash_middleware::authentication::AuthenticationLayer
#[must_use]
pub(crate) fn is_bootstrap_route(path: &str) -> bool {
    if path == "/policies/seed" {
        return true;
    }

    path.strip_prefix("/actors/machine/identifier/system/")
        .is_some_and(|identifier| !identifier.is_empty() && !identifier.contains('/'))
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use std::collections::HashMap;

    use axum::{Router, body::Body, routing::get};
    use hash_graph_authentication::{
        actor::tests::FixedActorResolver, delegation::ServiceDelegationProvider,
    };
    use hash_middleware::authentication::{
        AuthenticatedActorId, AuthenticationLayer, AuthenticationMetrics,
    };
    use http::{Request, StatusCode, header::CONTENT_TYPE};
    use serde_json::{Value, json};
    use tower::ServiceExt as _;
    use type_system::principal::actor::ActorId;
    use uuid::Uuid;

    use super::is_bootstrap_route;

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
    async fn bootstrap_malformed_actor_header() {
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
        assert_eq!(response.headers()[CONTENT_TYPE], "application/problem+json");
        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .expect("the response body should be readable");
        assert_eq!(
            serde_json::from_slice::<Value>(&body).expect("the response body should be JSON"),
            json!({
                "type": "about:blank",
                "title": "Bad Request",
                "status": 400,
                "detail": "`X-Authenticated-User-Actor-Id` header is not a valid UUID",
            })
        );
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
    async fn bootstrap_wrong_secret() {
        let response = delegation_router()
            .oneshot(request_with_secret("/policies/seed", "hash-svc-wrong"))
            .await
            .expect("the router should respond");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let body = axum::body::to_bytes(response.into_body(), 1024)
            .await
            .expect("the response body should be readable");
        assert_eq!(
            serde_json::from_slice::<Value>(&body).expect("the response body should be JSON")
                ["detail"],
            "credentials are not accepted",
            "a wrong secret should not tell the caller about the service credential"
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
            .header("X-Authenticated-User-Actor-Id", Uuid::nil().to_string())
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
}

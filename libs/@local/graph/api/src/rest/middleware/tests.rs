use alloc::sync::Arc;
use core::{
    net::{IpAddr, SocketAddr},
    num::NonZeroU32,
};

use axum::{Router, body::Body, extract::ConnectInfo, response::Response, routing::get};
use hash_middleware::{
    authentication::{
        AuthenticatedActorId, AuthenticationMetrics, provider::StaticAuthenticationProvider,
    },
    rate_limit::{ClientIpSource, RateLimitConfig, RateLimitMode, RateLimiters},
};
use http::{
    HeaderValue, Method, Request, StatusCode,
    header::{ALLOW, AUTHORIZATION, CONTENT_TYPE},
};
use serde_json::json;
use tower::ServiceExt as _;
use type_system::principal::actor::{ActorId, ActorType};
use uuid::Uuid;

use super::Middleware;
use crate::rest::{
    documentation, internal,
    test_utils::{self, apis, echo_caller, response_json},
};

const SERVICE_SECRET: &str = "hash-svc-test-secret";

fn non_zero(value: u32) -> NonZeroU32 {
    NonZeroU32::new(value).expect("the value should be non-zero")
}

/// Budgets that refill once per second or hour, so only the bursts decide within a test.
fn config(gate_burst: u32, caller_burst: u32) -> RateLimitConfig {
    RateLimitConfig {
        rate_limit_mode: RateLimitMode::Enforce,
        client_ip_source: ClientIpSource::ConnectInfo,
        rate_limit_gate_per_second: non_zero(1),
        rate_limit_gate_burst: non_zero(gate_burst),
        rate_limit_anonymous_per_hour: non_zero(1),
        rate_limit_anonymous_burst: non_zero(caller_burst),
        rate_limit_actor_per_hour: non_zero(1),
        rate_limit_actor_burst: non_zero(caller_burst),
    }
}

fn middleware(
    config: &RateLimitConfig,
    public_provider: StaticAuthenticationProvider,
    internal_provider: StaticAuthenticationProvider,
) -> Middleware<StaticAuthenticationProvider, StaticAuthenticationProvider> {
    let meter = opentelemetry::global::meter("test");
    Middleware {
        public_provider: Arc::new(public_provider),
        internal_provider: Arc::new(internal_provider),
        service_secret: Arc::from(SERVICE_SECRET),
        authentication_metrics: Arc::new(AuthenticationMetrics::new(&meter)),
        rate_limiters: RateLimiters::start(config, &meter),
    }
}

fn client(host: u8) -> IpAddr {
    IpAddr::from([192, 0, 2, host])
}

fn request_from(path: &str, peer: IpAddr) -> Request<Body> {
    let mut request = Request::builder()
        .uri(path)
        .body(Body::empty())
        .expect("the request should build");
    request
        .extensions_mut()
        .insert(ConnectInfo(SocketAddr::new(peer, 4000)));
    request
}

fn request_to(path: &str) -> Request<Body> {
    request_from(path, client(1))
}

fn request_with(method: Method, path: &str) -> Request<Body> {
    let mut request = request_to(path);
    *request.method_mut() = method;
    request
}

async fn send_request(router: &Router, request: Request<Body>) -> Response {
    router
        .clone()
        .oneshot(request)
        .await
        .expect("the router should respond")
}

async fn send(router: &Router, path: &str) -> Response {
    send_request(router, request_to(path)).await
}

#[tokio::test]
async fn documentation_skips_authentication() {
    let apis = apis();
    let documentation = documentation::routes(&apis);
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Unreachable,
    )
    .assemble(Router::new(), apis, documentation);

    for path in [
        "/",
        "/openapi/scalar.js",
        "/_api",
        "/_api/",
        "/_api/openapi/scalar.js",
        "/_api/legacy/openapi.json",
        "/entities/v1/openapi.json",
        "/_api/openapi.json",
    ] {
        assert_eq!(
            send(&router, path).await.status(),
            StatusCode::OK,
            "{path} should be served without consulting the provider, which is unreachable here"
        );
    }
}

#[tokio::test]
async fn internal_api_answers_beside_its_reference() {
    let actor = ActorId::new(Uuid::from_u128(1), ActorType::User);
    let apis = apis();
    let documentation = documentation::routes(&apis);
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::Verified(actor),
        StaticAuthenticationProvider::Verified(actor),
    )
    .assemble(Router::new(), apis, documentation);

    let path = format!("{}/caller", internal::PREFIX);
    assert_eq!(
        send(&router, &path).await.status(),
        StatusCode::OK,
        "{path} should answer beside the reference occupying its prefix"
    );
}

#[tokio::test]
async fn documentation_draws_on_address_gate() {
    let apis = apis();
    let documentation = documentation::routes(&apis);
    let router = middleware(
        &config(1, 10),
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Unreachable,
    )
    .assemble(Router::new(), apis, documentation);

    assert_eq!(
        send(&router, "/_api/legacy/openapi.json").await.status(),
        StatusCode::OK,
        "the first document request should pass the gate"
    );
    assert_eq!(
        send(&router, "/entities/v1/openapi.json").await.status(),
        StatusCode::TOO_MANY_REQUESTS,
        "documentation should draw from the address budget like any other request"
    );
}

#[tokio::test]
async fn fallback_answers_problem_document() {
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Unreachable,
    )
    .assemble(Router::new(), apis(), Router::new());

    let response = send(&router, "/does-not-exist").await;
    assert_eq!(
        response.status(),
        StatusCode::NOT_FOUND,
        "an unmatched path should answer 404 without consulting the provider"
    );
    assert_eq!(
        response.headers()[CONTENT_TYPE],
        "application/problem+json",
        "the fallback should answer with a problem document like every other rejection"
    );
    assert_eq!(
        response_json(response).await["status"],
        json!(404),
        "the problem document should carry the response status"
    );
}

#[tokio::test]
async fn fallback_draws_on_address_gate() {
    let router = middleware(
        &config(1, 10),
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Unreachable,
    )
    .assemble(Router::new(), [], Router::new());

    assert_eq!(
        send(&router, "/does-not-exist").await.status(),
        StatusCode::NOT_FOUND,
        "the first unmatched request should pass the gate"
    );
    assert_eq!(
        send(&router, "/does-not-exist").await.status(),
        StatusCode::TOO_MANY_REQUESTS,
        "an unmatched path should draw from the address budget like any other request"
    );
}

#[tokio::test]
async fn method_not_allowed_problem_document() {
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
    )
    .assemble(Router::new(), [test_utils::api("/first")], Router::new());

    let response = send_request(&router, request_with(Method::DELETE, "/first/test")).await;
    assert_eq!(
        response.status(),
        StatusCode::METHOD_NOT_ALLOWED,
        "a path that does not serve the method should answer 405"
    );
    assert_eq!(
        response.headers()[CONTENT_TYPE],
        "application/problem+json",
        "the answer should be a problem document like every other rejection"
    );
    assert_eq!(
        response.headers()[ALLOW],
        "GET,HEAD",
        "the answer should name the methods the path serves"
    );
    assert_eq!(
        response_json(response).await["status"],
        json!(405),
        "the problem document should carry the response status"
    );
}

#[tokio::test]
async fn method_not_allowed_legacy_route() {
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
    )
    .assemble(
        Router::new().route("/legacy", get(async || ())),
        [],
        Router::new(),
    );

    let response = send_request(&router, request_with(Method::DELETE, "/legacy")).await;
    assert_eq!(
        response.status(),
        StatusCode::METHOD_NOT_ALLOWED,
        "a legacy path that does not serve the method should answer 405"
    );
    assert_eq!(
        response.headers()[CONTENT_TYPE],
        "application/problem+json",
        "a legacy route should answer the same problem document as the APIs"
    );
}

#[tokio::test]
async fn apis_and_legacy_share_one_actor_budget() {
    let actor = ActorId::new(Uuid::from_u128(1), ActorType::User);
    let router = middleware(
        &config(10, 2),
        StaticAuthenticationProvider::Verified(actor),
        StaticAuthenticationProvider::Verified(actor),
    )
    .assemble(
        Router::new().route("/legacy", get(async || "ok")),
        [test_utils::api("/first"), test_utils::api("/second")],
        Router::new(),
    );

    assert_eq!(
        send_request(&router, request_from("/first/test", client(1)))
            .await
            .status(),
        StatusCode::OK,
        "an API should serve the actor within the budget"
    );
    assert_eq!(
        send_request(&router, request_from("/second/test", client(2)))
            .await
            .status(),
        StatusCode::OK,
        "the actor's budget should follow the actor across APIs and addresses"
    );
    assert_eq!(
        send_request(&router, request_from("/legacy", client(3)))
            .await
            .status(),
        StatusCode::TOO_MANY_REQUESTS,
        "legacy routes should draw on the budget the APIs exhausted"
    );
}

#[tokio::test]
async fn legacy_bootstrap_route_requires_service_secret() {
    let actor = ActorId::new(Uuid::from_u128(1), ActorType::Machine);
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Verified(actor),
    )
    .assemble(
        Router::new()
            .route("/policies/seed", get(async || "ok"))
            .route("/policies/query", get(async || "ok")),
        [],
        Router::new(),
    );

    assert_eq!(
        send(&router, "/policies/seed").await.status(),
        StatusCode::UNAUTHORIZED,
        "a bootstrap route should reject a request without the service secret"
    );
    assert_eq!(
        send(&router, "/policies/query").await.status(),
        StatusCode::OK,
        "every other legacy route should leave the credential check to the handler"
    );

    let mut request = request_to("/policies/seed");
    request.headers_mut().insert(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("HASH-Service {SERVICE_SECRET}"))
            .expect("the authorization header should be valid"),
    );
    assert_eq!(
        send_request(&router, request).await.status(),
        StatusCode::OK,
        "a bootstrap route should admit the service secret"
    );
}

#[tokio::test]
async fn legacy_routes_use_internal_provider() {
    let actor = ActorId::new(Uuid::from_u128(1), ActorType::User);
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Verified(actor),
    )
    .assemble(
        Router::new().route(
            "/test",
            get(async |AuthenticatedActorId(actor)| echo_caller(Some(actor)).await),
        ),
        [],
        Router::new(),
    );

    let response = send(&router, "/test").await;
    assert_eq!(
        response.status(),
        StatusCode::OK,
        "legacy routes should resolve the caller through the internal provider"
    );
    assert_eq!(
        response_json(response).await,
        json!({"actor": actor}),
        "legacy routes should hand the resolved actor to the handler"
    );
}

use alloc::sync::Arc;
use core::{
    net::{IpAddr, SocketAddr},
    num::NonZeroU32,
};

use axum::{Router, body::Body, extract::ConnectInfo, response::Response, routing::get};
use hash_crypto::Secret;
use hash_middleware::{
    authentication::{
        AuthenticatedActorId, AuthenticationMetrics, provider::StaticAuthenticationProvider,
    },
    problem::{InternalServerError, ServiceUnavailable},
    rate_limit::{ClientIpSource, RateLimitConfig, RateLimitMode, RateLimiters},
};
use http::{
    HeaderValue, Method, Request, StatusCode,
    header::{
        ACCESS_CONTROL_ALLOW_CREDENTIALS, ACCESS_CONTROL_ALLOW_HEADERS,
        ACCESS_CONTROL_ALLOW_ORIGIN, ACCESS_CONTROL_EXPOSE_HEADERS, ACCESS_CONTROL_REQUEST_HEADERS,
        ACCESS_CONTROL_REQUEST_METHOD, ALLOW, AUTHORIZATION, CACHE_CONTROL, CONTENT_TYPE, ORIGIN,
        WWW_AUTHENTICATE,
    },
};
use problematic::Rejected;
use serde_json::json;
use tower::ServiceExt as _;
use type_system::principal::actor::{ActorId, ActorType};
use uuid::Uuid;

use super::Middleware;
use crate::rest::{
    cors::CorsConfig,
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
    legacy_provider: StaticAuthenticationProvider,
) -> Middleware<
    StaticAuthenticationProvider,
    StaticAuthenticationProvider,
    StaticAuthenticationProvider,
> {
    let meter = opentelemetry::global::meter("test");
    Middleware {
        public_provider: Arc::new(public_provider),
        internal_provider: Arc::new(internal_provider),
        legacy_provider: Arc::new(legacy_provider),
        service_secret: Secret::from_string(SERVICE_SECRET.to_owned()).to_arc(),
        authentication_metrics: Arc::new(AuthenticationMetrics::new(&meter)),
        rate_limiters: RateLimiters::start(config, &meter),
        cors: CorsConfig::default(),
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

/// A response the address gate refuses carries the default `Cache-Control` like the one it admits.
#[tokio::test]
async fn cache_control_gate_rejection() {
    let router = middleware(
        &config(1, 10),
        StaticAuthenticationProvider::Verified(ActorId::new(Uuid::from_u128(1), ActorType::User)),
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
    )
    .assemble(Router::new(), [test_utils::api("/first")], Router::new());

    let mut answers = Vec::new();
    for _ in 0..2 {
        let response = send(&router, "/first/test").await;
        answers.push((
            response.status(),
            response.headers().get(CACHE_CONTROL).cloned(),
        ));
    }
    let default = Some(HeaderValue::from_static("private, no-store"));
    assert_eq!(
        answers,
        [
            (StatusCode::OK, default.clone()),
            (StatusCode::TOO_MANY_REQUESTS, default)
        ],
        "both the admitted request and the gate's refusal should carry the default"
    );
}

/// The problem documents for an unknown path and an unserved method carry the default
/// `Cache-Control`.
#[tokio::test]
async fn cache_control_fallback() {
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::Verified(ActorId::new(Uuid::from_u128(1), ActorType::User)),
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
    )
    .assemble(Router::new(), [test_utils::api("/first")], Router::new());

    for (request, status) in [
        (request_to("/does-not-exist"), StatusCode::NOT_FOUND),
        (
            request_with(Method::DELETE, "/first/test"),
            StatusCode::METHOD_NOT_ALLOWED,
        ),
    ] {
        let path = request.uri().path().to_owned();
        let response = send_request(&router, request).await;
        assert_eq!(
            response.status(),
            status,
            "{path} should be answered {status}"
        );
        assert_eq!(
            response.headers().get(CACHE_CONTROL),
            Some(&HeaderValue::from_static("private, no-store")),
            "the {} for {path} should carry the default",
            response.status()
        );
    }
}

/// A route that sets its own `Cache-Control` keeps it.
#[tokio::test]
async fn cache_control_own_value() {
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
    )
    .assemble(
        Router::new().route(
            "/cached",
            get(async || ([(CACHE_CONTROL, "max-age=60")], "ok")),
        ),
        [],
        Router::new(),
    );

    assert_eq!(
        send(&router, "/cached").await.headers()[CACHE_CONTROL],
        "max-age=60",
        "the default should not replace the route's own value"
    );
}

#[tokio::test]
async fn fallback_draws_on_address_gate() {
    let router = middleware(
        &config(1, 10),
        StaticAuthenticationProvider::Unreachable,
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
        StaticAuthenticationProvider::Verified(ActorId::new(Uuid::from_u128(1), ActorType::User)),
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
    assert!(
        response.headers()[ALLOW]
            .to_str()
            .is_ok_and(|allow| allow.split(',').any(|method| method.trim() == "GET")),
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
async fn method_not_allowed_after_authentication() {
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Unreachable,
    )
    .assemble(
        Router::new().route("/legacy", get(async || ())),
        [test_utils::api("/first")],
        Router::new(),
    );

    for path in ["/legacy", "/first/test"] {
        assert_eq!(
            send_request(&router, request_with(Method::DELETE, path))
                .await
                .status(),
            StatusCode::SERVICE_UNAVAILABLE,
            "{path} should authenticate a request before answering that it does not serve its \
             method, and the provider is unreachable here"
        );
    }
}

#[tokio::test]
async fn method_not_allowed_documentation_route() {
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Unreachable,
    )
    .assemble(
        Router::new(),
        [],
        Router::new().route("/reference", get(async || ())),
    );

    let response = send_request(&router, request_with(Method::DELETE, "/reference")).await;
    assert_eq!(
        response.status(),
        StatusCode::METHOD_NOT_ALLOWED,
        "a documentation path that does not serve the method should answer 405"
    );
    assert_eq!(
        response.headers()[CONTENT_TYPE],
        "application/problem+json",
        "a documentation route should answer the same problem document as the APIs"
    );
}

#[tokio::test]
async fn method_not_allowed_draws_on_address_gate() {
    let router = middleware(
        &config(1, 10),
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Unreachable,
    )
    .assemble(
        Router::new(),
        [],
        Router::new().route("/reference", get(async || ())),
    );

    assert_eq!(
        send_request(&router, request_with(Method::DELETE, "/reference"))
            .await
            .status(),
        StatusCode::METHOD_NOT_ALLOWED,
        "the first request with a method the path does not serve should pass the gate"
    );
    assert_eq!(
        send_request(&router, request_with(Method::DELETE, "/reference"))
            .await
            .status(),
        StatusCode::TOO_MANY_REQUESTS,
        "a method the path does not serve should draw from the address budget like any other \
         request"
    );
}

#[tokio::test]
async fn method_not_allowed_draws_on_caller_budget() {
    let router = middleware(
        &config(10, 1),
        StaticAuthenticationProvider::Verified(ActorId::new(Uuid::from_u128(1), ActorType::User)),
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
    )
    .assemble(Router::new(), [test_utils::api("/first")], Router::new());

    assert_eq!(
        send_request(&router, request_with(Method::DELETE, "/first/test"))
            .await
            .status(),
        StatusCode::METHOD_NOT_ALLOWED,
        "the first request with a method the path does not serve should pass the caller budget"
    );
    assert_eq!(
        send_request(&router, request_with(Method::DELETE, "/first/test"))
            .await
            .status(),
        StatusCode::TOO_MANY_REQUESTS,
        "a method the path does not serve should draw from the caller budget like any other \
         request"
    );
}

#[tokio::test]
async fn panic_problem_document() {
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
    )
    .assemble(
        Router::new().route(
            "/legacy",
            get(async || -> StatusCode { panic!("the handler failed") }),
        ),
        [],
        Router::new(),
    );

    let response = send(&router, "/legacy").await;
    assert_eq!(
        response.status(),
        StatusCode::INTERNAL_SERVER_ERROR,
        "a request whose handler panics should answer 500"
    );
    assert_eq!(
        response.headers()[CONTENT_TYPE],
        "application/problem+json",
        "a panic should answer a problem document like every other failure"
    );
    assert_eq!(
        response_json(response).await["detail"],
        json!(InternalServerError.to_string()),
        "the problem document should not describe the panic"
    );
}

/// The entity route reads the store it was handed, and answers `503` when it cannot acquire one.
#[tokio::test]
async fn entity_store_unreachable() {
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::Verified(ActorId::new(Uuid::from_u128(1), ActorType::User)),
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Unreachable,
    )
    .assemble(Router::new(), apis(), Router::new());

    let response = send(
        &router,
        "/entities/v1/8d86c8c3-d66d-43d1-859b-676c3bcaeadc~be2c5b2f-e3e1-4f26-a0c4-0f8b5e9c4a1d",
    )
    .await;
    assert_eq!(
        response.status(),
        StatusCode::SERVICE_UNAVAILABLE,
        "the route should answer 503 when it cannot reach the store"
    );
    assert!(
        response.extensions().get::<Rejected>().is_some(),
        "the 503 should be the route's rejection, which a panic does not leave"
    );
    assert_eq!(
        response_json(response).await["detail"],
        json!(ServiceUnavailable.to_string()),
        "the problem document should not name the store"
    );
}

/// An anonymous request to the entity route is answered `401` before the store is read.
#[tokio::test]
async fn entity_anonymous() {
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Unreachable,
    )
    .assemble(Router::new(), apis(), Router::new());

    let response = send(
        &router,
        "/entities/v1/8d86c8c3-d66d-43d1-859b-676c3bcaeadc~be2c5b2f-e3e1-4f26-a0c4-0f8b5e9c4a1d",
    )
    .await;
    assert_eq!(
        response.status(),
        StatusCode::UNAUTHORIZED,
        "an anonymous request should be answered 401"
    );
}

/// A public API answers a request without a credential with `401` even on a route that reads no
/// caller.
#[tokio::test]
async fn public_api_anonymous() {
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
    )
    .assemble(Router::new(), [test_utils::api("/first")], Router::new());

    let response = send(&router, "/first/test").await;
    assert_eq!(
        response.status(),
        StatusCode::UNAUTHORIZED,
        "an anonymous request should be answered 401"
    );
    assert!(
        response
            .headers()
            .get(WWW_AUTHENTICATE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("Bearer")),
        "the 401 should challenge with `Bearer`"
    );
}

/// The entity route reads no drafts, so a draft's ID is answered `400` before it reads the store.
#[tokio::test]
async fn entity_draft_id() {
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::Verified(ActorId::new(Uuid::from_u128(1), ActorType::User)),
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::Unreachable,
    )
    .assemble(Router::new(), apis(), Router::new());

    let response = send(
        &router,
        "/entities/v1/8d86c8c3-d66d-43d1-859b-676c3bcaeadc~be2c5b2f-e3e1-4f26-a0c4-0f8b5e9c4a1d~\
         3f0c3b6e-5d2a-4c8e-9b1f-7a6d5e4c3b2a",
    )
    .await;
    assert_eq!(
        response.status(),
        StatusCode::BAD_REQUEST,
        "a draft's ID should be answered 400"
    );
    let detail = response_json(response).await["detail"].clone();
    assert!(
        detail
            .as_str()
            .is_some_and(|detail| detail.contains("the entity ID names a draft")),
        "the problem document should say that the ID names a draft, got {detail}"
    );
}

#[tokio::test]
async fn apis_and_legacy_share_one_actor_budget() {
    let actor = ActorId::new(Uuid::from_u128(1), ActorType::User);
    let router = middleware(
        &config(10, 2),
        StaticAuthenticationProvider::Verified(actor),
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
async fn legacy_routes_use_legacy_provider() {
    let actor = ActorId::new(Uuid::from_u128(1), ActorType::User);
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::Unreachable,
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
        "legacy routes should resolve the caller through the legacy provider"
    );
    assert_eq!(
        response_json(response).await,
        json!({"actor": actor}),
        "legacy routes should hand the resolved actor to the handler"
    );
}

/// The service secret passes the caller budget on the legacy routes, which the services holding
/// it call, and on no API.
#[tokio::test]
async fn service_secret_exempt_on_legacy_only() {
    let router = middleware(
        &config(10, 1),
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
    )
    .assemble(
        Router::new().route("/legacy", get(async || "ok")),
        [internal::api()],
        Router::new(),
    );
    let with_secret = |path: &str, peer: IpAddr| {
        let mut request = request_from(path, peer);
        request.headers_mut().insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("HASH-Service {SERVICE_SECRET}"))
                .expect("the authorization header should be valid"),
        );
        request
    };

    for _ in 0..3 {
        assert_eq!(
            send_request(&router, with_secret("/legacy", client(1)))
                .await
                .status(),
            StatusCode::OK,
            "the legacy routes should not charge the service secret"
        );
    }
    let caller = format!("{}/caller", internal::PREFIX);
    let mut statuses = Vec::new();
    for _ in 0..2 {
        statuses.push(
            send_request(&router, with_secret(&caller, client(2)))
                .await
                .status(),
        );
    }
    assert_eq!(
        statuses,
        [StatusCode::OK, StatusCode::TOO_MANY_REQUESTS],
        "the internal API should charge the service secret's presenter like any anonymous caller"
    );
}

#[tokio::test]
async fn legacy_routes_challenge_service() {
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::Unreachable,
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
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
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        response.headers()[WWW_AUTHENTICATE],
        r#"HASH-Service realm="HASH""#,
        "legacy routes should challenge with the service secret"
    );
}

/// Middleware admitting the comma-separated `public` origins to the public APIs and `internal` to
/// the internal API, with an address gate admitting `gate_burst` requests.
fn cors_middleware(
    gate_burst: u32,
    public: &str,
    internal: &str,
) -> Middleware<
    StaticAuthenticationProvider,
    StaticAuthenticationProvider,
    StaticAuthenticationProvider,
> {
    let mut middleware = middleware(
        &config(gate_burst, 10),
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
    );
    middleware.cors = CorsConfig::parse(public, internal).expect("the origins should parse");
    middleware
}

fn with_origin(mut request: Request<Body>, origin: &'static str) -> Request<Body> {
    request
        .headers_mut()
        .insert(ORIGIN, HeaderValue::from_static(origin));
    request
}

fn preflight(path: &str, origin: &'static str) -> Request<Body> {
    let mut request = with_origin(request_with(Method::OPTIONS, path), origin);
    let headers = request.headers_mut();
    headers.insert(
        ACCESS_CONTROL_REQUEST_METHOD,
        HeaderValue::from_static("POST"),
    );
    headers.insert(
        ACCESS_CONTROL_REQUEST_HEADERS,
        HeaderValue::from_static("authorization,content-type"),
    );
    request
}

/// A preflight to a public API is answered ahead of the address gate, authentication and the
/// caller budget.
#[tokio::test]
async fn cors_preflight_public() {
    let router = cors_middleware(1, "https://hash.dev", "https://app.hash.ai").assemble(
        Router::new(),
        apis(),
        Router::new(),
    );

    for path in ["/entities/v1", "/entities/v1/query"] {
        let response = send_request(&router, preflight(path, "https://hash.dev")).await;
        assert_eq!(
            response.status(),
            StatusCode::OK,
            "the preflight to {path} should be answered without credentials"
        );
        assert_eq!(
            response.headers().get(ACCESS_CONTROL_ALLOW_ORIGIN),
            Some(&HeaderValue::from_static("https://hash.dev")),
            "the listed origin should be allowed on {path}"
        );
        assert_eq!(
            response.headers().get(ACCESS_CONTROL_ALLOW_HEADERS),
            Some(&HeaderValue::from_static("authorization,content-type")),
            "the requested headers should be allowed on {path}"
        );
        assert_eq!(
            response.headers().get(ACCESS_CONTROL_ALLOW_CREDENTIALS),
            None,
            "the public APIs should not allow credentials on {path}"
        );
        assert_eq!(
            response.headers().get(CACHE_CONTROL),
            Some(&HeaderValue::from_static("private, no-store")),
            "the preflight to {path} should carry the default cache control"
        );
    }
    assert_eq!(
        send(&router, "/entities/v1/query").await.status(),
        StatusCode::UNAUTHORIZED,
        "the preflight should not have drawn on the address gate"
    );
}

/// The public APIs admit their origins while the internal API has none.
#[tokio::test]
async fn cors_preflight_public_only() {
    let router =
        cors_middleware(10, "https://hash.dev", "").assemble(Router::new(), apis(), Router::new());

    assert_eq!(
        send_request(&router, preflight("/entities/v1/query", "https://hash.dev"))
            .await
            .headers()
            .get(ACCESS_CONTROL_ALLOW_ORIGIN),
        Some(&HeaderValue::from_static("https://hash.dev")),
        "the listed origin should be allowed without internal origins"
    );
}

/// An origin is admitted only by the APIs of its own audience, and nowhere outside the APIs.
#[tokio::test]
async fn cors_preflight_unlisted_origin() {
    let router = cors_middleware(10, "https://hash.dev", "https://app.hash.ai").assemble(
        Router::new(),
        apis(),
        Router::new(),
    );

    for (path, origin) in [
        ("/entities/v1/query", "https://example.com"),
        ("/entities/v1/query", "https://app.hash.ai"),
        ("/_api/caller", "https://hash.dev"),
        ("/_apis", "https://app.hash.ai"),
        ("/", "https://hash.dev"),
    ] {
        assert_eq!(
            send_request(&router, preflight(path, origin))
                .await
                .headers()
                .get(ACCESS_CONTROL_ALLOW_ORIGIN),
            None,
            "{origin} should not be allowed on {path}"
        );
    }
}

/// The internal API admits its origins with credentials.
#[tokio::test]
async fn cors_preflight_internal() {
    let router = cors_middleware(10, "https://hash.dev", "https://app.hash.ai").assemble(
        Router::new(),
        apis(),
        Router::new(),
    );

    let response = send_request(&router, preflight("/_api/caller", "https://app.hash.ai")).await;
    assert_eq!(
        response.headers().get(ACCESS_CONTROL_ALLOW_ORIGIN),
        Some(&HeaderValue::from_static("https://app.hash.ai")),
        "the listed origin should be allowed"
    );
    assert_eq!(
        response.headers().get(ACCESS_CONTROL_ALLOW_CREDENTIALS),
        Some(&HeaderValue::from_static("true")),
        "the internal API should allow credentials"
    );
}

/// Rejections by authentication and by the address gate carry the CORS headers and expose the
/// challenge and rate-limit headers.
#[tokio::test]
async fn cors_rejection_headers() {
    let router = cors_middleware(1, "https://hash.dev", "https://app.hash.ai").assemble(
        Router::new(),
        [test_utils::api("/first")],
        Router::new(),
    );

    for status in [StatusCode::UNAUTHORIZED, StatusCode::TOO_MANY_REQUESTS] {
        let response = send_request(
            &router,
            with_origin(request_to("/first/test"), "https://hash.dev"),
        )
        .await;
        assert_eq!(response.status(), status, "the request should be rejected");
        assert_eq!(
            response.headers().get(ACCESS_CONTROL_ALLOW_ORIGIN),
            Some(&HeaderValue::from_static("https://hash.dev")),
            "the {status} should allow the origin"
        );
        let exposed = response
            .headers()
            .get(ACCESS_CONTROL_EXPOSE_HEADERS)
            .unwrap_or_else(|| panic!("the {status} should carry Access-Control-Expose-Headers"))
            .to_str()
            .expect("the exposed headers should be ASCII");
        for header in [
            "retry-after",
            "www-authenticate",
            "ratelimit",
            "ratelimit-policy",
            "link",
        ] {
            assert!(
                exposed.split(',').any(|name| name.trim() == header),
                "the {status} should expose {header}"
            );
        }
    }
}

/// Without origins, a preflight is answered like any other request.
#[tokio::test]
async fn cors_unconfigured() {
    let router = middleware(
        &config(10, 10),
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
        StaticAuthenticationProvider::NotRecognized,
    )
    .assemble(Router::new(), apis(), Router::new());

    let response = send_request(&router, preflight("/entities/v1/query", "https://hash.dev")).await;
    assert_eq!(
        response.status(),
        StatusCode::UNAUTHORIZED,
        "the preflight should be authenticated like any request"
    );
    assert_eq!(
        response.headers().get(ACCESS_CONTROL_ALLOW_ORIGIN),
        None,
        "no origin should be allowed"
    );
}

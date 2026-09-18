use alloc::sync::Arc;
use core::{
    net::{IpAddr, SocketAddr},
    num::NonZeroU32,
};

use axum::{Router, body::Body, extract::ConnectInfo, routing::get};
use hash_middleware::{
    authentication::{
        AuthenticatedActorId, AuthenticationMetrics, provider::StaticAuthenticationProvider,
    },
    rate_limit::{ClientIpSource, PrincipalRateLimitConfig, RateLimitMode, RateLimiters},
};
use http::{Request, StatusCode};
use serde_json::json;
use tower::ServiceExt as _;
use type_system::principal::actor::{ActorId, ActorType};
use uuid::Uuid;

use super::Middleware;
use crate::rest::{
    documentation, probe,
    rate_limit::RateLimitConfig,
    test_utils::{echo_caller, response_json},
};

const SERVICE_SECRET: &str = "hash-svc-test-secret";

fn non_zero(value: u32) -> NonZeroU32 {
    NonZeroU32::new(value).expect("the value should be non-zero")
}

fn config(burst: u32) -> RateLimitConfig {
    RateLimitConfig {
        rate_limit_mode: RateLimitMode::Enforce,
        client_ip_source: ClientIpSource::ConnectInfo,
        rate_limit_gate_per_second: non_zero(1),
        rate_limit_gate_burst: non_zero(burst),
        rate_limit_anonymous_per_hour: non_zero(1),
        rate_limit_anonymous_burst: non_zero(burst),
        rate_limit_actor_per_hour: non_zero(1),
        rate_limit_actor_burst: non_zero(burst),
    }
}

fn request_to(path: &str, peer: IpAddr) -> Request<Body> {
    let mut request = Request::builder()
        .uri(path)
        .body(Body::empty())
        .expect("the request should build");
    request
        .extensions_mut()
        .insert(ConnectInfo(SocketAddr::new(peer, 4000)));
    request
}

async fn send(router: &Router, request: Request<Body>) -> axum::response::Response {
    router
        .clone()
        .oneshot(request)
        .await
        .expect("the router should respond")
}

#[tokio::test]
async fn assemble_documentation_and_fallback() {
    // Four requests of gate budget: both specifications, then two unmatched paths.
    let meter = opentelemetry::global::meter("test");
    let limiters = RateLimiters::start(
        &(&RateLimitConfig {
            rate_limit_gate_burst: non_zero(4),
            ..config(1)
        })
            .into(),
        &meter,
    );
    let apis = crate::rest::test_utils::apis();
    let documentation = documentation::routes(&apis);
    let middleware = Middleware {
        public_provider: Arc::new(StaticAuthenticationProvider::Unreachable),
        internal_provider: Arc::new(StaticAuthenticationProvider::Unreachable),
        service_secret: Arc::from(SERVICE_SECRET),
        authentication_metrics: Arc::new(AuthenticationMetrics::new(&meter)),
        rate_limiters: limiters,
        meter,
    };
    let router = middleware
        .assemble(
            Router::new().route("/entities", get(async || "ok")),
            apis,
            documentation,
        )
        .merge(probe::router());
    let client: IpAddr = "192.0.2.1".parse().expect("the address should parse");

    assert_eq!(
        send(&router, request_to("/openapi.json", client))
            .await
            .status(),
        StatusCode::OK,
        "a route merged between the layers should skip authentication, which rejects everything \
         here"
    );

    assert_eq!(
        send(&router, request_to("/entities/v1/openapi.json", client))
            .await
            .status(),
        StatusCode::OK,
        "the v1 specification should skip authentication and share the address budget"
    );

    assert_eq!(
        send(&router, request_to("/entities/v1/does-not-exist", client))
            .await
            .status(),
        StatusCode::NOT_FOUND,
        "an unmatched public path should skip authentication and consume one gate request"
    );
    assert_eq!(
        send(&router, request_to("/does-not-exist", client))
            .await
            .status(),
        StatusCode::NOT_FOUND,
        "an unmatched path should answer 404 without reaching authentication"
    );
    assert_eq!(
        send(&router, request_to("/does-not-exist", client))
            .await
            .status(),
        StatusCode::TOO_MANY_REQUESTS,
        "an unmatched path should draw from the address budget like any other request"
    );

    for _ in 0..3 {
        assert_eq!(
            send(&router, request_to("/health", client)).await.status(),
            StatusCode::OK,
            "a probe merged after the gate should stay outside it, whatever the budget holds"
        );
    }
}

#[tokio::test]
async fn assemble_principal_scopes() {
    let meter = opentelemetry::global::meter("test");
    let mut limits = (&config(1)).into();
    let mut module_limits = crate::rest::RateLimits::from(PrincipalRateLimitConfig::from(&limits));
    module_limits.public.entities.anonymous_burst = non_zero(2);
    let apis = crate::rest::apis(&module_limits);
    let budgets = apis
        .iter()
        .map(|api| (api.prefix, api.rate_limits.anonymous_burst.get()))
        .collect::<Vec<_>>();
    limits.rate_limit_gate_burst = non_zero(budgets.iter().map(|(_, burst)| burst + 1).sum());
    let provider = Arc::new(StaticAuthenticationProvider::NotRecognized);
    let middleware = Middleware {
        public_provider: Arc::clone(&provider),
        internal_provider: provider,
        service_secret: Arc::from(SERVICE_SECRET),
        authentication_metrics: Arc::new(AuthenticationMetrics::new(&meter)),
        rate_limiters: RateLimiters::start(&limits, &meter),
        meter,
    };
    let apis = apis.into_iter().map(|mut api| {
        api.router = Router::new().route(&format!("{}/test", api.prefix), get(async || "ok"));
        api
    });
    let router = middleware.assemble(Router::new(), apis, Router::new());
    let client: IpAddr = "192.0.2.1".parse().expect("the address should parse");
    for (prefix, burst) in budgets {
        let path = format!("{prefix}/test");
        for _ in 0..burst {
            assert_eq!(
                send(&router, request_to(&path, client)).await.status(),
                StatusCode::OK,
                "{prefix} should have its own configured principal budget"
            );
        }
        assert_eq!(
            send(&router, request_to(&path, client)).await.status(),
            StatusCode::TOO_MANY_REQUESTS
        );
    }
    assert_eq!(
        send(&router, request_to("/does-not-exist", client))
            .await
            .status(),
        StatusCode::TOO_MANY_REQUESTS,
        "each module request should consume exactly one request from the shared address budget"
    );
}

#[tokio::test]
async fn assemble_legacy_provider() {
    let actor = ActorId::new(Uuid::from_u128(1), ActorType::User);
    let meter = opentelemetry::global::meter("test");
    let middleware = Middleware {
        public_provider: Arc::new(StaticAuthenticationProvider::Unreachable),
        internal_provider: Arc::new(StaticAuthenticationProvider::Verified(actor)),
        service_secret: Arc::from(SERVICE_SECRET),
        authentication_metrics: Arc::new(AuthenticationMetrics::new(&meter)),
        rate_limiters: RateLimiters::start(&(&config(1)).into(), &meter),
        meter,
    };
    let router = middleware.assemble(
        Router::new().route(
            "/test",
            get(async |AuthenticatedActorId(actor)| echo_caller(Some(actor)).await),
        ),
        [],
        Router::new(),
    );
    let client = "192.0.2.1".parse().expect("the address should parse");
    let response = send(&router, request_to("/test", client)).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response_json(response).await, json!({"actor": actor}));
}

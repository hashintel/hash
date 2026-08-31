//! Tests for the rate-limiting middlewares.

use alloc::sync::Arc;
use core::{
    net::{IpAddr, Ipv4Addr, SocketAddr},
    sync::atomic::{AtomicUsize, Ordering},
};

use axum::{
    Router, body::Body, extract::ConnectInfo, middleware, response::Response, routing::get,
};
use error_stack::Report;
use http::{Request, StatusCode};
use tower::ServiceExt as _;
use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};
use uuid::Uuid;

use super::{
    ClientIpSource, RateLimitConfig, RateLimitMode, RateLimiters, ip_gate_middleware,
    principal_limit_middleware,
};
use crate::{
    authentication::{
        AuthenticationMetrics, ResolvedAuthentication, authentication_middleware,
        provider::StaticAuthenticationProvider, request::AuthenticationError,
    },
    test_metrics::{RecordedMetrics, noop_meter},
};

const SERVICE_SECRET: &str = "hash-svc-test-secret";

fn non_zero(value: u32) -> core::num::NonZeroU32 {
    core::num::NonZeroU32::new(value).expect("the value should be non-zero")
}

fn auth_metrics() -> Arc<AuthenticationMetrics> {
    Arc::new(AuthenticationMetrics::new(&noop_meter()))
}

fn limiters(config: &RateLimitConfig) -> Arc<RateLimiters> {
    RateLimiters::start(config, &noop_meter())
}

/// A configuration that exercises only the burst: budgets refill once per hour, the gate once per
/// second, and denials are enforced so a test can read them off the status code.
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

fn gate_router_with(limiters: &Arc<RateLimiters>) -> Router {
    let limiters = Arc::clone(limiters);
    let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
    Router::new()
        .route("/entities", get(async || "ok"))
        .route_layer(middleware::from_fn(move |request, next| {
            ip_gate_middleware(
                Arc::clone(&limiters),
                Arc::clone(&service_secret),
                request,
                next,
            )
        }))
}

fn gate_router(config: &RateLimitConfig) -> Router {
    gate_router_with(&limiters(config))
}

fn principal_router(config: &RateLimitConfig) -> Router {
    principal_router_with(&limiters(config))
}

fn principal_router_with(limiters: &Arc<RateLimiters>) -> Router {
    let limiters = Arc::clone(limiters);
    let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
    Router::new()
        .route("/entities", get(async || "ok"))
        .route_layer(middleware::from_fn(move |request, next| {
            principal_limit_middleware(
                Arc::clone(&limiters),
                Arc::clone(&service_secret),
                request,
                next,
            )
        }))
}

/// Stacks the three request middlewares in the order a REST router wires them.
fn full_stack_router(config: &RateLimitConfig, provider: StaticAuthenticationProvider) -> Router {
    full_stack_router_with(&limiters(config), provider)
}

fn full_stack_router_with(
    limiters: &Arc<RateLimiters>,
    provider: StaticAuthenticationProvider,
) -> Router {
    let limiters = Arc::clone(limiters);
    let provider = Arc::new(provider);
    let metrics = auth_metrics();
    let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
    let gate_limiters = Arc::clone(&limiters);
    let gate_secret = Arc::clone(&service_secret);
    let principal_secret = Arc::clone(&service_secret);
    Router::new()
        .route("/entities", get(async || "ok"))
        .route_layer(middleware::from_fn(move |request, next| {
            principal_limit_middleware(
                Arc::clone(&limiters),
                Arc::clone(&principal_secret),
                request,
                next,
            )
        }))
        .route_layer(middleware::from_fn(move |request, next| {
            let provider = Arc::clone(&provider);
            let service_secret = Arc::clone(&service_secret);
            let metrics = Arc::clone(&metrics);
            authentication_middleware::<_, Option<ActorId>>(
                provider,
                service_secret,
                metrics,
                |_path| false,
                request,
                next,
            )
        }))
        .route_layer(middleware::from_fn(move |request, next| {
            ip_gate_middleware(
                Arc::clone(&gate_limiters),
                Arc::clone(&gate_secret),
                request,
                next,
            )
        }))
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

fn request(peer: IpAddr) -> Request<Body> {
    request_to("/entities", peer)
}

/// A request as a router served without connect info produces.
fn request_without_peer() -> Request<Body> {
    Request::builder()
        .uri("/entities")
        .body(Body::empty())
        .expect("the request should build")
}

fn forwarded_request(peer: IpAddr, header: &'static str, value: &str) -> Request<Body> {
    let mut request = request(peer);
    request
        .headers_mut()
        .insert(header, value.parse().expect("the header should parse"));
    request
}

fn with_credential(mut request: Request<Body>, credential: &str) -> Request<Body> {
    request.headers_mut().insert(
        "authorization",
        credential.parse().expect("the header should parse"),
    );
    request
}

fn credentialed_request(peer: IpAddr, credential: &str) -> Request<Body> {
    with_credential(request(peer), credential)
}

fn anonymous_request(peer: IpAddr) -> Request<Body> {
    let mut request = request(peer);
    request
        .extensions_mut()
        .insert(ResolvedAuthentication::new(Ok(None), auth_metrics()));
    request
}

fn actor_request(actor_id: ActorId) -> Request<Body> {
    let mut request = request(IpAddr::V4(Ipv4Addr::LOCALHOST));
    request.extensions_mut().insert(ResolvedAuthentication::new(
        Ok(Some(actor_id)),
        auth_metrics(),
    ));
    request
}

fn random_actor() -> ActorId {
    ActorId::User(UserId::new(ActorEntityUuid::new(Uuid::new_v4())))
}

fn address(value: &str) -> IpAddr {
    value.parse().expect("the address should parse")
}

fn header(response: &Response, name: &str) -> Option<String> {
    response.headers().get(name).map(|value| {
        value
            .to_str()
            .expect("the header should be ASCII")
            .to_owned()
    })
}

async fn send(router: &Router, request: Request<Body>) -> Response {
    router
        .clone()
        .oneshot(request)
        .await
        .expect("the router should respond")
}

#[tokio::test]
async fn gate_denies_past_its_burst() {
    let router = gate_router(&config(1));
    let client = address("192.0.2.1");

    let admitted = send(&router, request(client)).await;
    assert_eq!(admitted.status(), StatusCode::OK);

    let denied = send(&router, request(client)).await;
    assert_eq!(denied.status(), StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(
        header(&denied, "retry-after"),
        Some("1".to_owned()),
        "a sub-second wait should round up, never telling a client to retry immediately"
    );

    assert_eq!(
        send(&router, request(address("192.0.2.2"))).await.status(),
        StatusCode::OK,
        "exhausting one address should not spend another's budget"
    );
}

#[tokio::test]
async fn forwarded_header_keys_the_budget_rather_than_the_connection() {
    let router = gate_router(&RateLimitConfig {
        client_ip_source: ClientIpSource::CfConnectingIp,
        ..config(1)
    });
    let proxy = address("192.0.2.1");

    for client in ["203.0.113.1", "203.0.113.2"] {
        let response = send(
            &router,
            forwarded_request(proxy, "cf-connecting-ip", client),
        )
        .await;
        assert_eq!(
            response.status(),
            StatusCode::OK,
            "two clients behind one proxy should hold separate budgets"
        );
    }

    let repeat = send(
        &router,
        forwarded_request(address("198.51.100.9"), "cf-connecting-ip", "203.0.113.1"),
    )
    .await;
    assert_eq!(
        repeat.status(),
        StatusCode::TOO_MANY_REQUESTS,
        "one client reaching through a second proxy should keep drawing from its own budget"
    );
}

/// Reading the connection is the default, so a client must not be able to pick its own budget by
/// sending a forwarded header the deployment never asked for.
#[tokio::test]
async fn connection_source_ignores_a_forwarded_header() {
    let router = gate_router(&config(1));
    let peer = address("192.0.2.1");

    assert_eq!(
        send(
            &router,
            forwarded_request(peer, "x-forwarded-for", "203.0.113.1")
        )
        .await
        .status(),
        StatusCode::OK
    );

    assert_eq!(
        send(
            &router,
            forwarded_request(peer, "x-forwarded-for", "203.0.113.2")
        )
        .await
        .status(),
        StatusCode::TOO_MANY_REQUESTS,
        "a second forwarded address should not mint a fresh budget for the same connection"
    );
}

#[tokio::test]
async fn unusable_forwarded_header_keys_on_the_connection() {
    let router = gate_router(&RateLimitConfig {
        client_ip_source: ClientIpSource::XForwardedFor,
        ..config(1)
    });
    let peer = address("192.0.2.1");

    let admitted = send(
        &router,
        forwarded_request(peer, "x-forwarded-for", "unknown"),
    )
    .await;
    assert_eq!(admitted.status(), StatusCode::OK);

    let denied = send(&router, request(peer)).await;
    assert_eq!(
        denied.status(),
        StatusCode::TOO_MANY_REQUESTS,
        "a garbage header should not mint a budget the missing header would not have"
    );
}

#[tokio::test]
async fn requests_without_a_connection_address_pass_unchecked() {
    let router = gate_router(&config(1));

    for _ in 0..3 {
        let response = send(&router, request_without_peer()).await;
        assert_eq!(
            response.status(),
            StatusCode::OK,
            "with nothing to key a budget by, the limiter has to admit rather than deny"
        );
    }
}

#[tokio::test]
async fn service_secret_bypasses_both_middlewares() {
    let router = full_stack_router(&config(1), StaticAuthenticationProvider::NotRecognized);
    let client = address("192.0.2.1");

    for _ in 0..4 {
        let response = send(
            &router,
            credentialed_request(client, &format!("HASH-Service {SERVICE_SECRET}")),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
    }
}

#[tokio::test]
async fn gate_rejects_the_scheme_without_the_secret() {
    let router = gate_router(&config(1));
    let client = address("192.0.2.1");

    let mut statuses = Vec::new();
    for _ in 0..2 {
        let response = send(
            &router,
            credentialed_request(client, "HASH-Service hash-svc-wrong"),
        )
        .await;
        statuses.push(response.status());
    }
    assert_eq!(
        statuses,
        [StatusCode::OK, StatusCode::TOO_MANY_REQUESTS],
        "the gate should verify the secret rather than trust the scheme"
    );
}

#[tokio::test]
async fn actor_budget_rejects_the_scheme_without_the_secret() {
    let router = principal_router(&config(1));
    let actor = random_actor();

    let mut statuses = Vec::new();
    for _ in 0..2 {
        let credentialed = with_credential(actor_request(actor), "HASH-Service hash-svc-wrong");
        statuses.push(send(&router, credentialed).await.status());
    }
    assert_eq!(
        statuses,
        [StatusCode::OK, StatusCode::TOO_MANY_REQUESTS],
        "the principal limiter should verify the secret rather than trust the scheme"
    );
}

#[tokio::test]
async fn actors_hold_one_budget_across_addresses() {
    let router = principal_router(&config(1));
    let actor = random_actor();

    assert_eq!(
        send(&router, actor_request(actor)).await.status(),
        StatusCode::OK
    );
    assert_eq!(
        send(&router, actor_request(actor)).await.status(),
        StatusCode::TOO_MANY_REQUESTS
    );
    assert_eq!(
        send(&router, actor_request(random_actor())).await.status(),
        StatusCode::OK,
        "another actor should draw from its own budget"
    );
}

/// The anonymous budget is keyed by the address the gate resolved, so this needs the full stack.
#[tokio::test]
async fn anonymous_requests_draw_from_their_address_budget() {
    let router = full_stack_router(
        &RateLimitConfig {
            rate_limit_gate_burst: non_zero(10),
            ..config(1)
        },
        StaticAuthenticationProvider::NotRecognized,
    );
    let client = address("192.0.2.1");

    assert_eq!(
        send(&router, request(client)).await.status(),
        StatusCode::OK
    );
    assert_eq!(
        send(&router, request(client)).await.status(),
        StatusCode::TOO_MANY_REQUESTS
    );
    assert_eq!(
        send(&router, request(address("192.0.2.2"))).await.status(),
        StatusCode::OK,
        "another address should draw from its own budget"
    );
}

#[tokio::test]
async fn route_without_authentication_fails_loudly() {
    let recorded = RecordedMetrics::new();
    let router = principal_router_with(&RateLimiters::start(&config(1), &recorded.meter()));

    let response = send(&router, request(IpAddr::V4(Ipv4Addr::LOCALHOST))).await;
    assert_eq!(
        response.status(),
        StatusCode::INTERNAL_SERVER_ERROR,
        "a wiring mistake should fail loudly rather than skip the budget"
    );
    assert_eq!(
        recorded.counter(
            "hash.rate_limit.misconfigurations",
            &[("reason", "missing_authentication")],
        ),
        1,
        "the missing authentication middleware should be counted"
    );
}

#[tokio::test]
async fn route_without_the_address_gate_fails_loudly() {
    let recorded = RecordedMetrics::new();
    let router = principal_router_with(&RateLimiters::start(&config(1), &recorded.meter()));

    let response = send(&router, anonymous_request(address("192.0.2.1"))).await;
    assert_eq!(
        response.status(),
        StatusCode::INTERNAL_SERVER_ERROR,
        "an anonymous request should not be budgeted where the gate never resolved an address"
    );
    assert_eq!(
        recorded.counter(
            "hash.rate_limit.misconfigurations",
            &[("reason", "missing_address_gate")],
        ),
        1,
        "the missing address gate should be counted"
    );
}

/// Which budget denied is read off the decisions metric, since a response names no budget.
#[tokio::test]
async fn gate_runs_ahead_of_authentication() {
    let recorded = RecordedMetrics::new();
    let limiters = RateLimiters::start(
        &RateLimitConfig {
            rate_limit_anonymous_burst: non_zero(10),
            ..config(1)
        },
        &recorded.meter(),
    );
    let router = full_stack_router_with(&limiters, StaticAuthenticationProvider::NotRecognized);
    let client = address("192.0.2.1");

    assert_eq!(
        send(&router, request(client)).await.status(),
        StatusCode::OK
    );
    assert_eq!(
        send(&router, request(client)).await.status(),
        StatusCode::TOO_MANY_REQUESTS
    );

    assert_eq!(
        recorded.counter(
            "hash.rate_limit.decisions",
            &[("limiter", "gate"), ("outcome", "denied")],
        ),
        1,
        "the gate should deny before the anonymous budget of 10 is consulted"
    );
    assert_eq!(
        recorded.counter(
            "hash.rate_limit.decisions",
            &[("limiter", "anonymous"), ("outcome", "denied")],
        ),
        0,
        "the anonymous budget should never have denied"
    );
}

#[tokio::test]
async fn authentication_feeds_the_actor_budget() {
    let recorded = RecordedMetrics::new();
    let limiters = RateLimiters::start(
        &RateLimitConfig {
            rate_limit_gate_burst: non_zero(10),
            rate_limit_anonymous_burst: non_zero(10),
            ..config(1)
        },
        &recorded.meter(),
    );
    let router = full_stack_router_with(
        &limiters,
        StaticAuthenticationProvider::Verified(random_actor()),
    );
    let client = address("192.0.2.1");

    assert_eq!(
        send(&router, request(client)).await.status(),
        StatusCode::OK
    );
    assert_eq!(
        send(&router, request(client)).await.status(),
        StatusCode::TOO_MANY_REQUESTS
    );

    assert_eq!(
        recorded.counter(
            "hash.rate_limit.decisions",
            &[("limiter", "actor"), ("outcome", "denied")],
        ),
        1,
        "a verified actor should be charged against the actor budget"
    );
    for limiter in ["gate", "anonymous"] {
        assert_eq!(
            recorded.counter(
                "hash.rate_limit.decisions",
                &[("limiter", limiter), ("outcome", "denied")],
            ),
            0,
            "the {limiter} budget should not have denied at a burst of 10"
        );
    }
}

#[tokio::test]
async fn observing_serves_the_request_and_reports_nothing_to_the_client() {
    let recorded = RecordedMetrics::new();
    let limiters = RateLimiters::start(
        &RateLimitConfig {
            rate_limit_mode: RateLimitMode::Observe,
            ..config(1)
        },
        &recorded.meter(),
    );
    let router = full_stack_router_with(&limiters, StaticAuthenticationProvider::NotRecognized);
    let client = address("192.0.2.1");

    assert_eq!(
        send(&router, request(client)).await.status(),
        StatusCode::OK
    );

    let over_budget = send(&router, request(client)).await;
    assert_eq!(
        over_budget.status(),
        StatusCode::OK,
        "observing should record the denial without applying it"
    );
    assert_eq!(
        header(&over_budget, "retry-after"),
        None,
        "a served request should not tell a client to wait for something it already got"
    );

    assert_eq!(
        recorded.counter(
            "hash.rate_limit.decisions",
            &[("limiter", "gate"), ("outcome", "would_deny")],
        ),
        1,
        "the denial should be recorded as `would_deny` even where it is not applied"
    );
    assert_eq!(
        recorded.counter(
            "hash.rate_limit.decisions",
            &[("limiter", "anonymous"), ("outcome", "would_deny")],
        ),
        1,
        "observing should keep charging the budgets behind the one that was crossed, so the \
         metric shows what enforcement would have done at each"
    );
}

/// A rejected credential and an exhausted gate answer differently, so the order they run in is
/// observable from the status code alone.
#[tokio::test]
async fn gate_denies_without_consulting_the_provider() {
    let router = full_stack_router(&config(1), StaticAuthenticationProvider::Unreachable);
    let client = address("192.0.2.1");

    assert_eq!(
        send(&router, request(client)).await.status(),
        StatusCode::SERVICE_UNAVAILABLE,
        "the provider should have its say while the gate still holds budget"
    );

    assert_eq!(
        send(&router, request(client)).await.status(),
        StatusCode::TOO_MANY_REQUESTS,
        "an exhausted gate should answer before a credential reaches the identity provider"
    );
}

/// Only the innermost service can tell whether an enforced denial reached it.
#[tokio::test]
async fn enforced_denials_skip_the_inner_stack() {
    let reached = Arc::new(AtomicUsize::new(0));
    let handler_reached = Arc::clone(&reached);
    // The anonymous budget has headroom, so only the gate denies. Were the inner stack awaited
    // before the denial answered, the handler would run and be counted.
    let limiters = limiters(&RateLimitConfig {
        rate_limit_anonymous_burst: non_zero(10),
        ..config(1)
    });
    let provider = Arc::new(StaticAuthenticationProvider::NotRecognized);
    let metrics = auth_metrics();
    let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
    let gate_limiters = Arc::clone(&limiters);
    let gate_secret = Arc::clone(&service_secret);
    let principal_secret = Arc::clone(&service_secret);
    let router = Router::new()
        .route(
            "/entities",
            get(async move || {
                handler_reached.fetch_add(1, Ordering::Relaxed);
                "ok"
            }),
        )
        .route_layer(middleware::from_fn(move |request, next| {
            principal_limit_middleware(
                Arc::clone(&limiters),
                Arc::clone(&principal_secret),
                request,
                next,
            )
        }))
        .route_layer(middleware::from_fn(move |request, next| {
            let provider = Arc::clone(&provider);
            let service_secret = Arc::clone(&service_secret);
            let metrics = Arc::clone(&metrics);
            authentication_middleware::<_, Option<ActorId>>(
                provider,
                service_secret,
                metrics,
                |_path| false,
                request,
                next,
            )
        }))
        .route_layer(middleware::from_fn(move |request, next| {
            ip_gate_middleware(
                Arc::clone(&gate_limiters),
                Arc::clone(&gate_secret),
                request,
                next,
            )
        }));
    let client = address("192.0.2.1");

    assert_eq!(
        send(&router, request(client)).await.status(),
        StatusCode::OK
    );
    assert_eq!(
        reached.load(Ordering::Relaxed),
        1,
        "the admitted request should reach the handler"
    );

    assert_eq!(
        send(&router, request(client)).await.status(),
        StatusCode::TOO_MANY_REQUESTS
    );
    assert_eq!(
        reached.load(Ordering::Relaxed),
        1,
        "a denied request should shed load rather than pay for the work it is refused"
    );
}

#[tokio::test]
async fn authentication_error_fails_loudly() {
    let recorded = RecordedMetrics::new();
    let router = principal_router_with(&RateLimiters::start(&config(1), &recorded.meter()));

    let mut request = request(IpAddr::V4(Ipv4Addr::LOCALHOST));
    request.extensions_mut().insert(ResolvedAuthentication::new(
        Err(Arc::new(Report::new(
            AuthenticationError::MissingDelegatedActor,
        ))),
        auth_metrics(),
    ));

    assert_eq!(
        send(&router, request).await.status(),
        StatusCode::INTERNAL_SERVER_ERROR,
        "an unrejected authentication error should fail loudly rather than skip the budget"
    );
    assert_eq!(
        recorded.counter(
            "hash.rate_limit.misconfigurations",
            &[("reason", "unrejected_authentication_error")],
        ),
        1,
        "the unrejected authentication error should be counted"
    );
}

#[tokio::test]
async fn unknown_addresses_count_once_per_stage() {
    let recorded = RecordedMetrics::new();
    let limiters = RateLimiters::start(&config(1), &recorded.meter());
    let router = full_stack_router_with(&limiters, StaticAuthenticationProvider::NotRecognized);

    assert_eq!(
        send(&router, request_without_peer()).await.status(),
        StatusCode::OK
    );

    for stage in ["gate", "principal"] {
        assert_eq!(
            recorded.counter(
                "hash.rate_limit.unchecked",
                &[("stage", stage), ("reason", "unknown_address")],
            ),
            1,
            "the request should count as unchecked at the {stage} stage"
        );
    }
}

#[tokio::test]
async fn service_secret_passes_count_as_unchecked_at_each_stage() {
    let recorded = RecordedMetrics::new();
    let limiters = RateLimiters::start(&config(1), &recorded.meter());
    let router = full_stack_router_with(&limiters, StaticAuthenticationProvider::NotRecognized);

    let response = send(
        &router,
        credentialed_request(
            address("192.0.2.1"),
            &format!("HASH-Service {SERVICE_SECRET}"),
        ),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);

    for stage in ["gate", "principal"] {
        assert_eq!(
            recorded.counter(
                "hash.rate_limit.unchecked",
                &[("stage", stage), ("reason", "service_secret")],
            ),
            1,
            "the secret-bearing request should count as unchecked at the {stage} stage"
        );
    }
}

#[tokio::test]
async fn denials_and_fallbacks_reach_the_meter() {
    let recorded = RecordedMetrics::new();
    let limiters = RateLimiters::start(
        &RateLimitConfig {
            client_ip_source: ClientIpSource::XForwardedFor,
            ..config(1)
        },
        &recorded.meter(),
    );
    let router = gate_router_with(&limiters);
    let peer = address("192.0.2.1");

    for _ in 0..2 {
        send(
            &router,
            forwarded_request(peer, "x-forwarded-for", "unknown"),
        )
        .await;
    }

    assert_eq!(
        recorded.counter(
            "hash.rate_limit.decisions",
            &[("limiter", "gate"), ("outcome", "allowed")],
        ),
        1,
        "the first of two requests over a burst of one should count as allowed"
    );
    assert_eq!(
        recorded.counter(
            "hash.rate_limit.decisions",
            &[("limiter", "gate"), ("outcome", "denied")],
        ),
        1,
        "the second of two requests over a burst of one should count as denied"
    );
    assert_eq!(
        recorded.histogram_count(
            "hash.rate_limit.denial_wait",
            &[("limiter", "gate"), ("outcome", "denied")],
        ),
        1,
        "the denial should record its wait time"
    );
    let wait = recorded.histogram_sum(
        "hash.rate_limit.denial_wait",
        &[("limiter", "gate"), ("outcome", "denied")],
    );
    assert!(
        wait > 0.0 && wait <= 1.0,
        "a per-second budget's wait should be recorded in seconds, got {wait}"
    );
    assert_eq!(
        recorded.counter(
            "hash.rate_limit.address_fallbacks",
            &[("reason", "unparsable")],
        ),
        2,
        "both unusable headers should be counted"
    );

    send(&router, request(address("192.0.2.2"))).await;
    assert_eq!(
        recorded.counter(
            "hash.rate_limit.address_fallbacks",
            &[("reason", "header_missing")],
        ),
        1,
        "the absent header should be counted"
    );
    let mut binary = request(address("192.0.2.3"));
    binary.headers_mut().insert(
        "x-forwarded-for",
        http::HeaderValue::from_bytes(b"\xff").expect("the header should hold arbitrary bytes"),
    );
    send(&router, binary).await;
    assert_eq!(
        recorded.counter(
            "hash.rate_limit.address_fallbacks",
            &[("reason", "header_not_ascii")],
        ),
        1,
        "the undecodable header should be counted"
    );

    assert_eq!(
        recorded.counter_attribute_keys("hash.rate_limit.decisions"),
        ["limiter".to_owned(), "outcome".to_owned()].into(),
        "an added label would fan the decisions series out per value, so the key set is pinned"
    );
}

/// The mode gauge is what keeps a `denied` alert honest: it names the mode whose outcome the
/// decisions metric carries.
#[tokio::test]
async fn mode_gauge_names_the_configured_mode() {
    let recorded = RecordedMetrics::new();
    let _limiters = RateLimiters::start(
        &RateLimitConfig {
            rate_limit_mode: RateLimitMode::Observe,
            ..config(1)
        },
        &recorded.meter(),
    );

    assert_eq!(
        recorded.gauge("hash.rate_limit.mode", &[("mode", "observe")]),
        Some(1),
        "the gauge should stand at one for the configured mode"
    );
}

#[tokio::test]
async fn tracked_keys_gauge_reads_the_stores() {
    let recorded = RecordedMetrics::new();
    let limiters = RateLimiters::start(&config(1), &recorded.meter());
    let router = gate_router_with(&limiters);

    assert_eq!(
        send(&router, request(address("192.0.2.1"))).await.status(),
        StatusCode::OK
    );

    for (limiter, keys) in [("gate", 1), ("anonymous", 0), ("actor", 0)] {
        assert_eq!(
            recorded.gauge("hash.rate_limit.tracked_keys", &[("limiter", limiter)]),
            Some(keys),
            "the {limiter} store should be observed at {keys} keys"
        );
    }
}

/// The gauge callback and the maintenance task must not keep the state alive.
///
/// A strong capture would leak the key stores for the process lifetime and keep the maintenance
/// task running forever, since the meter provider holds the callback until it shuts down.
#[tokio::test]
async fn started_state_drops_once_its_last_holder_does() {
    let recorded = RecordedMetrics::new();
    let limiters = RateLimiters::start(&config(1), &recorded.meter());
    let weak = Arc::downgrade(&limiters);

    drop(limiters);

    assert!(
        weak.upgrade().is_none(),
        "the gauge callback and the maintenance task should hold the state weakly"
    );
}

#[tokio::test(start_paused = true)]
async fn maintenance_runs_on_its_interval() {
    let limiters = limiters(&RateLimitConfig {
        rate_limit_gate_per_second: non_zero(u32::MAX),
        ..config(1)
    });
    let router = gate_router_with(&limiters);

    send(&router, request(address("192.0.2.1"))).await;
    assert_eq!(
        limiters.tracked_keys(),
        1,
        "the request should have left a key behind"
    );

    tokio::time::sleep(super::MAINTENANCE_INTERVAL + core::time::Duration::from_secs(1)).await;
    assert_eq!(
        limiters.tracked_keys(),
        0,
        "the started maintenance should release keys without anyone calling it"
    );
}

#[tokio::test]
async fn admitted_requests_carry_no_budget_headers() {
    let router = principal_router(&config(3));

    let response = send(&router, actor_request(random_actor())).await;
    assert_eq!(response.status(), StatusCode::OK);
    for name in ["retry-after", "ratelimit-limit", "ratelimit-remaining"] {
        assert_eq!(
            header(&response, name),
            None,
            "an admitted request should carry no rate-limit field, standardised or not"
        );
    }
}

/// Populates all three stores, so a maintenance run that forgets one is caught.
#[tokio::test]
async fn maintenance_releases_replenished_keys_from_every_store() {
    // The largest rates the type holds, so every key is releasable by the time maintenance runs.
    let quotas = RateLimitConfig {
        rate_limit_gate_per_second: non_zero(u32::MAX),
        rate_limit_anonymous_per_hour: non_zero(u32::MAX),
        rate_limit_actor_per_hour: non_zero(u32::MAX),
        ..config(1)
    };
    let recorded = RecordedMetrics::new();
    let limiters = RateLimiters::start(&quotas, &recorded.meter());
    let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
    let gate_limiters = Arc::clone(&limiters);
    let gate_secret = Arc::clone(&service_secret);
    let principal_limiters = Arc::clone(&limiters);
    let router = Router::new()
        .route("/entities", get(async || "ok"))
        .route_layer(middleware::from_fn(move |request, next| {
            principal_limit_middleware(
                Arc::clone(&principal_limiters),
                Arc::clone(&service_secret),
                request,
                next,
            )
        }))
        .route_layer(middleware::from_fn(move |request, next| {
            ip_gate_middleware(
                Arc::clone(&gate_limiters),
                Arc::clone(&gate_secret),
                request,
                next,
            )
        }));

    let client = address("192.0.2.1");
    assert_eq!(
        send(&router, anonymous_request(client)).await.status(),
        StatusCode::OK
    );

    let mut authenticated = request(client);
    authenticated
        .extensions_mut()
        .insert(ResolvedAuthentication::new(
            Ok(Some(random_actor())),
            auth_metrics(),
        ));
    assert_eq!(send(&router, authenticated).await.status(), StatusCode::OK);

    assert_eq!(
        limiters.tracked_keys(),
        3,
        "one gate key shared by both requests, plus one anonymous and one actor key"
    );

    limiters.maintain();
    assert_eq!(
        limiters.tracked_keys(),
        0,
        "eviction is the only thing releasing keys, so every store has to be maintained"
    );
    assert!(
        recorded.counter("hash.rate_limit.maintenance_runs", &[]) >= 1,
        "the run should count itself"
    );
    for limiter in ["gate", "anonymous", "actor"] {
        assert_eq!(
            recorded.counter("hash.rate_limit.evicted_keys", &[("limiter", limiter)]),
            1,
            "the released {limiter} key should be counted"
        );
    }
}

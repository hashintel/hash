//! The graph's rate-limit configuration over [`hash_middleware`]'s limiters.
//!
//! The middlewares and limiter state come from [`hash_middleware::rate_limit`] and are re-exported
//! here. This module adds the deployment surface: the clap arguments carrying the
//! `HASH_GRAPH_*` rate-limit environment variables and their defaults.

use core::num::NonZeroU32;

pub use hash_middleware::rate_limit::{
    ClientIpSource, RateLimitMode, RateLimiters, ip_gate_middleware, principal_limit_middleware,
};

/// Configuration for the request rate limits.
///
/// The address gate takes a per-second rate, the principal budgets take per-hour rates; each
/// pairs with a burst allowance naming how many requests a fresh key may send at once.
#[derive(Debug, Clone)]
#[cfg_attr(feature = "clap", derive(clap::Args))]
pub struct RateLimitConfig {
    /// Whether a request over its budget is denied or served.
    #[cfg_attr(
        feature = "clap",
        clap(long, env = "HASH_GRAPH_RATE_LIMIT_MODE", default_value_t, value_enum)
    )]
    pub rate_limit_mode: RateLimitMode,

    /// Where the client address of a request is read from.
    ///
    /// A forwarded header is trustworthy only where a proxy owns the entry that is read; on
    /// traffic reaching the service directly, it lets a client pick its own budget. Reading from
    /// the connection instead keys every caller behind a proxy into one shared budget.
    #[cfg_attr(
        feature = "clap",
        clap(long, env = "HASH_GRAPH_CLIENT_IP_SOURCE", default_value_t, value_enum)
    )]
    pub client_ip_source: ClientIpSource,

    /// Sustained requests per second each client address may send ahead of authentication.
    ///
    /// IPv6 addresses share a budget per /64 prefix, here and for the anonymous budget.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            env = "HASH_GRAPH_RATE_LIMIT_GATE_PER_SECOND",
            default_value = "10"
        )
    )]
    pub rate_limit_gate_per_second: NonZeroU32,

    /// Requests a fresh client address may send at once ahead of authentication.
    #[cfg_attr(
        feature = "clap",
        clap(long, env = "HASH_GRAPH_RATE_LIMIT_GATE_BURST", default_value = "50")
    )]
    pub rate_limit_gate_burst: NonZeroU32,

    /// Sustained requests per hour each client address may send anonymously.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            env = "HASH_GRAPH_RATE_LIMIT_ANONYMOUS_PER_HOUR",
            default_value = "60"
        )
    )]
    pub rate_limit_anonymous_per_hour: NonZeroU32,

    /// Requests a fresh client address may send anonymously at once.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            env = "HASH_GRAPH_RATE_LIMIT_ANONYMOUS_BURST",
            default_value = "50"
        )
    )]
    pub rate_limit_anonymous_burst: NonZeroU32,

    /// Sustained requests per hour each actor may send, counted across all its source addresses.
    #[cfg_attr(
        feature = "clap",
        clap(
            long,
            env = "HASH_GRAPH_RATE_LIMIT_ACTOR_PER_HOUR",
            default_value = "6000"
        )
    )]
    pub rate_limit_actor_per_hour: NonZeroU32,

    /// Requests a fresh actor may send at once.
    #[cfg_attr(
        feature = "clap",
        clap(long, env = "HASH_GRAPH_RATE_LIMIT_ACTOR_BURST", default_value = "100")
    )]
    pub rate_limit_actor_burst: NonZeroU32,
}

impl From<&RateLimitConfig> for hash_middleware::rate_limit::RateLimitConfig {
    fn from(config: &RateLimitConfig) -> Self {
        let &RateLimitConfig {
            rate_limit_mode,
            client_ip_source,
            rate_limit_gate_per_second,
            rate_limit_gate_burst,
            rate_limit_anonymous_per_hour,
            rate_limit_anonymous_burst,
            rate_limit_actor_per_hour,
            rate_limit_actor_burst,
        } = config;
        Self {
            rate_limit_mode,
            client_ip_source,
            rate_limit_gate_per_second,
            rate_limit_gate_burst,
            rate_limit_anonymous_per_hour,
            rate_limit_anonymous_burst,
            rate_limit_actor_per_hour,
            rate_limit_actor_burst,
        }
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::net::{IpAddr, SocketAddr};

    use axum::{Router, body::Body, extract::ConnectInfo, routing::get};
    use hash_middleware::authentication::provider::StaticAuthenticationProvider;
    use http::{Request, StatusCode};
    use tower::ServiceExt as _;
    use type_system::principal::actor::ActorId;

    use super::{ClientIpSource, RateLimitConfig, RateLimitMode, RateLimiters};

    const SERVICE_SECRET: &str = "hash-svc-test-secret";

    fn non_zero(value: u32) -> core::num::NonZeroU32 {
        core::num::NonZeroU32::new(value).expect("the value should be non-zero")
    }

    /// A configuration that exercises only the burst: budgets refill once per hour, the gate once
    /// per second, and denials are enforced so a test can read them off the status code.
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

    /// The defaults reach an operator through clap, so they are read back the way clap renders
    /// them.
    #[cfg(feature = "clap")]
    #[test]
    fn defaults_enforce_the_budgets() {
        use clap::Parser as _;

        #[derive(clap::Parser)]
        struct Wrapper {
            #[clap(flatten)]
            rate_limit: RateLimitConfig,
        }

        let parsed = Wrapper::parse_from(["test"]).rate_limit;
        assert_eq!(
            parsed.rate_limit_mode,
            RateLimitMode::Enforce,
            "an activated rate limiter should deny by default; observing is the opt-out"
        );
        assert_eq!(
            parsed.client_ip_source,
            ClientIpSource::ConnectInfo,
            "a forwarded header should only be read where a deployment asks for it"
        );
        assert_eq!(
            parsed.rate_limit_anonymous_burst.get(),
            50,
            "an anonymous caller should be able to load a page's worth of requests at once"
        );
    }

    /// Drives `attach_request_middlewares`, the function `rest_api_router` wires the stack with,
    /// so what each route carries is read off the production assembly rather than a copy of it.
    #[tokio::test]
    async fn attaching_budgets_unmatched_paths_and_spares_later_merges() {
        // Two requests of gate budget: the specification, then one unmatched path before it runs
        // out.
        let limiters = Arc::new(RateLimiters::new(
            &(&RateLimitConfig {
                rate_limit_gate_burst: non_zero(2),
                ..config(1)
            })
                .into(),
        ));
        let router = crate::rest::attach_request_middlewares::<_, Option<ActorId>>(
            Router::new()
                .route("/entities", get(async || "ok"))
                .fallback(|| async { StatusCode::NOT_FOUND }),
            Router::new().route("/openapi.json", get(async || "spec")),
            Arc::new(StaticAuthenticationProvider::Rejected),
            Arc::from(SERVICE_SECRET),
            limiters,
        )
        .merge(Router::new().route("/health", get(async || "ok")));
        let client: IpAddr = "192.0.2.1".parse().expect("the address should parse");

        assert_eq!(
            send(&router, request_to("/openapi.json", client))
                .await
                .status(),
            StatusCode::OK,
            "a route merged between the layers should skip authentication, which rejects \
             everything here"
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

    /// Converts a configuration whose fields all differ, so a swapped field cannot hide.
    #[test]
    fn conversion_maps_every_field_to_its_namesake() {
        let converted = hash_middleware::rate_limit::RateLimitConfig::from(&RateLimitConfig {
            rate_limit_mode: RateLimitMode::Enforce,
            client_ip_source: ClientIpSource::CfConnectingIp,
            rate_limit_gate_per_second: non_zero(11),
            rate_limit_gate_burst: non_zero(12),
            rate_limit_anonymous_per_hour: non_zero(13),
            rate_limit_anonymous_burst: non_zero(14),
            rate_limit_actor_per_hour: non_zero(15),
            rate_limit_actor_burst: non_zero(16),
        });

        assert_eq!(converted.rate_limit_mode, RateLimitMode::Enforce);
        assert_eq!(converted.client_ip_source, ClientIpSource::CfConnectingIp);
        assert_eq!(converted.rate_limit_gate_per_second, non_zero(11));
        assert_eq!(converted.rate_limit_gate_burst, non_zero(12));
        assert_eq!(converted.rate_limit_anonymous_per_hour, non_zero(13));
        assert_eq!(converted.rate_limit_anonymous_burst, non_zero(14));
        assert_eq!(converted.rate_limit_actor_per_hour, non_zero(15));
        assert_eq!(converted.rate_limit_actor_burst, non_zero(16));
    }

    /// A denied request carries the client message alone.
    #[tokio::test]
    async fn denied_bodies_carry_the_client_message() {
        let limiters = Arc::new(RateLimiters::new(&(&config(1)).into()));
        let service_secret: Arc<str> = Arc::from(SERVICE_SECRET);
        let router =
            Router::new()
                .route("/entities", get(async || "ok"))
                .layer(axum::middleware::from_fn(move |request, next| {
                    super::ip_gate_middleware(
                        Arc::clone(&limiters),
                        Arc::clone(&service_secret),
                        request,
                        next,
                    )
                }));
        let client: IpAddr = "192.0.2.1".parse().expect("the address should parse");

        assert_eq!(
            send(&router, request_to("/entities", client))
                .await
                .status(),
            StatusCode::OK
        );
        let denied = send(&router, request_to("/entities", client)).await;
        assert_eq!(denied.status(), StatusCode::TOO_MANY_REQUESTS);

        let expected = serde_json::to_vec(&serde_json::json!({
            "message": "rate limit exceeded",
        }))
        .expect("the error document should serialize");
        let body = axum::body::to_bytes(denied.into_body(), 1024)
            .await
            .expect("the response body should be readable");
        assert_eq!(
            body.as_ref(),
            expected.as_slice(),
            "the denied body should carry the client message alone"
        );
    }
}

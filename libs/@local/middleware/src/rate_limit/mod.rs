//! Rate limiting for HTTP request handling.
//!
//! Two middlewares share the limiter state in `RateLimiters`. [`IpGateLayer`] runs ahead of the
//! authentication layer and throttles each client address before credential verification.
//! [`PrincipalLimitLayer`] runs behind it and budgets requests by the resolved principal: the
//! actor for authenticated requests, counted across every address it connects from, and the
//! client address for anonymous ones.
//!
//! Requests presenting the service secret pass both middlewares unchecked. Both middlewares and
//! [`AuthenticationLayer`] have to share one secret: the principal limiter treats a stored
//! authentication error as unreachable because the requests it could arise from passed by secret
//! above.
//!
//! [`AuthenticationLayer`]: crate::authentication::AuthenticationLayer
//!
//! A request over its budget receives `429 Too Many Requests` with `Retry-After` in
//! [`RateLimitMode::Enforce`], the default, and is served unchanged in
//! [`RateLimitMode::Observe`]. `Retry-After` is the whole client-facing contract: a served
//! response says nothing about the budget it crossed, and what enforcement would have done is
//! read from the `would_deny` outcome of the decisions metric instead.
//!
//! Every budget decision, unchecked pass, address fallback, and maintenance run is counted on
//! the meter the state is built with, and the keys each limiter store holds are gauged. Denials
//! and address fallbacks also log at debug, carrying the key and header detail too wide for a
//! metric label.
//!
//! Limiter state lives in process memory, so enforcement is per instance: a deployment with N
//! instances admits up to N times the configured rates, and a rolling release starts every budget
//! over.

mod address;
mod config;
#[cfg(test)]
mod tests;

use alloc::sync::Arc;
use core::{fmt, future, num::NonZero, task, time::Duration};
use std::sync::LazyLock;

use axum::{
    body::Body,
    response::{IntoResponse, Response},
};
use futures::{TryFutureExt as _, future::Either};
use governor::{
    Quota, RateLimiter,
    clock::{Clock as _, DefaultClock},
    middleware::NoOpMiddleware,
    state::keyed::DefaultKeyedStateStore,
};
use http::{
    HeaderValue,
    header::{CONTENT_TYPE, RETRY_AFTER},
};
use opentelemetry::{
    KeyValue,
    metrics::{Counter, Histogram, Meter},
};
use type_system::principal::actor::ActorId;

use self::address::{BucketKey, ResolvedClientAddress};
pub use self::config::{ClientIpSource, RateLimitConfig, RateLimitMode};
use crate::{
    authentication::{ResolvedAuthentication, service_secret::presents_service_secret},
    response::{error_body, error_response},
};

/// How often replenished keys are evicted.
const MAINTENANCE_INTERVAL: Duration = Duration::from_secs(60);

type KeyedLimiter<K> = RateLimiter<K, DefaultKeyedStateStore<K>, DefaultClock, NoOpMiddleware>;

/// The budget a request is charged against, and the key it is charged for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Budget {
    /// Per client address, applied ahead of authentication.
    Gate(BucketKey),
    /// Per client address, applied to anonymous requests.
    Anonymous(BucketKey),
    /// Per actor, applied wherever the actor connects from.
    Actor(ActorId),
}

impl Budget {
    const ACTOR: &'static str = "actor";
    const ANONYMOUS: &'static str = "anonymous";
    const GATE: &'static str = "gate";

    /// Returns the budget's name.
    const fn as_str(self) -> &'static str {
        match self {
            Self::Gate(_) => Self::GATE,
            Self::Anonymous(_) => Self::ANONYMOUS,
            Self::Actor(_) => Self::ACTOR,
        }
    }
}

/// The decision a budget check records.
#[derive(Clone, Copy)]
enum Outcome {
    Allowed,
    Denied,
    WouldDeny,
}

impl Outcome {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Allowed => "allowed",
            Self::Denied => "denied",
            Self::WouldDeny => "would_deny",
        }
    }
}

impl RateLimitMode {
    /// Returns the outcome this mode records for a request over its budget.
    const fn denial_outcome(self) -> Outcome {
        match self {
            Self::Enforce => Outcome::Denied,
            Self::Observe => Outcome::WouldDeny,
        }
    }

    const fn as_str(self) -> &'static str {
        match self {
            Self::Enforce => "enforce",
            Self::Observe => "observe",
        }
    }
}

/// The middleware a request passes unchecked.
#[derive(Clone, Copy)]
enum Stage {
    Gate,
    Principal,
}

impl Stage {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Gate => "gate",
            Self::Principal => "principal",
        }
    }
}

/// Why a request passes a stage unchecked.
#[derive(Clone, Copy)]
enum UncheckedReason {
    ServiceSecret,
    UnknownAddress,
}

impl UncheckedReason {
    const fn as_str(self) -> &'static str {
        match self {
            Self::ServiceSecret => "service_secret",
            Self::UnknownAddress => "unknown_address",
        }
    }
}

/// A route wired so the principal limiter cannot budget it.
#[derive(Clone, Copy)]
enum Misconfiguration {
    MissingAuthentication,
    UnrejectedAuthenticationError,
    MissingAddressGate,
}

impl Misconfiguration {
    const fn as_str(self) -> &'static str {
        match self {
            Self::MissingAuthentication => "missing_authentication",
            Self::UnrejectedAuthenticationError => "unrejected_authentication_error",
            Self::MissingAddressGate => "missing_address_gate",
        }
    }
}

/// Instruments recording what the limiter decides and what passes it unchecked.
struct RateLimitMetrics {
    decisions: Counter<u64>,
    unchecked: Counter<u64>,
    misconfigurations: Counter<u64>,
    address_fallbacks: Counter<u64>,
    maintenance_runs: Counter<u64>,
    evicted_keys: Counter<u64>,
    denial_wait: Histogram<f64>,
}

impl RateLimitMetrics {
    fn new(meter: &Meter, mode: RateLimitMode) -> Self {
        meter
            .u64_gauge("hash.rate_limit.mode")
            .with_description("One at the mode the limiter runs in")
            .build()
            .record(1, &[KeyValue::new("mode", mode.as_str())]);
        Self {
            decisions: meter
                .u64_counter("hash.rate_limit.decisions")
                .with_description("Budget decisions by limiter and outcome")
                .with_unit("{request}")
                .build(),
            unchecked: meter
                .u64_counter("hash.rate_limit.unchecked")
                .with_description("Requests passing a limiter stage without a budget check")
                .with_unit("{request}")
                .build(),
            misconfigurations: meter
                .u64_counter("hash.rate_limit.misconfigurations")
                .with_description(
                    "Requests answered with an internal error because the route is wired without \
                     the middleware the principal limiter builds on",
                )
                .with_unit("{request}")
                .build(),
            address_fallbacks: meter
                .u64_counter("hash.rate_limit.address_fallbacks")
                .with_description(
                    "Client addresses read from the connection instead of the configured header",
                )
                .with_unit("{request}")
                .build(),
            maintenance_runs: meter
                .u64_counter("hash.rate_limit.maintenance_runs")
                .with_description("Completed eviction runs")
                .with_unit("{run}")
                .build(),
            evicted_keys: meter
                .u64_counter("hash.rate_limit.evicted_keys")
                .with_description("Keys released by maintenance after regaining their budget")
                .with_unit("{key}")
                .build(),
            // The boundaries span the sub-second waits of the per-second gate quota and the
            // hour-scale waits of the principal quotas; the defaults are sized for milliseconds
            // and would put every wait in one bucket.
            denial_wait: meter
                .f64_histogram("hash.rate_limit.denial_wait")
                .with_description("Time until the crossed budget admits the request again")
                .with_unit("s")
                .with_boundaries(vec![
                    0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 30.0, 60.0, 300.0, 1800.0, 3600.0,
                ])
                .build(),
        }
    }

    fn decision(&self, budget: Budget, outcome: Outcome) {
        self.decisions.add(
            1,
            &[
                KeyValue::new("limiter", budget.as_str()),
                KeyValue::new("outcome", outcome.as_str()),
            ],
        );
    }

    /// Records a request over its budget: the decision and the wait it was told.
    fn denial(&self, budget: Budget, outcome: Outcome, wait: Duration) {
        self.decision(budget, outcome);
        self.denial_wait.record(
            wait.as_secs_f64(),
            &[
                KeyValue::new("limiter", budget.as_str()),
                KeyValue::new("outcome", outcome.as_str()),
            ],
        );
    }

    fn unchecked(&self, stage: Stage, reason: UncheckedReason) {
        self.unchecked.add(
            1,
            &[
                KeyValue::new("stage", stage.as_str()),
                KeyValue::new("reason", reason.as_str()),
            ],
        );
    }

    fn misconfiguration(&self, reason: Misconfiguration) {
        self.misconfigurations
            .add(1, &[KeyValue::new("reason", reason.as_str())]);
    }
}

/// The `429 Too Many Requests` answer for a request over its budget.
pub struct TooManyRequests {
    /// Whole seconds until the crossed budget admits the request again, at least one.
    pub retry_after: NonZero<u64>,
}

impl IntoResponse for TooManyRequests {
    fn into_response(self) -> Response {
        static BODY: LazyLock<&'static [u8]> =
            LazyLock::new(|| error_body("rate limit exceeded").leak());

        let mut response = Response::new(Body::from(*BODY));
        *response.status_mut() = http::StatusCode::TOO_MANY_REQUESTS;
        let headers = response.headers_mut();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(RETRY_AFTER, HeaderValue::from(self.retry_after.get()));
        response
    }
}

/// The response a request the principal limiter cannot serve is answered with.
///
/// [`IpGateLayer`] rejects with [`TooManyRequests`] alone: only the principal limiter, building
/// on the layers above it, can find a route miswired.
pub enum RateLimitRejection {
    /// The request is over its budget.
    TooManyRequests(TooManyRequests),
    /// The route is wired without the middleware the principal limiter builds on, answered as
    /// an internal error.
    InternalError,
}

impl From<TooManyRequests> for RateLimitRejection {
    fn from(error: TooManyRequests) -> Self {
        Self::TooManyRequests(error)
    }
}

impl IntoResponse for RateLimitRejection {
    fn into_response(self) -> Response {
        match self {
            Self::TooManyRequests(too_many_requests) => too_many_requests.into_response(),
            Self::InternalError => error_response(
                http::StatusCode::INTERNAL_SERVER_ERROR,
                "internal server error",
            ),
        }
    }
}

/// A request found to be over its budget.
struct Denial {
    /// Whole seconds until the budget admits the request again, at least one.
    retry_after: NonZero<u64>,
    mode: RateLimitMode,
}

impl Denial {
    const fn apply(self) -> Option<TooManyRequests> {
        match self {
            Self {
                mode: RateLimitMode::Observe,
                retry_after: _,
            } => None,
            Self {
                mode: RateLimitMode::Enforce,
                retry_after,
            } => Some(TooManyRequests { retry_after }),
        }
    }
}

/// The shared limiter state both rate-limiting middlewares charge against.
///
/// [`start`] one per router from the configuration and hand it to [`IpGateLayer`] and
/// [`PrincipalLimitLayer`]; it maintains itself for as long as it is held.
///
/// [`start`]: Self::start
pub struct RateLimiters {
    mode: RateLimitMode,
    client_ip_source: ClientIpSource,
    gate: KeyedLimiter<BucketKey>,
    anonymous: KeyedLimiter<BucketKey>,
    actor: KeyedLimiter<ActorId>,
    metrics: RateLimitMetrics,
}

impl RateLimiters {
    /// Creates the limiter state, registers the key gauge, and spawns the maintenance task.
    ///
    /// The task and the gauge hold weak references, so they cannot keep the state alive: the task
    /// ends on the first tick after the state is dropped. The gauge reads the stores directly
    /// rather than from the maintenance task, so a lost task shows as a flat run count next to a
    /// climbing key count.
    ///
    /// # Panics
    ///
    /// Panics when called outside a Tokio runtime.
    pub fn start(config: &RateLimitConfig, meter: &Meter) -> Arc<Self> {
        tracing::info!(
            mode = ?config.rate_limit_mode,
            client_ip_source = ?config.client_ip_source,
            gate_per_second = config.rate_limit_gate_per_second,
            gate_burst = config.rate_limit_gate_burst,
            anonymous_per_hour = config.rate_limit_anonymous_per_hour,
            anonymous_burst = config.rate_limit_anonymous_burst,
            actor_per_hour = config.rate_limit_actor_per_hour,
            actor_burst = config.rate_limit_actor_burst,
            "rate limiting active"
        );
        let this = Arc::new(Self {
            mode: config.rate_limit_mode,
            client_ip_source: config.client_ip_source,
            gate: RateLimiter::keyed(
                Quota::per_second(config.rate_limit_gate_per_second)
                    .allow_burst(config.rate_limit_gate_burst),
            )
            .with_middleware(),
            anonymous: RateLimiter::keyed(
                Quota::per_hour(config.rate_limit_anonymous_per_hour)
                    .allow_burst(config.rate_limit_anonymous_burst),
            )
            .with_middleware(),
            actor: RateLimiter::keyed(
                Quota::per_hour(config.rate_limit_actor_per_hour)
                    .allow_burst(config.rate_limit_actor_burst),
            )
            .with_middleware(),
            metrics: RateLimitMetrics::new(meter, config.rate_limit_mode),
        });

        meter
            .u64_observable_gauge("hash.rate_limit.tracked_keys")
            .with_description("Keys currently held by each limiter store")
            .with_unit("{key}")
            .with_callback({
                let limiters = Arc::downgrade(&this);
                move |observer| {
                    let Some(limiters) = limiters.upgrade() else {
                        return;
                    };
                    for (limiter, keys) in [
                        (Budget::GATE, limiters.gate.len()),
                        (Budget::ANONYMOUS, limiters.anonymous.len()),
                        (Budget::ACTOR, limiters.actor.len()),
                    ] {
                        observer.observe(keys as u64, &[KeyValue::new("limiter", limiter)]);
                    }
                }
            })
            .build();

        let limiters = Arc::downgrade(&this);
        let maintenance = tokio::spawn(async move {
            let mut interval = tokio::time::interval(MAINTENANCE_INTERVAL);
            loop {
                interval.tick().await;
                let Some(limiters) = limiters.upgrade() else {
                    tracing::debug!("rate-limiter state dropped, ending its maintenance");
                    break;
                };
                limiters.maintain();
            }
        });
        tokio::spawn(async move {
            if let Err(error) = maintenance.await {
                tracing::error!(
                    %error,
                    "rate-limiter maintenance stopped, keys are no longer released"
                );
            }
        });

        this
    }

    /// Reads the budget key of a request from the configured source.
    ///
    /// Falls back to the connection's address when the configured header is unusable, which keys
    /// every client behind that proxy into one budget.
    fn client_key<B>(&self, request: &http::Request<B>) -> Option<BucketKey> {
        let Some(header) = self.client_ip_source.header() else {
            return address::peer(request);
        };

        match address::from_header(request, header) {
            Ok(key) => Some(key),
            Err(fallback) => {
                self.metrics
                    .address_fallbacks
                    .add(1, &[KeyValue::new("reason", fallback.as_str())]);
                tracing::debug!(
                    reason = fallback.as_str(),
                    header = %header,
                    "client address read from the connection instead of the configured header"
                );
                address::peer(request)
            }
        }
    }

    /// Records a request whose client address could not be determined at the gate.
    fn note_unknown_address(&self) {
        self.metrics
            .unchecked(Stage::Gate, UncheckedReason::UnknownAddress);
        tracing::debug!(
            "client address unavailable, request passes the rate limiter unchecked; the router \
             has to be served with `into_make_service_with_connect_info`"
        );
    }

    #[cfg(test)]
    fn tracked_keys(&self) -> usize {
        self.gate.len() + self.anonymous.len() + self.actor.len()
    }

    /// Drops keys that regained their full budget and shrinks the stores.
    ///
    /// Eviction is the only mechanism releasing keys, so a store grows with every distinct client
    /// until this runs.
    fn maintain(&self) {
        for (limiter, evicted) in [
            (Budget::GATE, release(&self.gate)),
            (Budget::ANONYMOUS, release(&self.anonymous)),
            (Budget::ACTOR, release(&self.actor)),
        ] {
            self.metrics
                .evicted_keys
                .add(evicted as u64, &[KeyValue::new("limiter", limiter)]);
        }
        self.metrics.maintenance_runs.add(1, &[]);

        tracing::debug!(
            gate_keys = self.gate.len(),
            anonymous_keys = self.anonymous.len(),
            actor_keys = self.actor.len(),
            "rate limiter maintenance run"
        );
    }

    /// Charges one request against the store the budget names.
    fn charge(&self, budget: Budget) -> Result<(), Denial> {
        match budget {
            Budget::Gate(key) => self.charge_key(budget, &self.gate, &key),
            Budget::Anonymous(key) => self.charge_key(budget, &self.anonymous, &key),
            Budget::Actor(actor) => self.charge_key(budget, &self.actor, &actor),
        }
    }

    /// Charges one request of `key` against `limiter`, recording it when it is over budget.
    fn charge_key<K>(
        &self,
        budget: Budget,
        limiter: &KeyedLimiter<K>,
        key: &K,
    ) -> Result<(), Denial>
    where
        K: fmt::Display + Clone + Eq + core::hash::Hash,
    {
        let not_until = match limiter.check_key(key) {
            Ok(()) => {
                self.metrics.decision(budget, Outcome::Allowed);
                return Ok(());
            }
            Err(not_until) => not_until,
        };

        let wait = not_until.wait_time_from(limiter.clock().now());
        self.metrics
            .denial(budget, self.mode.denial_outcome(), wait);
        let seconds = wait.as_secs() + u64::from(wait.subsec_nanos() > 0);
        let retry_after = NonZero::new(seconds).unwrap_or(NonZero::<u64>::MIN);
        tracing::debug!(
            budget = budget.as_str(),
            key = %key,
            retry_after_seconds = retry_after.get(),
            mode = ?self.mode,
            "request over its rate-limit budget"
        );
        Err(Denial {
            retry_after,
            mode: self.mode,
        })
    }
}

/// Releases the keys of one store that regained their full budget, returning how many.
fn release<K>(limiter: &KeyedLimiter<K>) -> usize
where
    K: core::hash::Hash + Eq + Clone,
{
    let before = limiter.len();
    limiter.retain_recent();
    limiter.shrink_to_fit();
    before.saturating_sub(limiter.len())
}

/// Throttles each client address ahead of credential verification.
///
/// The service secret is verified against the configured value, so a request merely presenting
/// the scheme stays gated. A request whose client address cannot be determined passes unchecked —
/// reading the connection's address requires serving the router with
/// `into_make_service_with_connect_info`.
///
/// # Example
///
/// ```
/// # use core::num::NonZeroU32;
/// # use std::sync::Arc;
/// # use axum::{Router, routing::get};
/// use hash_middleware::rate_limit::{IpGateLayer, RateLimiters};
/// # use hash_middleware::rate_limit::{ClientIpSource, RateLimitConfig, RateLimitMode};
///
/// # #[tokio::main(flavor = "current_thread")]
/// # async fn main() {
/// # let quota = |value| NonZeroU32::new(value).expect("the quota should be non-zero");
/// # let config = RateLimitConfig {
/// #     rate_limit_mode: RateLimitMode::Observe,
/// #     client_ip_source: ClientIpSource::ConnectInfo,
/// #     rate_limit_gate_per_second: quota(10),
/// #     rate_limit_gate_burst: quota(50),
/// #     rate_limit_anonymous_per_hour: quota(60),
/// #     rate_limit_anonymous_burst: quota(50),
/// #     rate_limit_actor_per_hour: quota(6000),
/// #     rate_limit_actor_burst: quota(100),
/// # };
/// # let meter = opentelemetry::global::meter("doc");
/// // A `layer` rather than a `route_layer`, so unmatched paths draw on a budget too.
/// let router: Router = Router::new()
///     .route("/entities", get(async || "ok"))
///     .layer(IpGateLayer {
///         limiters: RateLimiters::start(&config, &meter),
///         service_secret: Arc::from("service-secret"),
///     });
/// # }
/// ```
#[derive(Clone)]
pub struct IpGateLayer {
    /// The shared limiter state requests are charged against.
    pub limiters: Arc<RateLimiters>,
    /// The secret whose presenters pass unchecked.
    pub service_secret: Arc<str>,
}

impl<S> tower::Layer<S> for IpGateLayer {
    type Service = IpGateService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        IpGateService {
            inner,
            limiters: Arc::clone(&self.limiters),
            service_secret: Arc::clone(&self.service_secret),
        }
    }
}

/// The service [`IpGateLayer`] wraps its inner service into.
#[derive(Clone)]
pub struct IpGateService<S> {
    inner: S,

    limiters: Arc<RateLimiters>,
    service_secret: Arc<str>,
}

impl<B, S> tower::Service<http::Request<B>> for IpGateService<S>
where
    S: tower::Service<http::Request<B>>,
{
    type Error = S::Error;
    type Response = Result<S::Response, TooManyRequests>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut task::Context<'_>) -> task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, mut req: http::Request<B>) -> Self::Future {
        if presents_service_secret(req.headers(), &self.service_secret) {
            self.limiters
                .metrics
                .unchecked(Stage::Gate, UncheckedReason::ServiceSecret);

            return Either::Right(self.inner.call(req).map_ok(Ok));
        }

        let resolved = self.limiters.client_key(&req);
        req.extensions_mut().insert(resolved.map_or(
            ResolvedClientAddress::Unknown,
            ResolvedClientAddress::Bucketed,
        ));

        let Some(key) = resolved else {
            self.limiters.note_unknown_address();
            return Either::Right(self.inner.call(req).map_ok(Ok));
        };

        match self
            .limiters
            .charge(Budget::Gate(key))
            .map_err(Denial::apply)
        {
            Ok(()) | Err(None) => Either::Right(self.inner.call(req).map_ok(Ok)),
            Err(Some(error)) => Either::Left(future::ready(Ok(Err(error)))),
        }
    }
}

/// Budgets requests by the principal the authentication middleware resolved.
///
/// Requests presenting the service secret pass unchecked, as does an anonymous request whose
/// client address the gate could not determine. A route reached without the authentication
/// middleware or without the address gate is answered with an internal error.
///
/// # Example
///
/// Layered inside the authentication middleware, which itself sits inside the gate — the crate
/// documentation shows the full stack:
///
/// ```
/// # use core::{marker::PhantomData, num::NonZeroU32, ops::ControlFlow};
/// # use std::sync::Arc;
/// # use axum::{Router, routing::get};
/// # use error_stack::Report;
/// # use hash_middleware::authentication::{
/// #     AuthenticationLayer, AuthenticationMetrics,
/// #     provider::{AuthenticationProvider, Caller},
/// #     request::AuthenticationError,
/// # };
/// # use http::HeaderMap;
/// # use type_system::principal::actor::ActorId;
/// use hash_middleware::rate_limit::{IpGateLayer, PrincipalLimitLayer, RateLimiters};
/// # use hash_middleware::rate_limit::{ClientIpSource, RateLimitConfig, RateLimitMode};
///
/// # struct Verifier;
/// # impl<C: Caller> AuthenticationProvider<C> for Verifier {
/// #     async fn authenticate(
/// #         &self,
/// #         _headers: &HeaderMap,
/// #     ) -> ControlFlow<Result<C, Report<AuthenticationError>>> {
/// #         ControlFlow::Continue(())
/// #     }
/// # }
/// # #[tokio::main(flavor = "current_thread")]
/// # async fn main() {
/// # let quota = |value| NonZeroU32::new(value).expect("the quota should be non-zero");
/// # let config = RateLimitConfig {
/// #     rate_limit_mode: RateLimitMode::Observe,
/// #     client_ip_source: ClientIpSource::ConnectInfo,
/// #     rate_limit_gate_per_second: quota(10),
/// #     rate_limit_gate_burst: quota(50),
/// #     rate_limit_anonymous_per_hour: quota(60),
/// #     rate_limit_anonymous_burst: quota(50),
/// #     rate_limit_actor_per_hour: quota(6000),
/// #     rate_limit_actor_burst: quota(100),
/// # };
/// # let meter = opentelemetry::global::meter("doc");
/// let limiters = RateLimiters::start(&config, &meter);
/// let service_secret: Arc<str> = Arc::from("service-secret");
/// # let provider = Arc::new(Verifier);
/// # let auth_metrics = Arc::new(AuthenticationMetrics::new(&meter));
///
/// let router: Router = Router::new()
///     .route("/entities", get(async || "ok"))
///     .route_layer(PrincipalLimitLayer {
///         limiters: Arc::clone(&limiters),
///         service_secret: Arc::clone(&service_secret),
///     })
///     .route_layer(AuthenticationLayer::<_, Option<ActorId>> {
///         provider,
///         service_secret: Arc::clone(&service_secret),
///         metrics: auth_metrics,
///         bootstrap_route: |_path| false,
///         caller: PhantomData,
///     })
///     .layer(IpGateLayer {
///         limiters,
///         service_secret,
///     });
/// # }
/// ```
#[derive(Clone)]
pub struct PrincipalLimitLayer {
    /// The shared limiter state requests are charged against.
    pub limiters: Arc<RateLimiters>,
    /// The secret whose presenters pass unchecked.
    pub service_secret: Arc<str>,
}

impl<S> tower::Layer<S> for PrincipalLimitLayer {
    type Service = PrincipalLimitService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        PrincipalLimitService {
            inner,
            limiters: Arc::clone(&self.limiters),
            service_secret: Arc::clone(&self.service_secret),
        }
    }
}

/// The service [`PrincipalLimitLayer`] wraps its inner service into.
#[derive(Clone)]
pub struct PrincipalLimitService<S> {
    inner: S,

    limiters: Arc<RateLimiters>,
    service_secret: Arc<str>,
}

impl<B, S> tower::Service<http::Request<B>> for PrincipalLimitService<S>
where
    S: tower::Service<http::Request<B>>,
{
    type Error = S::Error;
    type Response = Result<S::Response, RateLimitRejection>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut task::Context<'_>) -> task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: http::Request<B>) -> Self::Future {
        if presents_service_secret(req.headers(), &self.service_secret) {
            self.limiters
                .metrics
                .unchecked(Stage::Principal, UncheckedReason::ServiceSecret);
            return Either::Right(self.inner.call(req).map_ok(Ok));
        }

        let Some(resolved) = req.extensions().get::<ResolvedAuthentication>() else {
            tracing::error!(
                path = req.uri().path(),
                "`PrincipalLimitLayer` ran on a route without authentication middleware"
            );

            self.limiters
                .metrics
                .misconfiguration(Misconfiguration::MissingAuthentication);
            return Either::Left(future::ready(Ok(Err(RateLimitRejection::InternalError))));
        };

        let actor = match resolved.outcome() {
            Ok(actor) => *actor,
            Err(error) => {
                // A stored error means a bootstrap route tolerated the failure, and those
                // requests presented the service secret and passed above. Reaching this
                // arm means the middleware order broke, so the report's attachments are the only
                // account of what the provider saw: `Display` would print the first context and
                // drop them.
                tracing::error!(error = ?error, "authentication error reached the rate limiter unrejected");

                self.limiters
                    .metrics
                    .misconfiguration(Misconfiguration::UnrejectedAuthenticationError);
                return Either::Left(future::ready(Ok(Err(RateLimitRejection::InternalError))));
            }
        };

        let budget = if let Some(actor) = actor {
            Budget::Actor(actor)
        } else {
            let Some(resolved) = req.extensions().get::<ResolvedClientAddress>() else {
                tracing::error!(
                    path = req.uri().path(),
                    "`PrincipalLimitLayer` ran on a route without the address gate"
                );
                self.limiters
                    .metrics
                    .misconfiguration(Misconfiguration::MissingAddressGate);
                return Either::Left(future::ready(Ok(Err(RateLimitRejection::InternalError))));
            };
            let Some(key) = resolved.key() else {
                // Counted per stage, so the gate's count of this address does not stand in for the
                // principal stage.
                self.limiters
                    .metrics
                    .unchecked(Stage::Principal, UncheckedReason::UnknownAddress);
                return Either::Right(self.inner.call(req).map_ok(Ok));
            };
            Budget::Anonymous(key)
        };

        match self.limiters.charge(budget).map_err(Denial::apply) {
            Ok(()) | Err(None) => Either::Right(self.inner.call(req).map_ok(Ok)),
            Err(Some(error)) => Either::Left(future::ready(Ok(Err(error.into())))),
        }
    }
}

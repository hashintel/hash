//! Rate limiting for HTTP request handling.
//!
//! [`IpGateLayer`] runs ahead of the authentication layer and throttles each client address before
//! credential verification. [`CallerLimitLayer`] runs behind it and budgets requests by the
//! resolved caller: the actor for authenticated requests, counted across every address it
//! connects from, and the client address for anonymous ones. [`RateLimiters::start`] holds the
//! address gate and one set of caller budgets; [`RateLimiters::with_caller_limits`] adds
//! further caller budgets that share the gate, which the state `start` returned keeps charging,
//! maintaining, and gauging.
//!
//! Each middleware passes requests presenting its configured service secret unchecked, and
//! exempts none when configured without one. A [`CallerLimitLayer`] behind an
//! [`AuthenticationLayer`] with [`Bootstrap`] routes has to be configured with the bootstrap
//! secret: a bootstrap request naming no actor reaches it with its authentication error stored,
//! which only that exemption lets through.
//!
//! [`AuthenticationLayer`]: crate::authentication::AuthenticationLayer
//! [`Bootstrap`]: crate::authentication::Bootstrap
//!
//! A request over its budget receives `429 Too Many Requests` with an `application/problem+json`
//! body and `Retry-After` in [`RateLimitMode::Enforce`], the default. The problem type is
//! `about:blank`, and `Retry-After` gives the delay in seconds before retrying.
//! In [`RateLimitMode::Observe`], requests are served unchanged; the `would_deny` outcome of the
//! decisions metric records requests that enforcement would have denied.
//!
//! In [`RateLimitMode::Enforce`], the response to a request carries one `RateLimit-Policy` and one
//! `RateLimit` item for each budget the request was checked against, as
//! [draft-ietf-httpapi-ratelimit-headers-11] defines them. The policy item states the burst as `q`
//! and the whole seconds an exhausted budget takes to refill as `w`, and the `RateLimit` item
//! states the requests the budget has left as `r`. A `429` reports the crossed budget with `r=0`. A
//! request that passes a middleware unchecked carries no item of that middleware, and in
//! [`RateLimitMode::Observe`] no response carries either field.
//!
//! [draft-ietf-httpapi-ratelimit-headers-11]: https://www.ietf.org/archive/id/draft-ietf-httpapi-ratelimit-headers-11.html
//!
//! Budget decisions, unchecked passes, misconfigurations, address fallbacks, maintenance runs,
//! evicted keys, and denial waits are recorded on the meter the state is built with, and the keys
//! each limiter store holds are gauged. Every instrument carries a `scope` attribute naming the set
//! of caller budgets it belongs to. Denials and address fallbacks also log at debug, carrying
//! the key and header detail too wide for a metric label.
//!
//! Limiter state lives in process memory, so enforcement is per instance: a deployment with N
//! instances admits up to N times the configured rates, and a rolling release starts every budget
//! over.

mod address;
#[cfg(feature = "aide")]
mod aide;
mod config;
#[cfg(feature = "aide")]
pub use self::aide::{document, document_fields};
#[cfg(test)]
mod tests;

use alloc::{borrow::Cow, sync::Arc};
use core::{error::Error, fmt, future, num::NonZero, pin::Pin, task, time::Duration};
use std::sync::LazyLock;

use axum::response::{IntoResponse, Response};
use futures::{TryFutureExt as _, future::Either};
use governor::{
    Quota, RateLimiter,
    clock::{Clock as _, DefaultClock},
    middleware::StateInformationMiddleware,
    state::keyed::DefaultKeyedStateStore,
};
use hash_crypto::Secret;
use http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header::RETRY_AFTER};
use opentelemetry::{
    KeyValue,
    metrics::{Counter, Histogram, Meter},
};
use problematic::{
    Answer, Expose, Header, Problem, ProblemType, ProblemVariant, Rejection, Variant,
};
use type_system::principal::actor::ActorId;

use self::address::{BucketKey, ResolvedClientAddress};
pub use self::config::{CallerRateLimitConfig, ClientIpSource, RateLimitConfig, RateLimitMode};
use crate::{
    authentication::{ResolvedAuthentication, service_secret::presents_service_secret},
    problem::InternalServerError,
    response::problem_response_body,
};

/// How often replenished keys are evicted.
const MAINTENANCE_INTERVAL: Duration = Duration::from_secs(60);

/// The field naming each budget that charged a request with the quota it allocates.
const RATELIMIT_POLICY: HeaderName = HeaderName::from_static("ratelimit-policy");

/// The field stating what each budget that charged a request has left.
const RATELIMIT: HeaderName = HeaderName::from_static("ratelimit");

type KeyedLimiter<K> =
    RateLimiter<K, DefaultKeyedStateStore<K>, DefaultClock, StateInformationMiddleware>;

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
    Caller,
}

impl Stage {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Gate => "gate",
            Self::Caller => "caller",
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

/// A route wired so the caller limiter cannot budget it.
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
    scope: KeyValue,
    decisions: Counter<u64>,
    unchecked: Counter<u64>,
    misconfigurations: Counter<u64>,
    address_fallbacks: Counter<u64>,
    maintenance_runs: Counter<u64>,
    evicted_keys: Counter<u64>,
    denial_wait: Histogram<f64>,
}

impl RateLimitMetrics {
    fn new(meter: &Meter, mode: RateLimitMode, scope: &'static str) -> Self {
        let scope = KeyValue::new("scope", scope);
        meter
            .u64_gauge("hash.rate_limit.mode")
            .with_description("One at the mode the limiter runs in")
            .build()
            .record(1, &[scope.clone(), KeyValue::new("mode", mode.as_str())]);
        Self {
            scope,
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
                     the middleware the caller limiter builds on",
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
            // hour-scale waits of the caller quotas; the defaults are sized for milliseconds
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
                self.scope.clone(),
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
                self.scope.clone(),
                KeyValue::new("limiter", budget.as_str()),
                KeyValue::new("outcome", outcome.as_str()),
            ],
        );
    }

    fn unchecked(&self, stage: Stage, reason: UncheckedReason) {
        self.unchecked.add(
            1,
            &[
                self.scope.clone(),
                KeyValue::new("stage", stage.as_str()),
                KeyValue::new("reason", reason.as_str()),
            ],
        );
    }

    fn misconfiguration(&self, reason: Misconfiguration) {
        self.misconfigurations.add(
            1,
            &[self.scope.clone(), KeyValue::new("reason", reason.as_str())],
        );
    }
}

/// What the `RateLimit-Policy` field tells a client.
const RATELIMIT_POLICY_DESCRIPTION: &str =
    "The budgets the request was checked against, one item each, as \
     draft-ietf-httpapi-ratelimit-headers-11 defines them. `q` is the burst a budget admits at \
     once, and `w` the whole seconds an exhausted budget takes to refill, so `q` requests per `w` \
     seconds stay within its sustained rate.";

/// What the `RateLimit` field tells a client.
const RATELIMIT_DESCRIPTION: &str = "The requests each budget in `RateLimit-Policy` has left \
                                     after this request, as its `r`. A crossed budget reports \
                                     `r=0`.";

/// The request exceeded its rate-limit budget.
#[derive(Debug, Clone, derive_more::Display, serde::Serialize, schemars::JsonSchema)]
#[display("The request exceeded its rate-limit budget.")]
pub struct TooManyRequests {
    /// Whole seconds until the crossed budget admits the request again, at least one.
    #[serde(skip)]
    retry_after: NonZero<u64>,
    /// The crossed budget, which the response reports in `RateLimit-Policy` and `RateLimit`.
    #[serde(skip)]
    charge: Charge,
}

impl ProblemVariant for TooManyRequests {
    const HEADERS: &'static [Header] = &[
        Header::new::<NonZero<u64>>("Retry-After", "Whole seconds before retrying the request."),
        Header::new::<String>("RateLimit-Policy", RATELIMIT_POLICY_DESCRIPTION),
        Header::new::<String>("RateLimit", RATELIMIT_DESCRIPTION),
    ];
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Too Many Requests"),
        status: StatusCode::TOO_MANY_REQUESTS,
    };

    fn headers(&self, headers: &mut HeaderMap) {
        headers.insert(RETRY_AFTER, HeaderValue::from(self.retry_after.get()));
        self.charge.append_to(headers);
    }

    fn example() -> Option<Self> {
        Some(Self {
            retry_after: NonZero::<u64>::MIN,
            charge: Charge {
                policy: HeaderValue::from_static(r#""actor";q=500;w=50"#),
                service_limit: HeaderValue::from_static(r#""actor";r=0"#),
            },
        })
    }
}

impl IntoResponse for TooManyRequests {
    fn into_response(self) -> Response {
        // A flood is answered with this rejection, so its body is serialized once: `retry_after`
        // and the crossed budget travel in headers only, which leaves the body constant.
        static BODY: LazyLock<&'static [u8]> = LazyLock::new(|| {
            let answer = Answer::<RateLimitProblem>::new(
                TooManyRequests::example().expect("the rate-limit problem should have an example"),
            );
            serde_json::to_vec(&answer.details())
                .expect("the rate-limit problem should serialize")
                .leak()
        });

        let mut response = problem_response_body(Self::TYPE.status, *BODY);
        ProblemVariant::headers(&self, response.headers_mut());
        response
    }
}

/// The public problems the rate-limit layers answer with.
pub struct RateLimitProblem;

impl Problem for RateLimitProblem {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<TooManyRequests>(),
        Variant::of::<InternalServerError>(),
    ];
}

/// The response a request the caller limiter cannot serve is answered with.
///
/// [`IpGateLayer`] rejects with [`TooManyRequests`] alone: only the caller limiter, building
/// on the layers above it, can find a route miswired.
#[derive(Debug, derive_more::Display)]
pub enum RateLimitRejection {
    /// The request is over its budget.
    #[display("the request exceeded its rate-limit budget")]
    TooManyRequests(TooManyRequests),
    /// The route lacks the middleware the caller limiter builds on, or runs it in the wrong
    /// order, answered as an internal error.
    #[display("the caller limiter is wired incorrectly on this route")]
    Misconfigured,
}

impl Error for RateLimitRejection {}

impl From<TooManyRequests> for RateLimitRejection {
    fn from(error: TooManyRequests) -> Self {
        Self::TooManyRequests(error)
    }
}

impl Expose<RateLimitProblem> for RateLimitRejection {
    fn expose(&self) -> Answer<'_, RateLimitProblem> {
        match self {
            Self::TooManyRequests(too_many_requests) => Answer::new(too_many_requests.clone()),
            Self::Misconfigured => Answer::new(InternalServerError),
        }
    }
}

impl IntoResponse for RateLimitRejection {
    fn into_response(self) -> Response {
        match self {
            Self::TooManyRequests(too_many_requests) => too_many_requests.into_response(),
            Self::Misconfigured => Rejection::<RateLimitProblem>::from(self).into_response(),
        }
    }
}

/// The items a response reports for the budget its request was checked against.
#[derive(Debug, Clone)]
struct Charge {
    /// The budget's `RateLimit-Policy` item.
    policy: HeaderValue,
    /// The budget's `RateLimit` item, stating the requests it has left: `r=0` for a crossed
    /// budget.
    service_limit: HeaderValue,
}

impl Charge {
    /// Appends this budget's items as field lines of their own, after any that another layer
    /// added.
    fn append_to(&self, headers: &mut HeaderMap) {
        headers.append(RATELIMIT_POLICY, self.policy.clone());
        headers.append(RATELIMIT, self.service_limit.clone());
    }
}

/// The quota of a budget, as the responses to the requests checked against it report it.
#[derive(Debug)]
struct Policy {
    /// The name both items give the budget.
    name: &'static str,
    /// The `RateLimit-Policy` item.
    item: HeaderValue,
    /// The `RateLimit` item of the budget with nothing left.
    exhausted: HeaderValue,
}

impl Policy {
    /// The policy of the budget `name`, which allocates `quota`.
    ///
    /// The quota `q` is the burst, and the window `w` is the time an exhausted budget takes to
    /// refill, rounded up to whole seconds, so `q` requests per `w` seconds stay within the
    /// configured rate.
    fn new(name: &'static str, quota: Quota) -> Self {
        Self {
            name,
            item: HeaderValue::try_from(format!(
                "\"{name}\";q={};w={}",
                quota.burst_size(),
                whole_seconds(quota.burst_size_replenished_in())
            ))
            .expect("should build the item from a budget name and numbers"),
            exhausted: service_limit(name, 0),
        }
    }

    /// The charge of a request after which the budget has `remaining` requests left.
    fn charge(&self, remaining: u32) -> Charge {
        Charge {
            policy: self.item.clone(),
            service_limit: if remaining == 0 {
                self.exhausted.clone()
            } else {
                service_limit(self.name, remaining)
            },
        }
    }
}

/// The `RateLimit` item of the budget `name` with `remaining` requests left.
fn service_limit(name: &str, remaining: u32) -> HeaderValue {
    HeaderValue::try_from(format!("\"{name}\";r={remaining}"))
        .expect("should build the item from a budget name and a number")
}

/// A store of budgets keyed by `K`, with the policy their quota follows.
struct Limiter<K>
where
    K: Clone + Eq + core::hash::Hash,
{
    store: KeyedLimiter<K>,
    policy: Policy,
}

impl<K> Limiter<K>
where
    K: Clone + Eq + core::hash::Hash,
{
    fn new(name: &'static str, quota: Quota) -> Self {
        Self {
            store: RateLimiter::keyed(quota).with_middleware(),
            policy: Policy::new(name, quota),
        }
    }
}

/// `duration` rounded up to whole seconds, at least one.
fn whole_seconds(duration: Duration) -> NonZero<u64> {
    NonZero::new(duration.as_secs() + u64::from(duration.subsec_nanos() > 0))
        .unwrap_or(NonZero::<u64>::MIN)
}

/// A request found to be over its budget.
struct Denial {
    /// Whole seconds until the budget admits the request again, at least one.
    retry_after: NonZero<u64>,
    /// The crossed budget, with nothing left.
    charge: Charge,
    mode: RateLimitMode,
}

impl Denial {
    fn apply(self) -> Option<TooManyRequests> {
        match self.mode {
            RateLimitMode::Observe => None,
            RateLimitMode::Enforce => Some(TooManyRequests {
                retry_after: self.retry_after,
                charge: self.charge,
            }),
        }
    }
}

/// The shared limiter state both rate-limiting middlewares charge against.
///
/// [`start`] creates the address gate and caller budgets. [`with_caller_limits`] creates
/// separate caller budgets for a route group while sharing the gate. Each state maintains
/// itself for as long as it is held.
///
/// [`start`]: Self::start
/// [`with_caller_limits`]: Self::with_caller_limits
pub struct RateLimiters {
    mode: RateLimitMode,
    client_ip_source: ClientIpSource,
    gate: Arc<Limiter<BucketKey>>,
    // The parent owns maintenance and metrics for the shared gate.
    parent: Option<Arc<Self>>,
    anonymous: Limiter<BucketKey>,
    actor: Limiter<ActorId>,
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
            gate: Arc::new(Limiter::new(
                Budget::GATE,
                Quota::per_second(config.rate_limit_gate_per_second)
                    .allow_burst(config.rate_limit_gate_burst),
            )),
            parent: None,
            anonymous: Limiter::new(
                Budget::ANONYMOUS,
                Quota::per_hour(config.rate_limit_anonymous_per_hour)
                    .allow_burst(config.rate_limit_anonymous_burst),
            ),
            actor: Limiter::new(
                Budget::ACTOR,
                Quota::per_hour(config.rate_limit_actor_per_hour)
                    .allow_burst(config.rate_limit_actor_burst),
            ),
            metrics: RateLimitMetrics::new(meter, config.rate_limit_mode, "global"),
        });

        this.start_maintenance(meter);
        this
    }

    /// Creates independent caller budgets while sharing this limiter's address gate.
    ///
    /// The new state inherits the enforcement mode and client-address source. `scope` identifies
    /// the route group in metrics and must be distinct for each set of caller budgets.
    ///
    /// # Panics
    ///
    /// Panics when called outside a Tokio runtime.
    #[must_use]
    pub fn with_caller_limits(
        self: &Arc<Self>,
        config: &CallerRateLimitConfig,
        scope: &'static str,
        meter: &Meter,
    ) -> Arc<Self> {
        let this = Arc::new(Self {
            mode: self.mode,
            client_ip_source: self.client_ip_source,
            gate: Arc::clone(&self.gate),
            parent: Some(Arc::clone(self)),
            anonymous: Limiter::new(
                Budget::ANONYMOUS,
                Quota::per_hour(config.anonymous_per_hour).allow_burst(config.anonymous_burst),
            ),
            actor: Limiter::new(
                Budget::ACTOR,
                Quota::per_hour(config.actor_per_hour).allow_burst(config.actor_burst),
            ),
            metrics: RateLimitMetrics::new(meter, self.mode, scope),
        });
        this.start_maintenance(meter);
        this
    }

    fn start_maintenance(self: &Arc<Self>, meter: &Meter) {
        meter
            .u64_observable_gauge("hash.rate_limit.tracked_keys")
            .with_description("Keys currently held by each limiter store")
            .with_unit("{key}")
            .with_callback({
                let limiters = Arc::downgrade(self);
                move |observer| {
                    let Some(limiters) = limiters.upgrade() else {
                        return;
                    };
                    for (limiter, keys) in [
                        (
                            Budget::GATE,
                            limiters.parent.is_none().then(|| limiters.gate.store.len()),
                        ),
                        (Budget::ANONYMOUS, Some(limiters.anonymous.store.len())),
                        (Budget::ACTOR, Some(limiters.actor.store.len())),
                    ] {
                        if let Some(keys) = keys {
                            observer.observe(
                                keys as u64,
                                &[
                                    limiters.metrics.scope.clone(),
                                    KeyValue::new("limiter", limiter),
                                ],
                            );
                        }
                    }
                }
            })
            .build();

        let limiters = Arc::downgrade(self);
        let maintenance = tokio::spawn(async move {
            let mut interval = tokio::time::interval(MAINTENANCE_INTERVAL);
            loop {
                interval.tick().await;
                let Some(limiters) = limiters.upgrade() else {
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
                self.metrics.address_fallbacks.add(
                    1,
                    &[
                        self.metrics.scope.clone(),
                        KeyValue::new("reason", fallback.as_str()),
                    ],
                );
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
        self.gate.store.len() + self.anonymous.store.len() + self.actor.store.len()
    }

    /// Drops keys that regained their full budget and shrinks the stores.
    ///
    /// Eviction is the only mechanism releasing keys, so a store grows with every distinct client
    /// until this runs.
    fn maintain(&self) {
        for (limiter, evicted) in [
            (
                Budget::GATE,
                self.parent.is_none().then(|| release(&self.gate.store)),
            ),
            (Budget::ANONYMOUS, Some(release(&self.anonymous.store))),
            (Budget::ACTOR, Some(release(&self.actor.store))),
        ] {
            if let Some(evicted) = evicted {
                self.metrics.evicted_keys.add(
                    evicted as u64,
                    &[
                        self.metrics.scope.clone(),
                        KeyValue::new("limiter", limiter),
                    ],
                );
            }
        }
        self.metrics
            .maintenance_runs
            .add(1, core::slice::from_ref(&self.metrics.scope));
    }

    /// Charges one request against the store the budget names.
    ///
    /// Yields the [`Charge`] the response reports, or [`None`] in [`RateLimitMode::Observe`].
    /// Fails with a [`Denial`] when the budget is exhausted, in either mode.
    fn charge(&self, budget: Budget) -> Result<Option<Charge>, Denial> {
        match budget {
            Budget::Gate(key) => self.parent.as_ref().map_or_else(
                || self.charge_key(budget, &self.gate, &key),
                |parent| parent.charge(budget),
            ),
            Budget::Anonymous(key) => self.charge_key(budget, &self.anonymous, &key),
            Budget::Actor(actor) => self.charge_key(budget, &self.actor, &actor),
        }
    }

    /// Charges one request of `key` against `limiter`, recording it when it is over budget.
    fn charge_key<K>(
        &self,
        budget: Budget,
        limiter: &Limiter<K>,
        key: &K,
    ) -> Result<Option<Charge>, Denial>
    where
        K: fmt::Display + Clone + Eq + core::hash::Hash,
    {
        let not_until = match limiter.store.check_key(key) {
            Ok(snapshot) => {
                self.metrics.decision(budget, Outcome::Allowed);
                return Ok((self.mode == RateLimitMode::Enforce)
                    .then(|| limiter.policy.charge(snapshot.remaining_burst_capacity())));
            }
            Err(not_until) => not_until,
        };

        let wait = not_until.wait_time_from(limiter.store.clock().now());
        self.metrics
            .denial(budget, self.mode.denial_outcome(), wait);
        let retry_after = whole_seconds(wait);
        tracing::debug!(
            budget = budget.as_str(),
            key = %key,
            retry_after_seconds = retry_after.get(),
            mode = ?self.mode,
            "request over its rate-limit budget"
        );
        Err(Denial {
            retry_after,
            charge: limiter.policy.charge(0),
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
/// A request presenting the configured service secret passes unchecked. The secret is compared
/// with the configured value, so a request merely presenting the scheme stays gated. A request
/// whose client address cannot be determined passes unchecked too — reading the connection's
/// address requires serving the router with `into_make_service_with_connect_info`.
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
///         service_secret: None,
///     });
/// # }
/// ```
#[derive(Clone)]
pub struct IpGateLayer {
    /// The shared limiter state requests are charged against.
    pub limiters: Arc<RateLimiters>,
    /// The secret whose presenters pass unchecked, or [`None`] to exempt no request by secret.
    pub service_secret: Option<Pin<Arc<Secret<str>>>>,
}

impl<S> tower::Layer<S> for IpGateLayer {
    type Service = IpGateService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        IpGateService {
            inner,
            limiters: Arc::clone(&self.limiters),
            service_secret: self.service_secret.clone(),
        }
    }
}

/// The service [`IpGateLayer`] wraps its inner service into.
#[derive(Clone)]
pub struct IpGateService<S> {
    inner: S,

    limiters: Arc<RateLimiters>,
    service_secret: Option<Pin<Arc<Secret<str>>>>,
}

impl<B, R, S> tower::Service<http::Request<B>> for IpGateService<S>
where
    S: tower::Service<http::Request<B>, Response = http::Response<R>>,
{
    type Error = S::Error;
    type Response = Result<S::Response, TooManyRequests>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut task::Context<'_>) -> task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, mut req: http::Request<B>) -> Self::Future {
        let charge = if self
            .service_secret
            .as_deref()
            .is_some_and(|secret| presents_service_secret(req.headers(), secret))
        {
            self.limiters
                .metrics
                .unchecked(Stage::Gate, UncheckedReason::ServiceSecret);
            req.extensions_mut()
                .insert(ResolvedClientAddress::Unresolved);
            None
        } else {
            let resolved = self.limiters.client_key(&req);
            let charge = if let Some(key) = resolved {
                match self.limiters.charge(Budget::Gate(key)) {
                    Ok(charge) => charge,
                    Err(denial) => match denial.apply() {
                        Some(error) => return Either::Left(future::ready(Ok(Err(error)))),
                        None => None,
                    },
                }
            } else {
                self.limiters.note_unknown_address();
                None
            };
            req.extensions_mut().insert(resolved.map_or(
                ResolvedClientAddress::Unknown,
                ResolvedClientAddress::Bucketed,
            ));
            charge
        };

        Either::Right(
            self.inner
                .call(req)
                .map_ok(move |response| Ok(report(response, charge))),
        )
    }
}

/// Budgets requests by the caller the authentication middleware resolved.
///
/// Requests presenting the configured service secret pass unchecked, as does an anonymous request
/// whose client address cannot be determined. A route reached without the authentication
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
/// #     AuthenticationLayer, AuthenticationMetrics, Challenge,
/// #     provider::{AuthenticationProvider, Caller},
/// #     request::AuthenticationError,
/// # };
/// # use http::HeaderMap;
/// # use type_system::principal::actor::ActorId;
/// use hash_middleware::rate_limit::{CallerLimitLayer, IpGateLayer, RateLimiters};
/// # use hash_middleware::rate_limit::{ClientIpSource, RateLimitConfig, RateLimitMode};
///
/// # struct Verifier;
/// # impl<C: Caller> AuthenticationProvider<C> for Verifier {
/// #     async fn authenticate(
/// #         &self,
/// #         _headers: &HeaderMap,
/// #     ) -> ControlFlow<Result<C, Arc<Report<AuthenticationError>>>> {
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
/// # let provider = Arc::new(Verifier);
/// # let auth_metrics = Arc::new(AuthenticationMetrics::new(&meter));
///
/// let router: Router = Router::new()
///     .route("/entities", get(async || "ok"))
///     .route_layer(CallerLimitLayer {
///         limiters: Arc::clone(&limiters),
///         service_secret: None,
///     })
///     .route_layer(AuthenticationLayer::<_, Option<ActorId>> {
///         provider,
///         metrics: auth_metrics,
///         bootstrap: None,
///         challenge: Challenge::Bearer,
///         caller: PhantomData,
///     })
///     .layer(IpGateLayer {
///         limiters,
///         service_secret: None,
///     });
/// # }
/// ```
#[derive(Clone)]
pub struct CallerLimitLayer {
    /// The shared limiter state requests are charged against.
    pub limiters: Arc<RateLimiters>,
    /// The secret whose presenters pass unchecked, or [`None`] to exempt no request by secret.
    ///
    /// Behind an [`AuthenticationLayer`] with [`Bootstrap`] routes, this has to be the bootstrap
    /// secret.
    ///
    /// [`AuthenticationLayer`]: crate::authentication::AuthenticationLayer
    /// [`Bootstrap`]: crate::authentication::Bootstrap
    pub service_secret: Option<Pin<Arc<Secret<str>>>>,
}

impl<S> tower::Layer<S> for CallerLimitLayer {
    type Service = CallerLimitService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        CallerLimitService {
            inner,
            limiters: Arc::clone(&self.limiters),
            service_secret: self.service_secret.clone(),
        }
    }
}

/// The service [`CallerLimitLayer`] wraps its inner service into.
#[derive(Clone)]
pub struct CallerLimitService<S> {
    inner: S,

    limiters: Arc<RateLimiters>,
    service_secret: Option<Pin<Arc<Secret<str>>>>,
}

impl<S> CallerLimitService<S> {
    /// Charges `req` against the budget of its caller.
    ///
    /// Yields the charge its response reports, or [`None`] when the request passes unchecked.
    /// Fails with the rejection the layer answers instead.
    fn charge<B>(&self, req: &http::Request<B>) -> Result<Option<Charge>, RateLimitRejection> {
        if self
            .service_secret
            .as_deref()
            .is_some_and(|secret| presents_service_secret(req.headers(), secret))
        {
            self.limiters
                .metrics
                .unchecked(Stage::Caller, UncheckedReason::ServiceSecret);
            return Ok(None);
        }

        let Some(resolved) = req.extensions().get::<ResolvedAuthentication>() else {
            tracing::error!(
                method = %req.method(),
                path = req.uri().path(),
                "`CallerLimitLayer` ran on a route without authentication middleware"
            );

            self.limiters
                .metrics
                .misconfiguration(Misconfiguration::MissingAuthentication);
            return Err(RateLimitRejection::Misconfigured);
        };

        let actor = match resolved.outcome() {
            Ok(actor) => *actor,
            Err(error) => {
                // A stored error means a bootstrap route tolerated the failure, and those
                // requests presented the service secret and passed above. Reaching this
                // arm means the middleware order broke or this layer lacks the bootstrap secret,
                // so the report's attachments are the only account of what the provider saw:
                // `Display` would print the first context and drop them.
                tracing::error!(
                    method = %req.method(),
                    path = req.uri().path(),
                    error = ?error,
                    "authentication error reached the rate limiter unrejected"
                );

                self.limiters
                    .metrics
                    .misconfiguration(Misconfiguration::UnrejectedAuthenticationError);
                return Err(RateLimitRejection::Misconfigured);
            }
        };

        let budget = if let Some(actor) = actor {
            Budget::Actor(actor)
        } else {
            let Some(&resolved) = req.extensions().get::<ResolvedClientAddress>() else {
                tracing::error!(
                    method = %req.method(),
                    path = req.uri().path(),
                    "`CallerLimitLayer` ran on a route without the address gate"
                );
                self.limiters
                    .metrics
                    .misconfiguration(Misconfiguration::MissingAddressGate);
                return Err(RateLimitRejection::Misconfigured);
            };
            let key = match resolved {
                ResolvedClientAddress::Bucketed(key) => Some(key),
                ResolvedClientAddress::Unknown => None,
                ResolvedClientAddress::Unresolved => self.limiters.client_key(req),
            };
            let Some(key) = key else {
                // Counted per stage, so the gate's count of this address does not stand in for the
                // caller stage.
                self.limiters
                    .metrics
                    .unchecked(Stage::Caller, UncheckedReason::UnknownAddress);
                return Ok(None);
            };
            Budget::Anonymous(key)
        };

        match self.limiters.charge(budget) {
            Ok(charge) => Ok(charge),
            Err(denial) => denial
                .apply()
                .map_or(Ok(None), |error| Err(RateLimitRejection::from(error))),
        }
    }
}

/// Adds the fields of `charge` to `response`.
fn report<R>(mut response: http::Response<R>, charge: Option<Charge>) -> http::Response<R> {
    if let Some(charge) = charge {
        charge.append_to(response.headers_mut());
    }
    response
}

impl<B, R, S> tower::Service<http::Request<B>> for CallerLimitService<S>
where
    S: tower::Service<http::Request<B>, Response = http::Response<R>>,
{
    type Error = S::Error;
    type Response = Result<S::Response, RateLimitRejection>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut task::Context<'_>) -> task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: http::Request<B>) -> Self::Future {
        let charge = match self.charge(&req) {
            Ok(charge) => charge,
            Err(error) => return Either::Left(future::ready(Ok(Err(error)))),
        };

        Either::Right(
            self.inner
                .call(req)
                .map_ok(move |response| Ok(report(response, charge))),
        )
    }
}

//! Rate limiting for HTTP request handling.
//!
//! Two middlewares share the limiter state in `RateLimiters`. `ip_gate_middleware` runs ahead of
//! the authentication middleware and throttles each client address before credential
//! verification. `principal_limit_middleware` runs behind it and budgets requests by the resolved
//! principal: the actor for authenticated requests, counted across every address it connects
//! from, and the client address for anonymous ones.
//!
//! Requests presenting the service secret pass both middlewares unchecked. Both middlewares and
//! [`authentication_middleware`] have to share one secret: the principal limiter treats a stored
//! authentication error as unreachable because the requests it could arise from passed by secret
//! above.
//!
//! [`authentication_middleware`]: crate::authentication::authentication_middleware
//!
//! A request over its budget receives `429 Too Many Requests` with `Retry-After` in
//! [`RateLimitMode::Enforce`], and is served unchanged in [`RateLimitMode::Observe`], the
//! default. `Retry-After` is the whole client-facing contract: a served response says nothing
//! about the budget it crossed, and what enforcement would have done is read from the sweep
//! report instead.
//!
//! Denials, address fallbacks and unresolvable addresses log at debug. The eviction sweep reports
//! the store sizes every interval, at warn with the interval's totals whenever it saw one of
//! those, at info otherwise.
//!
//! Limiter state lives in process memory, so enforcement is per instance: a deployment with N
//! instances admits up to N times the configured rates, and a rolling release starts every budget
//! over.

mod address;
mod config;
#[cfg(test)]
mod tests;

use alloc::sync::Arc;
use core::{
    fmt,
    num::NonZeroU64,
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
use std::sync::LazyLock;

use axum::{body::Body, extract::Request, middleware::Next, response::Response};
use bytes::Bytes;
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
use type_system::principal::actor::ActorId;

use self::address::{BucketKey, ResolvedClientAddress};
pub use self::config::{ClientIpSource, RateLimitConfig, RateLimitMode};
use crate::{
    authentication::{ResolvedAuthentication, service_secret::presents_service_secret},
    response::{error_body, error_response},
};

/// How often replenished keys are evicted and the interval is reported.
const SWEEP_INTERVAL: Duration = Duration::from_secs(60);

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
    /// Returns the budget's name.
    const fn as_str(self) -> &'static str {
        match self {
            Self::Gate(_) => "gate",
            Self::Anonymous(_) => "anonymous",
            Self::Actor(_) => "actor",
        }
    }
}

/// The counters one sweep interval reports.
#[derive(Default)]
struct Tally {
    gate_denials: AtomicU64,
    anonymous_denials: AtomicU64,
    actor_denials: AtomicU64,
    address_fallbacks: AtomicU64,
    unknown_addresses: AtomicU64,
}

impl Tally {
    const fn denials(&self, budget: Budget) -> &AtomicU64 {
        match budget {
            Budget::Gate(_) => &self.gate_denials,
            Budget::Anonymous(_) => &self.anonymous_denials,
            Budget::Actor(_) => &self.actor_denials,
        }
    }

    /// Records a request whose client address could not be determined.
    fn note_unknown_address(&self) {
        self.unknown_addresses.fetch_add(1, Ordering::Relaxed);
        tracing::debug!(
            "client address unavailable, request passes the rate limiter unchecked; the router \
             has to be served with `into_make_service_with_connect_info`"
        );
    }

    /// Reads every counter and resets it.
    fn take(&self) -> Totals {
        let Self {
            gate_denials,
            anonymous_denials,
            actor_denials,
            address_fallbacks,
            unknown_addresses,
        } = self;
        Totals {
            gate_denials: gate_denials.swap(0, Ordering::Relaxed),
            anonymous_denials: anonymous_denials.swap(0, Ordering::Relaxed),
            actor_denials: actor_denials.swap(0, Ordering::Relaxed),
            address_fallbacks: address_fallbacks.swap(0, Ordering::Relaxed),
            unknown_addresses: unknown_addresses.swap(0, Ordering::Relaxed),
        }
    }
}

/// One interval's totals.
struct Totals {
    gate_denials: u64,
    anonymous_denials: u64,
    actor_denials: u64,
    address_fallbacks: u64,
    unknown_addresses: u64,
}

impl Totals {
    const fn is_empty(&self) -> bool {
        let Self {
            gate_denials,
            anonymous_denials,
            actor_denials,
            address_fallbacks,
            unknown_addresses,
        } = self;
        *gate_denials == 0
            && *anonymous_denials == 0
            && *actor_denials == 0
            && *address_fallbacks == 0
            && *unknown_addresses == 0
    }
}

/// A request found to be over its budget.
struct Denial {
    /// Whole seconds until the budget admits the request again, at least one.
    retry_after: NonZeroU64,
    mode: RateLimitMode,
}

impl Denial {
    /// Answers the request, awaiting `served` where the mode does not enforce the denial.
    async fn apply(self, served: impl Future<Output = Response>) -> Response {
        match self.mode {
            RateLimitMode::Enforce => too_many_requests(self.retry_after),
            RateLimitMode::Observe => served.await,
        }
    }
}

/// The shared limiter state both rate-limiting middlewares charge against.
///
/// Build one per router from the configuration, hand it to [`ip_gate_middleware`] and
/// [`principal_limit_middleware`] behind one [`Arc`], and call [`spawn_maintenance`] on it so
/// replenished keys are released.
///
/// [`spawn_maintenance`]: Self::spawn_maintenance
pub struct RateLimiters {
    mode: RateLimitMode,
    client_ip_source: ClientIpSource,
    gate: KeyedLimiter<BucketKey>,
    anonymous: KeyedLimiter<BucketKey>,
    actor: KeyedLimiter<ActorId>,
    tally: Tally,
}

impl RateLimiters {
    /// Creates the limiter state from the configuration.
    #[must_use]
    pub fn new(config: &RateLimitConfig) -> Self {
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
        Self {
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
            tally: Tally::default(),
        }
    }

    /// Spawns the eviction sweep and a watcher reporting its loss.
    ///
    /// The sweep holds a weak reference, so it cannot keep the state alive, and ends on the first
    /// tick after the state is dropped.
    ///
    /// # Panics
    ///
    /// Panics when called outside a Tokio runtime.
    pub fn spawn_maintenance(self: &Arc<Self>) {
        let limiters = Arc::downgrade(self);
        let sweeper = tokio::spawn(async move {
            let mut interval = tokio::time::interval(SWEEP_INTERVAL);
            loop {
                interval.tick().await;
                let Some(limiters) = limiters.upgrade() else {
                    tracing::debug!("rate-limiter state dropped, ending the eviction sweep");
                    break;
                };
                limiters.sweep();
            }
        });

        tokio::spawn(async move {
            if let Err(error) = sweeper.await {
                tracing::error!(
                    %error,
                    "rate-limiter eviction sweep stopped, keys are no longer released"
                );
            }
        });
    }

    /// Reads the budget key of a request from the configured source.
    ///
    /// Falls back to the connection's address when the configured header is unusable, which keys
    /// every client behind that proxy into one budget.
    fn client_key(&self, request: &Request) -> Option<BucketKey> {
        let Some(header) = self.client_ip_source.header() else {
            return address::peer(request);
        };
        match address::from_header(request, header) {
            Ok(key) => Some(key),
            Err(fallback) => {
                self.tally.address_fallbacks.fetch_add(1, Ordering::Relaxed);
                tracing::debug!(
                    reason = fallback.as_str(),
                    header = %header,
                    "client address read from the connection instead of the configured header"
                );
                address::peer(request)
            }
        }
    }

    #[cfg(test)]
    fn tracked_keys(&self) -> usize {
        self.gate.len() + self.anonymous.len() + self.actor.len()
    }

    /// Drops keys that regained their full budget, shrinks the stores, and reports the interval.
    ///
    /// Eviction is the only mechanism releasing keys, so a store grows with every distinct client
    /// until this runs.
    fn sweep(&self) {
        let Self {
            mode,
            client_ip_source: _,
            gate,
            anonymous,
            actor,
            tally,
        } = self;

        release(gate);
        release(anonymous);
        release(actor);

        let gate_keys = gate.len();
        let anonymous_keys = anonymous.len();
        let actor_keys = actor.len();
        let totals = tally.take();
        if totals.is_empty() {
            tracing::info!(
                gate_keys,
                anonymous_keys,
                actor_keys,
                mode = ?mode,
                "rate limiter interval report"
            );
            return;
        }

        tracing::warn!(
            gate_denials = totals.gate_denials,
            anonymous_denials = totals.anonymous_denials,
            actor_denials = totals.actor_denials,
            address_fallbacks = totals.address_fallbacks,
            unknown_addresses = totals.unknown_addresses,
            gate_keys,
            anonymous_keys,
            actor_keys,
            mode = ?mode,
            "rate limiter interval report"
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
            Ok(()) => return Ok(()),
            Err(not_until) => not_until,
        };

        self.tally.denials(budget).fetch_add(1, Ordering::Relaxed);
        let wait = not_until.wait_time_from(limiter.clock().now());
        let seconds = wait.as_secs() + u64::from(wait.subsec_nanos() > 0);
        let retry_after = NonZeroU64::new(seconds).unwrap_or(NonZeroU64::MIN);
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

/// Releases the keys of one store that regained their full budget.
fn release<K>(limiter: &KeyedLimiter<K>)
where
    K: core::hash::Hash + Eq + Clone,
{
    limiter.retain_recent();
    limiter.shrink_to_fit();
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
/// # use axum::{Router, middleware, routing::get};
/// use hash_middleware::rate_limit::{RateLimiters, ip_gate_middleware};
/// # use hash_middleware::rate_limit::{ClientIpSource, RateLimitConfig, RateLimitMode};
///
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
/// let limiters = Arc::new(RateLimiters::new(&config));
/// let service_secret: Arc<str> = Arc::from("service-secret");
///
/// // A `layer` rather than a `route_layer`, so unmatched paths draw on a budget too.
/// let router: Router =
///     Router::new()
///         .route("/entities", get(async || "ok"))
///         .layer(middleware::from_fn(move |request, next| {
///             ip_gate_middleware(
///                 Arc::clone(&limiters),
///                 Arc::clone(&service_secret),
///                 request,
///                 next,
///             )
///         }));
/// ```
pub async fn ip_gate_middleware(
    limiters: Arc<RateLimiters>,
    service_secret: Arc<str>,
    mut request: Request,
    next: Next,
) -> Response {
    if presents_service_secret(request.headers(), &service_secret) {
        return next.run(request).await;
    }

    let resolved = limiters.client_key(&request);
    request.extensions_mut().insert(resolved.map_or(
        ResolvedClientAddress::Unknown,
        ResolvedClientAddress::Bucketed,
    ));
    let Some(key) = resolved else {
        limiters.tally.note_unknown_address();
        return next.run(request).await;
    };

    match limiters.charge(Budget::Gate(key)) {
        Ok(()) => next.run(request).await,
        Err(denial) => denial.apply(next.run(request)).await,
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
/// # use core::{num::NonZeroU32, ops::ControlFlow};
/// # use std::sync::Arc;
/// # use axum::{Router, middleware, routing::get};
/// # use error_stack::Report;
/// # use hash_middleware::authentication::{
/// #     authentication_middleware,
/// #     provider::{AuthenticationProvider, Caller},
/// #     request::AuthenticationError,
/// # };
/// # use http::HeaderMap;
/// # use type_system::principal::actor::ActorId;
/// use hash_middleware::rate_limit::{
///     RateLimiters, ip_gate_middleware, principal_limit_middleware,
/// };
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
/// let limiters = Arc::new(RateLimiters::new(&config));
/// let service_secret: Arc<str> = Arc::from("service-secret");
/// # let provider = Arc::new(Verifier);
/// # let auth_secret = Arc::clone(&service_secret);
/// let principal_limiters = Arc::clone(&limiters);
/// let principal_secret = Arc::clone(&service_secret);
///
/// let router: Router = Router::new()
///     .route("/entities", get(async || "ok"))
///     .route_layer(middleware::from_fn(move |request, next| {
///         principal_limit_middleware(
///             Arc::clone(&principal_limiters),
///             Arc::clone(&principal_secret),
///             request,
///             next,
///         )
///     }))
///     .route_layer(middleware::from_fn(move |request, next| {
///         # let provider = Arc::clone(&provider);
///         # let auth_secret = Arc::clone(&auth_secret);
///         authentication_middleware::<_, Option<ActorId>>(
///             provider,
///             auth_secret,
///             |_path| false,
///             request,
///             next,
///         )
///     }))
///     .layer(middleware::from_fn(move |request, next| {
///         ip_gate_middleware(
///             Arc::clone(&limiters),
///             Arc::clone(&service_secret),
///             request,
///             next,
///         )
///     }));
/// ```
pub async fn principal_limit_middleware(
    limiters: Arc<RateLimiters>,
    service_secret: Arc<str>,
    request: Request,
    next: Next,
) -> Response {
    if presents_service_secret(request.headers(), &service_secret) {
        return next.run(request).await;
    }
    let Some(resolved) = request.extensions().get::<ResolvedAuthentication>() else {
        tracing::error!(
            path = request.uri().path(),
            "`principal_limit_middleware` ran on a route without authentication middleware"
        );
        return internal_error();
    };
    let actor = match resolved.outcome() {
        Ok(actor) => *actor,
        Err(error) => {
            // `authentication_middleware` stores an error only as `MissingDelegatedActor` on a
            // bootstrap route, and those requests present the service secret and passed above.
            tracing::error!(%error, "authentication error reached the rate limiter unrejected");
            return internal_error();
        }
    };

    let budget = if let Some(actor) = actor {
        Budget::Actor(actor)
    } else {
        let Some(resolved) = request.extensions().get::<ResolvedClientAddress>() else {
            tracing::error!(
                path = request.uri().path(),
                "`principal_limit_middleware` ran on a route without the address gate"
            );
            return internal_error();
        };
        let Some(key) = resolved.key() else {
            // The gate counted the unresolvable address already.
            return next.run(request).await;
        };
        Budget::Anonymous(key)
    };

    match limiters.charge(budget) {
        Ok(()) => next.run(request).await,
        Err(denial) => denial.apply(next.run(request)).await,
    }
}

/// The body every enforced denial answers with, built once.
static TOO_MANY_REQUESTS: LazyLock<Bytes> =
    LazyLock::new(|| Bytes::from(error_body("rate limit exceeded".to_owned())));

/// Builds the 429 response for a denied request.
fn too_many_requests(retry_after: NonZeroU64) -> Response {
    let mut response = Response::new(Body::from(TOO_MANY_REQUESTS.clone()));
    *response.status_mut() = http::StatusCode::TOO_MANY_REQUESTS;
    let headers = response.headers_mut();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(RETRY_AFTER, HeaderValue::from(retry_after.get()));
    response
}

fn internal_error() -> Response {
    error_response(
        http::StatusCode::INTERNAL_SERVER_ERROR,
        "internal server error".to_owned(),
    )
}

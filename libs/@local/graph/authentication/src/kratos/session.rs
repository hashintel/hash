//! Kratos session verification against the public API.

use alloc::sync::Arc;
use core::{num::NonZero, ops::ControlFlow, time::Duration};

use cookie::Cookie;
use error_stack::{Report, ResultExt as _};
use hash_middleware::authentication::{
    provider::{AuthenticationProvider, Caller},
    request::AuthenticationError,
};
use hmac::{Hmac, KeyInit as _, Mac as _};
use http::{HeaderMap, header};
use moka::future::Cache as MokaCache;
use opentelemetry::{
    KeyValue,
    metrics::{Counter, Meter},
};
use reqwest::{Client, Url, redirect};
use serde::Deserialize;
use sha2::Sha256;
use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};

use super::{MetadataPublic, provider_response, read_response_body};
use crate::actor::{ResolveActor, resolve_user_actor};

/// Name of the header carrying a Kratos session token.
pub const SESSION_TOKEN_HEADER: &str = "X-Session-Token";
/// Name of the Kratos session cookie within the `Cookie` header.
pub const SESSION_COOKIE_NAME: &str = "ory_kratos_session";

/// A Kratos session token, as carried by the `X-Session-Token` header.
struct SessionToken<'h>(&'h str);

/// The value of the `ory_kratos_session` cookie: the session token, its expiry and a nonce,
/// encrypted by Kratos.
struct SessionCookie<'h>(&'h str);

/// A session credential extracted from request headers.
enum SessionCredential<'h> {
    Token(SessionToken<'h>),
    Cookie(SessionCookie<'h>),
}

/// The cache key of a session credential: HMAC-SHA-256 over its form byte and value, under a
/// key drawn once per cache.
///
/// Two properties carry the cache. Collision resistance makes the digest the credential's
/// identity — not injectivity, which a cookie's state space already exceeds the digest for.
/// The key keeps a digest from being enumerated back to its credential, whatever the
/// credential's entropy, so the cache holds no session secrets. Without [`Debug`], so a digest
/// cannot reach logs.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
struct SessionCacheKey([u8; 32]);

/// Extracts a session credential from request headers.
///
/// A session token takes precedence over the session cookie. Returns `None` when neither an
/// `X-Session-Token` header nor an `ory_kratos_session` cookie is present, and an error when the
/// token is present but not decodable. Cookies are matched by name, and pairs that do not decode
/// or parse are skipped, so unrelated cookies neither trigger session verification nor mask the
/// session cookie.
fn extract_session_credential(
    headers: &HeaderMap,
) -> Option<Result<SessionCredential<'_>, Report<AuthenticationError>>> {
    if let Some(token) = headers.get(SESSION_TOKEN_HEADER) {
        return Some(
            token
                .to_str()
                .map(|token| SessionCredential::Token(SessionToken(token)))
                .change_context(AuthenticationError::malformed_credential()),
        );
    }

    for cookie_header in headers.get_all(header::COOKIE) {
        // Pairs are split on the byte level so a cookie that does not decode leaves its
        // neighbours readable.
        let value = cookie_header
            .as_bytes()
            .split(|&byte| byte == b';')
            .filter_map(|pair| core::str::from_utf8(pair).ok())
            .filter_map(|pair| Cookie::parse(pair).ok())
            .find_map(|cookie| {
                if cookie.name() == SESSION_COOKIE_NAME {
                    cookie.value_raw()
                } else {
                    None
                }
            });
        if let Some(value) = value {
            return Some(Ok(SessionCredential::Cookie(SessionCookie(value))));
        }
    }

    None
}

/// Deserialized subset of the Kratos whoami response.
#[derive(Deserialize)]
struct WhoamiResponse {
    active: Option<bool>,
    identity: WhoamiIdentity,
}

#[derive(Deserialize)]
struct WhoamiIdentity {
    id: String,
    metadata_public: Option<MetadataPublic>,
}

/// Configuration of the verified-session cache.
#[derive(Debug, Clone)]
pub struct SessionCacheConfig {
    /// How long a verified session is served from the cache.
    ///
    /// Counted from verification and unaffected by later hits, so it bounds how long the cache
    /// answers for revoked sessions and for actors the principal store no longer holds.
    pub ttl: Duration,
    /// Maximum number of verified sessions kept.
    pub capacity: NonZero<u64>,
}

impl SessionCacheConfig {
    /// Returns the configuration, [`None`] for a zero `ttl`.
    ///
    /// A zero `ttl` reads as "no cache": it would build a cache whose entries are born expired,
    /// paying the cache machinery without ever answering from it.
    #[must_use]
    pub fn new(ttl: Duration, capacity: NonZero<u64>) -> Option<Self> {
        (!ttl.is_zero()).then_some(Self { ttl, capacity })
    }
}

/// Configuration for [`KratosSessionProvider`].
#[derive(Debug, Clone)]
pub struct KratosSessionConfig {
    /// Base URL of the Kratos public API.
    pub kratos_public_url: Url,
    /// HTTP client timeout for whoami requests.
    pub http_timeout: Duration,
    /// The verified-session cache. Absent, every request verifies against Kratos.
    pub cache: Option<SessionCacheConfig>,
}

/// How a cache lookup was answered.
#[derive(Clone, Copy)]
enum CacheOutcome {
    /// Answered from the cache, or by a shared verification that succeeded.
    Hit,
    /// Verified freshly against Kratos.
    Miss,
    /// The verification failed, its own or a shared one.
    Failed,
}

impl CacheOutcome {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Hit => "hit",
            Self::Miss => "miss",
            Self::Failed => "failed",
        }
    }
}

/// The verified-session cache and the instrument its lookups are counted on.
struct SessionCache {
    verified: Arc<MokaCache<SessionCacheKey, UserId>>,
    key: [u8; 32],
    lookups: Counter<u64>,
}

impl SessionCache {
    fn new(config: &SessionCacheConfig, meter: &Meter) -> Self {
        let verified = Arc::new(
            MokaCache::builder()
                .max_capacity(config.capacity.get())
                .time_to_live(config.ttl)
                .build(),
        );

        // Weak, so the meter's callback does not keep the cache alive. Dropping the gauge
        // handle does not unregister it.
        let entries = Arc::downgrade(&verified);
        meter
            .u64_observable_gauge("hash.authentication.session_cache.entries")
            .with_description("Verified sessions currently cached")
            .with_unit("{session}")
            .with_callback(move |observer| {
                if let Some(cache) = entries.upgrade() {
                    observer.observe(cache.entry_count(), &[]);
                }
            })
            .build();

        Self {
            verified,
            key: rand::random(),
            lookups: meter
                .u64_counter("hash.authentication.session_cache.lookups")
                .with_description("Session-cache lookups by outcome")
                .with_unit("{lookup}")
                .build(),
        }
    }

    /// Derives the cache key of a credential.
    ///
    /// The leading byte separates the token and cookie forms: the same byte string is a
    /// different credential in a header than in a cookie.
    fn key(&self, credential: &SessionCredential<'_>) -> SessionCacheKey {
        let (form, value) = match credential {
            SessionCredential::Token(SessionToken(token)) => (0_u8, *token),
            SessionCredential::Cookie(SessionCookie(value)) => (1_u8, *value),
        };
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.key)
            .expect("HMAC should accept a key of any length");
        mac.update(&[form]);
        mac.update(value.as_bytes());
        SessionCacheKey(mac.finalize().into_bytes().into())
    }

    /// Resolves the key from the cache, verifying and caching on a miss.
    ///
    /// One verification runs per key at a time, and an `Err` is never cached: requests already
    /// waiting share the failure, the next request verifies afresh.
    async fn resolve(
        &self,
        key: SessionCacheKey,
        verify: impl Future<Output = Result<UserId, Report<AuthenticationError>>> + Send,
    ) -> Result<UserId, Arc<Report<AuthenticationError>>> {
        let resolution = self.verified.entry(key).or_try_insert_with(verify).await;

        let (outcome, resolution) = match resolution {
            Ok(entry) => (
                if entry.is_fresh() {
                    CacheOutcome::Miss
                } else {
                    CacheOutcome::Hit
                },
                Ok(entry.into_value()),
            ),
            Err(shared) => (CacheOutcome::Failed, Err(shared)),
        };
        self.lookups
            .add(1, &[KeyValue::new("outcome", outcome.as_str())]);

        resolution
    }
}

/// Verifies Kratos sessions and maps them to Graph actors.
///
/// Sessions are verified via the Kratos whoami endpoint. The actor is read from the
/// `graph_actor_id` field in the identity's `metadata_public` and checked to be an existing user
/// actor in the principal store.
///
/// With a [`SessionCacheConfig`], verified sessions are served from a bounded cache keyed by
/// hashed credential for at most the TTL, skipping Kratos and the principal store, and
/// concurrent requests for one credential share a single verification. Failures are never
/// cached: requests waiting on a failing verification share its error, the next request
/// verifies afresh.
pub struct KratosSessionProvider<R> {
    http_client: Client,
    whoami_url: Url,
    actor_resolver: R,
    cache: Option<SessionCache>,
}

impl<R> KratosSessionProvider<R> {
    /// Creates a new session provider from the given configuration.
    ///
    /// Cache lookups are counted on `meter`.
    ///
    /// # Panics
    ///
    /// Panics if the HTTP client cannot be built or the Kratos URL cannot be extended with the
    /// whoami path.
    #[must_use]
    pub fn new(config: KratosSessionConfig, actor_resolver: R, meter: &Meter) -> Self {
        let mut whoami_url = config.kratos_public_url;
        whoami_url
            .path_segments_mut()
            .expect("the Kratos public URL should be a valid base URL")
            .pop_if_empty()
            .extend(["sessions", "whoami"]);

        Self {
            // The whoami endpoint never redirects. Following a redirect would forward the
            // session token to the redirect target.
            http_client: Client::builder()
                .timeout(config.http_timeout)
                .redirect(redirect::Policy::none())
                .build()
                .expect("the HTTP client should build with default TLS configuration"),
            whoami_url,
            actor_resolver,
            cache: config.cache.map(|cache| SessionCache::new(&cache, meter)),
        }
    }
}

impl<R> KratosSessionProvider<R>
where
    R: ResolveActor,
{
    /// Verifies the credential against Kratos and validates the resulting actor.
    #[tracing::instrument(level = "debug", skip_all, fields(whoami_url = %self.whoami_url))]
    async fn verify_session(
        &self,
        credential: SessionCredential<'_>,
    ) -> Result<ActorEntityUuid, Report<AuthenticationError>> {
        let request = match credential {
            SessionCredential::Token(SessionToken(token)) => self
                .http_client
                .get(self.whoami_url.clone())
                .header(SESSION_TOKEN_HEADER, token),
            SessionCredential::Cookie(SessionCookie(cookie_value)) => {
                self.http_client.get(self.whoami_url.clone()).header(
                    header::COOKIE,
                    format!("{SESSION_COOKIE_NAME}={cookie_value}"),
                )
            }
        };

        let response = request
            .send()
            .await
            .change_context(AuthenticationError::provider_unreachable())?;

        // Kratos answers an unknown or expired session with 401 or 403, which is a credential
        // failure rather than a provider fault.
        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(Report::new(AuthenticationError::invalid_session())
                .attach(provider_response(status, response.text().await)));
        }

        let body = read_response_body(response).await?;
        // A whoami body carries the identity and its traits, so it stays out of the report. The
        // bodies that do get attached, here and in `read_response_body`, are Kratos error
        // responses without identity data.
        let whoami: WhoamiResponse = serde_json::from_str(&body)
            .change_context(AuthenticationError::invalid_provider_response())?;

        // The schema does not require `active`, so only an explicit `true` passes.
        if whoami.active != Some(true) {
            return Err(Report::new(AuthenticationError::invalid_session())
                .attach(format!("whoami reported active = {:?}", whoami.active)));
        }

        let Some(actor_uuid) = whoami
            .identity
            .metadata_public
            .and_then(|metadata| metadata.graph_actor_id)
        else {
            return Err(Report::new(AuthenticationError::not_provisioned(
                whoami.identity.id,
            )));
        };
        Ok(ActorEntityUuid::new(actor_uuid))
    }

    /// Verifies the credential against Kratos and resolves the actor it names.
    async fn verify_and_resolve(
        &self,
        credential: SessionCredential<'_>,
    ) -> Result<UserId, Report<AuthenticationError>> {
        let actor_uuid = self.verify_session(credential).await?;
        resolve_user_actor(&self.actor_resolver, actor_uuid).await
    }
}

impl<C, R> AuthenticationProvider<C> for KratosSessionProvider<R>
where
    C: Caller,
    R: ResolveActor,
{
    #[tracing::instrument(level = "debug", skip_all, fields(whoami_url = %self.whoami_url))]
    async fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> ControlFlow<Result<C, Arc<Report<AuthenticationError>>>> {
        let credential = match extract_session_credential(headers) {
            None => return ControlFlow::Continue(()),
            Some(Err(report)) => return ControlFlow::Break(Err(Arc::new(report))),
            Some(Ok(credential)) => credential,
        };

        let resolution = match &self.cache {
            Some(cache) => {
                let key = cache.key(&credential);
                cache
                    .resolve(key, self.verify_and_resolve(credential))
                    .await
            }
            None => self.verify_and_resolve(credential).await.map_err(Arc::new),
        };

        ControlFlow::Break(resolution.map(|user_id| C::from_actor(ActorId::User(user_id))))
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::{
        assert_matches,
        num::NonZero,
        ops::ControlFlow,
        sync::atomic::{AtomicBool, AtomicUsize, Ordering},
        time::Duration,
    };
    use std::collections::HashMap;

    use axum::{Json, Router, response::IntoResponse as _, routing::get};
    use hash_middleware::authentication::{
        provider::{AuthenticationProvider as _, expect_rejection},
        request::{ACTOR_ID_HEADER, AuthenticationError, AuthenticationErrorKind},
        service_secret::SERVICE_AUTH_SCHEME,
    };
    use http::{HeaderMap, HeaderValue, StatusCode};
    use opentelemetry::metrics::MeterProvider as _;
    use opentelemetry_sdk::metrics::{
        InMemoryMetricExporter, SdkMeterProvider,
        data::{
            AggregatedMetrics, GaugeDataPoint, MetricData, ResourceMetrics, ScopeMetrics,
            SumDataPoint,
        },
    };
    use reqwest::Url;
    use rstest::rstest;
    use serde_json::{Value as JsonValue, json};
    use type_system::principal::actor::{ActorEntityUuid, ActorId, MachineId};
    use uuid::Uuid;

    use super::{
        KratosSessionConfig, KratosSessionProvider, SESSION_COOKIE_NAME, SessionCacheConfig,
    };
    use crate::{
        actor::tests::{FixedActorResolver, known_user, random_actor},
        delegation::ServiceDelegationProvider,
        kratos::tests::spawn_fake_kratos,
    };

    const SESSION_TOKEN: &str = "test-session-token";

    /// The whoami response a fake Kratos serves.
    struct FakeSession {
        active: Option<bool>,
        graph_actor_id: Option<ActorEntityUuid>,
    }

    impl FakeSession {
        /// An active session whose identity is provisioned for the given actor.
        const fn active_for(actor_id: ActorEntityUuid) -> Self {
            Self {
                active: Some(true),
                graph_actor_id: Some(actor_id),
            }
        }

        /// An inactive session whose identity is provisioned for the given actor.
        const fn inactive_for(actor_id: ActorEntityUuid) -> Self {
            Self {
                active: Some(false),
                graph_actor_id: Some(actor_id),
            }
        }

        /// A session response missing the `active` flag entirely.
        const fn without_active_flag(actor_id: ActorEntityUuid) -> Self {
            Self {
                active: None,
                graph_actor_id: Some(actor_id),
            }
        }

        /// An active session whose identity has no Graph actor provisioned.
        const fn unprovisioned() -> Self {
            Self {
                active: Some(true),
                graph_actor_id: None,
            }
        }

        /// Builds the whoami wire format.
        fn into_whoami_json(self) -> JsonValue {
            let mut identity = json!({ "id": Uuid::new_v4() });
            if let Some(actor_id) = self.graph_actor_id {
                identity["metadata_public"] = json!({ "graph_actor_id": actor_id });
            }
            let mut whoami = json!({ "id": Uuid::new_v4(), "identity": identity });
            if let Some(active) = self.active {
                whoami["active"] = json!(active);
            }
            whoami
        }
    }

    /// A meter whose provider has no reader, so nothing records.
    fn noop_meter() -> opentelemetry::metrics::Meter {
        SdkMeterProvider::builder().build().meter("test")
    }

    fn provider_at(
        url: Url,
        actors: HashMap<ActorEntityUuid, ActorId>,
    ) -> KratosSessionProvider<FixedActorResolver> {
        KratosSessionProvider::new(
            KratosSessionConfig {
                kratos_public_url: url,
                http_timeout: Duration::from_secs(5),
                cache: None,
            },
            FixedActorResolver::new(actors),
            &noop_meter(),
        )
    }

    /// Spawns a fake Kratos counting the whoami requests it serves and returns a provider
    /// pointed at it.
    ///
    /// The fake only serves the session when the request carries the expected session token or
    /// session cookie, so any test that reaches verification also verifies credential forwarding.
    async fn counting_provider(
        session: FakeSession,
        actors: HashMap<ActorEntityUuid, ActorId>,
        cache: Option<SessionCacheConfig>,
        meter: &opentelemetry::metrics::Meter,
    ) -> (KratosSessionProvider<FixedActorResolver>, Arc<AtomicUsize>) {
        let verifications = Arc::new(AtomicUsize::new(0));
        let whoami = session.into_whoami_json();
        let counter = Arc::clone(&verifications);
        let router = Router::new().route(
            "/sessions/whoami",
            get(move |request_headers: HeaderMap| {
                let whoami = whoami.clone();
                let counter = Arc::clone(&counter);
                async move {
                    counter.fetch_add(1, Ordering::Relaxed);
                    let token_sent = request_headers
                        .get(super::SESSION_TOKEN_HEADER)
                        .is_some_and(|value| value.as_bytes() == SESSION_TOKEN.as_bytes());
                    let expected_cookie = format!("{SESSION_COOKIE_NAME}={SESSION_TOKEN}");
                    let cookie_sent = request_headers
                        .get_all(http::header::COOKIE)
                        .iter()
                        .any(|value| value.as_bytes() == expected_cookie.as_bytes());
                    if token_sent || cookie_sent {
                        Json(whoami).into_response()
                    } else {
                        StatusCode::UNAUTHORIZED.into_response()
                    }
                }
            }),
        );

        let provider = KratosSessionProvider::new(
            KratosSessionConfig {
                kratos_public_url: spawn_fake_kratos(router).await,
                http_timeout: Duration::from_secs(5),
                cache,
            },
            FixedActorResolver::new(actors),
            meter,
        );
        (provider, verifications)
    }

    /// Spawns a fake Kratos serving the given session and returns a provider pointed at it.
    async fn provider_for(
        session: FakeSession,
        actors: HashMap<ActorEntityUuid, ActorId>,
    ) -> KratosSessionProvider<FixedActorResolver> {
        counting_provider(session, actors, None, &noop_meter())
            .await
            .0
    }

    /// Spawns a fake Kratos failing the first verification with `first_response` and serving the
    /// session afterwards.
    async fn recovering_provider(
        first_response: StatusCode,
        session: FakeSession,
        actors: HashMap<ActorEntityUuid, ActorId>,
        cache: Option<SessionCacheConfig>,
    ) -> (KratosSessionProvider<FixedActorResolver>, Arc<AtomicUsize>) {
        let verifications = Arc::new(AtomicUsize::new(0));
        let whoami = session.into_whoami_json();
        let counter = Arc::clone(&verifications);
        let router = Router::new().route(
            "/sessions/whoami",
            get(move || {
                let whoami = whoami.clone();
                let counter = Arc::clone(&counter);
                async move {
                    if counter.fetch_add(1, Ordering::Relaxed) == 0 {
                        first_response.into_response()
                    } else {
                        Json(whoami).into_response()
                    }
                }
            }),
        );

        let provider = KratosSessionProvider::new(
            KratosSessionConfig {
                kratos_public_url: spawn_fake_kratos(router).await,
                http_timeout: Duration::from_secs(5),
                cache,
            },
            FixedActorResolver::new(actors),
            &noop_meter(),
        );
        (provider, verifications)
    }

    /// Spawns a fake Kratos serving one session per token and returns a provider pointed at it.
    async fn multi_session_provider(
        sessions: HashMap<String, ActorEntityUuid>,
        actors: HashMap<ActorEntityUuid, ActorId>,
        cache: Option<SessionCacheConfig>,
    ) -> (KratosSessionProvider<FixedActorResolver>, Arc<AtomicUsize>) {
        let verifications = Arc::new(AtomicUsize::new(0));
        let whoami_by_token: HashMap<String, JsonValue> = sessions
            .into_iter()
            .map(|(token, actor_id)| (token, FakeSession::active_for(actor_id).into_whoami_json()))
            .collect();
        let counter = Arc::clone(&verifications);
        let router = Router::new().route(
            "/sessions/whoami",
            get(move |request_headers: HeaderMap| {
                let whoami_by_token = whoami_by_token.clone();
                let counter = Arc::clone(&counter);
                async move {
                    counter.fetch_add(1, Ordering::Relaxed);
                    request_headers
                        .get(super::SESSION_TOKEN_HEADER)
                        .and_then(|token| token.to_str().ok())
                        .and_then(|token| whoami_by_token.get(token))
                        .map_or_else(
                            || StatusCode::UNAUTHORIZED.into_response(),
                            |whoami| Json(whoami.clone()).into_response(),
                        )
                }
            }),
        );

        let provider = KratosSessionProvider::new(
            KratosSessionConfig {
                kratos_public_url: spawn_fake_kratos(router).await,
                http_timeout: Duration::from_secs(5),
                cache,
            },
            FixedActorResolver::new(actors),
            &noop_meter(),
        );
        (provider, verifications)
    }

    /// A one-way latch: requests arriving before it opens wait, later ones pass straight through.
    struct Gate {
        open: AtomicBool,
        opened: tokio::sync::Notify,
    }

    impl Gate {
        fn open(&self) {
            self.open.store(true, Ordering::Release);
            self.opened.notify_waiters();
        }

        async fn passed(&self) {
            // Register before checking the flag, so an `open` between the check and the wait
            // still wakes this waiter.
            let opened = self.opened.notified();
            tokio::pin!(opened);
            opened.as_mut().enable();
            if !self.open.load(Ordering::Acquire) {
                opened.await;
            }
        }
    }

    /// Spawns a fake Kratos parking every request at `gate` until the test opens it: it signals
    /// `started` on arrival and answers with `failure` when one is given.
    async fn gated_provider(
        failure: Option<StatusCode>,
        session: FakeSession,
        actors: HashMap<ActorEntityUuid, ActorId>,
        cache: Option<SessionCacheConfig>,
        meter: &opentelemetry::metrics::Meter,
    ) -> (
        Arc<KratosSessionProvider<FixedActorResolver>>,
        Arc<AtomicUsize>,
        Arc<tokio::sync::Notify>,
        Arc<Gate>,
    ) {
        let verifications = Arc::new(AtomicUsize::new(0));
        let started = Arc::new(tokio::sync::Notify::new());
        let gate = Arc::new(Gate {
            open: AtomicBool::new(false),
            opened: tokio::sync::Notify::new(),
        });
        let whoami = session.into_whoami_json();
        let counter = Arc::clone(&verifications);
        let gate_started = Arc::clone(&started);
        let handler_gate = Arc::clone(&gate);
        let router = Router::new().route(
            "/sessions/whoami",
            get(move || {
                let whoami = whoami.clone();
                let counter = Arc::clone(&counter);
                let started = Arc::clone(&gate_started);
                let gate = Arc::clone(&handler_gate);
                async move {
                    counter.fetch_add(1, Ordering::Relaxed);
                    started.notify_one();
                    gate.passed().await;
                    failure.map_or_else(
                        || Json(whoami.clone()).into_response(),
                        axum::response::IntoResponse::into_response,
                    )
                }
            }),
        );

        let provider = Arc::new(KratosSessionProvider::new(
            KratosSessionConfig {
                kratos_public_url: spawn_fake_kratos(router).await,
                http_timeout: Duration::from_secs(5),
                cache,
            },
            FixedActorResolver::new(actors),
            meter,
        ));
        (provider, verifications, started, gate)
    }

    fn cache_config() -> SessionCacheConfig {
        SessionCacheConfig {
            ttl: Duration::from_secs(60),
            capacity: NonZero::new(64).expect("the capacity literal should be non-zero"),
        }
    }

    fn token_header(token: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            super::SESSION_TOKEN_HEADER,
            token
                .parse()
                .expect("the session token should be a valid header value"),
        );
        headers
    }

    fn session_token_header() -> HeaderMap {
        token_header(SESSION_TOKEN)
    }

    #[tokio::test]
    async fn session_token_resolves_provisioned_actor() {
        let actor_id = random_actor();
        let provider = provider_for(FakeSession::active_for(actor_id), known_user(actor_id)).await;

        let authentication: ControlFlow<Result<ActorId, _>> =
            provider.authenticate(&session_token_header()).await;

        assert!(
            matches!(
                authentication,
                ControlFlow::Break(Ok(ActorId::User(user_id)))
                if ActorEntityUuid::new(user_id) == actor_id
            ),
            "a valid session should verify to the provisioned user actor"
        );
    }

    #[tokio::test]
    async fn session_cookie_resolves_provisioned_actor() {
        let actor_id = random_actor();
        let provider = provider_for(FakeSession::active_for(actor_id), known_user(actor_id)).await;

        // The unrelated cookie carries a non-ASCII value. It must neither mask the session
        // cookie nor poison the extraction.
        let mut headers = HeaderMap::new();
        headers.insert(
            http::header::COOKIE,
            HeaderValue::from_bytes(
                format!("tracking=caf\u{e9}; {SESSION_COOKIE_NAME}={SESSION_TOKEN}").as_bytes(),
            )
            .expect("the cookie should be a valid header value"),
        );

        let authentication: ControlFlow<Result<ActorId, _>> = provider.authenticate(&headers).await;

        assert!(
            matches!(authentication, ControlFlow::Break(Ok(ActorId::User(_)))),
            "a session cookie next to non-ASCII cookies should verify"
        );
    }

    #[tokio::test]
    async fn malformed_session_token_fails_authentication() {
        let provider = provider_for(FakeSession::unprovisioned(), HashMap::new()).await;

        let mut headers = HeaderMap::new();
        headers.insert(
            super::SESSION_TOKEN_HEADER,
            HeaderValue::from_bytes(b"caf\xc3\xa9")
                .expect("the token should be a valid header value"),
        );

        let report = expect_rejection::<ActorId>(provider.authenticate(&headers).await);
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::MalformedCredential,
            "a non-ASCII session token should be rejected as malformed, not ignored"
        );
    }

    /// A fixed actor, so a case can point the session and the resolver at the same one.
    ///
    /// A real version 4 UUID, because the wire types reject UUIDs without an RFC 4122 version.
    fn case_actor() -> ActorEntityUuid {
        ActorEntityUuid::new(
            Uuid::parse_str("d290f1ee-6c54-4b01-90e6-d701748f0851")
                .expect("the case UUID should parse"),
        )
    }

    /// Each case covers a distinct rejecting branch of session verification.
    #[rstest]
    #[case::unprovisioned_identity(
        FakeSession::unprovisioned(),
        HashMap::new(),
        |error: &AuthenticationError| matches!(error.kind(), AuthenticationErrorKind::NotProvisioned { .. })
    )]
    #[case::unknown_actor(
        FakeSession::active_for(case_actor()),
        HashMap::new(),
        |error: &AuthenticationError| matches!(error.kind(), AuthenticationErrorKind::ActorNotFound { .. })
    )]
    #[case::machine_actor(
        FakeSession::active_for(case_actor()),
        HashMap::from([(case_actor(), ActorId::Machine(MachineId::new(case_actor())))]),
        |error: &AuthenticationError| matches!(error.kind(), AuthenticationErrorKind::NotAUser { .. })
    )]
    #[case::inactive_session(
        FakeSession::inactive_for(case_actor()),
        known_user(case_actor()),
        |error: &AuthenticationError| matches!(error.kind(), AuthenticationErrorKind::InvalidSession)
    )]
    #[case::session_without_active_flag(
        FakeSession::without_active_flag(case_actor()),
        known_user(case_actor()),
        |error: &AuthenticationError| matches!(error.kind(), AuthenticationErrorKind::InvalidSession)
    )]
    #[tokio::test]
    async fn invalid_session_fails_authentication(
        #[case] session: FakeSession,
        #[case] actors: HashMap<ActorEntityUuid, ActorId>,
        #[case] expected: fn(&AuthenticationError) -> bool,
    ) {
        let provider = provider_for(session, actors).await;

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&session_token_header()).await);
        assert!(
            expected(report.current_context()),
            "the session should fail authentication, got {:?}",
            report.current_context()
        );
    }

    #[tokio::test]
    async fn unrelated_cookies_carry_no_session_credential() {
        let provider = provider_for(FakeSession::unprovisioned(), HashMap::new()).await;

        let mut headers = HeaderMap::new();
        headers.insert(
            http::header::COOKIE,
            format!("analytics=on; theme=dark; my_{SESSION_COOKIE_NAME}_v2=nope")
                .parse()
                .expect("the cookie should be a valid header value"),
        );

        let decision: ControlFlow<Result<ActorId, _>> = provider.authenticate(&headers).await;
        assert!(
            matches!(decision, ControlFlow::Continue(())),
            "unrelated cookies should not be recognized as a session credential"
        );
    }

    #[tokio::test]
    async fn requests_without_credentials_carry_no_session_credential() {
        let provider = provider_for(FakeSession::unprovisioned(), HashMap::new()).await;

        let decision: ControlFlow<Result<ActorId, _>> =
            provider.authenticate(&HeaderMap::new()).await;
        assert!(
            matches!(decision, ControlFlow::Continue(())),
            "a request without session credentials should not be recognized"
        );
    }

    /// Spawns a fake Kratos serving a fixed response and returns a provider pointed at it.
    async fn provider_with_static_response(
        status: StatusCode,
        body: &'static str,
    ) -> KratosSessionProvider<FixedActorResolver> {
        let router = Router::new().route(
            "/sessions/whoami",
            get(move || async move { (status, body) }),
        );

        provider_at(spawn_fake_kratos(router).await, HashMap::new())
    }

    #[tokio::test]
    async fn forbidden_session_fails_authentication() {
        let provider = provider_with_static_response(StatusCode::FORBIDDEN, "{}").await;

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&session_token_header()).await);
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::InvalidSession,
            "a forbidden session should fail as an invalid session, not as provider unavailability"
        );
    }

    #[tokio::test]
    async fn redirecting_provider_fails_verification() {
        let provider = provider_with_static_response(StatusCode::FOUND, "").await;

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&session_token_header()).await);
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::ProviderUnreachable,
            "a redirecting provider should fail verification instead of being followed"
        );
    }

    /// A client error that is not 401 or 403 reports the provider, not the session.
    ///
    /// Widening the credential-failure check to every client error would tell a caller its session
    /// is invalid while Kratos is merely throttling.
    #[tokio::test]
    async fn rate_limited_provider_fails_verification() {
        let provider = provider_with_static_response(StatusCode::TOO_MANY_REQUESTS, "{}").await;

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&session_token_header()).await);
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::ProviderRejection,
            "a rate-limited provider should fail as a provider rejection, not as an invalid \
             session"
        );
    }

    #[tokio::test]
    async fn slow_provider_fails_verification() {
        let url = spawn_fake_kratos(Router::new().route(
            "/sessions/whoami",
            get(|| async {
                tokio::time::sleep(Duration::from_secs(5)).await;
                "{}"
            }),
        ))
        .await;
        let provider = KratosSessionProvider::new(
            KratosSessionConfig {
                kratos_public_url: url,
                http_timeout: Duration::from_millis(100),
                cache: None,
            },
            FixedActorResolver::new(HashMap::new()),
            &noop_meter(),
        );

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&session_token_header()).await);
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::ProviderUnreachable,
            "a provider exceeding the HTTP timeout should fail as provider unavailability"
        );
    }

    #[tokio::test]
    async fn undeserializable_whoami_response_fails_verification() {
        let provider =
            provider_with_static_response(StatusCode::OK, r#"{"identity-like": "body"}"#).await;

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&session_token_header()).await);
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::InvalidProviderResponse,
            "an undeserializable whoami response should fail as an invalid provider response"
        );
        assert!(
            !format!("{report:?}").contains("identity-like"),
            "the report should not carry the whoami response body"
        );
    }

    const CHAIN_SERVICE_SECRET: &str = "hash-svc-chain-test-secret";

    fn with_delegation_pair(mut headers: HeaderMap, actor_id: ActorEntityUuid) -> HeaderMap {
        headers.insert(
            http::header::AUTHORIZATION,
            format!("{SERVICE_AUTH_SCHEME} {CHAIN_SERVICE_SECRET}")
                .parse()
                .expect("the credential should be a valid header value"),
        );
        headers.insert(
            ACTOR_ID_HEADER,
            actor_id
                .to_string()
                .parse()
                .expect("a UUID should be a valid header value"),
        );
        headers
    }

    #[tokio::test]
    async fn chain_rejects_invalid_session_despite_delegation_pair() {
        let chain = (
            provider_with_static_response(StatusCode::UNAUTHORIZED, "{}").await,
            ServiceDelegationProvider::new(
                CHAIN_SERVICE_SECRET.to_owned(),
                FixedActorResolver::new(HashMap::new()),
            ),
        );

        let headers = with_delegation_pair(session_token_header(), random_actor());

        let report = expect_rejection::<ActorId>(chain.authenticate(&headers).await);

        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::InvalidSession,
            "an invalid session should reject even when a valid delegation pair is present"
        );
    }

    #[tokio::test]
    async fn chain_resolves_session_actor_over_delegated_actor() {
        let session_actor = random_actor();
        let chain = (
            provider_for(
                FakeSession::active_for(session_actor),
                known_user(session_actor),
            )
            .await,
            ServiceDelegationProvider::new(
                CHAIN_SERVICE_SECRET.to_owned(),
                FixedActorResolver::new(HashMap::new()),
            ),
        );

        let headers = with_delegation_pair(session_token_header(), random_actor());

        let decision: ControlFlow<Result<ActorId, _>> = chain.authenticate(&headers).await;
        assert!(
            matches!(
                decision,
                ControlFlow::Break(Ok(ActorId::User(user_id)))
                    if ActorEntityUuid::new(user_id) == session_actor
            ),
            "a valid session should act as the session user, not the delegated actor"
        );
    }

    #[tokio::test]
    async fn cache_serves_repeated_requests_without_reverification() {
        let actor_id = random_actor();
        let (provider, verifications) = counting_provider(
            FakeSession::active_for(actor_id),
            known_user(actor_id),
            Some(cache_config()),
            &noop_meter(),
        )
        .await;

        for _ in 0..2 {
            let authentication: ControlFlow<Result<ActorId, _>> =
                provider.authenticate(&session_token_header()).await;
            assert_matches!(
                authentication,
                ControlFlow::Break(Ok(_)),
                "the session should authenticate on every request"
            );
        }

        assert_eq!(
            verifications.load(Ordering::Relaxed),
            1,
            "the second request should be served from the cache"
        );
    }

    #[tokio::test]
    async fn uncached_provider_verifies_every_request() {
        let actor_id = random_actor();
        let (provider, verifications) = counting_provider(
            FakeSession::active_for(actor_id),
            known_user(actor_id),
            None,
            &noop_meter(),
        )
        .await;

        for _ in 0..2 {
            let authentication: ControlFlow<Result<ActorId, _>> =
                provider.authenticate(&session_token_header()).await;
            assert_matches!(
                authentication,
                ControlFlow::Break(Ok(_)),
                "the session should authenticate on every request"
            );
        }

        assert_eq!(
            verifications.load(Ordering::Relaxed),
            2,
            "without a cache every request should verify"
        );
    }

    #[tokio::test]
    async fn failed_verification_stays_uncached() {
        let actor_id = random_actor();
        let (provider, verifications) = recovering_provider(
            StatusCode::UNAUTHORIZED,
            FakeSession::active_for(actor_id),
            known_user(actor_id),
            Some(cache_config()),
        )
        .await;

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&session_token_header()).await);
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::InvalidSession,
            "the first request should carry the provider's failure"
        );

        let authentication: ControlFlow<Result<ActorId, _>> =
            provider.authenticate(&session_token_header()).await;
        assert_matches!(
            authentication,
            ControlFlow::Break(Ok(_)),
            "the request after a failure should verify afresh and succeed"
        );
        assert_eq!(
            verifications.load(Ordering::Relaxed),
            2,
            "both requests should reach the provider"
        );
    }

    #[tokio::test]
    async fn distinct_credentials_resolve_their_own_actors() {
        let first_actor = random_actor();
        let second_actor = random_actor();
        let mut actors = known_user(first_actor);
        actors.extend(known_user(second_actor));
        let (provider, verifications) = multi_session_provider(
            HashMap::from([
                ("first-token".to_owned(), first_actor),
                ("second-token".to_owned(), second_actor),
            ]),
            actors,
            Some(cache_config()),
        )
        .await;
        for _ in 0..2 {
            let first: ControlFlow<Result<ActorId, _>> =
                provider.authenticate(&token_header("first-token")).await;
            assert_matches!(
                first,
                ControlFlow::Break(Ok(ActorId::User(user_id)))
                    if ActorEntityUuid::new(user_id) == first_actor,
                "the first token should resolve to its own actor"
            );
            let second: ControlFlow<Result<ActorId, _>> =
                provider.authenticate(&token_header("second-token")).await;
            assert_matches!(
                second,
                ControlFlow::Break(Ok(ActorId::User(user_id)))
                    if ActorEntityUuid::new(user_id) == second_actor,
                "the second token should resolve to its own actor"
            );
        }

        assert_eq!(
            verifications.load(Ordering::Relaxed),
            2,
            "each credential should verify once and stay separate in the cache"
        );
    }

    #[tokio::test]
    async fn concurrent_requests_share_one_verification() {
        let actor_id = random_actor();
        let (provider, verifications, started, gate) = gated_provider(
            None,
            FakeSession::active_for(actor_id),
            known_user(actor_id),
            Some(cache_config()),
            &noop_meter(),
        )
        .await;

        let leader = tokio::spawn({
            let provider = Arc::clone(&provider);
            async move {
                let authentication: ControlFlow<Result<ActorId, _>> =
                    provider.authenticate(&session_token_header()).await;
                authentication
            }
        });
        started.notified().await;
        let waiter = tokio::spawn({
            let provider = Arc::clone(&provider);
            async move {
                let authentication: ControlFlow<Result<ActorId, _>> =
                    provider.authenticate(&session_token_header()).await;
                authentication
            }
        });
        // Give the waiter time to join the in-flight verification. Arriving after it resolved
        // still hits the cache, so the assertion below holds either way.
        tokio::time::sleep(Duration::from_millis(100)).await;
        gate.open();

        for handle in [leader, waiter] {
            let authentication = handle.await.expect("the request should not panic");
            assert_matches!(
                authentication,
                ControlFlow::Break(Ok(_)),
                "every concurrent request should authenticate"
            );
        }
        assert_eq!(
            verifications.load(Ordering::Relaxed),
            1,
            "concurrent requests for one credential should share one verification"
        );
    }

    #[tokio::test]
    async fn shared_failed_verification_rejects_every_waiter() {
        let (meter_provider, exporter) = recording_meter();
        let actor_id = random_actor();
        let (provider, _verifications, started, gate) = gated_provider(
            Some(StatusCode::UNAUTHORIZED),
            FakeSession::active_for(actor_id),
            known_user(actor_id),
            Some(cache_config()),
            &meter_provider.meter("test"),
        )
        .await;

        let leader = tokio::spawn({
            let provider = Arc::clone(&provider);
            async move {
                let authentication: ControlFlow<Result<ActorId, _>> =
                    provider.authenticate(&session_token_header()).await;
                authentication
            }
        });
        started.notified().await;
        let waiter = tokio::spawn({
            let provider = Arc::clone(&provider);
            async move {
                let authentication: ControlFlow<Result<ActorId, _>> =
                    provider.authenticate(&session_token_header()).await;
                authentication
            }
        });
        tokio::time::sleep(Duration::from_millis(100)).await;
        gate.open();

        for handle in [leader, waiter] {
            let report = expect_rejection(handle.await.expect("the request should not panic"));
            assert_matches!(
                report.current_context().kind(),
                AuthenticationErrorKind::InvalidSession,
                "every request sharing the failed verification should carry its rejection"
            );
        }
        assert_eq!(
            recorded_lookups(&meter_provider, &exporter, "failed"),
            2,
            "both lookups should count as failed, not as hits"
        );
        assert_eq!(
            recorded_lookups(&meter_provider, &exporter, "hit"),
            0,
            "a shared failure should never count as a hit"
        );
    }

    #[tokio::test]
    async fn capacity_bounds_the_cached_sessions() {
        let first_actor = random_actor();
        let second_actor = random_actor();
        let mut actors = known_user(first_actor);
        actors.extend(known_user(second_actor));
        let (provider, verifications) = multi_session_provider(
            HashMap::from([
                ("first-token".to_owned(), first_actor),
                ("second-token".to_owned(), second_actor),
            ]),
            actors,
            Some(SessionCacheConfig {
                ttl: Duration::from_secs(60),
                capacity: NonZero::new(1).expect("the capacity literal should be non-zero"),
            }),
        )
        .await;
        let _: ControlFlow<Result<ActorId, _>> =
            provider.authenticate(&token_header("first-token")).await;
        let _: ControlFlow<Result<ActorId, _>> =
            provider.authenticate(&token_header("second-token")).await;
        provider
            .cache
            .as_ref()
            .expect("the provider should be caching")
            .verified
            .run_pending_tasks()
            .await;

        let _: ControlFlow<Result<ActorId, _>> =
            provider.authenticate(&token_header("first-token")).await;
        let _: ControlFlow<Result<ActorId, _>> =
            provider.authenticate(&token_header("second-token")).await;

        assert!(
            verifications.load(Ordering::Relaxed) >= 3,
            "a cache bounded to one session should have evicted one of the two"
        );
    }

    #[tokio::test]
    async fn token_and_cookie_forms_cache_separately() {
        let actor_id = random_actor();
        let (provider, verifications) = counting_provider(
            FakeSession::active_for(actor_id),
            known_user(actor_id),
            Some(cache_config()),
            &noop_meter(),
        )
        .await;

        let by_token: ControlFlow<Result<ActorId, _>> =
            provider.authenticate(&session_token_header()).await;
        assert_matches!(
            by_token,
            ControlFlow::Break(Ok(_)),
            "the token form should authenticate"
        );

        let mut headers = HeaderMap::new();
        headers.insert(
            http::header::COOKIE,
            format!("{SESSION_COOKIE_NAME}={SESSION_TOKEN}")
                .parse()
                .expect("the cookie should be a valid header value"),
        );
        let by_cookie: ControlFlow<Result<ActorId, _>> = provider.authenticate(&headers).await;
        assert_matches!(
            by_cookie,
            ControlFlow::Break(Ok(_)),
            "the cookie form should authenticate"
        );

        assert_eq!(
            verifications.load(Ordering::Relaxed),
            2,
            "the cookie form should verify separately from the token form"
        );
    }

    #[tokio::test]
    async fn ttl_counts_from_verification_not_from_last_use() {
        let actor_id = random_actor();
        let (provider, verifications) = counting_provider(
            FakeSession::active_for(actor_id),
            known_user(actor_id),
            Some(SessionCacheConfig {
                ttl: Duration::from_secs(2),
                capacity: NonZero::new(64).expect("the capacity literal should be non-zero"),
            }),
            &noop_meter(),
        )
        .await;
        let authenticate = || async {
            let authentication: ControlFlow<Result<ActorId, _>> =
                provider.authenticate(&session_token_header()).await;
            assert_matches!(
                authentication,
                ControlFlow::Break(Ok(_)),
                "the session should authenticate on every request"
            );
        };

        let verified_at = tokio::time::Instant::now();
        authenticate().await;
        tokio::time::sleep(Duration::from_millis(500)).await;
        assert!(
            verified_at.elapsed() < Duration::from_secs(2),
            "the second request should run inside the TTL window"
        );
        authenticate().await;
        assert_eq!(
            verifications.load(Ordering::Relaxed),
            1,
            "a hit inside the TTL should not verify"
        );

        // Now ~2.2s after verification: past the TTL, but before the point an idle timer reset
        // by the hit at ~0.5s would expire (~2.5s).
        tokio::time::sleep(Duration::from_millis(1700)).await;
        assert!(
            verified_at.elapsed() < Duration::from_millis(2500),
            "the third request should run before an idle timer would have expired the entry"
        );
        authenticate().await;
        assert_eq!(
            verifications.load(Ordering::Relaxed),
            2,
            "the request after the TTL should verify afresh"
        );
    }

    /// A meter provider recording into an in-memory exporter.
    fn recording_meter() -> (SdkMeterProvider, InMemoryMetricExporter) {
        let exporter = InMemoryMetricExporter::default();
        let provider = SdkMeterProvider::builder()
            .with_periodic_exporter(exporter.clone())
            .build();
        (provider, exporter)
    }

    /// Reads the metric's data in the latest export, after a flush.
    fn read_metric<T>(
        provider: &SdkMeterProvider,
        exporter: &InMemoryMetricExporter,
        name: &str,
        read: impl FnOnce(&AggregatedMetrics) -> T,
    ) -> Option<T> {
        provider
            .force_flush()
            .expect("the meter provider should flush");
        exporter
            .get_finished_metrics()
            .expect("the exporter should hand out its exports")
            .last()
            .into_iter()
            .flat_map(ResourceMetrics::scope_metrics)
            .flat_map(ScopeMetrics::metrics)
            .find(|metric| metric.name() == name)
            .map(|metric| read(metric.data()))
    }

    /// The lookup count recorded for the outcome.
    fn recorded_lookups(
        provider: &SdkMeterProvider,
        exporter: &InMemoryMetricExporter,
        outcome: &str,
    ) -> u64 {
        read_metric(
            provider,
            exporter,
            "hash.authentication.session_cache.lookups",
            |data| {
                let AggregatedMetrics::U64(MetricData::Sum(sum)) = data else {
                    return 0;
                };
                sum.data_points()
                    .filter(|point| {
                        point.attributes().any(|attribute| {
                            attribute.key.as_str() == "outcome"
                                && attribute.value.as_str() == outcome
                        })
                    })
                    .map(SumDataPoint::value)
                    .sum()
            },
        )
        .unwrap_or(0)
    }

    /// The entry count the gauge reported, [`None`] before its first export.
    fn recorded_entries(
        provider: &SdkMeterProvider,
        exporter: &InMemoryMetricExporter,
    ) -> Option<u64> {
        read_metric(
            provider,
            exporter,
            "hash.authentication.session_cache.entries",
            |data| {
                let AggregatedMetrics::U64(MetricData::Gauge(gauge)) = data else {
                    return None;
                };
                gauge.data_points().map(GaugeDataPoint::value).last()
            },
        )
        .flatten()
    }

    #[tokio::test]
    async fn cache_lookups_reach_the_meter_with_their_outcome() {
        let (meter_provider, exporter) = recording_meter();
        let actor_id = random_actor();
        let (provider, _verifications) = counting_provider(
            FakeSession::active_for(actor_id),
            known_user(actor_id),
            Some(cache_config()),
            &meter_provider.meter("test"),
        )
        .await;

        for _ in 0..2 {
            let authentication: ControlFlow<Result<ActorId, _>> =
                provider.authenticate(&session_token_header()).await;
            assert_matches!(
                authentication,
                ControlFlow::Break(Ok(_)),
                "the session should authenticate on every request"
            );
        }

        assert_eq!(
            recorded_lookups(&meter_provider, &exporter, "miss"),
            1,
            "the first lookup should count as a miss"
        );
        assert_eq!(
            recorded_lookups(&meter_provider, &exporter, "hit"),
            1,
            "the second lookup should count as a hit"
        );
    }

    #[tokio::test]
    async fn entries_gauge_reads_the_cache() {
        let (meter_provider, exporter) = recording_meter();
        let actor_id = random_actor();
        let (provider, _verifications) = counting_provider(
            FakeSession::active_for(actor_id),
            known_user(actor_id),
            Some(cache_config()),
            &meter_provider.meter("test"),
        )
        .await;

        // The entry count is eventually consistent and converges through cache activity.
        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        loop {
            let authentication: ControlFlow<Result<ActorId, _>> =
                provider.authenticate(&session_token_header()).await;
            assert_matches!(
                authentication,
                ControlFlow::Break(Ok(_)),
                "the session should authenticate on every request"
            );
            if recorded_entries(&meter_provider, &exporter) == Some(1) {
                break;
            }
            assert!(
                tokio::time::Instant::now() < deadline,
                "the entries gauge should reach the cached session before the deadline"
            );
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }
}

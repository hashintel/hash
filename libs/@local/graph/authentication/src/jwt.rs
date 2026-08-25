//! JWT validation against a JWKS endpoint.
//!
//! Primarily designed for Cloudflare Access but compatible with any OIDC-compliant JWT issuer.

use core::time::Duration;
use std::{
    sync::{PoisonError, RwLock},
    time::Instant,
};

use error_stack::{Report, ResultExt as _};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use reqwest::{Client, Url};
use serde::Deserialize;
use tokio::sync::Mutex;

/// Validated claims from an authenticated JWT.
///
/// All validation (signature, expiration, audience, issuer) has already been performed by the
/// [`JwtValidator`].
#[derive(Debug, Clone, Deserialize)]
pub struct JwtClaims {
    /// Subject identifier of the authenticated principal.
    pub sub: String,
    /// Email address of the authenticated principal.
    pub email: Option<String>,
}

/// Errors that can occur during JWT validation.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum JwtError {
    /// JWKS endpoint could not be reached or returned invalid data.
    #[display("failed to fetch JWKS")]
    JwksFetch,
    /// JWT decoding or signature verification failed.
    #[display("JWT validation failed")]
    Validation,
    /// JWT header has no `kid` field.
    #[display("JWT header is missing `kid` (key ID)")]
    MissingKeyId,
    /// The `kid` in the JWT does not match any key in the JWKS.
    #[display("unknown key ID: {kid}")]
    UnknownKeyId {
        /// The key ID that was not found.
        kid: String,
    },
    /// The JWKS supplied a key that cannot be used for verification.
    ///
    /// A fault of the provider, not of the token: the key it names exists but is unusable, so
    /// every token signed with it fails.
    #[display("the JWKS entry for key ID `{kid}` is unusable")]
    UnusableKey {
        /// The key ID whose JWKS entry could not be turned into a verification key.
        kid: String,
    },
}

/// Configuration for [`JwtValidator`].
#[derive(Debug, Clone)]
pub struct JwtValidatorConfig {
    /// JWKS endpoint URL.
    pub jwks_url: Url,
    /// Expected audience claim.
    pub audience: String,
    /// Expected issuer claim.
    pub issuer: String,
    /// How long to cache JWKS keys before re-fetching.
    pub jwks_cache_ttl: Duration,
    /// Minimum interval between forced JWKS refreshes (unknown key ID).
    pub jwks_refresh_cooldown: Duration,
    /// HTTP client timeout for JWKS fetches.
    pub http_timeout: Duration,
    /// Algorithms accepted in JWT headers.
    pub allowed_algorithms: Vec<Algorithm>,
}

/// How stale a cached key set may be to satisfy a read.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum JwksRead {
    /// Within the cache TTL.
    Cached,
    /// Within the refresh cooldown, which bounds the fetches a crafted `kid` can trigger.
    Refresh,
}

/// Validates JWTs against a JWKS endpoint.
///
/// Fetches public keys from the configured JWKS URL and caches them. Keys are refreshed when the
/// cache TTL expires or when a token references an unknown key ID (to handle key rotation).
pub struct JwtValidator {
    audience: String,
    issuer: String,
    jwks_url: Url,
    /// Serializes JWKS fetches so only one outbound request is in-flight at a time.
    ///
    /// The HTTP client is behind the mutex to enforce that all outbound JWKS requests go through
    /// this serialization point.
    http_client: Mutex<Client>,
    cache: RwLock<Option<(Instant, JwkSet)>>,
    /// When the last fetch attempt failed.
    ///
    /// Without this, a failing endpoint leaves the cache empty and every request mounts its own
    /// fetch — the cooldown only bounds requests once a fetch has succeeded.
    last_failure: RwLock<Option<Instant>>,
    jwks_cache_ttl: Duration,
    jwks_refresh_cooldown: Duration,
    allowed_algorithms: Vec<Algorithm>,
}

impl JwtValidator {
    /// Creates a new JWT validator from the given configuration.
    ///
    /// Does not eagerly fetch JWKS -- the first request triggers the initial fetch.
    ///
    /// # Panics
    ///
    /// Panics if the HTTP client cannot be built (should not happen with default TLS config).
    #[must_use]
    pub fn new(config: JwtValidatorConfig) -> Self {
        Self {
            audience: config.audience,
            issuer: config.issuer,
            jwks_url: config.jwks_url,
            http_client: Mutex::new(
                Client::builder()
                    .timeout(config.http_timeout)
                    .build()
                    .expect("the HTTP client should build with default TLS configuration"),
            ),
            cache: RwLock::new(None),
            last_failure: RwLock::new(None),
            jwks_cache_ttl: config.jwks_cache_ttl,
            jwks_refresh_cooldown: config.jwks_refresh_cooldown,
            allowed_algorithms: config.allowed_algorithms,
        }
    }

    /// Validates a JWT token string and returns the decoded claims.
    ///
    /// # Errors
    ///
    /// - [`Validation`] if the token header cannot be decoded, signature verification fails, or
    ///   claims are invalid (expired, wrong audience/issuer)
    /// - [`MissingKeyId`] if the token has no `kid` header
    /// - [`JwksFetch`] if the JWKS endpoint cannot be reached
    /// - [`UnknownKeyId`] if the `kid` does not match any key in the JWKS
    ///
    /// [`Validation`]: JwtError::Validation
    /// [`MissingKeyId`]: JwtError::MissingKeyId
    /// [`JwksFetch`]: JwtError::JwksFetch
    /// [`UnknownKeyId`]: JwtError::UnknownKeyId
    pub async fn validate(&self, token: &str) -> Result<JwtClaims, Report<JwtError>> {
        let header = decode_header(token).change_context(JwtError::Validation)?;

        if !self.allowed_algorithms.contains(&header.alg) {
            return Err(Report::new(JwtError::Validation))
                .attach(format!("algorithm {:?} is not allowed", header.alg));
        }

        let kid = header.kid.ok_or(JwtError::MissingKeyId)?;

        let decoding_key = self.resolve_decoding_key(&kid).await?;

        // jsonwebtoken v10 requires all algorithms in the validation list to share the same key
        // family, so we pass only the token's algorithm (already checked above).
        let mut validation = Validation::new(header.alg);
        validation.set_audience(&[&self.audience]);
        validation.set_issuer(&[&self.issuer]);
        // `set_audience` and `set_issuer` only compare a claim that is present, and only `exp` is
        // required by default. Without this, a token omitting `aud` verifies — and `aud` is what
        // scopes a token to this application, since every application of a Cloudflare Access team
        // is signed by the same keys.
        validation.set_required_spec_claims(&["exp", "aud", "iss"]);
        validation.validate_nbf = true;

        Ok(decode::<JwtClaims>(token, &decoding_key, &validation)
            .change_context(JwtError::Validation)?
            .claims)
    }

    /// Resolves a [`DecodingKey`] for the given key ID from the cached JWKS.
    ///
    /// If the key ID is not found in the cache, forces a refresh in case of key rotation.
    async fn resolve_decoding_key(&self, kid: &str) -> Result<DecodingKey, Report<JwtError>> {
        // Try cached JWKS first
        let jwks = self.get_jwks(JwksRead::Cached).await?;
        if let Some(jwk) = jwks.find(kid) {
            return DecodingKey::from_jwk(jwk).change_context(JwtError::UnusableKey {
                kid: kid.to_owned(),
            });
        }

        // Key not found -- may be a rotation, force refresh
        let refreshed = self.get_jwks(JwksRead::Refresh).await?;
        let jwk = refreshed.find(kid).ok_or_else(|| JwtError::UnknownKeyId {
            kid: kid.to_owned(),
        })?;
        DecodingKey::from_jwk(jwk).change_context(JwtError::UnusableKey {
            kid: kid.to_owned(),
        })
    }

    /// Returns the cached JWKS or fetches a fresh copy.
    ///
    /// The fetch mutex ensures only one outbound JWKS request is in-flight at a time. Concurrent
    /// callers wait for the single fetch to complete and then re-check the cache.
    async fn get_jwks(&self, read: JwksRead) -> Result<JwkSet, Report<JwtError>> {
        // Fast path: serve from cache without acquiring the HTTP client lock.
        if let Some(jwks) = self.cached_jwks(read) {
            return Ok(jwks);
        }
        self.check_failure_cooldown()?;

        // Serialize fetches — only one task fetches at a time.
        let http_client = self.http_client.lock().await;

        // Re-check after acquiring the lock: another task may have refreshed while we waited.
        if let Some(jwks) = self.cached_jwks(read) {
            return Ok(jwks);
        }
        self.check_failure_cooldown()?;

        let jwks = self.fetch_jwks(&http_client).await.inspect_err(|_error| {
            *self
                .last_failure
                .write()
                .unwrap_or_else(PoisonError::into_inner) = Some(Instant::now());
        })?;

        {
            let mut cache = self.cache.write().unwrap_or_else(PoisonError::into_inner);
            *cache = Some((Instant::now(), jwks.clone()));
        }
        *self
            .last_failure
            .write()
            .unwrap_or_else(PoisonError::into_inner) = None;

        // http_client (mutex guard) is dropped here, after the cache is updated, so concurrent
        // waiters see the fresh JWKS immediately upon acquiring the lock.
        drop(http_client);

        Ok(jwks)
    }

    /// Performs the outbound JWKS request.
    async fn fetch_jwks(&self, http_client: &Client) -> Result<JwkSet, Report<JwtError>> {
        http_client
            .get(self.jwks_url.clone())
            .send()
            .await
            .change_context(JwtError::JwksFetch)
            .attach(format!("JWKS URL: {}", self.jwks_url))?
            .error_for_status()
            .change_context(JwtError::JwksFetch)
            .attach(format!("JWKS URL: {}", self.jwks_url))?
            .json()
            .await
            .change_context(JwtError::JwksFetch)
            .attach("failed to deserialize JWKS response")
    }

    /// Rejects immediately while a recent fetch failure is still within the cooldown.
    ///
    /// Bounds outbound requests during an outage: without it the cache stays empty, so every
    /// request would mount its own fetch and queue behind the fetch mutex.
    ///
    /// # Errors
    ///
    /// - [`JwksFetch`] while the last failure is more recent than the refresh cooldown
    ///
    /// [`JwksFetch`]: JwtError::JwksFetch
    fn check_failure_cooldown(&self) -> Result<(), Report<JwtError>> {
        let last_failure = self
            .last_failure
            .read()
            .unwrap_or_else(PoisonError::into_inner);
        if last_failure.is_some_and(|at| at.elapsed() < self.jwks_refresh_cooldown) {
            return Err(Report::new(JwtError::JwksFetch)
                .attach("a recent JWKS fetch failed; within the refresh cooldown"));
        }
        drop(last_failure);
        Ok(())
    }

    /// Returns cached JWKS if still valid, or `None` if a fetch is needed.
    fn cached_jwks(&self, read: JwksRead) -> Option<JwkSet> {
        let limit = match read {
            JwksRead::Cached => self.jwks_cache_ttl,
            JwksRead::Refresh => self.jwks_refresh_cooldown,
        };

        let cache = self.cache.read().unwrap_or_else(PoisonError::into_inner);
        let (fetched_at, jwks) = (*cache).as_ref()?;
        if fetched_at.elapsed() < limit {
            return Some(jwks.clone());
        }
        drop(cache);
        None
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::{
        net::SocketAddr,
        sync::atomic::{AtomicUsize, Ordering},
        time::Duration,
    };

    use axum::{Json, Router, http::StatusCode, routing::get};
    use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
    use reqwest::Url;
    use serde_json::json;

    use super::{JwtError, JwtValidator, JwtValidatorConfig};

    /// A JWKS endpoint that counts how often it is fetched.
    struct CountingJwks {
        url: Url,
        fetches: Arc<AtomicUsize>,
    }

    /// Key ID the rotation test expects to appear only after a refresh.
    const ROTATED_KEY_ID: &str = "rotated-in";

    /// A key set holding a throwaway RSA public key under [`ROTATED_KEY_ID`].
    ///
    /// The modulus only has to be well-formed: the rotation test asserts that the key is *found*,
    /// not that it verifies a signature.
    fn rotating_jwks() -> serde_json::Value {
        json!({
            "keys": [{
                "kty": "RSA",
                "kid": ROTATED_KEY_ID,
                "use": "sig",
                "alg": "RS256",
                "n": "t5IuzKgt8loO_ycsQBRu7IrCosQhvgbGMhR-lFPENb4ldy4XrRuuBc1BLqR5sqGKDd-LKjLKG89a7QKUorI2CQeRUFN3gW3BvMmNnZNjDMxmEZ0hVvS3L3ocKl_8HGJfCMtgF2maAgyq9mfNnuXDNqvKHJy0dlhGTN6v9nPROuQzbKFshxN1PUTB8c9tTbX-3EpHnfwYx3_xeDnl6FF8B5OFm05CQGUF_VJw_LG8Z0w8rvkeUCzNh7JGOalNG0GgyviUPyDly32gt9D5JcJlGz1dx6QyjZ472VJKV7Rdg-E-HrP-di1sKfBTXoBYYR2YoZ-erluN8tUueY0o0Aoj7w",
                "e": "AQAB",
            }]
        })
    }

    /// Binds a JWKS router on an ephemeral port and returns its URL.
    async fn spawn_jwks_router(router: Router) -> Url {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("the test server should bind to an ephemeral port");
        let address = listener
            .local_addr()
            .expect("the test listener should report its local address");
        tokio::spawn(async move {
            axum::serve(
                listener,
                router.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
            .expect("the test server should serve requests");
        });

        Url::parse(&format!("http://{address}/jwks"))
            .expect("the test server address should parse as a URL")
    }

    /// Counts attempts and answers every one with a server error, so no fetch ever succeeds.
    async fn spawn_failing_jwks() -> CountingJwks {
        let fetches = Arc::new(AtomicUsize::new(0));
        let router = Router::new().route(
            "/jwks",
            get({
                let fetches = Arc::clone(&fetches);
                move || {
                    fetches.fetch_add(1, Ordering::Relaxed);
                    async { StatusCode::INTERNAL_SERVER_ERROR }
                }
            }),
        );

        CountingJwks {
            url: spawn_jwks_router(router).await,
            fetches,
        }
    }

    /// Serves an empty key set, so every `kid` is unknown and forces a refresh.
    async fn spawn_counting_jwks() -> CountingJwks {
        let fetches = Arc::new(AtomicUsize::new(0));
        let router = Router::new().route(
            "/jwks",
            get({
                let fetches = Arc::clone(&fetches);
                move || {
                    fetches.fetch_add(1, Ordering::Relaxed);
                    async { Json(json!({ "keys": [] })) }
                }
            }),
        );

        CountingJwks {
            url: spawn_jwks_router(router).await,
            fetches,
        }
    }

    fn validator_at(
        jwks_url: Url,
        jwks_cache_ttl: Duration,
        jwks_refresh_cooldown: Duration,
    ) -> JwtValidator {
        JwtValidator::new(JwtValidatorConfig {
            jwks_url,
            audience: "test-audience".to_owned(),
            issuer: "https://test-team.cloudflareaccess.com".to_owned(),
            jwks_cache_ttl,
            jwks_refresh_cooldown,
            http_timeout: Duration::from_secs(5),
            // The signature is never reached: an empty key set fails `kid` resolution first, so
            // these tests need no real signing key.
            allowed_algorithms: vec![Algorithm::HS256],
        })
    }

    fn token_with_key_id(kid: &str) -> String {
        let mut header = Header::new(Algorithm::HS256);
        header.kid = Some(kid.to_owned());
        encode(
            &header,
            &json!({ "sub": "test-subject" }),
            &EncodingKey::from_secret(b"irrelevant-for-key-resolution"),
        )
        .expect("the token should encode")
    }

    /// A crafted `kid` must not buy an attacker one JWKS fetch per request.
    ///
    /// Ten unknown key IDs arrive; the cooldown outlives the test, so the endpoint may be asked
    /// only for the initial population of the cache.
    #[tokio::test]
    async fn unknown_key_ids_share_one_jwks_fetch() {
        let jwks = spawn_counting_jwks().await;
        let validator = validator_at(
            jwks.url.clone(),
            Duration::from_secs(600),
            Duration::from_secs(600),
        );

        for attempt in 0..10 {
            drop(
                validator
                    .validate(&token_with_key_id(&format!("crafted-{attempt}")))
                    .await
                    .expect_err("an unknown key ID should not validate"),
            );
        }

        assert_eq!(
            jwks.fetches.load(Ordering::Relaxed),
            1,
            "the cooldown should collapse ten crafted key IDs into a single JWKS fetch"
        );
    }

    /// Without a cooldown the same traffic is free to hit the endpoint repeatedly, which is what
    /// makes the assertion above a statement about the cooldown rather than about caching.
    #[tokio::test]
    async fn unknown_key_ids_refetch_once_the_cooldown_lapses() {
        let jwks = spawn_counting_jwks().await;
        let validator = validator_at(jwks.url.clone(), Duration::from_secs(600), Duration::ZERO);

        for attempt in 0..10 {
            drop(
                validator
                    .validate(&token_with_key_id(&format!("crafted-{attempt}")))
                    .await
                    .expect_err("an unknown key ID should not validate"),
            );
        }

        assert!(
            jwks.fetches.load(Ordering::Relaxed) > 1,
            "without a cooldown the endpoint should be re-fetched, got {} fetch(es)",
            jwks.fetches.load(Ordering::Relaxed)
        );
    }

    /// An endpoint that never answers must not buy one outbound attempt per request.
    ///
    /// Nothing populates the cache during an outage, so only the failure cooldown bounds the
    /// attempts. Without it, each request mounts its own fetch and queues behind the fetch mutex.
    #[tokio::test]
    async fn failure_cooldown_suppresses_further_fetches() {
        let jwks = spawn_failing_jwks().await;
        let validator = validator_at(
            jwks.url.clone(),
            Duration::from_secs(600),
            Duration::from_secs(600),
        );

        for attempt in 0..5 {
            drop(
                validator
                    .validate(&token_with_key_id(&format!("crafted-{attempt}")))
                    .await
                    .expect_err("a key set that never loads should not validate"),
            );
        }

        assert_eq!(
            jwks.fetches.load(Ordering::Relaxed),
            1,
            "the cooldown should hold the outage to one outbound fetch, got {} fetch(es)",
            jwks.fetches.load(Ordering::Relaxed)
        );
    }

    /// A key that appears only after a refresh must be picked up, which is how a rotation lands.
    #[tokio::test]
    async fn forced_refresh_picks_up_rotated_keys() {
        let fetches = Arc::new(AtomicUsize::new(0));
        let router = Router::new().route(
            "/jwks",
            get({
                let fetches = Arc::clone(&fetches);
                move || {
                    let served = fetches.fetch_add(1, Ordering::Relaxed);
                    // The first fetch predates the rotation and lacks the key.
                    async move {
                        Json(if served == 0 {
                            json!({ "keys": [] })
                        } else {
                            rotating_jwks()
                        })
                    }
                }
            }),
        );
        let url = spawn_jwks_router(router).await;
        let validator = validator_at(url, Duration::from_secs(600), Duration::ZERO);

        let error = validator
            .validate(&token_with_key_id(ROTATED_KEY_ID))
            .await
            .expect_err("the throwaway key cannot verify a signature made with a random secret");

        assert!(
            !matches!(error.current_context(), JwtError::UnknownKeyId { .. }),
            "the refreshed key set should supply the rotated key, got {:?}",
            error.current_context()
        );
        assert!(
            fetches.load(Ordering::Relaxed) >= 2,
            "the unknown key ID should have forced a refresh"
        );
    }

    /// Once the TTL lapses the key set is fetched again, which is the other half of rotation
    /// pickup.
    #[tokio::test]
    async fn lapsed_cache_triggers_refetch() {
        let jwks = spawn_counting_jwks().await;
        // A cooldown of zero leaves the TTL as the only thing that could suppress a fetch.
        let validator = validator_at(jwks.url.clone(), Duration::ZERO, Duration::ZERO);

        for attempt in 0..3 {
            drop(
                validator
                    .validate(&token_with_key_id(&format!("crafted-{attempt}")))
                    .await
                    .expect_err("an unknown key ID should not validate"),
            );
        }
        let without_ttl = jwks.fetches.load(Ordering::Relaxed);

        let cached = spawn_counting_jwks().await;
        let validator = validator_at(
            cached.url.clone(),
            Duration::from_secs(600),
            Duration::from_secs(600),
        );
        for attempt in 0..3 {
            drop(
                validator
                    .validate(&token_with_key_id(&format!("crafted-{attempt}")))
                    .await
                    .expect_err("an unknown key ID should not validate"),
            );
        }

        assert!(
            without_ttl > cached.fetches.load(Ordering::Relaxed),
            "an immediately lapsing cache should fetch more often than a held one, got {} vs {}",
            without_ttl,
            cached.fetches.load(Ordering::Relaxed)
        );
    }
}

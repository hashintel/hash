//! JWT authentication for the Graph API.
//!
//! Validates JSON Web Tokens against a JWKS (JSON Web Key Set) endpoint, primarily designed for
//! Cloudflare Access but compatible with any OIDC-compliant JWT issuer.
//!
//! # Token extraction
//!
//! Tokens are extracted from request headers in the following order:
//! 1. `Cf-Access-Jwt-Assertion` -- Cloudflare Access header
//! 2. `Authorization: Bearer <token>` -- Standard bearer token

use alloc::{borrow::Cow, sync::Arc};
use core::time::Duration;
use std::{sync::RwLock, time::Instant};

use axum::{extract::FromRequestParts, http::request::Parts};
use error_stack::{Report, ResultExt as _};
use hash_status::StatusCode;
use http::{HeaderMap, header};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use reqwest::{Client, Url};
use serde::Deserialize;
use time::OffsetDateTime;
use tokio::sync::Mutex;

use crate::rest::status::{BoxedResponse, report_to_response};

/// Raw JWT claims for deserialization from the token payload.
///
/// Field names and types match the JWT/OIDC specification. This is an internal type -- consumers
/// should use [`JwtClaims`] instead.
#[derive(Deserialize)]
struct RawJwtClaims {
    sub: String,
    email: Option<String>,
    exp: u64,
    iat: u64,
}

/// Validated claims from an authenticated JWT.
///
/// All validation (signature, expiration, audience, issuer) has already been performed by the
/// [`JwtValidator`]. Consumers can rely on these claims being trustworthy.
#[derive(Debug, Clone)]
pub struct JwtClaims {
    pub sub: String,
    pub email: Option<String>,
    pub issued_at: OffsetDateTime,
    pub expires_at: OffsetDateTime,
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
    /// No JWT token found in request headers.
    #[display(
        "no JWT token provided -- expected `Cf-Access-Jwt-Assertion` or `Authorization: Bearer` \
         header"
    )]
    MissingToken,
    /// Token header value contains non-ASCII characters.
    #[display("JWT token contains invalid encoding")]
    InvalidTokenEncoding,
    /// JWT validator was not configured on this route.
    #[display("JWT validator not configured")]
    NotConfigured,
}

/// Configuration for [`JwtValidator`].
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
                    .expect("failed to build HTTP client"),
            ),
            cache: RwLock::new(None),
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

        let raw = decode::<RawJwtClaims>(token, &decoding_key, &validation)
            .change_context(JwtError::Validation)?
            .claims;

        let issued_at = OffsetDateTime::from_unix_timestamp(
            i64::try_from(raw.iat).change_context(JwtError::Validation)?,
        )
        .change_context(JwtError::Validation)?;

        let expires_at = OffsetDateTime::from_unix_timestamp(
            i64::try_from(raw.exp).change_context(JwtError::Validation)?,
        )
        .change_context(JwtError::Validation)?;

        Ok(JwtClaims {
            sub: raw.sub,
            email: raw.email,
            issued_at,
            expires_at,
        })
    }

    /// Resolves a [`DecodingKey`] for the given key ID from the cached JWKS.
    ///
    /// If the key ID is not found in the cache, forces a refresh in case of key rotation.
    async fn resolve_decoding_key(&self, kid: &str) -> Result<DecodingKey, Report<JwtError>> {
        // Try cached JWKS first
        let jwks = self.get_jwks(false).await?;
        if let Some(jwk) = jwks.find(kid) {
            return DecodingKey::from_jwk(jwk).change_context(JwtError::Validation);
        }

        // Key not found -- may be a rotation, force refresh
        let refreshed = self.get_jwks(true).await?;
        let jwk = refreshed.find(kid).ok_or_else(|| JwtError::UnknownKeyId {
            kid: kid.to_owned(),
        })?;
        DecodingKey::from_jwk(jwk).change_context(JwtError::Validation)
    }

    /// Returns the cached JWKS or fetches a fresh copy.
    ///
    /// When `force_refresh` is `true`, fetches unless the cache was refreshed within the cooldown
    /// period (to prevent denial-of-service via crafted `kid` values).
    ///
    /// The fetch mutex ensures only one outbound JWKS request is in-flight at a time. Concurrent
    /// callers wait for the single fetch to complete and then re-check the cache.
    async fn get_jwks(&self, force_refresh: bool) -> Result<JwkSet, Report<JwtError>> {
        // Fast path: serve from cache without acquiring the HTTP client lock.
        if let Some(jwks) = self.cached_jwks(force_refresh) {
            return Ok(jwks);
        }

        // Serialize fetches — only one task fetches at a time.
        let http_client = self.http_client.lock().await;

        // Re-check after acquiring the lock: another task may have refreshed while we waited.
        if let Some(jwks) = self.cached_jwks(force_refresh) {
            return Ok(jwks);
        }

        let response = http_client
            .get(self.jwks_url.clone())
            .send()
            .await
            .change_context(JwtError::JwksFetch)?
            .error_for_status()
            .change_context(JwtError::JwksFetch)?;

        let jwks: JwkSet = response
            .json()
            .await
            .change_context(JwtError::JwksFetch)
            .attach("failed to deserialize JWKS response")?;

        *self.cache.write().expect("JWKS cache lock poisoned") =
            Some((Instant::now(), jwks.clone()));

        // http_client (mutex guard) is dropped here, after the cache is updated, so concurrent
        // waiters see the fresh JWKS immediately upon acquiring the lock.
        drop(http_client);

        Ok(jwks)
    }

    /// Returns cached JWKS if still valid, or `None` if a fetch is needed.
    fn cached_jwks(&self, force_refresh: bool) -> Option<JwkSet> {
        let cache = self.cache.read().expect("JWKS cache lock poisoned");
        let (fetched_at, jwks) = (*cache).as_ref()?;
        let age = fetched_at.elapsed();
        if !force_refresh && age < self.jwks_cache_ttl
            || force_refresh && age < self.jwks_refresh_cooldown
        {
            return Some(jwks.clone());
        }
        drop(cache);
        None
    }
}

/// Extracts a JWT token from request headers.
///
/// Checks headers in order:
/// 1. `Cf-Access-Jwt-Assertion` (Cloudflare Access)
/// 2. `Authorization: Bearer <token>`
fn extract_token_from_headers(headers: &HeaderMap) -> Result<Cow<'_, str>, Report<JwtError>> {
    // Cloudflare Access header
    if let Some(value) = headers.get("Cf-Access-Jwt-Assertion") {
        return value
            .to_str()
            .map(Cow::Borrowed)
            .change_context(JwtError::InvalidTokenEncoding);
    }

    // Standard Authorization: Bearer header
    if let Some(value) = headers.get(header::AUTHORIZATION) {
        let value = value
            .to_str()
            .change_context(JwtError::InvalidTokenEncoding)?;

        // RFC 7235: authentication schemes are case-insensitive
        if let Some(token) = value
            .get(..7)
            .filter(|prefix| prefix.eq_ignore_ascii_case("bearer "))
            .and_then(|_| value.get(7..))
        {
            return Ok(Cow::Borrowed(token));
        }
    }

    Err(Report::new(JwtError::MissingToken))
}

/// Axum extractor that validates a JWT and provides the decoded claims.
///
/// Requires an `Extension<Arc<JwtValidator>>` to be present in the router. If no validator is
/// configured, extraction fails with `500 Internal Server Error`.
///
/// # Example
///
/// ```ignore
/// async fn protected_handler(
///     JwtAuthentication(claims): JwtAuthentication,
/// ) -> impl IntoResponse {
///     format!("Hello, {}", claims.email().unwrap_or_default())
/// }
/// ```
pub struct JwtAuthentication(pub JwtClaims);

impl<S: Sync> FromRequestParts<S> for JwtAuthentication {
    type Rejection = BoxedResponse;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let validator = parts
            .extensions
            .get::<Arc<JwtValidator>>()
            .cloned()
            .ok_or_else(|| Report::new(JwtError::NotConfigured))
            .attach_opaque(StatusCode::Internal)
            .map_err(report_to_response)?;

        let token = extract_token_from_headers(&parts.headers)
            .attach_opaque(StatusCode::Unauthenticated)
            .map_err(report_to_response)?;

        let claims = validator
            .validate(&token)
            .await
            .attach_opaque(StatusCode::Unauthenticated)
            .map_err(report_to_response)?;

        Ok(Self(claims))
    }
}

/// Optional JWT authentication extractor.
///
/// Returns `Some(claims)` when a [`JwtValidator`] is configured and the request contains a valid
/// token. Returns `None` when no validator is present (dev mode).
///
/// When a validator **is** present but the token is missing or invalid, extraction fails with `401
/// Unauthorized` -- this is intentional to prevent unauthenticated access when JWT enforcement is
/// enabled.
pub struct OptionalJwtAuthentication(pub Option<JwtClaims>);

impl<S: Sync> FromRequestParts<S> for OptionalJwtAuthentication {
    type Rejection = BoxedResponse;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let Some(validator) = parts.extensions.get::<Arc<JwtValidator>>().cloned() else {
            // No validator configured -- JWT auth is disabled (dev mode)
            return Ok(Self(None));
        };

        let token = extract_token_from_headers(&parts.headers)
            .attach_opaque(StatusCode::Unauthenticated)
            .map_err(report_to_response)?;

        let claims = validator
            .validate(&token)
            .await
            .attach_opaque(StatusCode::Unauthenticated)
            .map_err(report_to_response)?;

        Ok(Self(Some(claims)))
    }
}

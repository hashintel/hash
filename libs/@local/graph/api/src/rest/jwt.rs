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
use std::time::Instant;

use axum::{extract::FromRequestParts, http::request::Parts};
use error_stack::{Report, ResultExt as _};
use hash_status::StatusCode;
use http::{HeaderMap, header};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use reqwest::{Client, Url};
use serde::Deserialize;
use time::OffsetDateTime;
use tokio::sync::RwLock;

use crate::rest::status::{BoxedResponse, report_to_response};

/// How long to cache JWKS keys before re-fetching.
const JWKS_CACHE_TTL: Duration = Duration::from_hours(1);

/// Asymmetric algorithms we accept in JWT headers.
///
/// This allowlist prevents algorithm confusion attacks (e.g. `HS256` with an RSA public key used as
/// HMAC secret).
const ALLOWED_ALGORITHMS: &[Algorithm] = &[
    Algorithm::RS256,
    Algorithm::RS384,
    Algorithm::RS512,
    Algorithm::ES256,
    Algorithm::ES384,
];

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

/// Validates JWTs against a JWKS endpoint.
///
/// Fetches public keys from the configured JWKS URL and caches them. Keys are refreshed when the
/// cache TTL expires or when a token references an unknown key ID (to handle key rotation).
pub struct JwtValidator {
    audience: String,
    issuer: String,
    jwks_url: Url,
    http_client: Client,
    cache: RwLock<Option<(std::time::Instant, JwkSet)>>,
}

impl JwtValidator {
    /// Creates a new JWT validator.
    ///
    /// Does not eagerly fetch JWKS -- the first request triggers the initial fetch.
    ///
    /// # Panics
    ///
    /// Panics if the HTTP client cannot be built (should not happen with default TLS config).
    #[must_use]
    pub fn new(jwks_url: Url, audience: String, issuer: String) -> Self {
        Self {
            audience,
            issuer,
            jwks_url,
            http_client: Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .expect("failed to build HTTP client"),
            cache: RwLock::new(None),
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

        if !ALLOWED_ALGORITHMS.contains(&header.alg) {
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
    /// When `force_refresh` is `true`, always fetches regardless of cache age.
    async fn get_jwks(&self, force_refresh: bool) -> Result<JwkSet, Report<JwtError>> {
        // Check cache first (read lock)
        if !force_refresh {
            let cache = self.cache.read().await;
            if let Some((fetched_at, ref jwks)) = *cache
                && fetched_at.elapsed() < JWKS_CACHE_TTL
            {
                return Ok(jwks.clone());
            }
        }

        // Fetch outside any lock to avoid blocking concurrent validations
        let response = self
            .http_client
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

        let result = jwks.clone();
        *self.cache.write().await = Some((Instant::now(), jwks));
        Ok(result)
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

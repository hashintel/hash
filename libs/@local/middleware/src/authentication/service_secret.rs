//! Recognition of the service credential in the `Authorization` header.
//!
//! The scheme and its parsing live here alone: the providers that verify the credential and the
//! middlewares that gate on it read the header through these functions, so what counts as a
//! service credential is defined once.

use hash_crypto::Secret;
use http::{HeaderMap, header};

/// The `Authorization` scheme carrying the service secret.
pub const SERVICE_AUTH_SCHEME: &str = "HASH-Service";

/// Returns the service secret carried in the `Authorization` header.
///
/// Returns [`None`] when the header is absent, does not decode, or names a different scheme, so
/// credentials of other schemes pass through unrecognized. The scheme is matched
/// case-insensitively.
#[must_use]
pub fn service_credential(headers: &HeaderMap) -> Option<&str> {
    let credentials = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let (scheme, token) = credentials.split_once(' ').unwrap_or((credentials, ""));
    scheme
        .eq_ignore_ascii_case(SERVICE_AUTH_SCHEME)
        .then(|| token.trim_ascii())
}

/// Returns whether the request carries the expected service secret.
///
/// Compares the value in constant time, the length is not hidden.
#[must_use]
pub fn presents_service_secret(headers: &HeaderMap, secret: &Secret<str>) -> bool {
    service_credential(headers).is_some_and(|token| *secret == *token)
}

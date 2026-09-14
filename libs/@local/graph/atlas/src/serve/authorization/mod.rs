//! Actor-bound tokens retaining a generation's delivery context between requests.
//!
//! A manifest resolves an authenticated actor's visibility and seals a [`Scope`](scope::Scope). The
//! scope contains the generation and [delta lifetime](crate::serve::delta::DeltaId), the actor, the
//! filter digest and the delivery offset. Keeping this context in an authenticated token lets later
//! requests reuse it without trusting client-supplied fields. The token carries neither the visible
//! row set nor the filter document.
//!
//! # Admission and renewal
//!
//! [`Authority::decrypt`](authority::Authority::decrypt) authenticates the token and requires the
//! independently authenticated actor, generation and delta lifetime to match. The sealed delta
//! reference records a revision, but admission compares only its lifetime identifier. Later
//! publications within that lifetime do not invalidate the token. Possession alone does not
//! identify an actor, and issuance itself performs no permission-store query.
//!
//! Data admission requires a [`CurrentScope`](scope::CurrentScope), obtained by checking the
//! token's issue-time window. Renewal may instead take a
//! [`ContinuityScope`](scope::ContinuityScope), retaining only the filter identity and delivery
//! offset even after expiry. Both paths still require successful authentication and actor,
//! generation and delta-lifetime comparisons. Renewal resolves the wanted visibility before issuing
//! another token.
//!
//! Visibility remains a separate decision through
//! [`ScopeResolver`](crate::serve::visibility::resolver::ScopeResolver). Both manifest and data
//! requests may reuse a cached result, including a soft-stale entry before its hard expiry. A
//! retained generation can reuse an eligible cached scope but cannot resolve a missing or expired
//! one. A valid token therefore establishes neither current store permissions nor the availability
//! of a reusable scope.
//!
//! # Security boundary
//!
//! [`Authority`](authority::Authority) uses XChaCha20-Poly1305 to encrypt the scope and
//! authenticate it together with the clear header. Its [key and nonce
//! requirements](authority::Authority#key-and-nonce-requirements) are part of this protection. The
//! header exposes the layout version, issue time and nonce. Hexadecimal presentation adds no
//! secrecy.
//!
//! Tokens are reusable within their admission conditions. Verification records no use and provides
//! no single-use or per-token revocation mechanism. The scope binds no route, variant or request
//! body beyond the stored filter identity and delivery offset. Token expiry is a wall-clock check
//! at admission, separate from the visibility cache's age and the generation's retention interval.
//!
//! [`token`] defines the envelope, [`scope`] the verified views, and [`actor`] the principal's byte
//! representation. The [API extractors](crate::api) own HTTP rejection and renewal
//! behavior.

mod actor;
pub(crate) mod authority;
mod error;
pub(crate) mod scope;
pub(crate) mod token;

#[cfg(test)]
mod tests;

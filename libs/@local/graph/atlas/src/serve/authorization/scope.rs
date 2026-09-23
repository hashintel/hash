//! The sealed delivery decision and the views available after verification.
//!
//! [`Scope`] records the [authorization model](super)'s delivery context. Verification returns a
//! [`ScopeLease`] that retains the issue time. Consuming a lease selects exactly one view:
//!
//! - [`CurrentScope`] retains the whole decision only after an expiry check succeeds at the
//!   supplied time.
//! - [`ContinuityScope`] retains the filter identity and delivery offset without checking expiry.
//!
//! The distinction prevents renewal context from satisfying an API that requires a current scope.
//! It does not make a returned scope expire automatically.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use core::{ops::Deref, time::Duration};
use std::time::SystemTime;

use error_stack::Report;

use super::{actor::ArchivedActorId, error::AuthorityError};
use crate::{
    file::generation::GenerationId,
    morton::Zoom,
    serve::{delta::DeltaReference, visibility::cache::FilterDigest},
};

/// A scope's request filter, by identity.
///
/// The discriminant distinguishes absence from a digest that happens to be all zero. Conversion
/// from [`Option<FilterDigest>`] writes zeros for the absent payload, but decoding accepts any
/// payload bytes under the absent discriminant. An invalid discriminant is a malformed
/// representation. Every variant has the same width: filter presence never changes the envelope's
/// length.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(u8)]
pub(crate) enum ScopeFilter {
    /// No filter, with payload bytes that issuance writes as zeros.
    Absent([u8; 32]),
    /// The scope names the filter with this digest.
    Present(FilterDigest),
}

impl ScopeFilter {
    /// Returns the filter's digest, absent when the scope names no filter.
    pub(crate) const fn digest(self) -> Option<FilterDigest> {
        match self {
            Self::Present(digest) => Some(digest),
            Self::Absent(_) => None,
        }
    }
}

impl From<Option<FilterDigest>> for ScopeFilter {
    fn from(filter: Option<FilterDigest>) -> Self {
        filter.map_or(Self::Absent([0; 32]), Self::Present)
    }
}

/// The delivery context sealed into an authority token.
///
/// Authentication covers every field, while admission compares the generation, actor and [delta
/// lifetime](crate::serve::delta::DeltaId). A different delta identifier rejects an earlier token
/// even under the same generation. Random identifier generation permits a reopen to draw the same
/// identifier. The recorded revision takes no part in admission: the token can apply to later
/// publications of the same lifetime.
///
/// The fixed representation validates the actor and filter discriminants and the [`Zoom`] domain on
/// decoding. Other byte fields admit every bit pattern. These structural checks establish a
/// readable value, while authentication and request-binding checks establish its authority.
/// Visibility resolution determines the rows an actor may receive.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]
#[repr(C)]
pub(crate) struct Scope {
    /// The generation of the resolved delivery decision.
    pub generation: GenerationId,
    /// The issuing publication's delta reference, compared only by lifetime at admission.
    pub delta: DeltaReference,

    /// The principal bound to the token.
    pub actor: ArchivedActorId,
    /// The request filter's identity, absent for an unfiltered scope.
    pub filter: ScopeFilter,
    /// The admitted zoom offset for the delivery cut.
    pub k: Zoom,
}

/// A decrypted [`Scope`] pending an admission or renewal decision.
///
/// Verification establishes that the token passed AEAD authentication and matches the request's
/// actor, generation and delta lifetime. [`current`](Self::current) checks expiry.
/// [`continuity`](Self::continuity) retains only the filter identity and delivery offset, even for
/// an expired lease.
pub(crate) struct ScopeLease {
    scope: Scope,
    issued_at: SystemTime,
    expiration: Duration,
}

impl ScopeLease {
    /// Holds a verified `scope` against the issuer's `expiration` window.
    pub(super) const fn new(scope: Scope, issued_at: SystemTime, expiration: Duration) -> Self {
        Self {
            scope,
            issued_at,
            expiration,
        }
    }

    /// Resolves the lease into the whole decision, when it is current at `now`.
    ///
    /// Accepts exactly when the issue time is at or before `now` and the elapsed duration is
    /// strictly less than the expiration window. Equality with the expiry boundary and a zero
    /// window both fail the check.
    ///
    /// This check uses the supplied wall-clock time. A clock moving before the issue time causes
    /// rejection. Other backwards adjustments can extend apparent validity or make a previously
    /// expired token current again.
    ///
    /// # Errors
    ///
    /// Returns [`AuthorityError`] when `now` lies outside the issue window.
    pub(crate) fn current(self, now: SystemTime) -> Result<CurrentScope, Report<AuthorityError>> {
        if self.issued_at > now || now.saturating_duration_since(self.issued_at) >= self.expiration
        {
            return Err(Report::new(AuthorityError::Expired));
        }

        Ok(CurrentScope(self.scope))
    }

    /// Reduces the lease to the part that survives expiry.
    ///
    /// Retains the filter identity and delivery offset without checking the issue time. The result
    /// carries continuity for resolving a renewed view, with no actor or generation fields that
    /// could authorize data delivery.
    pub(crate) const fn continuity(self) -> ContinuityScope {
        ContinuityScope {
            filter: self.scope.filter.digest(),
            k: self.scope.k,
        }
    }
}

/// The filter identity and delivery offset retained for renewal.
#[expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]
pub(crate) struct ContinuityScope {
    /// The request filter's identity, absent for an unfiltered scope.
    pub filter: Option<FilterDigest>,
    /// The delivery cut's zoom offset sealed in the verified lease.
    pub k: Zoom,
}

/// A [`Scope`] whose issue-time check succeeded at admission.
///
/// Only [`ScopeLease::current`] constructs this type, after checking expiry at the supplied time.
/// The result records that check without enforcing freshness as time advances. Later requests still
/// require admission and visibility resolution.
pub(crate) struct CurrentScope(Scope);

impl Deref for CurrentScope {
    type Target = Scope;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[cfg(test)]
mod tests {
    use core::time::Duration;
    use std::time::SystemTime;

    use zerocopy::TryFromBytes as _;

    use super::{Scope, ScopeLease};
    use crate::{morton::Zoom, serve::visibility::cache::FilterDigest};

    #[test]
    fn continuity_filter_digest() {
        let offset = Zoom::new(3).expect("should fit the zoom domain");
        for filter in [None, Some(FilterDigest::of(b"filter bytes"))] {
            let mut scope = Scope::try_read_from_bytes(&[0_u8; size_of::<Scope>()])
                .expect("should decode a scope with zero fields");
            scope.filter = filter.into();
            scope.k = offset;

            let continuity =
                ScopeLease::new(scope, SystemTime::UNIX_EPOCH, Duration::ZERO).continuity();

            assert_eq!(continuity.filter, filter);
            assert_eq!(continuity.k, offset);
        }
    }
}

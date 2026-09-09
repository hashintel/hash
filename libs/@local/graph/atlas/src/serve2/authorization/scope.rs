use core::{ops::Deref, time::Duration};
use std::time::SystemTime;

use error_stack::Report;

use super::{actor::ArchivedActorId, error::AuthorityError};
use crate::{
    file::generation::GenerationId, morton::Zoom, serve::cache::scope::FilterDigest,
    serve2::delta::DeltaReference,
};

/// A scope's request filter, by identity.
///
/// The discriminant is the presence and the payload is the digest, one validated field: parsing
/// admits the two written forms and a tampered discriminant refuses as
/// [`AuthorityError::Envelope`]. The absent form zeroes its payload bytes, and a filter's presence
/// never shows in the envelope's length.
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
    Absent([u8; 32]),
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
    pub generation: GenerationId,
    pub delta: DeltaReference,

    pub actor: ArchivedActorId,
    pub filter: ScopeFilter,
    pub k: Zoom,
}

pub(crate) struct ScopeLease {
    scope: Scope,
    issued_at: SystemTime,
    expiration: Duration,
}

impl ScopeLease {
    pub(super) const fn new(scope: Scope, issued_at: SystemTime, expiration: Duration) -> Self {
        Self {
            scope,
            issued_at,
            expiration,
        }
    }

    pub(crate) fn current(self, now: SystemTime) -> Result<CurrentScope, Report<AuthorityError>> {
        if self.issued_at > now || now.saturating_duration_since(self.issued_at) >= self.expiration
        {
            return Err(Report::new(AuthorityError::Expired));
        }

        Ok(CurrentScope(self.scope))
    }

    pub(crate) const fn continuity(self) -> ContinuityScope {
        ContinuityScope { k: self.scope.k }
    }
}

pub(crate) struct ContinuityScope {
    pub k: Zoom,
}

pub(crate) struct CurrentScope(Scope);

impl Deref for CurrentScope {
    type Target = Scope;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

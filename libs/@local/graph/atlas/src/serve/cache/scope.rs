//! The vocabulary the cache holds scopes under.
//!
//! A scope is what the cache keeps one resolution for, so its name and the policy bounding its
//! reuse stand apart from the holding machinery. [`CacheKey`] names the scope and
//! [`FilterDigest`] folds a request filter into that name. [`VisibilityLimits`] bounds how long
//! and how much the cache holds, and [`Publication`] orders the writes into one slot.
#![expect(
    clippy::empty_enums,
    reason = "zerocopy's FromBytes derive expands to an empty enum for its validation machinery"
)]
use core::{
    sync::atomic::{Atomic, Ordering},
    time::Duration,
};

use type_system::principal::actor::ActorEntityUuid;

use crate::{
    file::generation::GenerationId,
    integrity::{Sha256, Sha256Digest, Update as _},
};

/// The digest of a request filter, over the bytes exactly as presented.
///
/// Byte-equal filter documents share a digest, so one held entry answers both. The digest is taken
/// over the presented bytes alone, so documents differing only in whitespace or key order are
/// different digests and resolve as different scopes, and a client re-presenting a filter sends the
/// bytes it sent before. Every digest has the same width, and equal bytes always produce equal
/// digests, on any host and in any process, which is what lets it bind a scope inside a sealed
/// token as well as name one in a key.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    Hash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct FilterDigest(Sha256Digest);

impl FilterDigest {
    /// Digests one filter document's bytes.
    ///
    /// `presented` is the filter exactly as the request carried it. Requests carrying byte-equal
    /// filters share a scope. A request whose filter differs by so much as a space describes a
    /// different scope and resolves on its own.
    pub(crate) fn of(presented: &[u8]) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(b"filter");
        hasher.update(presented);

        Self(hasher.finalize())
    }
}

/// Names one write into one slot, ordered against every other write this cache makes.
///
/// Drawn when a write publishes, so every publication is unique and names exactly the entry that
/// write produced. A refresh reads an entry before it publishes over that entry, and the slot
/// stands open to a stranger in between. The refresh recognises such a stranger by its publication
/// and leaves it in place.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(super) struct Publication(u64);

/// One cache's source of publications.
#[derive(Debug)]
pub(super) struct Publications(Atomic<u64>);

impl Publications {
    /// Returns a source that has published nothing.
    pub(super) const fn new() -> Self {
        Self(Atomic::<u64>::new(0))
    }

    /// Returns a publication greater than every one this source has returned.
    ///
    /// [`Ordering::Relaxed`] carries it, because the only ordering the comparison needs is moka's
    /// key lock, which every read and write of a published value already happens under. This
    /// counter owes uniqueness and monotonicity, which `fetch_add` gives at any ordering.
    /// Exhausting `u64` at a billion publications a second takes over five centuries, so the count
    /// does not wrap.
    pub(super) fn draw(&self) -> Publication {
        Publication(self.0.fetch_add(1, Ordering::Relaxed))
    }
}

/// One scope, naming an actor's view of one generation under one filter.
///
/// Equal keys name the same view, so they share one held entry.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct CacheKey {
    /// The generation whose row ids the proof indexes.
    pub generation: GenerationId,
    /// The actor whose policies the proof resolves.
    pub actor: ActorEntityUuid,
    /// The request filter's identity, when the request carries one.
    pub filter: Option<FilterDigest>,
}

/// How long the cache reuses a resolved scope, and how much heap the held scopes retain.
///
/// Choose [`Self::hard`] first. It is the ceiling on how long the cache goes on answering a request
/// under permissions that have since changed, which makes it the deployment's tolerated revocation
/// lag. A ten-minute hard window means a revoked permission takes effect within ten minutes for a
/// scope in continuous use, and on the next request for one that was idle.
///
/// [`Self::soft`] is where an entry begins refreshing behind the answer it still serves. The gap
/// between the two windows is what the refresh runs in, so no request waits on store latency while
/// a scope stays in use.
///
/// [`Self::bytes`] budgets the held scopes by estimated weight rather than by an
/// allocator-faithful ceiling. Each entry is weighed once at resolution, and the configured
/// value bounds the sum of those insertion-time estimates. The weight covers the proof's mask
/// containers with a fixed per-container allowance and the scoped view's own cascade, measured
/// exactly. The weight also adds the filter document and the entry's and key's inline sizes. The
/// saturated cascade is the generation's own memo, alive for the atlas's lifetime outside this
/// budget, and an entry sharing it weighs none of it. A deployment whose active scopes outweigh the
/// budget still answers every request, and the scopes that fall out resolve again, one store round
/// trip each.
///
/// What the estimate leaves out is stated rather than implied. Eviction is asynchronous and
/// trails admission, so a burst briefly holds more than
/// the budget. A value a caller still holds after eviction lives for that caller's request
/// and is off the ledger. A refresh builds its replacement unpriced until publication. A
/// single entry weighing past `u32::MAX` bytes weighs exactly `u32::MAX`. The cache's own
/// per-entry bookkeeping, `Arc` control blocks and allocator slack go uncounted.
///
/// [`Self::soft`] is shorter than [`Self::hard`]. Where it is not, the expiry test runs first and
/// no entry ever refreshes behind its answer, so every request past the hard window waits on a
/// resolution of its own.
///
/// An authority token names a cached scope, so this pair also bounds a held token's age. The
/// authority's `open` judges the issue time a token carries against the same `hard` window, and the
/// manifest publishes both values as the client's refresh and expiry horizons.
///
/// # Examples
///
/// Revocation taking effect within a minute, refreshing fifteen seconds before expiry:
///
/// ```
/// use core::time::Duration;
///
/// use hash_graph_atlas::serve::VisibilityLimits;
///
/// let limits = VisibilityLimits {
///     hard: Duration::from_secs(60),
///     soft: Duration::from_secs(45),
///     ..VisibilityLimits::default()
/// };
///
/// assert_eq!(limits.hard, Duration::from_secs(60));
/// assert_eq!(limits.hard - limits.soft, Duration::from_secs(15));
/// ```
///
/// The cost of a short window is store traffic: each active scope re-resolves once per window, so
/// halving it doubles the resolutions a steady population of actors produces.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct VisibilityLimits {
    /// The estimated-weight budget for held scopes, in bytes.
    pub bytes: u64,
    /// When a held entry starts refreshing behind the answer it serves.
    pub soft: Duration,
    /// When a held entry stops answering.
    pub hard: Duration,
}

impl Default for VisibilityLimits {
    /// A ten-minute revocation lag, refreshing at eight, budgeting one gibibyte of estimated
    /// weight.
    ///
    /// The refresh runs in the two-minute gap between the windows. A scope in continuous use
    /// re-resolves at eight minutes and keeps answering from the held proof while that runs, so
    /// only a scope whose refresh failed or that no longer receives requests reaches the hard
    /// window. The byte budget is an unvalidated starting point - a scoped view retains tens of
    /// bytes per visible row, so the default holds on the order of a hundred concurrently hot
    /// heavyweight scopes, and thousands of small ones - and the measurement that revises it is
    /// the deployment's own heap reading beside the cache's hit rate.
    fn default() -> Self {
        Self {
            bytes: 1 << 30,
            soft: Duration::from_mins(8),
            hard: Duration::from_mins(10),
        }
    }
}

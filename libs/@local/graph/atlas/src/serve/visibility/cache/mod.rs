//! Retention and refresh of resolved visibility scopes.
//!
//! Caching avoids repeating a permission-store round trip and schedule construction over every
//! visible row for each request. A [`CacheKey`] contains the generation, sampled delta-lifetime
//! tag, actor and filter digest, but not the delta revision. A hit may carry an older authorization
//! mask and delivery schedule while request data uses a newer publication from the same lifetime.
//!
//! Freshness starts at the resolving request's admission time and does not restart when resolution
//! completes. An entry becomes stale at the soft age, but a lookup still receives it. A lookup
//! whose current epoch matches the key starts a detached refresh only when it acquires the refresh
//! claim. At the hard age, that matching lookup waits for foreground resolution. A lookup under
//! another generation or lifetime removes the expired entry and returns [`None`].
//!
//! Foreground resolution belongs to the caller's future. A stale refresh runs in a detached task
//! and may finish after that caller or the observed generation ceases to be present. Entry weights
//! measure capacity. The cache enforces that capacity as a best-effort target rather than an
//! instantaneous memory ceiling.

use alloc::sync::Arc;
use core::{
    sync::atomic::{self, Atomic},
    time::Duration,
};
use std::time::Instant;

use error_stack::{Report, ResultExt as _};
use moka::ops::compute::{CompResult, Op};
use serde_json::value::RawValue;
use tracing::Instrument as _;
use type_system::principal::actor::ActorId;

use self::error::VisibilityCacheError;
use crate::{
    allocator::HeapMemoryUsage as _,
    file::generation::GenerationId,
    offload,
    serve::{
        delta::{DeltaId, epoch::Epoch},
        density::ViewOccupancy,
        schedule::ViewSchedule,
        visibility::VisibilityMask,
        world::World,
    },
};

mod error;
mod filter;

#[cfg(test)]
mod tests;

pub(crate) use self::filter::FilterDigest;

/// Computes the cache charge for an entry retaining `retained` heap bytes under `filter`.
///
/// The charge covers the entry's own inline bytes, its key, the heap the mask and schedule hold,
/// and the retained filter document. Saturating arithmetic caps an oversized charge at
/// [`u32::MAX`], the largest weight accepted by the cache.
fn weight_of(retained: u64, filter: Option<&RawValue>) -> u32 {
    let inline = size_of::<CacheEntry>() as u64 + size_of::<CacheKey>() as u64;
    let total = retained
        .saturating_add(inline)
        .saturating_add(filter.map_or(0, |document| document.get().len() as u64));

    total.saturating_cast()
}

/// A resolved scope that has not been admitted to the cache yet.
///
/// The mask and schedule capture one epoch. The cache may later reuse them at newer revisions of
/// the same delta lifetime. This type separates finished, weighed resolution from cache admission.
/// Foreground misses and expiries construct it while holding the per-key compute lock. Detached
/// refreshes construct it before taking that lock for conditional replacement. Insertion turns it
/// into a [`CacheEntry`] by adding refresh state, the resolving lookup's admission time and a cache
/// publication number allocated only then.
#[derive(Debug)]
pub(crate) struct PendingCacheEntry {
    mask: VisibilityMask,
    schedule: ViewSchedule,
    filter: Option<Arc<RawValue>>,
    occupancy: Option<ViewOccupancy>,
    weight: u32,
}

impl PendingCacheEntry {
    /// Builds the delivery schedule for `mask` over `world` at `epoch`.
    ///
    /// The schedule construction runs on the offload pool, because it walks every visible row and
    /// would otherwise block the request's async worker. Forking `epoch` gives that work its own
    /// owned handle on the same captured publication, independent of the caller's guard. Dropping
    /// this future abandons the result but does not cancel schedule work already submitted to
    /// Rayon.
    ///
    /// # Errors
    ///
    /// Returns [`VisibilityCacheError::Panic`] when the offloaded construction panics or its
    /// worker disappears without returning a value.
    pub(crate) async fn new(
        world: Arc<World>,
        epoch: &Epoch,
        mask: VisibilityMask,
        filter: Option<Arc<RawValue>>,
    ) -> Result<Self, Report<VisibilityCacheError>> {
        let epoch = epoch.fork();
        let (schedule, occupancy, mask) = offload::run(move || {
            let schedule = ViewSchedule::of(world, &epoch, &mask);
            let occupancy = schedule.occupancy();

            (schedule, occupancy, mask)
        })
        .await
        .change_context(VisibilityCacheError::Panic)?;

        let weight = weight_of(
            mask.heap_memory_usage() + schedule.heap_memory_usage(),
            filter.as_deref(),
        );

        Ok(Self {
            mask,
            schedule,
            filter,
            occupancy,
            weight,
        })
    }
}

hashql_core::id::newtype! {
    /// A cache insertion token checked before a refresh replaces an entry.
    ///
    /// A refresh compares the publication it claimed against the one currently held to detect an intervening replacement.
    ///
    /// # Warning
    ///
    /// [`PublicationProducer`] uses a u32 counter, which wraps after 2³² allocations across the cache. Equality distinguishes insertions only while their tokens have not repeated. An outstanding refresh can mistake a later insertion with the same token for its claimed entry.
    struct Publication(u64)
}

hashql_core::id::newtype_producer!(struct PublicationProducer(Publication));

/// One refresh's exclusive claim on a cache entry.
///
/// Dropping the guard clears that entry's claim. The refresh future owns the guard and releases
/// it on completion, unwinding or future drop. Later refreshes remain subject to the retired-epoch
/// checks in [`VisibilityCache::resolve`] and to the entry's expiry.
struct RefreshClaim {
    entry: Arc<CacheEntry>,
}

impl RefreshClaim {
    /// Returns the claimed entry's publication.
    fn publication(&self) -> Publication {
        self.entry.publication
    }
}

impl Drop for RefreshClaim {
    fn drop(&mut self) {
        self.entry
            .refreshing
            .store(false, atomic::Ordering::Release);
    }
}

/// One actor's resolved scope, retained for reuse across requests.
///
/// The entry is shared behind an [`Arc`], letting a request that took it keep reading a
/// coherent scope while a refresh replaces the cache's copy.
#[derive(Debug)]
pub(crate) struct CacheEntry {
    /// The rows the actor may receive.
    pub mask: VisibilityMask,
    /// The delivery schedule built over those rows.
    pub schedule: ViewSchedule,
    /// The filter document retained from this scope's resolution.
    ///
    /// A later request naming only its digest can reuse this document.
    pub filter: Option<Arc<RawValue>>,
    /// Distinct occupied-cell counts by Morton depth, used to resolve a density offset.
    ///
    /// Corpus policy has no occupancy profile. Every scoped schedule has one, including the zero
    /// profile of an empty scope.
    pub occupancy: Option<ViewOccupancy>,
    resolved_at: Instant,
    publication: Publication,
    refreshing: Atomic<bool>,
    weight: u32,
}

impl CacheEntry {
    /// Stamps a resolved scope with its admission time and publication.
    fn new(
        PendingCacheEntry {
            mask,
            schedule,
            filter,
            occupancy,
            weight,
        }: PendingCacheEntry,
        resolved_at: Instant,
        publication: Publication,
    ) -> Self {
        Self {
            mask,
            schedule,
            filter,
            occupancy,
            resolved_at,
            publication,
            refreshing: Atomic::<bool>::new(false),
            weight,
        }
    }

    /// Returns whether the entry has reached the `soft` age.
    fn is_stale(&self, now: Instant, soft: Duration) -> bool {
        now.saturating_duration_since(self.resolved_at) >= soft
    }

    /// Returns whether the entry has reached the `hard` age, past which it is no longer served.
    fn is_expired(&self, now: Instant, hard: Duration) -> bool {
        now.saturating_duration_since(self.resolved_at) >= hard
    }

    /// Claims the exclusive right to refresh this entry until the returned guard drops.
    ///
    /// Returns [`None`] while another refresh holds the claim. A request that still holds an entry
    /// a later refresh has already replaced can claim it again. The publication comparison in
    /// [`VisibilityCache::resolve`] rejects that redundant resolution's result while
    /// [`Publication`] tokens have not repeated.
    fn claim_refresh(entry: &Arc<Self>) -> Option<RefreshClaim> {
        entry
            .refreshing
            .compare_exchange(
                false,
                true,
                atomic::Ordering::AcqRel,
                atomic::Ordering::Acquire,
            )
            .is_ok()
            .then(|| RefreshClaim {
                entry: Arc::clone(entry),
            })
    }
}

/// An actor and filter scope within one generation and [delta lifetime](DeltaId).
///
/// A generation can reopen with another [`DeltaId`]. Including both values normally separates its
/// cache scopes. Each lifetime draws its own sampled 64-bit tag, but the cache does not detect when
/// separate samples produce equal tags. The key excludes the revision to permit reuse and refresh
/// across publications within a lifetime. Freshness limits rather than revision changes bound scope
/// staleness.
#[derive(Debug, PartialEq, Eq, Hash)]
pub(crate) struct CacheKey {
    generation: GenerationId,
    delta: DeltaId,
    actor: ActorId,
    filter: Option<FilterDigest>,
}

impl CacheKey {
    /// Names the scope `actor` reads `epoch` under, optionally through `filter`.
    pub(crate) fn new(epoch: &Epoch, actor: ActorId, filter: Option<FilterDigest>) -> Self {
        Self {
            generation: epoch.generation(),
            delta: epoch.reference().id,
            actor,
            filter,
        }
    }

    /// Returns whether `epoch` carries this key's generation and lifetime tag.
    ///
    /// A match makes `epoch` eligible for resolution. It cannot distinguish a sampled [`DeltaId`]
    /// collision.
    fn matches(&self, epoch: &Epoch) -> bool {
        self.generation == epoch.generation() && self.delta == epoch.reference().id
    }
}

/// The operator's capacity and freshness limits for resolved visibility scopes.
///
/// Ages start at the lookup admission time recorded on insertion. `soft` permits one matching
/// lookup to refresh in the background while receiving the held entry. `hard` prevents serving an
/// expired entry: a matching lifetime resolves synchronously, while a non-present lifetime receives
/// no entry. Construction does not require `soft < hard`. When `soft ≥ hard`, there is no interval
/// in which a still-servable entry can start a stale refresh.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct VisibilityLimits {
    /// The best-effort weighted capacity in bytes, not a strict instantaneous heap ceiling.
    pub bytes: u64,
    /// The age at which an entry becomes stale and a matching lookup may claim its refresh.
    pub soft: Duration,
    /// The age at or beyond which serving requires foreground re-resolution.
    pub hard: Duration,
}

/// One process's retained visibility scopes.
#[derive(Debug)]
pub(crate) struct VisibilityCache {
    entries: moka::future::Cache<CacheKey, Arc<CacheEntry>>,
    publications: Arc<PublicationProducer>,
    limits: VisibilityLimits,
}

impl VisibilityCache {
    /// Builds a cache configured with `limits`.
    ///
    /// Eviction charges each entry by footprint and uses the `tiny_lfu` policy to account for
    /// access frequency. Capacity enforcement is best effort. The backing cache also applies a
    /// time-to-live of [`VisibilityLimits::hard`] from physical insertion. Explicit age checks use
    /// the entry's earlier logical admission time.
    ///
    /// # Panics
    ///
    /// Panics when [`VisibilityLimits::hard`] exceeds 31,536,000,000 seconds (1,000 times 365
    /// days), including by a fractional second.
    pub(crate) fn new(limits: VisibilityLimits) -> Self {
        Self {
            entries: moka::future::Cache::builder()
                .max_capacity(limits.bytes)
                .weigher(|_key, entry: &Arc<CacheEntry>| entry.weight)
                .eviction_policy(moka::policy::EvictionPolicy::tiny_lfu())
                .time_to_live(limits.hard)
                .build(),
            publications: Arc::new(PublicationProducer::new()),
            limits,
        }
    }

    /// Returns the filter document a retained entry was resolved under.
    ///
    /// A request may present a filter digest without the document it names, and this is how the
    /// resolver recovers the document rather than refusing the request.
    pub(super) async fn filter_document(&self, key: &CacheKey) -> Option<Arc<RawValue>> {
        self.entries.get(key).await?.filter.as_ref().map(Arc::clone)
    }

    /// Returns the entry under `key`, resolving it where no live entry exists.
    ///
    /// The key's compute lock serializes the decision. The cache reuses any held entry younger than
    /// [`VisibilityLimits::hard`], including one whose generation or lifetime does not match
    /// `epoch`. When the held entry is missing or expired, a matching key resolves and
    /// publishes a replacement. A nonmatching key removes only an expired held entry and otherwise
    /// remains absent. With a zero maximum age, every held entry is logically expired.
    ///
    /// # Errors
    ///
    /// Returns the resolver's error without publishing a replacement. A later request may retry.
    async fn get_or_insert_with<R, E>(
        &self,
        epoch: &Epoch,
        key: CacheKey,
        now: Instant,
        resolver: R,
    ) -> Result<Option<Arc<CacheEntry>>, E>
    where
        R: AsyncFnOnce(&Epoch) -> Result<PendingCacheEntry, E>,
        E: Send + Sync + 'static,
    {
        let eligible = key.matches(epoch);
        self.entries
            .entry(key)
            .and_try_compute_with(async |held| {
                if held.is_some_and(|held| !held.value().is_expired(now, self.limits.hard)) {
                    return Ok::<_, E>(Op::Nop);
                }

                if !eligible {
                    return Ok(Op::Remove);
                }

                Ok(Op::Put(Arc::new(CacheEntry::new(
                    resolver(epoch).await?,
                    now,
                    self.publications.next(),
                ))))
            })
            .await
            .map(|result| match result {
                CompResult::StillNone(_) | CompResult::Removed(_) => None,
                CompResult::Unchanged(entry)
                | CompResult::Inserted(entry)
                | CompResult::ReplacedWith(entry) => Some(entry.into_value()),
            })
    }

    /// Reuses a cached scope or resolves an eligible epoch.
    ///
    /// The caller's future resolves a missing or expired matching entry. Cancelling that future
    /// drops the foreground resolver, although schedule work already submitted to Rayon
    /// continues without a receiver. A stale matching entry returns immediately and starts a
    /// detached Tokio refresh when its claim is free. The detached task outlives caller
    /// cancellation. A nonmatching lookup serves the entry without refresh until its maximum age,
    /// then removes it without resolution.
    ///
    /// The detached task uses the current tracing span. On a returned resolution error, it releases
    /// the entry's refresh claim before calling `on_refresh_error`. Unwinding or task cancellation
    /// also releases the claim, but does not call the error callback. The held entry keeps its
    /// original expiry after any failed refresh.
    ///
    /// # Errors
    ///
    /// Returns the resolver's error when a matching entry is missing or expired.
    ///
    /// # Panics
    ///
    /// Panics if a stale matching lookup claims a refresh unless the caller has entered a
    /// [`Runtime`](tokio::runtime::Runtime).
    pub(crate) async fn resolve<R, E>(
        &self,
        epoch: &Epoch,
        key: CacheKey,
        now: Instant,
        resolver: R,
        on_refresh_error: impl FnOnce(E) + Send + 'static,
    ) -> Result<Option<Arc<CacheEntry>>, E>
    where
        R: for<'epoch> AsyncFnOnce(&'epoch Epoch) -> Result<PendingCacheEntry, E> + Send + 'static,
        for<'epoch> <R as AsyncFnOnce<(&'epoch Epoch,)>>::CallOnceFuture: Send,
        E: Send + Sync + 'static,
    {
        let Some(entry) = self.entries.get(&key).await else {
            return self.get_or_insert_with(epoch, key, now, resolver).await;
        };

        if entry.is_expired(now, self.limits.hard) {
            return self.get_or_insert_with(epoch, key, now, resolver).await;
        }

        if !key.matches(epoch) {
            return Ok(Some(entry));
        }

        if entry.is_stale(now, self.limits.soft)
            && let Some(claim) = CacheEntry::claim_refresh(&entry)
        {
            let entries = self.entries.clone();
            let publications = Arc::clone(&self.publications);
            let epoch = epoch.fork();

            let _handle = tokio::spawn(
                async move {
                    let resolution = match resolver(&epoch).await {
                        Ok(resolution) => resolution,
                        Err(error) => {
                            drop(claim);
                            on_refresh_error(error);
                            return;
                        }
                    };

                    let _result = entries
                        .entry(key)
                        .and_compute_with(async |held| {
                            if held
                                .is_none_or(|held| held.value().publication != claim.publication())
                            {
                                return Op::Nop;
                            }

                            Op::Put(Arc::new(CacheEntry::new(
                                resolution,
                                now,
                                publications.next(),
                            )))
                        })
                        .await;
                }
                .in_current_span(),
            );
        }

        Ok(Some(entry))
    }
}

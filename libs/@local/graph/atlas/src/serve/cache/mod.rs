//! Resolved visibility, held per scope for a bounded window.
//!
//! Resolving one actor's visible rows costs a store round trip, and a single map view issues one
//! request per tile. [`VisibilityCache`] holds each resolution so those requests share it, and
//! collapses a burst. A request for the same scope arriving during one resolution waits on it and
//! receives its result, so N concurrent tile requests cost one store query.
//!
//! A scope is a [`CacheKey`], naming a generation, an authenticated actor, and the digest of the
//! request filter when the request carries one. Callers presenting the same filter for the same
//! actor and generation share one entry. A filtered request and an unfiltered one are different
//! scopes.
//!
//! [`VisibilityLimits`] bounds reuse. Past the soft window an entry keeps answering while a refresh
//! runs behind it, and at the hard window it stops answering. An authority token presented by a
//! caller carries its own authenticated issue time, and opening a presented token bounds that age
//! against the token's own evidence.
//!
//! # Examples
//!
//! [`VisibilityCache`] is crate-internal, so the sketch below stands in for a compiled example.
//!
//! ```ignore
//! let cache = VisibilityCache::new(VisibilityLimits::default());
//! let scope = CacheKey { generation, actor, filter: None };
//!
//! // The first request resolves. A second inside the window reads the held entry.
//! let entry = cache.resolve(scope, Instant::now(), || resolve_from_store(actor)).await?;
//! let again = cache.resolve(scope, Instant::now(), || resolve_from_store(actor)).await?;
//! // One entry, shared: the second request reads what the first published.
//! assert!(Arc::ptr_eq(&entry, &again));
//! ```
use alloc::sync::Arc;
use core::{
    sync::atomic::{Atomic, Ordering},
    time::Duration,
};
use std::time::Instant;

use moka::ops::compute::Op;

use self::scope::{CacheKey, Publication, Publications, VisibilityLimits};
use super::{
    Atlas, ViewCensus, VisibilityProof,
    hydrate::{MaskingActor, compile::ProofError},
    schedule::ViewSchedule,
};

pub(crate) mod scope;
#[cfg(test)]
pub(crate) mod tests;

/// A proof with the census and schedule of the view it admits, from one resolution.
///
/// The value exists because one resolution produces all three per scope, and none is a function
/// of a request. Its production constructor censuses and schedules the proof it stores, so a
/// census or schedule paired with a foreign proof is unconstructible rather than forbidden.
#[derive(Debug)]
pub(crate) struct PendingCacheEntry {
    /// The rows the actor may see.
    proof: VisibilityProof,
    /// The actor the scope's hydrations mask properties for, resolved with [`Self::proof`].
    masking: MaskingActor,
    /// The corpus-wide census of what [`Self::proof`] admits.
    census: ViewCensus,
    /// The delivery schedule of [`Self::proof`]'s view.
    schedule: ViewSchedule,
    /// The filter document the resolution of [`Self::proof`] ran over, as presented, absent when
    /// unfiltered.
    ///
    /// Held so a refresh can recompile the filter without a client round trip: the client is the
    /// document's durable holder, and this copy lives exactly as long as the entry it resolved.
    filter: Option<Arc<[u8]>>,
    /// The entry's retained heap, folded into moka's weight domain at resolution.
    weight: u32,
}

/// Folds an entry's retained bytes into moka's `u32` weight domain, saturating.
///
/// `retained` is what the resolution measured: the proof's masks and a scoped view's own
/// cascade. The fold adds the entry's inline size and the filter document it holds.
fn weight_of(retained: u64, filter: Option<&[u8]>) -> u32 {
    let total = size_of::<CacheEntry>() as u64
        + retained
        + filter.map_or(0, |document| document.len() as u64);

    u32::try_from(total).unwrap_or(u32::MAX)
}

impl PendingCacheEntry {
    /// Pairs `proof` with its census and schedule over `atlas` and the `filter` document.
    ///
    /// The `filter` is the document the resolution ran over, as presented. The census walks the
    /// base column once for a masked proof and reads the artifacts for an unmasked one, and the
    /// schedule builds a scoped proof's cascade, so the resolution pays those costs rather than
    /// the requests that share them. The first request of a scope reads a held schedule instead
    /// of building one.
    pub(crate) async fn of(
        atlas: Arc<Atlas>,
        proof: VisibilityProof,
        masking: MaskingActor,
        filter: Option<Arc<[u8]>>,
    ) -> Result<Self, ProofError> {
        let (schedule, census, proof, retained) = crate::offload::run(move || {
            let schedule = ViewSchedule::of(&atlas, &proof);
            let census = atlas.census(&proof);

            // The saturated cascade is the generation's own memo, alive for the atlas's
            // lifetime, so an entry sharing it retains none of it.
            let schedule_bytes = match &schedule {
                ViewSchedule::Corpus => 0,
                ViewSchedule::Scope(scope) => {
                    if Arc::ptr_eq(scope, atlas.saturated_scope_schedule()) {
                        0
                    } else {
                        scope.heap_bytes()
                    }
                }
            };
            let retained = proof.heap_bytes() + schedule_bytes;

            (schedule, census, proof, retained)
        })
        .await
        .map_err(ProofError::ComputeView)?;

        Ok(Self {
            proof,
            masking,
            census,
            schedule,
            weight: weight_of(retained, filter.as_deref()),
            filter,
        })
    }

    /// Pairs `proof` with the empty view's census and schedule.
    ///
    /// The cache neither reads a census or schedule nor derives one, so its own tests - over
    /// holding, refreshing and expiring entries - need no walked ones. Production keeps exactly
    /// one constructor, [`Self::of`], which censuses and schedules the proof it stores.
    #[cfg(test)]
    fn with_empty_view(proof: VisibilityProof) -> Self {
        Self {
            proof,
            masking: MaskingActor {
                id: None,
                instance_admin: false,
            },
            census: ViewCensus::EMPTY,
            schedule: ViewSchedule::Scope(Arc::new(super::schedule::ScopeSchedule::empty())),
            filter: None,
            weight: weight_of(0, None),
        }
    }
}

/// One resolved scope, as the cache holds it.
///
/// Everything one resolution produced, together with the bookkeeping that decides when it stops
/// answering and which write may replace it.
///
/// The cache hands out one [`Arc`] per scope, so every reader shares the entry rather than a copy
/// of its parts. No caller can detach a proof from the census resolved with it.
///
/// A refresh publishes a new entry instead of mutating this one. A caller holding an entry across a
/// refresh keeps reading the resolution it was handed.
#[derive(Debug)]
pub(crate) struct CacheEntry {
    /// The rows the actor may see.
    proof: VisibilityProof,
    /// The actor the scope's hydrations mask properties for, resolved with [`Self::proof`].
    masking: MaskingActor,
    /// The corpus-wide census of what [`Self::proof`] admits, resolved with it.
    census: ViewCensus,
    /// The filter document the resolution of [`Self::proof`] ran over, as presented, absent when
    /// unfiltered.
    filter: Option<Arc<[u8]>>,
    /// The delivery schedule of [`Self::proof`]'s view, resolved with it.
    ///
    /// One scope builds its cascade once, at resolution, and every request under it reads that
    /// one. Replacing the entry retires the schedule along with the proof it describes.
    schedule: ViewSchedule,
    /// When the resolution behind [`Self::proof`] ran.
    resolved_at: Instant,
    /// Which write into the slot published this entry.
    publication: Publication,
    /// Held while a refresh of this entry is in flight.
    ///
    /// This has one job. A burst of requests crossing the refresh horizon together runs one
    /// resolution rather than one each. Which entry that resolution may publish over is
    /// [`Publication`]'s question, and this answers nothing about it.
    refreshing: Atomic<bool>,
    /// The entry's retained heap, priced at resolution, read by the cache's weigher.
    weight: u32,
}

impl CacheEntry {
    /// Builds an entry around a freshly resolved scope.
    fn new(
        PendingCacheEntry {
            proof,
            masking,
            census,
            schedule,
            filter,
            weight,
        }: PendingCacheEntry,
        resolved_at: Instant,
        publication: Publication,
    ) -> Self {
        Self {
            proof,
            masking,
            census,
            filter,
            schedule,
            resolved_at,
            publication,
            refreshing: Atomic::<bool>::new(false),
            weight,
        }
    }

    /// Returns the rows the scope may see.
    pub(crate) const fn proof(&self) -> &VisibilityProof {
        &self.proof
    }

    /// Returns the actor the scope's hydrations mask properties for.
    pub(crate) const fn masking(&self) -> MaskingActor {
        self.masking
    }

    /// Returns the corpus-wide census of what [`Self::proof`] admits.
    pub(crate) const fn census(&self) -> &ViewCensus {
        &self.census
    }

    /// Returns the delivery schedule of this entry's view, resolved with its proof.
    pub(crate) const fn view_schedule(&self) -> &ViewSchedule {
        &self.schedule
    }

    /// Returns the filter document the resolution ran over, as presented.
    pub(crate) fn filter_document(&self) -> Option<Arc<[u8]>> {
        self.filter.clone()
    }

    /// Returns whether this entry has reached its refresh horizon by `now`.
    fn is_stale(&self, now: Instant, soft: Duration) -> bool {
        now.saturating_duration_since(self.resolved_at) >= soft
    }

    /// Returns whether this entry has outlived its reuse window by `now`.
    ///
    /// The age runs from the resolution, so the window bounds how long permissions may lag however
    /// long the resolution itself took.
    fn is_expired(&self, now: Instant, hard: Duration) -> bool {
        now.saturating_duration_since(self.resolved_at) >= hard
    }

    /// Takes the refresh latch, returning whether this caller now owns the refresh.
    fn claim_refresh(&self) -> bool {
        self.refreshing
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
    }
}

/// Resolved scopes, held for their reuse window.
///
/// One entry per scope, weighed by the bytes it retains, so the capacity bound follows what the
/// held resolutions actually keep allocated rather than their count. A scope with no held entry
/// resolves again on its next request and admits the same rows when its permissions have not
/// moved, so eviction costs one store round trip and nothing else.
///
/// Admission favours the scopes that come back. Since a scope's key includes its filter, a client
/// exploring filters produces a stream of scopes asked for once each, and those cost one resolution
/// apiece and leave returning callers' entries in place. A newly active scope pays an extra
/// resolution or two before admission while the cache is full.
#[derive(Debug)]
pub(crate) struct VisibilityCache {
    entries: moka::future::Cache<CacheKey, Arc<CacheEntry>>,
    publications: Arc<Publications>,
    soft: Duration,
    hard: Duration,
}

impl VisibilityCache {
    /// Builds a cache holding scopes under the given [`VisibilityLimits`].
    pub(crate) fn new(VisibilityLimits { bytes, soft, hard }: VisibilityLimits) -> Self {
        Self {
            // The eviction policy is moka's default, named here so an upstream change of default
            // cannot swap it. The time-to-live runs from insertion, which is the resolution's END,
            // so the window it enforces is `hard` plus however long the resolution took: `resolve`
            // refuses on the entry's own `resolved_at`, and this bounds the memory behind it.
            // Weights are the entries' retained bytes, priced at resolution, so the capacity is a
            // byte budget.
            entries: moka::future::Cache::builder()
                .max_capacity(bytes)
                .weigher(|_key, entry: &Arc<CacheEntry>| entry.weight)
                .eviction_policy(moka::policy::EvictionPolicy::tiny_lfu())
                .time_to_live(hard)
                .build(),
            publications: Arc::new(Publications::new()),
            soft,
            hard,
        }
    }

    /// Returns the entry held for `key`.
    pub(crate) async fn get(&self, key: &CacheKey) -> Option<Arc<CacheEntry>> {
        self.entries.get(key).await
    }

    /// Resolves `key` again in place of the expired entry held for it.
    ///
    /// The replacement takes the slot under moka's key lock, so a burst of requests past the hard
    /// window costs one store round trip: the first publishes and the rest read what it published.
    /// Dropping the entry and inserting its replacement as two operations would leave the slot
    /// empty in between, where a concurrent refresh's publication or an inline resolution can land
    /// and then be overwritten by this one.
    async fn replaced_expired<R, E>(
        &self,
        key: CacheKey,
        now: Instant,
        resolver: R,
    ) -> Result<Arc<CacheEntry>, Arc<E>>
    where
        R: AsyncFnOnce() -> Result<PendingCacheEntry, E>,
        E: Send + Sync + 'static,
    {
        let published = self
            .entries
            .entry(key)
            .and_try_compute_with(async |held| {
                // Another caller past the same window may have published while this one queued, and
                // its resolution is no older than the one this call would run.
                if held.is_some_and(|held| !held.value().is_expired(now, self.hard)) {
                    return Ok::<_, E>(Op::Nop);
                }

                Ok(Op::Put(Arc::new(CacheEntry::new(
                    resolver().await?,
                    now,
                    self.publications.draw(),
                ))))
            })
            .await
            .map_err(Arc::new)?;

        Ok(published
            .into_entry()
            .expect(
                "a compute that publishes over an absent slot and removes nothing holds an entry",
            )
            .into_value())
    }

    /// Answers from the entry held for `key`, resolving inline when the cache holds none.
    ///
    /// Concurrent callers of one key share one inline resolution: the initializer runs once and
    /// every waiter receives its result, which is what keeps a burst of tile requests for one scope
    /// to a single store round trip.
    async fn resolved_inline<R, E>(
        &self,
        key: CacheKey,
        now: Instant,
        resolver: R,
    ) -> Result<Arc<CacheEntry>, Arc<E>>
    where
        R: AsyncFnOnce() -> Result<PendingCacheEntry, E>,
        E: Send + Sync + 'static,
    {
        self.entries
            .try_get_with(key, async {
                // Called during the generation, not before, as the function indicates a write, not
                // an intention to write.
                resolver().await.map(|resolution| {
                    Arc::new(CacheEntry::new(resolution, now, self.publications.draw()))
                })
            })
            .await
    }

    /// Returns the scope `key` names at `now`, resolving it through `resolver` when needed.
    ///
    /// A held entry inside the soft window answers immediately, and `resolver` goes uncalled.
    ///
    /// An entry past the soft window answers too, and one caller takes the refresh. That resolution
    /// runs behind the answer already returned and replaces the entry once it completes, so a
    /// request that crosses the horizon costs what a hit costs and receives the proof it already
    /// had.
    ///
    /// An entry past the hard window answers nothing. The cache drops it and resolves again, so the
    /// answer is a resolution no older than `now`. The cache judges both windows on the `now` this
    /// call supplies, the monotonic clock `resolved_at` came from, and measures them from the
    /// resolution the entry carries, so a slow resolution shortens the entry's reuse rather than
    /// extending its window.
    ///
    /// A refresh publishes only over the entry it refreshed, and only while that entry is the
    /// newest held. A refresh completing after a newer resolution, or after the entry it refreshed
    /// has left the cache, publishes nothing, so the newest resolution of a scope is the one that
    /// answers and no proof re-enters the cache with a window it did not earn.
    ///
    /// With nothing held, the resolution runs inline and every request arriving during it receives
    /// its result, so a burst of tile requests for one scope costs one store round trip.
    ///
    /// An unchanged permission set resolves to the same rows. When a refresh resolves a *narrower*
    /// proof, it replaces the entry and the requests after it answer from the narrower view. The
    /// cache takes that mid-run change while the graph has no permission epochs for invalidating an
    /// entry, so no caller learns of a refresh.
    ///
    /// # Errors
    ///
    /// Returns `resolver`'s error when an inline resolution fails, holding no entry. A failed
    /// resolution publishes nothing, and the requests that shared it share its error. A failed
    /// refresh leaves the held entry serving and releases the refresh, so the next request past the
    /// soft window tries again.
    pub(crate) async fn resolve<R, E>(
        &self,
        key: CacheKey,
        now: Instant,
        resolver: R,
    ) -> Result<Arc<CacheEntry>, Arc<E>>
    where
        R: AsyncFnOnce() -> Result<PendingCacheEntry, E> + Send + 'static,
        R::CallOnceFuture: Send,
        E: Send + Sync + 'static,
    {
        // Exactly one of the three paths below resolves, which is what lets the signature ask for
        // an `AsyncFnOnce`. Any call that resolves returns an entry younger than both windows, so
        // no later path in the same call can resolve again. Reading the slot first is what makes
        // that visible to the compiler as well as true.
        //
        // The windows are judged on the `now` this call is given, the one `resolved_at` came from,
        // rather than on moka's, whose expiry starts when the resolution finishes.
        let Some(entry) = self.entries.get(&key).await else {
            return self.resolved_inline(key, now, resolver).await;
        };

        if entry.is_expired(now, self.hard) {
            return self.replaced_expired(key, now, resolver).await;
        }

        if entry.is_stale(now, self.soft) && entry.claim_refresh() {
            let entries = self.entries.clone();
            let publications = Arc::clone(&self.publications);
            let refreshed = Arc::clone(&entry);

            let _handle = tokio::spawn(async move {
                let Ok(resolution) = resolver().await else {
                    // A failed refresh releases the latch and leaves the entry it read serving, so
                    // the next request past the soft window tries again. Nothing here answers a
                    // caller, because the request that triggered this refresh was answered before
                    // it began.
                    refreshed.refreshing.store(false, Ordering::Release);
                    return;
                };

                // The resolution ran outside moka's key lock. The comparison and the write happen
                // inside it with nothing awaited in between. The write goes to whatever holds the
                // slot when this closure reads it.
                //
                // Publication names the entry this refresh read, and age cannot. A request stamps
                // `now` on arrival, while its insert lands a pool acquire and a store round trip
                // later, so an entry resolved before this refresh began can reach the slot after
                // it. A slot emptied by the hard window or by an eviction gets refilled by a
                // resolution carrying its own publication. That stranger keeps the slot however its
                // timestamp reads, and no proof re-enters a slot with a window it did not earn.
                let _result = entries
                    .entry(key)
                    .and_compute_with(async |held| {
                        if held.is_none_or(|held| held.value().publication != refreshed.publication)
                        {
                            return Op::Nop;
                        }

                        // The refreshed entry carries `now`, the time of the request that triggered
                        // it, so no entry claims a time later than the permissions it
                        // reflects.
                        Op::Put(Arc::new(CacheEntry::new(
                            resolution,
                            now,
                            publications.draw(),
                        )))
                    })
                    .await;
            });
        }

        Ok(entry)
    }
}

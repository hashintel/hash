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

fn weight_of(retained: u64, filter: Option<&RawValue>) -> u32 {
    let inline = size_of::<CacheEntry>() as u64 + size_of::<CacheKey>() as u64;
    let total = retained
        .saturating_add(inline)
        .saturating_add(filter.map_or(0, |document| document.get().len() as u64));

    total.saturating_cast()
}

#[derive(Debug)]
pub(crate) struct PendingCacheEntry {
    mask: VisibilityMask,
    schedule: ViewSchedule,
    filter: Option<Arc<RawValue>>,
    occupancy: Option<ViewOccupancy>,
    weight: u32,
}

impl PendingCacheEntry {
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
    struct Publication(u64)
}

hashql_core::id::newtype_producer!(struct PublicationProducer(Publication));

#[derive(Debug)]
pub(crate) struct CacheEntry {
    pub mask: VisibilityMask,
    pub schedule: ViewSchedule,
    pub filter: Option<Arc<RawValue>>,
    pub occupancy: Option<ViewOccupancy>,
    resolved_at: Instant,
    publication: Publication,
    refreshing: Atomic<bool>,
    weight: u32,
}

impl CacheEntry {
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

    fn is_stale(&self, now: Instant, soft: Duration) -> bool {
        now.saturating_duration_since(self.resolved_at) >= soft
    }

    fn is_expired(&self, now: Instant, hard: Duration) -> bool {
        now.saturating_duration_since(self.resolved_at) >= hard
    }

    /// Claims the exclusive right to refresh this entry until the returned guard drops.
    ///
    /// Returns [`None`] while another refresh holds the claim. A request that still holds an entry
    /// a later refresh has already replaced can claim it again, and the publication comparison in
    /// [`VisibilityCache::resolve`] rejects that redundant resolution's result.
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

/// One refresh's exclusive claim on a cache entry.
///
/// Dropping the guard clears that entry's claim. The refresh future owns the guard and releases
/// it on completion, unwinding or future drop. Later refreshes remain subject to the retired-epoch
/// checks in [`VisibilityCache::resolve`] and to the entry's expiry.
struct RefreshClaim {
    entry: Arc<CacheEntry>,
}

impl RefreshClaim {
    /// The claimed entry's publication.
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

/// An actor and filter scope within one generation and [delta lifetime](DeltaId).
///
/// A generation can reopen with a new [`DeltaId`]. Including both identifiers keeps its cache
/// scopes separate. Excluding the revision permits cache reuse and refresh across publications
/// within that lifetime.
#[derive(Debug, PartialEq, Eq, Hash)]
pub(crate) struct CacheKey {
    generation: GenerationId,
    delta: DeltaId,
    actor: ActorId,
    filter: Option<FilterDigest>,
}

impl CacheKey {
    pub(crate) fn new(epoch: &Epoch, actor: ActorId, filter: Option<FilterDigest>) -> Self {
        Self {
            generation: epoch.generation(),
            delta: epoch.reference().id,
            actor,
            filter,
        }
    }

    fn matches(&self, epoch: &Epoch) -> bool {
        self.generation == epoch.generation() && self.delta == epoch.reference().id
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct VisibilityLimits {
    pub bytes: u64,
    pub soft: Duration,
    pub hard: Duration,
}

#[derive(Debug)]
pub(crate) struct VisibilityCache {
    entries: moka::future::Cache<CacheKey, Arc<CacheEntry>>,
    publications: Arc<PublicationProducer>,
    limits: VisibilityLimits,
}

impl VisibilityCache {
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

    pub(super) async fn filter_document(&self, key: &CacheKey) -> Option<Arc<RawValue>> {
        self.entries.get(key).await?.filter.as_ref().map(Arc::clone)
    }

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
    /// A stale eligible entry returns immediately and starts a detached refresh if its claim is
    /// free. The task uses the current tracing span. On resolution failure, it releases the
    /// entry's refresh claim before calling `on_refresh_error` with the error. The cached entry
    /// retains its expiry.
    ///
    /// # Errors
    ///
    /// Returns the resolver's error when an eligible entry is missing or expired.
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

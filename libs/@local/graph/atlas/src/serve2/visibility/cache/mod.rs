use alloc::sync::Arc;
use core::{
    sync::atomic::{self, Atomic},
    time::Duration,
};
use std::time::Instant;

use error_stack::{Report, ResultExt as _};
use moka::ops::compute::{CompResult, Op};
use serde_json::value::RawValue;
use type_system::principal::actor::ActorId;

use self::error::VisibilityCacheError;
pub(crate) use self::filter::FilterDigest;
use crate::{
    allocator::HeapMemoryUsage,
    file::generation::GenerationId,
    offload,
    serve2::{
        delta::epoch::Epoch, density::ViewOccupancy, schedule::ViewSchedule,
        visibility::VisibilityMask, world::World,
    },
};

mod error;
mod filter;

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
    filter: Option<Arc<RawValue>>,
    occupancy: Option<ViewOccupancy>,
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

    fn claim_refresh(&self) -> bool {
        self.refreshing
            .compare_exchange(
                false,
                true,
                atomic::Ordering::AcqRel,
                atomic::Ordering::Acquire,
            )
            .is_ok()
    }
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub(crate) struct CacheKey {
    generation: GenerationId,
    actor: ActorId,
    filter: Option<FilterDigest>,
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
        let key_generation = key.generation;
        self.entries
            .entry(key)
            .and_try_compute_with(async |held| {
                if held.is_some_and(|held| !held.value().is_expired(now, self.limits.hard)) {
                    return Ok::<_, E>(Op::Nop);
                }

                if key_generation != epoch.generation() {
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

    pub(crate) async fn resolve<R, E>(
        &self,
        epoch: &Epoch,
        key: CacheKey,
        now: Instant,
        resolver: R,
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

        if entry.is_stale(now, self.limits.soft) && entry.claim_refresh() {
            // To exhaust we skip refreshes for entries that haven't expired
            if key.generation != epoch.generation() {
                return Ok(Some(entry));
            }

            let entries = self.entries.clone();
            let publications = Arc::clone(&self.publications);
            let refreshed = Arc::clone(&entry);
            let epoch = epoch.fork();

            let _handle = tokio::spawn(async move {
                let Ok(resolution) = resolver(&epoch).await else {
                    refreshed.refreshing.store(false, atomic::Ordering::Release);
                    return;
                };

                let _result = entries
                    .entry(key)
                    .and_compute_with(async |held| {
                        if held.is_none_or(|held| held.value().publication != refreshed.publication)
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
            });
        }

        Ok(Some(entry))
    }
}

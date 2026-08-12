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
#![expect(
    clippy::empty_enums,
    reason = "zerocopy's FromBytes derive expands to an empty enum for its validation machinery"
)]
use alloc::sync::Arc;
use core::{
    sync::atomic::{Atomic, Ordering},
    time::Duration,
};
use std::{sync::OnceLock, time::Instant};

use moka::ops::compute::Op;
use type_system::principal::actor::ActorEntityUuid;

use super::{Atlas, ViewCensus, VisibilityProof, hydrate::MaskingActor, schedule::ViewSchedule};
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
pub(crate) struct Publication(u64);

/// One cache's source of publications.
#[derive(Debug)]
struct Publications(Atomic<u64>);

impl Publications {
    /// Returns a source that has published nothing.
    const fn new() -> Self {
        Self(Atomic::<u64>::new(0))
    }

    /// Returns a publication greater than every one this source has returned.
    ///
    /// [`Ordering::Relaxed`] carries it, because the only ordering the comparison needs is moka's
    /// key lock, which every read and write of a published value already happens under. This
    /// counter owes uniqueness and monotonicity, which `fetch_add` gives at any ordering.
    /// Exhausting `u64` at a billion publications a second takes over five centuries, so the count
    /// does not wrap.
    fn draw(&self) -> Publication {
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

/// A proof and the census of the view it admits, from one resolution.
///
/// The pair exists because one resolution produces both per scope, and neither is a function of a
/// request. Its production constructor censuses the proof it stores, so a census paired with a
/// foreign proof is unconstructible rather than forbidden.
#[derive(Debug)]
pub(crate) struct PendingCacheEntry {
    /// The rows the actor may see.
    proof: VisibilityProof,
    /// The actor the scope's hydrations mask properties for, resolved with [`Self::proof`].
    masking: MaskingActor,
    /// The corpus-wide census of what [`Self::proof`] admits.
    census: ViewCensus,
    /// The filter document the resolution of [`Self::proof`] ran over, as presented, absent when
    /// unfiltered.
    ///
    /// Held so a refresh can recompile the filter without a client round trip: the client is the
    /// document's durable holder, and this copy lives exactly as long as the entry it resolved.
    filter: Option<Arc<[u8]>>,
}

impl PendingCacheEntry {
    /// Pairs `proof` with its census over `atlas` and the `filter` document, as presented.
    ///
    /// The `filter` is the document the resolution ran over. The census walks the base column once
    /// for a masked proof and reads the artifacts for an unmasked one, so the resolution pays that
    /// cost rather than the requests that share it.
    pub(crate) fn of(
        atlas: &Atlas,
        proof: VisibilityProof,
        masking: MaskingActor,
        filter: Option<Arc<[u8]>>,
    ) -> Self {
        Self {
            census: atlas.census(&proof),
            proof,
            masking,
            filter,
        }
    }

    /// Pairs `proof` with the empty view's census.
    ///
    /// The cache neither reads a census nor derives one, so its own tests - over holding,
    /// refreshing and expiring entries - need no walked one. Production keeps exactly one
    /// constructor, [`Self::of`], which censuses the proof it stores.
    #[cfg(test)]
    pub(crate) const fn with_empty_census(proof: VisibilityProof) -> Self {
        Self {
            proof,
            masking: MaskingActor {
                id: None,
                instance_admin: false,
            },
            census: ViewCensus::EMPTY,
            filter: None,
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
    /// The delivery schedule of [`Self::proof`]'s view, built on first read.
    ///
    /// One scope builds its cascade once, and every request under it reads that one. Replacing the
    /// entry retires the schedule along with the proof it describes.
    schedule: OnceLock<ViewSchedule>,
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
}

impl CacheEntry {
    /// Builds an entry around a freshly resolved scope.
    fn new(
        PendingCacheEntry {
            proof,
            masking,
            census,
            filter,
        }: PendingCacheEntry,
        resolved_at: Instant,
        publication: Publication,
    ) -> Self {
        Self {
            proof,
            masking,
            census,
            filter,
            schedule: OnceLock::new(),
            resolved_at,
            publication,
            refreshing: Atomic::<bool>::new(false),
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

    /// Returns the delivery schedule of this entry's view, building it on first read.
    ///
    /// Concurrent first readers of one scope wait for a single construction rather than duplicating
    /// it.
    pub(crate) fn view_schedule(&self, atlas: &Atlas) -> &ViewSchedule {
        self.schedule
            .get_or_init(|| ViewSchedule::of(atlas, &self.proof))
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

/// How long the cache reuses a resolved scope, and how many scopes it holds at once.
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
/// [`Self::entries`] bounds how many scopes the cache holds. A deployment with more concurrently
/// active actors than entries still answers every request, and the scopes that fall out resolve
/// again, one store round trip each.
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
    /// How many scopes the cache holds before dropping the least valuable.
    pub entries: u64,
    /// When a held entry starts refreshing behind the answer it serves.
    pub soft: Duration,
    /// When a held entry stops answering.
    pub hard: Duration,
}

impl Default for VisibilityLimits {
    /// A ten-minute revocation lag, refreshing at eight, holding 4096 scopes.
    ///
    /// The refresh runs in the two-minute gap between the windows. A scope in continuous use
    /// re-resolves at eight minutes and keeps answering from the held proof while that runs, so
    /// only a scope whose refresh failed or that no longer receives requests reaches the hard
    /// window. The entry count is an unvalidated starting point, bounding concurrent hot scopes,
    /// and the measurement that revises it is the cache's own hit rate against the deployment's
    /// active-actor count.
    fn default() -> Self {
        Self {
            entries: 4096,
            soft: Duration::from_mins(8),
            hard: Duration::from_mins(10),
        }
    }
}

/// Resolved scopes, held for their reuse window.
///
/// One entry per scope, whatever its proof admits, so the capacity bound counts scopes rather than
/// rows or bytes. A scope with no held entry resolves again on its next request and admits the same
/// rows when its permissions have not moved, so eviction costs one store round trip and nothing
/// else.
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
    pub(crate) fn new(
        VisibilityLimits {
            entries,
            soft,
            hard,
        }: VisibilityLimits,
    ) -> Self {
        Self {
            // The eviction policy is moka's default, named here so an upstream change of default
            // cannot swap it. The time-to-live runs from insertion, which is the resolution's END,
            // so the window it enforces is `hard` plus however long the resolution took: `resolve`
            // refuses on the entry's own `resolved_at`, and this bounds the memory behind it.
            entries: moka::future::Cache::builder()
                .max_capacity(entries)
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

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::{
        sync::atomic::{AtomicUsize, Ordering},
        time::Duration,
    };
    use std::time::Instant;

    use hashql_core::id::Id as _;
    use type_system::principal::actor::ActorEntityUuid;
    use uuid::Uuid;

    use super::{
        CacheEntry, CacheKey, FilterDigest, PendingCacheEntry, VisibilityCache, VisibilityLimits,
    };
    use crate::{
        bitset::CompressedBitSet,
        identity::{EdgeRowId, NodeRowId},
        serve::VisibilityProof,
    };

    const SOFT: Duration = Duration::from_mins(8);
    const HARD: Duration = Duration::from_mins(10);

    /// A budget no fixture here evicts under.
    const LIMITS: VisibilityLimits = VisibilityLimits {
        entries: 1 << 10,
        soft: SOFT,
        hard: HARD,
    };

    /// The scope of the actor numbered `actor`.
    fn key_of(actor: u128) -> CacheKey {
        CacheKey {
            generation: "07"
                .repeat(32)
                .parse()
                .expect("64 hexadecimal digits name a generation"),
            actor: ActorEntityUuid::new(Uuid::from_u128(actor)),
            filter: None,
        }
    }

    fn key() -> CacheKey {
        key_of(11)
    }

    /// Builds a masked proof admitting `nodes` as node rows and no link rows.
    fn proof_of(nodes: &[u32]) -> VisibilityProof {
        VisibilityProof::from_masks(
            CompressedBitSet::from_rows(nodes.iter().copied().map(NodeRowId::from_u32)),
            CompressedBitSet::<EdgeRowId>::new(),
        )
    }

    /// Whether `entry`'s proof admits the node row numbered `node`.
    ///
    /// The fixtures give each resolution a row of its own, so one membership test names which
    /// resolution an entry carries.
    fn admits(entry: &CacheEntry, node: u32) -> bool {
        entry.proof().contains(NodeRowId::from_u32(node))
    }

    /// A resolver answering `rows` and counting its calls.
    ///
    /// A macro rather than a function, because the cache asks its resolver for a `Send` future at
    /// every lifetime, and an opaque return type publishes only the bounds it names. Expanding at
    /// the call site hands the compiler the closure itself, which carries the property.
    macro_rules! answering {
        ($rows:expr, $calls:expr) => {{
            let calls = Arc::clone($calls);

            async move || {
                calls.fetch_add(1, Ordering::Relaxed);
                Ok::<_, ()>(PendingCacheEntry::with_empty_census(proof_of($rows)))
            }
        }};
    }

    /// An entry inside the soft window answers without resolving again.
    #[tokio::test]
    async fn held_entry_answers_without_resolving_again() {
        let cache = VisibilityCache::new(LIMITS);
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        for elapsed in [Duration::ZERO, SOFT / 2] {
            cache
                .resolve(key(), now + elapsed, answering!(&[1, 2, 3], &calls))
                .await
                .expect("the resolution answers");
        }

        assert_eq!(
            calls.load(Ordering::Relaxed),
            1,
            "the second read was served"
        );
    }

    /// Requests arriving during one resolution share it.
    ///
    /// Without sharing, a burst of tile requests for one scope would each issue the store query the
    /// cache exists to avoid.
    #[tokio::test]
    async fn concurrent_misses_resolve_once() {
        let cache = VisibilityCache::new(LIMITS);
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        let (first, second) = tokio::join!(
            cache.resolve(key(), now, answering!(&[1, 2, 3], &calls)),
            cache.resolve(key(), now, answering!(&[1, 2, 3], &calls)),
        );

        let first = first.expect("the resolution answers");
        let second = second.expect("the resolution answers");

        assert_eq!(calls.load(Ordering::Relaxed), 1, "one resolution ran");
        assert!(Arc::ptr_eq(&first, &second), "both callers hold one entry");
    }

    /// An entry past the soft window answers from the held proof while a refresh replaces it.
    ///
    /// The request crossing the horizon pays nothing: it receives the proof it already had. The
    /// refresh runs as a task, so the loop below drives the runtime until the refresh publishes
    /// rather than waiting on a clock.
    #[tokio::test]
    async fn stale_entry_answers_while_it_refreshes() {
        let cache = VisibilityCache::new(LIMITS);
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        let held = cache
            .resolve(key(), now, answering!(&[1, 2, 3], &calls))
            .await
            .expect("the resolution answers");

        let stale = cache
            .resolve(key(), now + SOFT, answering!(&[9], &calls))
            .await
            .expect("the held entry answers");
        assert!(
            Arc::ptr_eq(&stale, &held),
            "the stale read answered from the held proof"
        );
        assert_eq!(
            calls.load(Ordering::Relaxed),
            1,
            "the stale answer ran no resolution of its own"
        );

        let mut refreshed = None;
        for _ in 0..16_u8 {
            tokio::task::yield_now().await;
            let entry = cache.get(&key()).await.expect("the entry stays held");
            if !Arc::ptr_eq(&entry, &held) {
                refreshed = Some(entry);
                break;
            }
        }

        let refreshed = refreshed.expect("the refresh replaced the held entry");
        assert!(
            admits(&refreshed, 9),
            "the published entry carries the refresh's own resolution"
        );
        assert_eq!(
            calls.load(Ordering::Relaxed),
            2,
            "the refresh resolved behind the answer"
        );
    }

    /// A filter's identity separates entries for one actor.
    #[tokio::test]
    async fn filter_identity_separates_entries_for_one_actor() {
        let cache = VisibilityCache::new(LIMITS);
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        let mut filtered = key();
        filtered.filter = Some(FilterDigest::of(b"web = 7"));

        for scope in [key(), filtered] {
            cache
                .resolve(scope, now, answering!(&[1], &calls))
                .await
                .expect("the resolution answers");
        }

        assert_eq!(
            calls.load(Ordering::Relaxed),
            2,
            "the filtered scope resolved on its own"
        );
    }

    /// The capacity bound counts entries, so a proof's rows cannot evict its neighbours.
    ///
    /// Under a two-entry budget, two scopes hold six rows between them. A budget priced in rows
    /// admits each entry and evicts it again, while a budget priced in entries holds both. The
    /// budget bites on a third scope, by eviction or by refused admission, since the count is what
    /// this fixture pins.
    #[tokio::test]
    async fn capacity_bound_counts_entries() {
        let cache = VisibilityCache::new(VisibilityLimits {
            entries: 2,
            ..LIMITS
        });
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        for actor in [1_u128, 2] {
            cache
                .resolve(key_of(actor), now, answering!(&[1, 2, 3], &calls))
                .await
                .expect("the resolution answers");
        }
        cache.entries.run_pending_tasks().await;

        for actor in [1_u128, 2] {
            assert!(
                cache.get(&key_of(actor)).await.is_some(),
                "scope {actor} is held: two entries of three rows fit a two-entry budget"
            );
        }

        cache
            .resolve(key_of(3), now, answering!(&[1, 2, 3], &calls))
            .await
            .expect("the resolution answers");
        cache.entries.run_pending_tasks().await;

        assert_eq!(
            cache.entries.entry_count(),
            2,
            "the third scope did not raise the held count"
        );
    }

    /// The cache answers nothing from an entry past the hard window.
    ///
    /// The window runs from the resolution, so the clock this advances is the injected `now` and
    /// not the cache's own. An entry whose age reaches `hard` resolves again inline, and the answer
    /// carries the new proof rather than the held one.
    #[tokio::test]
    async fn expired_entry_resolves_again() {
        let cache = VisibilityCache::new(LIMITS);
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        let held = cache
            .resolve(key(), now, answering!(&[1, 2, 3], &calls))
            .await
            .expect("the resolution answers");

        let answered = cache
            .resolve(key(), now + HARD, answering!(&[9], &calls))
            .await
            .expect("the expired entry resolves again");

        assert_eq!(
            calls.load(Ordering::Relaxed),
            2,
            "the expired read resolved rather than answering from the held proof"
        );
        assert!(
            !Arc::ptr_eq(&answered, &held),
            "the answer carries the new resolution"
        );
        assert!(admits(&answered, 9), "the answer is the inline resolution");
    }

    /// A refresh landing after a newer resolution publishes nothing.
    ///
    /// The refresh task holds the proof it resolved. An unconditional `insert` would let an older
    /// proof replace a newer one and restart the window it lives in. The cache would then go on
    /// serving a permission revoked between the two for a fresh window. The fixture forces that
    /// order. A paused resolver holds the refresh in flight until a newer inline resolution has
    /// published, and only then does the refresh complete.
    #[tokio::test]
    async fn refresh_landing_after_a_newer_resolution_publishes_nothing() {
        let cache = VisibilityCache::new(LIMITS);
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        let held = cache
            .resolve(key(), now, answering!(&[1, 2, 3], &calls))
            .await
            .expect("the resolution answers");

        // The refresh resolver blocks on a permit that the gate stores rather than signals, so the
        // order below holds however the runtime interleaves the spawned task.
        let gate = Arc::new(tokio::sync::Notify::new());
        let refresh_gate = Arc::clone(&gate);
        let refresh_calls = Arc::clone(&calls);
        let stale = cache
            .resolve(key(), now + SOFT, move || {
                let gate = Arc::clone(&refresh_gate);
                let calls = Arc::clone(&refresh_calls);
                async move {
                    // `notify_one` stores a permit, so this completes whether the release ran
                    // before this task was first polled or after.
                    gate.notified().await;
                    calls.fetch_add(1, Ordering::Relaxed);
                    Ok::<_, ()>(PendingCacheEntry::with_empty_census(proof_of(&[1, 2, 3])))
                }
            })
            .await
            .expect("the held entry answers");
        assert!(
            Arc::ptr_eq(&stale, &held),
            "the stale read answered as held"
        );

        // A newer resolution replaces the entry while the refresh is still in flight.
        cache.entries.invalidate(&key()).await;
        let newer = cache
            .resolve(key(), now + SOFT + SOFT, answering!(&[7], &calls))
            .await
            .expect("the newer resolution answers");
        assert_eq!(
            calls.load(Ordering::Relaxed),
            2,
            "the refresh is still in flight: one initial resolution, one newer"
        );

        gate.notify_one();

        // The refresh's own resolution must COMPLETE for this fixture to witness anything: without
        // that count the assertion below would hold of a task that never published at all.
        let mut resolved = false;
        for _ in 0..64_u8 {
            tokio::task::yield_now().await;
            if calls.load(Ordering::Relaxed) == 3 {
                resolved = true;
            }
        }
        assert!(resolved, "the refresh resolved behind the newer entry");

        let after = cache.get(&key()).await.expect("an entry stays held");
        assert!(
            Arc::ptr_eq(&after, &newer),
            "the newer resolution still answers: the refresh published nothing over it"
        );
    }

    /// A refresh publishes only over the entry it refreshed.
    ///
    /// Identity names that entry. Age cannot name it: a request stamps `now` when it arrives, while
    /// its insert completes only after a pool acquire and a store round trip. An entry resolved
    /// before the refresh was triggered can be written into the slot after that refresh started. An
    /// age comparison overwrites it, and its proof is a different resolution that no request asked
    /// to have replaced.
    ///
    /// The fixture holds a refresh in flight while it empties the slot and refills it with a
    /// stranger stamped below the refresh trigger. Only then does the refresh complete.
    #[tokio::test]
    async fn refresh_publishes_only_over_its_own_entry() {
        let cache = VisibilityCache::new(LIMITS);
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        let held = cache
            .resolve(key(), now, answering!(&[1, 2, 3], &calls))
            .await
            .expect("the resolution answers");

        let gate = Arc::new(tokio::sync::Notify::new());
        let refresh_gate = Arc::clone(&gate);
        let refresh_calls = Arc::clone(&calls);
        let stale = cache
            .resolve(key(), now + SOFT, move || {
                let gate = Arc::clone(&refresh_gate);
                let calls = Arc::clone(&refresh_calls);
                async move {
                    gate.notified().await;
                    calls.fetch_add(1, Ordering::Relaxed);
                    Ok::<_, ()>(PendingCacheEntry::with_empty_census(proof_of(&[1, 2, 3])))
                }
            })
            .await
            .expect("the held entry answers");
        assert!(
            Arc::ptr_eq(&stale, &held),
            "the stale read answered as held"
        );

        // A different entry takes the slot while the refresh is in flight, stamped below the
        // refresh trigger: the request that arrived before the refreshing one and whose insert
        // landed after it.
        cache.entries.invalidate(&key()).await;
        let stranger = cache
            .resolve(key(), now + SOFT / 2, answering!(&[7], &calls))
            .await
            .expect("the stranger resolution answers");
        assert!(
            stranger.resolved_at < now + SOFT,
            "the stranger is older than the refresh trigger, so an age test replaces it"
        );

        gate.notify_one();

        // The refresh's own resolution must complete for this fixture to witness anything.
        let mut resolved = false;
        for _ in 0..64_u8 {
            tokio::task::yield_now().await;
            if calls.load(Ordering::Relaxed) == 3 {
                resolved = true;
            }
        }
        assert!(resolved, "the refresh resolved behind the stranger");

        let after = cache.get(&key()).await.expect("an entry stays held");
        assert!(
            Arc::ptr_eq(&after, &stranger),
            "the stranger still answers: a refresh publishes only over the entry it refreshed"
        );
    }

    /// A refresh whose entry has left the cache publishes nothing.
    ///
    /// The slot empties for exactly the reasons the windows exist, either because the hard window
    /// dropped the entry or because capacity evicted it, so a refresh that filled the slot again
    /// would give a proof resolved before that removal a fresh window to live in, with no request
    /// having asked for it. A refresh replaces the entry it refreshed and creates none.
    #[tokio::test]
    async fn refresh_of_a_removed_entry_publishes_nothing() {
        let cache = VisibilityCache::new(LIMITS);
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        cache
            .resolve(key(), now, answering!(&[1, 2, 3], &calls))
            .await
            .expect("the resolution answers");

        let gate = Arc::new(tokio::sync::Notify::new());
        let refresh_gate = Arc::clone(&gate);
        let refresh_calls = Arc::clone(&calls);
        cache
            .resolve(key(), now + SOFT, move || {
                let gate = Arc::clone(&refresh_gate);
                let calls = Arc::clone(&refresh_calls);
                async move {
                    gate.notified().await;
                    calls.fetch_add(1, Ordering::Relaxed);
                    Ok::<_, ()>(PendingCacheEntry::with_empty_census(proof_of(&[1, 2, 3])))
                }
            })
            .await
            .expect("the held entry answers");

        // The entry leaves while its refresh is in flight, and nothing resolves after it.
        cache.entries.invalidate(&key()).await;
        gate.notify_one();

        let mut resolved = false;
        for _ in 0..64_u8 {
            tokio::task::yield_now().await;
            if calls.load(Ordering::Relaxed) == 2 {
                resolved = true;
            }
        }
        assert!(resolved, "the refresh resolved after the entry was removed");

        assert!(
            cache.get(&key()).await.is_none(),
            "the refresh published nothing into the empty slot"
        );
    }

    /// A failed resolution holds no entry.
    #[tokio::test]
    async fn failed_resolution_holds_no_entry() {
        let cache = VisibilityCache::new(LIMITS);
        let now = Instant::now();

        let failed = cache
            .resolve(key(), now, async || {
                Err::<PendingCacheEntry, &'static str>("the store refused")
            })
            .await;

        let _refusal = failed.expect_err("a failed resolution answers its error");
        assert!(
            cache.get(&key()).await.is_none(),
            "a failed resolution leaves no entry"
        );
    }
}

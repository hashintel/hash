//! Resolved visibility, held per scope for a bounded window.
//!
//! Resolving one actor's visible rows costs a store round trip, and a single map view issues one
//! request per tile. [`VisibilityCache`] holds each resolution so those requests share it, and
//! collapses a burst: while one resolution is in flight, every request for the same scope waits on
//! it and receives its result, so N concurrent tile requests cost one store query.
//!
//! A scope is a [`VisibilityKey`] - a generation, an authenticated actor, and the digest of the
//! request filter when there is one. Two callers presenting the same filter for the same actor and
//! generation share one entry; a filtered request and an unfiltered one are different scopes.
//!
//! Each entry carries a [`ProofDigest`] alongside its proof: the digest of what that proof admits.
//! Re-resolving an unchanged permission set reproduces it, and any change to what the actor may see
//! produces a different one, because it reads the admitted rows and nothing else. It is internal
//! instrumentation and never leaves the server - see its own documentation for why it is not a
//! permission epoch and why no caller pins state to it.
//!
//! [`VisibilityLimits`] bounds reuse: past the soft window an entry keeps answering while a refresh
//! runs behind it, and at the hard window it stops answering. A sealed token presented by a caller
//! carries its own authenticated issue time, and [`seal::open`](super::seal::open) bounds that age
//! against the token's own evidence.
//!
//! # Examples
//!
//! Nothing in this module is public, so the sketch below stands in for a compiled example.
//!
//! ```ignore
//! let cache = VisibilityCache::new(VisibilityLimits::default());
//! let scope = VisibilityKey { generation, actor, filter: None };
//!
//! // The first request resolves; a second inside the window reads the held entry.
//! let entry = cache.resolve(scope, Instant::now(), || resolve_from_store(actor)).await?;
//! let again = cache.resolve(scope, Instant::now(), || resolve_from_store(actor)).await?;
//! assert_eq!(entry.digest, again.digest);
//! // The digest is the cache's own; nothing outside this module reads it.
//! ```

use alloc::sync::Arc;
use core::{
    future::Future,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use std::time::Instant;

use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use moka::ops::compute::Op;

use super::{Atlas, ViewCensus, VisibilityProof};
use crate::{
    file::generation::GenerationId,
    integrity::{Sha256, Sha256Digest, Update as _},
};

/// The digest of a request filter.
///
/// Filters selecting the same view share a digest, so one held entry answers both. The digest is
/// fixed-width and content-derived: equal filter bytes always produce equal digests, on any host
/// and in any process, which is what lets it bind a scope inside a sealed token as well as name one
/// in a key.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct FilterDigest(Sha256Digest);

impl FilterDigest {
    /// Digests one filter's canonical bytes.
    ///
    /// `canonical` is the filter exactly as the request presented it. Two requests carrying
    /// byte-equal filters share a scope; a request whose filter differs by so much as a space
    /// describes a different scope and resolves on its own.
    pub(crate) fn of(canonical: &[u8]) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(b"filter");
        hasher.update(canonical);

        Self(hasher.finalize())
    }

    /// Returns the digest's bytes.
    pub(crate) const fn digest(self) -> Sha256Digest {
        self.0
    }

    /// Restores a digest that travelled, as an authority token's does.
    ///
    /// The bytes are a digest this process or another already computed over a filter's canonical
    /// form; nothing here recomputes it. A wrong value names a scope no filter produces, which the
    /// filter store then fails to resolve.
    pub(crate) const fn from_digest(digest: Sha256Digest) -> Self {
        Self(digest)
    }
}

/// The identity of a resolved permission set.
///
/// Equal digests mean equal visible row sets: the value is a function of the admitted rows, so it
/// survives re-resolution and refreshes and differs whenever what the actor may see differs. The
/// full-visibility proof and a mask admitting every row carry different digests, matching the
/// proofs themselves - one is authority over the corpus, the other a scope that happens to cover
/// it.
///
/// **This is not a permission epoch, and it names no product concept.** It digests the *content of
/// one resolved proof*, which is a weaker thing than an identity for the permission state that
/// produced it: permission epochs do not exist in the graph yet, so nothing here can observe that a
/// permission set changed except by resolving it and comparing what came back. When they do exist,
/// invalidation on an epoch change is a separate mechanism rather than this value grown up.
///
/// **Nothing outside this module reads it, and it does not travel.** A soft refresh may replace the
/// proof under an unchanged cache key, and that mid-run change of the visible set is accepted for
/// now by owner ruling - so no caller pins progressive state to this value, because no such
/// consumer is selected. It is the cache's own instrumentation: the refresh tests assert through it
/// that a resolution admitting the same rows reproduces the same value.
///
/// Caller requirement: do not publish it. It is a digest over the admitted row identities, so two
/// scopes admitting byte-identical sets share one - an equality oracle across actors, if it were
/// ever to leave the server.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ProofDigest(Sha256Digest);

impl ProofDigest {
    /// Digests the rows `proof` admits.
    ///
    /// Absorbs every admitted row identity, so the cost is linear in the visible set - paid once
    /// per resolution, never per request.
    pub(crate) fn of(proof: &VisibilityProof) -> Self {
        Self(proof.digest())
    }
}

/// One scope: whose view of which generation, under which filter.
///
/// Equal keys name the same view, so they share one held entry.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct VisibilityKey {
    /// The generation whose row ids the proof indexes.
    pub generation: GenerationId,
    /// The actor whose policies the proof resolves.
    pub actor: AuthenticatedActor,
    /// The request filter's identity, when the request carries one.
    pub filter: Option<FilterDigest>,
}

/// One resolution's product: a proof, and the census of the view it admits.
///
/// The pair exists because both are resolved per scope and neither is a function of a request. Its
/// only constructor censuses the very proof it stores, so a census paired with a foreign proof is
/// unconstructible rather than forbidden.
#[derive(Debug)]
pub(crate) struct Resolution {
    /// The rows the actor may see.
    proof: VisibilityProof,
    /// The corpus-wide census of what [`Self::proof`] admits.
    census: ViewCensus,
}

impl Resolution {
    /// Censuses `proof` over `atlas` and pairs them.
    ///
    /// The census walks the base column once for a masked proof and reads the artifacts for an
    /// unmasked one, so the cost lands on the resolution rather than on the requests that share it.
    pub(crate) fn of(atlas: &Atlas, proof: VisibilityProof) -> Self {
        Self {
            census: atlas.census(&proof),
            proof,
        }
    }

    /// Pairs `proof` with the empty view's census.
    ///
    /// The cache neither reads a census nor derives one, so its own tests - over holding,
    /// refreshing and expiring entries - need no walked one. Production keeps exactly one
    /// constructor, [`Self::of`], which censuses the very proof it stores.
    #[cfg(test)]
    pub(crate) const fn with_empty_census(proof: VisibilityProof) -> Self {
        Self {
            proof,
            census: ViewCensus::EMPTY,
        }
    }
}

/// One resolved scope.
///
/// The rows the scope may see, the census of them, and the identity of that permission set.
#[derive(Debug, Clone)]
pub(crate) struct ResolvedVisibility {
    /// The rows the actor may see.
    pub proof: Arc<VisibilityProof>,
    /// The corpus-wide census of what [`Self::proof`] admits, resolved with it.
    pub census: ViewCensus,
    /// The identity of what [`Self::proof`] admits.
    pub digest: ProofDigest,
    /// When the resolution behind [`Self::proof`] ran.
    resolved_at: Instant,
    /// Held while a refresh of this entry is in flight, so one refresh runs per entry.
    refreshing: Arc<AtomicBool>,
}

impl ResolvedVisibility {
    /// Builds an entry around a freshly resolved scope.
    fn new(Resolution { proof, census }: Resolution, resolved_at: Instant) -> Self {
        Self {
            digest: ProofDigest::of(&proof),
            proof: Arc::new(proof),
            census,
            resolved_at,
            refreshing: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Returns whether this entry has reached its refresh horizon by `now`.
    fn is_stale(&self, now: Instant, soft: Duration) -> bool {
        now.saturating_duration_since(self.resolved_at) >= soft
    }

    /// Returns whether this entry has outlived its reuse window by `now`.
    ///
    /// The age is measured from the resolution, so the window bounds how long permissions may lag
    /// however long the resolution itself took.
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

/// How long a resolved scope is reused, and how many scopes are held at once.
///
/// [`Self::hard`] is the setting to choose first: it is the ceiling on how long a request may still
/// be answered under permissions that have since changed, which makes it the deployment's tolerated
/// revocation lag. A ten-minute hard window means a revoked permission takes effect within ten
/// minutes for a scope in continuous use, and on the next request for one that was idle.
///
/// [`Self::soft`] is where an entry begins refreshing behind the answer it still serves. The gap
/// between the two windows is what the refresh runs in, so store latency lands on no request while
/// a scope stays in use.
///
/// [`Self::entries`] bounds how many scopes are held. A deployment with more concurrently active
/// actors than entries still answers every request; the scopes that fall out resolve again, one
/// store round trip each.
///
/// A sealed token's own age is judged by [`SealLimits`](super::SealLimits) against the issue time
/// it carries, so these windows govern reuse only.
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
/// assert_eq!(limits.entries, VisibilityLimits::default().entries);
/// ```
///
/// The cost of a short window is store traffic: each active scope re-resolves once per window, so
/// halving it doubles the resolutions a steady population of actors produces.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct VisibilityLimits {
    /// How many scopes are held before the least valuable is dropped.
    pub entries: u64,
    /// When a held entry starts refreshing behind the answer it serves.
    pub soft: Duration,
    /// When a held entry stops being served.
    pub hard: Duration,
}

impl Default for VisibilityLimits {
    /// A ten-minute revocation lag, refreshing at eight, holding 4096 scopes.
    ///
    /// The two-minute gap between the windows is the refresh's room: a scope in continuous use is
    /// re-resolved at eight minutes and keeps answering from the held proof while that runs, so the
    /// hard window is reached only by a scope whose refresh failed or that stopped being asked for.
    /// The entry count is an unvalidated starting point - it bounds concurrent hot scopes, and the
    /// measurement that revises it is the cache's own hit rate against the deployment's
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
/// rows or bytes. A scope whose entry is gone resolves again on its next request and reproduces its
/// digest when its permissions have not moved, so eviction costs one store round trip and nothing
/// else.
///
/// Admission favours the scopes that come back. A filter belongs to a scope's key, so a client
/// exploring filters produces a stream of scopes asked for once each; those cost one resolution
/// apiece and leave returning callers' entries in place. A newly active scope pays an extra
/// resolution or two before it is admitted while the cache is full.
#[derive(Debug)]
pub(crate) struct VisibilityCache {
    entries: moka::future::Cache<VisibilityKey, ResolvedVisibility>,
    soft: Duration,
    hard: Duration,
}

impl VisibilityCache {
    /// Builds a cache holding scopes under `limits`.
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
            soft,
            hard,
        }
    }

    /// Returns the entry held for `key`.
    pub(crate) async fn get(&self, key: &VisibilityKey) -> Option<ResolvedVisibility> {
        self.entries.get(key).await
    }

    /// Returns the scope `key` names at `now`, resolving it through `resolve` when needed.
    ///
    /// A held entry inside the soft window answers immediately, and `resolve` goes uncalled: it is
    /// handed over as the initializer of the miss path, which an entry that answers never reaches.
    ///
    /// An entry past the soft window answers too, and one caller takes the refresh: the resolution
    /// runs behind the answer that was already returned and replaces the entry when it lands. So a
    /// request that crosses the horizon costs what a hit costs, and the proof it receives is the
    /// one it already had.
    ///
    /// An entry past the hard window answers nothing: it is dropped and resolved again, so the
    /// answer is a resolution no older than `now`. The window is judged on the caller's `now` - the
    /// clock `resolved_at` came from - and measured from the resolution the entry carries, so a
    /// slow resolution shortens the entry's reuse rather than extending its window.
    ///
    /// A refresh publishes only over the entry it refreshed, and only while that entry is the
    /// newest held: a refresh that lands after a newer resolution, or after the entry it refreshed
    /// is gone, publishes nothing. So the newest resolution of a scope is the one that answers, and
    /// no proof re-enters the cache with a window it did not earn.
    ///
    /// With nothing held, the resolution runs inline and every request arriving during it receives
    /// its result: a burst of tile requests for one scope costs one store round trip.
    ///
    /// An unchanged permission set reproduces the digest it had. A refresh that lands a *narrower*
    /// proof replaces the entry silently and the requests after it answer from the narrower view:
    /// that mid-run change is accepted while the graph has no permission epochs to invalidate on,
    /// and it is why nothing here announces a refresh to a caller.
    ///
    /// # Errors
    ///
    /// Returns `resolve`'s error when an inline resolution fails, holding no entry: a failed
    /// resolution publishes nothing, and the requests that shared it share its error. A failed
    /// refresh leaves the held entry serving and releases the refresh, so the next request past the
    /// soft window tries again.
    pub(crate) async fn resolve<R, F, E>(
        &self,
        key: VisibilityKey,
        now: Instant,
        resolve: R,
    ) -> Result<ResolvedVisibility, Arc<E>>
    where
        R: FnOnce() -> F + Clone + Send + 'static,
        F: Future<Output = Result<Resolution, E>> + Send + 'static,
        E: Send + Sync + 'static,
    {
        let refresh = resolve.clone();
        let mut entry = self.held_or_resolved(key, now, resolve.clone()).await?;

        // The window is judged on the caller's clock - the one `resolved_at` came from - and not on
        // moka's, whose expiry would start when the resolution finished. Judging it after the read
        // rather than before costs the answering path one lookup instead of two, and the retry
        // cannot loop: what it inserts is dated `now`.
        if entry.is_expired(now, self.hard) {
            self.entries.invalidate(&key).await;
            entry = self.held_or_resolved(key, now, resolve).await?;
        }

        // A resolution that just ran is not stale, so this is the held-entry path alone.
        if entry.is_stale(now, self.soft) && entry.claim_refresh() {
            let entries = self.entries.clone();
            let refreshing = Arc::clone(&entry.refreshing);

            drop(tokio::spawn(async move {
                match refresh().await {
                    Ok(resolution) => {
                        // The resolution is dated `now`, the request that triggered it: an entry is
                        // never dated later than the permissions it reflects.
                        let refreshed = ResolvedVisibility::new(resolution, now);

                        // Published under moka's key lock, so the comparison and the write cannot
                        // straddle another writer. A refresh replaces the entry it refreshed and
                        // creates none: an absent entry keeps an older proof from re-entering a
                        // slot that the hard window or eviction emptied.
                        drop(
                            entries
                                .entry(key)
                                .and_compute_with(async |held| {
                                    let replaces = held.is_some_and(|held| {
                                        held.value().resolved_at <= refreshed.resolved_at
                                    });

                                    if replaces {
                                        Op::Put(refreshed)
                                    } else {
                                        Op::Nop
                                    }
                                })
                                .await,
                        );
                    }
                    Err(_error) => refreshing.store(false, Ordering::Release),
                }
            }));
        }

        Ok(entry)
    }

    /// Answers from the entry held for `key`, resolving inline when none is held.
    ///
    /// Concurrent callers of one key share one inline resolution: the initializer runs once and
    /// every waiter receives its result, which is what keeps a burst of tile requests for one scope
    /// to a single store round trip.
    async fn held_or_resolved<R, F, E>(
        &self,
        key: VisibilityKey,
        now: Instant,
        resolve: R,
    ) -> Result<ResolvedVisibility, Arc<E>>
    where
        R: FnOnce() -> F + Send + 'static,
        F: Future<Output = Result<Resolution, E>> + Send + 'static,
        E: Send + Sync + 'static,
    {
        self.entries
            .try_get_with(key, async move {
                resolve()
                    .await
                    .map(|resolution| ResolvedVisibility::new(resolution, now))
            })
            .await
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::{
        future::{Ready, ready},
        sync::atomic::{AtomicUsize, Ordering},
        time::Duration,
    };
    use std::time::Instant;

    use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
    use hashql_core::id::Id as _;
    use type_system::principal::actor::ActorEntityUuid;
    use uuid::Uuid;

    use super::{
        FilterDigest, ProofDigest, Resolution, VisibilityCache, VisibilityKey, VisibilityLimits,
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
    fn key_of(actor: u128) -> VisibilityKey {
        VisibilityKey {
            generation: "07"
                .repeat(32)
                .parse()
                .expect("64 hexadecimal digits name a generation"),
            actor: AuthenticatedActor::Uuid(ActorEntityUuid::new(Uuid::from_u128(actor))),
            filter: None,
        }
    }

    fn key() -> VisibilityKey {
        key_of(11)
    }

    /// Builds a masked proof admitting `nodes` as node rows and no link rows.
    fn proof_of(nodes: &[u32]) -> VisibilityProof {
        VisibilityProof::from_masks(
            CompressedBitSet::from_rows(nodes.iter().copied().map(NodeRowId::from_u32)),
            CompressedBitSet::<EdgeRowId>::new(),
        )
    }

    /// A resolver answering `rows` and counting its calls.
    fn answering(
        rows: &'static [u32],
        calls: &Arc<AtomicUsize>,
    ) -> impl FnOnce() -> Ready<Result<Resolution, ()>> + Clone + Send + 'static {
        let calls = Arc::clone(calls);

        move || {
            calls.fetch_add(1, Ordering::Relaxed);
            ready(Ok(Resolution::with_empty_census(proof_of(rows))))
        }
    }

    /// An entry inside the soft window answers without resolving again.
    #[tokio::test]
    async fn a_held_entry_is_served_without_resolving() {
        let cache = VisibilityCache::new(LIMITS);
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        for elapsed in [Duration::ZERO, SOFT / 2] {
            cache
                .resolve(key(), now + elapsed, answering(&[1, 2, 3], &calls))
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
            cache.resolve(key(), now, answering(&[1, 2, 3], &calls)),
            cache.resolve(key(), now, answering(&[1, 2, 3], &calls)),
        );

        let first = first.expect("the resolution answers");
        let second = second.expect("the resolution answers");

        assert_eq!(calls.load(Ordering::Relaxed), 1, "one resolution ran");
        assert_eq!(first.digest, second.digest);
    }

    /// An entry past the soft window answers from the held proof while a refresh replaces it.
    ///
    /// The request crossing the horizon pays nothing: it receives the proof it already had. The
    /// refresh runs as a task, so the loop below drives the runtime until it lands rather than
    /// waiting on a clock.
    #[tokio::test]
    async fn a_stale_entry_answers_while_it_refreshes() {
        let cache = VisibilityCache::new(LIMITS);
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        let held = cache
            .resolve(key(), now, answering(&[1, 2, 3], &calls))
            .await
            .expect("the resolution answers");

        let stale = cache
            .resolve(key(), now + SOFT, answering(&[9], &calls))
            .await
            .expect("the held entry answers");
        assert_eq!(
            stale.digest, held.digest,
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
            if entry.digest != held.digest {
                refreshed = Some(entry);
                break;
            }
        }

        let refreshed = refreshed.expect("the refresh replaced the held entry");
        assert_eq!(refreshed.digest, ProofDigest::of(&proof_of(&[9])));
        assert_eq!(
            calls.load(Ordering::Relaxed),
            2,
            "the refresh resolved behind the answer"
        );
    }

    /// A filter's identity separates entries for one actor.
    #[tokio::test]
    async fn a_filtered_request_holds_its_own_entry() {
        let cache = VisibilityCache::new(LIMITS);
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        let mut filtered = key();
        filtered.filter = Some(FilterDigest::of(b"web = 7"));

        for scope in [key(), filtered] {
            cache
                .resolve(scope, now, answering(&[1], &calls))
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
    /// Two scopes hold six rows between them under a two-entry budget: a budget priced in rows
    /// would admit each entry and evict it again, a budget priced in entries holds both. A third
    /// scope is what the budget bites on - by eviction or by refused admission, since the count is
    /// what this fixture pins.
    #[tokio::test]
    async fn the_capacity_bound_counts_entries() {
        let cache = VisibilityCache::new(VisibilityLimits {
            entries: 2,
            ..LIMITS
        });
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        for actor in [1_u128, 2] {
            cache
                .resolve(key_of(actor), now, answering(&[1, 2, 3], &calls))
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
            .resolve(key_of(3), now, answering(&[1, 2, 3], &calls))
            .await
            .expect("the resolution answers");
        cache.entries.run_pending_tasks().await;

        assert_eq!(
            cache.entries.entry_count(),
            2,
            "the third scope did not raise the held count"
        );
    }

    /// An entry past the hard window is not answered from.
    ///
    /// The window is measured from the resolution, so the clock this advances is the injected `now`
    /// and not the cache's own: an entry whose age reaches `hard` resolves again inline, and the
    /// answer carries the new proof rather than the held one.
    #[tokio::test]
    async fn an_expired_entry_resolves_again() {
        let cache = VisibilityCache::new(LIMITS);
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        let held = cache
            .resolve(key(), now, answering(&[1, 2, 3], &calls))
            .await
            .expect("the resolution answers");

        let answered = cache
            .resolve(key(), now + HARD, answering(&[9], &calls))
            .await
            .expect("the expired entry resolves again");

        assert_eq!(
            calls.load(Ordering::Relaxed),
            2,
            "the expired read resolved rather than answering from the held proof"
        );
        assert_ne!(
            answered.digest, held.digest,
            "the answer carries the new resolution"
        );
        assert_eq!(answered.digest, ProofDigest::of(&proof_of(&[9])));
    }

    /// A refresh landing after a newer resolution publishes nothing.
    ///
    /// The refresh task holds the proof it resolved; if it could `insert` unconditionally, an older
    /// proof would replace a newer one *and* restart the window it lives in - a permission revoked
    /// between would be served again for a fresh window. The fixture drives that order
    /// deliberately: the refresh is claimed under a paused resolver, a newer inline resolution
    /// publishes while it is in flight, and only then does the refresh complete.
    #[tokio::test]
    async fn a_refresh_does_not_overwrite_a_newer_entry() {
        let cache = VisibilityCache::new(LIMITS);
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        let held = cache
            .resolve(key(), now, answering(&[1, 2, 3], &calls))
            .await
            .expect("the resolution answers");

        // The refresh resolver blocks on a permit that is buffered rather than signalled, so the
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
                    Ok::<_, ()>(Resolution::with_empty_census(proof_of(&[1, 2, 3])))
                }
            })
            .await
            .expect("the held entry answers");
        assert_eq!(stale.digest, held.digest, "the stale read answered as held");

        // A newer resolution replaces the entry while the refresh is still in flight.
        cache.entries.invalidate(&key()).await;
        let newer = cache
            .resolve(key(), now + SOFT + SOFT, answering(&[7], &calls))
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
        assert_eq!(
            after.digest, newer.digest,
            "the newer resolution still answers: the refresh published nothing over it"
        );
    }

    /// A refresh whose entry is gone publishes nothing.
    ///
    /// The slot empties for exactly the reasons the windows exist - the hard window dropped it, or
    /// capacity evicted it - so a refresh that filled the slot again would give a proof resolved
    /// before that removal a fresh window to live in, with no request having asked for it. A
    /// refresh replaces the entry it refreshed; it creates none.
    #[tokio::test]
    async fn a_refresh_does_not_resurrect_a_removed_entry() {
        let cache = VisibilityCache::new(LIMITS);
        let calls = Arc::new(AtomicUsize::new(0));
        let now = Instant::now();

        cache
            .resolve(key(), now, answering(&[1, 2, 3], &calls))
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
                    Ok::<_, ()>(Resolution::with_empty_census(proof_of(&[1, 2, 3])))
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
    async fn a_failed_resolution_publishes_no_entry() {
        let cache = VisibilityCache::new(LIMITS);
        let now = Instant::now();

        let failed = cache
            .resolve(key(), now, || {
                ready(Err::<Resolution, &'static str>("the store refused"))
            })
            .await;

        let _refusal = failed.expect_err("a failed resolution answers its error");
        assert!(
            cache.get(&key()).await.is_none(),
            "a failed resolution leaves no entry"
        );
    }

    /// An unchanged permission set reproduces its digest.
    ///
    /// The property holds of the digest itself rather than of any cache timing: two resolutions
    /// admitting the same rows carry one digest. Nothing outside this module consumes that today -
    /// it is what would let a refresh be recognized as a no-op if a consumer were ever selected.
    #[test]
    fn an_unchanged_permission_set_reproduces_its_digest() {
        assert_eq!(
            ProofDigest::of(&proof_of(&[4, 5, 6])),
            ProofDigest::of(&proof_of(&[4, 5, 6])),
        );
    }

    /// Losing a row replaces the digest.
    #[test]
    fn a_changed_permission_set_moves_the_digest() {
        assert_ne!(
            ProofDigest::of(&proof_of(&[4, 5, 6])),
            ProofDigest::of(&proof_of(&[4, 5])),
        );
    }

    /// The full-visibility proof and a mask carry different digests.
    ///
    /// The digest reads the constructor as well as the rows, so a saturated mask cannot present the
    /// operator identity.
    #[test]
    fn a_saturated_mask_and_the_full_proof_differ() {
        assert_ne!(
            ProofDigest::of(&proof_of(&[0, 1, 2])),
            ProofDigest::of(&VisibilityProof::full_visibility()),
        );
    }
}

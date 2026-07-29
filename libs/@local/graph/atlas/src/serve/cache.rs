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
//! Each entry carries a [`PermissionEpoch`] alongside its proof: the digest of what that proof
//! admits. Re-resolving an unchanged permission set reproduces the epoch, and any change to what
//! the actor may see produces a different one, so an epoch is the identity a caller pins
//! progressive state to across refetches. Two entries resolved minutes apart from the same
//! permissions carry one epoch, because the epoch reads the admitted rows and nothing else.
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
//! assert_eq!(entry.epoch, again.epoch);
//! ```

use alloc::sync::Arc;
use core::{
    future::Future,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};
use std::time::Instant;

use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;

use super::VisibilityProof;
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
}

/// The identity of a resolved permission set.
///
/// Equal epochs mean equal visible row sets, so state a caller built under one epoch stays valid
/// for as long as that epoch answers. The epoch is a function of the admitted rows: it survives
/// re-resolution, generation-independent timing, and refreshes, and it changes when what the actor
/// may see changes.
///
/// The full-visibility proof and a mask admitting every row of a generation carry different epochs,
/// matching the proofs themselves - one is authority over the corpus, the other a scope that
/// happens to cover it.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct PermissionEpoch(Sha256Digest);

impl PermissionEpoch {
    /// Reads the epoch `proof` admits.
    pub(crate) fn of(proof: &VisibilityProof) -> Self {
        Self(proof.digest())
    }

    /// Returns the epoch's digest, the form a caller-visible identity carries.
    pub(crate) const fn digest(self) -> Sha256Digest {
        self.0
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

/// One resolved scope: the rows it may see, and the identity of that permission set.
#[derive(Debug, Clone)]
pub(crate) struct ResolvedVisibility {
    /// The rows the actor may see.
    pub proof: Arc<VisibilityProof>,
    /// The identity of what [`Self::proof`] admits.
    pub epoch: PermissionEpoch,
    /// When the resolution behind [`Self::proof`] ran.
    resolved_at: Instant,
    /// Held while a refresh of this entry is in flight, so one refresh runs per entry.
    refreshing: Arc<AtomicBool>,
}

impl ResolvedVisibility {
    /// Builds an entry around a freshly resolved proof.
    fn new(proof: VisibilityProof, resolved_at: Instant) -> Self {
        Self {
            epoch: PermissionEpoch::of(&proof),
            proof: Arc::new(proof),
            resolved_at,
            refreshing: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Returns whether this entry has reached its refresh horizon by `now`.
    fn is_stale(&self, now: Instant, soft: Duration) -> bool {
        now.saturating_duration_since(self.resolved_at) >= soft
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
/// epoch when its permissions have not moved, so eviction costs one store round trip and nothing
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
            // cannot swap it.
            entries: moka::future::Cache::builder()
                .max_capacity(entries)
                .eviction_policy(moka::policy::EvictionPolicy::tiny_lfu())
                .time_to_live(hard)
                .build(),
            soft,
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
    /// request that crosses the horizon costs what a hit costs, and the epoch it receives is the
    /// one it already had.
    ///
    /// With nothing held, the resolution runs inline and every request arriving during it receives
    /// its result: a burst of tile requests for one scope costs one store round trip.
    ///
    /// An unchanged permission set reproduces the epoch it had, so a caller pinned to that epoch
    /// keeps its state across a refresh.
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
        F: Future<Output = Result<VisibilityProof, E>> + Send + 'static,
        E: Send + Sync + 'static,
    {
        let refresh = resolve.clone();
        let entry = self
            .entries
            .try_get_with(key, async move {
                resolve()
                    .await
                    .map(|proof| ResolvedVisibility::new(proof, now))
            })
            .await?;

        // A resolution that just ran is not stale, so this is the held-entry path alone.
        if entry.is_stale(now, self.soft) && entry.claim_refresh() {
            let entries = self.entries.clone();
            let refreshing = Arc::clone(&entry.refreshing);

            drop(tokio::spawn(async move {
                match refresh().await {
                    Ok(proof) => {
                        entries
                            .insert(key, ResolvedVisibility::new(proof, now))
                            .await;
                    }
                    Err(_error) => refreshing.store(false, Ordering::Release),
                }
            }));
        }

        Ok(entry)
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

    use super::{FilterDigest, PermissionEpoch, VisibilityCache, VisibilityKey, VisibilityLimits};
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
    ) -> impl FnOnce() -> Ready<Result<VisibilityProof, ()>> + Clone + Send + 'static {
        let calls = Arc::clone(calls);

        move || {
            calls.fetch_add(1, Ordering::Relaxed);
            ready(Ok(proof_of(rows)))
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
        assert_eq!(first.epoch, second.epoch);
    }

    /// An entry past the soft window answers from the held proof while a refresh replaces it.
    ///
    /// The request crossing the horizon pays nothing: it receives the epoch it already had. The
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
            stale.epoch, held.epoch,
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
            if entry.epoch != held.epoch {
                refreshed = Some(entry);
                break;
            }
        }

        let refreshed = refreshed.expect("the refresh replaced the held entry");
        assert_eq!(refreshed.epoch, PermissionEpoch::of(&proof_of(&[9])));
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

    /// A failed resolution holds no entry.
    #[tokio::test]
    async fn a_failed_resolution_publishes_no_entry() {
        let cache = VisibilityCache::new(LIMITS);
        let now = Instant::now();

        let failed = cache
            .resolve(key(), now, || {
                ready(Err::<VisibilityProof, &'static str>("the store refused"))
            })
            .await;

        let _refusal = failed.expect_err("a failed resolution answers its error");
        assert!(
            cache.get(&key()).await.is_none(),
            "a failed resolution leaves no entry"
        );
    }

    /// An unchanged permission set reproduces its epoch.
    ///
    /// This is the property a caller's progressive state rests on, and it holds of the epoch itself
    /// rather than of any cache timing: two resolutions admitting the same rows are one epoch.
    #[test]
    fn an_unchanged_permission_set_reproduces_its_epoch() {
        assert_eq!(
            PermissionEpoch::of(&proof_of(&[4, 5, 6])),
            PermissionEpoch::of(&proof_of(&[4, 5, 6])),
        );
    }

    /// Losing a row replaces the epoch.
    #[test]
    fn a_changed_permission_set_moves_the_epoch() {
        assert_ne!(
            PermissionEpoch::of(&proof_of(&[4, 5, 6])),
            PermissionEpoch::of(&proof_of(&[4, 5])),
        );
    }

    /// The full-visibility proof and a mask carry different epochs.
    ///
    /// The epoch reads the constructor as well as the rows, so a saturated mask cannot present the
    /// operator epoch.
    #[test]
    fn a_saturated_mask_and_the_full_proof_differ() {
        assert_ne!(
            PermissionEpoch::of(&proof_of(&[0, 1, 2])),
            PermissionEpoch::of(&VisibilityProof::full_visibility()),
        );
    }
}

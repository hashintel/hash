//! Visibility caching: one resolved proof per generation, actor, and request filter.
//!
//! Resolving an actor's visible rows costs a store round trip, so the result is held for a bounded
//! window instead of resolved per tile. Concurrent requests for one scope resolve once: the first
//! miss runs the resolution and every request arriving during it receives that same result, so a
//! burst of tile requests cannot multiply into a burst of store queries.
//!
//! Entries key on the generation, the authenticated actor, and the request filter's digest. The
//! filter belongs in the key because a filtered request and an unfiltered one describe different
//! views for the same actor, and two callers presenting the same filter describe the same view -
//! keying on the filter's content lets them share one entry.
//!
//! Each entry carries a [`PermissionEpoch`], the digest of what the proof admits. The epoch is the
//! identity a caller pins progressive state to: re-resolving an unchanged permission set yields an
//! equal epoch, so a caller keeps its state across refetches and moves only when what it may see
//! moves. Time bounds how long an entry is reused; it does not enter the epoch.
//!
//! The window here is the reuse window alone. A held entry serves requests until it elapses, and a
//! caller-presented token carries its own authenticated issue time whose bound
//! [`seal::open`](super::seal::open) enforces, so the two ages are judged where each one's evidence
//! lives.

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
/// Two filters share a digest when they select the same view, so one entry serves both. The digest
/// is the filter's identity in a cache key and carries no filter content.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct FilterDigest(Sha256Digest);

impl FilterDigest {
    /// Digests a filter's canonical bytes.
    pub(crate) fn of(canonical: &[u8]) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(b"filter");
        hasher.update(canonical);

        Self(hasher.finalize())
    }

    /// Returns the digest's bytes, the form a binding or a key carries.
    pub(crate) const fn digest(self) -> Sha256Digest {
        self.0
    }
}

/// The identity of a resolved permission set.
///
/// Equal epochs mean equal visible row sets, so a caller may hold state pinned to one epoch for as
/// long as the epoch holds. The epoch is a function of the admitted rows alone: re-resolving the
/// same permissions reproduces it, and a change to what an actor may see replaces it.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct PermissionEpoch(Sha256Digest);

impl PermissionEpoch {
    /// Reads the epoch of `proof`.
    pub(crate) fn of(proof: &VisibilityProof) -> Self {
        Self(proof.digest())
    }

    /// Returns the epoch's digest, the form a binding or a caller-visible identity carries.
    pub(crate) const fn digest(self) -> Sha256Digest {
        self.0
    }
}

/// The scope an entry answers for.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct VisibilityKey {
    /// The generation whose row ids the proof indexes.
    pub generation: GenerationId,
    /// The actor whose policies the proof resolves.
    pub actor: AuthenticatedActor,
    /// The request filter's identity, when the request carries one.
    pub filter: Option<FilterDigest>,
}

/// One actor's resolved visibility with the identity a caller pins state to.
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

/// How long resolved visibility is reused, and how many scopes are held.
///
/// The windows bound reuse alone: `soft` is where a held entry starts refreshing behind the answer
/// it still serves, `hard` is where it stops being served at all. A sealed token's own age is
/// judged by [`SealLimits`](super::SealLimits) against the issue time it carries, so the two ages
/// never share a knob.
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
    fn default() -> Self {
        Self {
            entries: 4096,
            soft: Duration::from_mins(5),
            hard: Duration::from_mins(10),
        }
    }
}

/// Resolved visibility held for a bounded window, keyed by scope.
///
/// Capacity counts entries: one entry per scope, however many rows its proof admits.
///
/// Eviction admits by estimated frequency, which suits the key's unbounded cardinality: the filter
/// belongs to the key, so a client exploring filters emits a stream of scopes it asks for once, and
/// the budget stays with the scopes that come back. A newly active scope pays an extra resolution
/// or two while the cache is full, since admission wants a frequency above the coldest resident's
/// and each miss raises it.
///
/// A scope whose entry is gone resolves again on its next request, and reproduces its epoch when
/// its permissions have not moved.
#[derive(Debug)]
pub(crate) struct VisibilityCache {
    entries: moka::future::Cache<VisibilityKey, ResolvedVisibility>,
    soft: Duration,
}

impl VisibilityCache {
    /// Builds a cache under `limits`.
    ///
    /// An entry serves requests for the whole of [`VisibilityLimits::hard`]. Past
    /// [`VisibilityLimits::soft`] it also carries a refresh: the request that finds it stale is
    /// answered from the held proof and a resolution runs behind it, so store latency lands on no
    /// request until the hard window removes the entry outright.
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

    /// Returns the entry for `key` at `now`, running `resolve` when no held entry answers.
    ///
    /// With no entry held the resolution runs inline, and one resolution serves however many
    /// requests arrive during it. A held entry answers without resolving: `resolve` is handed over
    /// as the miss path's initializer and an initializer that is never polled never calls it.
    ///
    /// A held entry past the soft window answers as well, and one caller takes the refresh: the
    /// resolution runs behind the answer and replaces the entry when it lands, so a stale entry
    /// costs the request nothing.
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

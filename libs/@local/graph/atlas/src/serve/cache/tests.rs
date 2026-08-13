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
    CacheEntry, PendingCacheEntry, VisibilityCache,
    scope::{CacheKey, FilterDigest, VisibilityLimits},
    weight_of,
};
use crate::{
    bitset::CompressedBitSet,
    identity::{EdgeRowId, NodeRowId},
    serve::{
        VisibilityProof,
        hydrate::MaskingActor,
        tests::{mask_hiding, publish},
    },
};

const SOFT: Duration = Duration::from_mins(8);
const HARD: Duration = Duration::from_mins(10);

/// A budget no fixture here evicts under.
const LIMITS: VisibilityLimits = VisibilityLimits {
    bytes: 1 << 20,
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
            Ok::<_, ()>(PendingCacheEntry::with_empty_view(proof_of($rows)))
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

/// The capacity bound prices retained bytes, so the budget holds what actually fits.
///
/// The budget is exactly two fixture entries' weight, computed through the same fold the cache
/// weighs with. Both scopes fit it whole, and a third cannot raise the held bytes past the
/// budget: the bite lands by eviction or by refused admission, since the byte price is what
/// this fixture pins.
#[tokio::test]
async fn capacity_bound_prices_retained_bytes() {
    let each = weight_of(proof_of(&[1, 2, 3]).heap_bytes(), None);
    let cache = VisibilityCache::new(VisibilityLimits {
        bytes: u64::from(each) * 2,
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
            "scope {actor} is held: two entries weigh exactly the byte budget"
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
        "the third scope did not raise the held bytes past the budget"
    );
}

/// Weighing a small scope never builds the saturated memo it is compared against.
///
/// The weigher recognizes a memo sharer by pointer identity, and a sharer took its `Arc` from
/// the memo itself, so an unbuilt memo already answers no. This pins the regression where the
/// weigher reached the memo through its building accessor and billed the first small scope's
/// resolution for the whole corpus's cascade construction.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn weighing_a_small_scope_leaves_the_memo_unbuilt() {
    let (_generation, atlas) = publish("cache-weigher-memo-unbuilt").await;
    let atlas = Arc::new(atlas);
    let proof = mask_hiding(&atlas, &[0]);

    let entry = PendingCacheEntry::of(
        Arc::clone(&atlas),
        proof,
        MaskingActor {
            id: None,
            instance_admin: false,
        },
        None,
    )
    .await
    .expect("a masked proof resolves");

    assert!(entry.weight > 0, "the scope weighed its own cascade");
    assert!(
        atlas.saturated_scope_schedule_if_built().is_none(),
        "recognition peeked: pricing a small scope must not construct the full-corpus memo",
    );
}

/// The weight fold saturates at the weight domain's top instead of failing or wrapping.
#[test]
fn weight_of_saturates_at_the_moka_domain() {
    assert_eq!(
        weight_of(u64::MAX, None),
        u32::MAX,
        "a retained figure past the domain weighs the domain's top",
    );
    assert_eq!(
        weight_of(u64::from(u32::MAX), Some(&[0_u8; 16])),
        u32::MAX,
        "the fold's own additions saturate with it",
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
                Ok::<_, ()>(PendingCacheEntry::with_empty_view(proof_of(&[1, 2, 3])))
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
                Ok::<_, ()>(PendingCacheEntry::with_empty_view(proof_of(&[1, 2, 3])))
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
                Ok::<_, ()>(PendingCacheEntry::with_empty_view(proof_of(&[1, 2, 3])))
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

use alloc::sync::Arc;
use core::{
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};
use std::time::Instant;

use hashql_core::{collections::fast_hash_set, id::Id as _};
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use super::{
    CacheEntry, PendingCacheEntry, VisibilityCache,
    scope::{CacheKey, FilterDigest, VisibilityLimits},
    weight_of,
};
use crate::{
    bitset::CompressedBitSet,
    identity::{BasePosition, EdgeRowId, NodeRowId},
    salt::wire::{Mode, tests::section},
    serve::{
        CutOffset, TileLimits, View, VisibilityProof,
        delta::PlacementCohort,
        hydrate::MaskingActor,
        tests::{ROW_IDS, mask_hiding, narrow_usize, publish, request, test_codec, withdrawing},
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
        fast_hash_set(),
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
async fn held_entry_hit() {
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
async fn stale_serves_while_refreshing() {
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
async fn filter_identity_separates_entries() {
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
async fn small_scope_memo_unbuilt() {
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

/// The entry censuses the folded view, and aggregates occupancy from the unfolded one.
///
/// [`PendingCacheEntry::of`] folds the cohort's withdrawals out of the proof before censusing,
/// so the aggregates the root publishes describe what the entry can actually serve. The
/// occupancy aggregate reads the proof before the fold, which keeps the cut offset a mint
/// resolves the store's answer alone. This pins the census/occupancy pair's ordering at the
/// constructor: nothing but statement order inside `of` holds it. Reordering the census
/// against the fold reddens exactly here, and reordering the occupancy reddens this witness
/// and the mint witness beside it. The schedule's place in that order has its own witness in
/// the delivery test below, which takes the entry to bytes.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn entry_census_folded_occupancy_unfolded() {
    let (_generation, atlas) = publish("cache-census-folded").await;
    let atlas = Arc::new(atlas);
    let proof = mask_hiding(&atlas, &[]);
    let masking = MaskingActor {
        id: None,
        instance_admin: false,
    };

    // Withdraw every fixture row but one, which moves any census the fold reaches: the folded
    // view holds one point where the resolution's holds the corpus.
    let survivor = 7_u8;
    let count = u8::try_from(atlas.row_ids().len()).expect("the fixture universe fits u8");
    let seeds: Vec<u8> = (0..count).filter(|&seed| seed != survivor).collect();
    let snapshot = Arc::new(withdrawing(&atlas, &seeds));

    let entry = PendingCacheEntry::of(
        Arc::clone(&atlas),
        proof.clone(),
        masking,
        None,
        Some(Arc::clone(&snapshot)),
    )
    .await
    .expect("the folded entry builds");

    let mut folded = proof.clone();
    folded.fold_withdrawn(&snapshot);
    assert_ne!(
        atlas.census(&folded),
        atlas.census(&proof),
        "the fold moves this view's census, so the equalities below have teeth"
    );

    assert_eq!(
        entry.census,
        atlas.census(&folded),
        "the entry's census is the folded view's own"
    );
    assert_eq!(
        entry.occupancy,
        Some(atlas.visible_occupancy(&proof)),
        "the entry's occupancy is the unfolded proof's own"
    );
}

/// The occupancy aggregate a mint reads ignores the entry's folded snapshot.
///
/// The entry aggregates occupancy from the store's answer before folding withdrawals, so the cut
/// offset a mint resolves is a function of the resolution alone and no snapshot moves it. The
/// witness withdraws every row of one occupied cell, because occupancy counts cells over the
/// fixture's co-located points and a lesser withdrawal cannot move it - which is exactly what
/// makes the equal aggregates a statement rather than a tautology, and the folded proof's own
/// occupancy pins that the harness holds the condition.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_mint_occupancy_ignores_the_folded_snapshot() {
    let (_generation, atlas) = publish("cache-mint-occupancy").await;
    let atlas = Arc::new(atlas);

    // Every row of the deepest grid's first occupied cell, by its position's Morton key. Fixture
    // node row `r` owns seed `r`, so the cell's rows withdraw as their own seeds.
    let row_ids = atlas.rows.view();
    let first_key = atlas.morton.code(BasePosition::MIN);
    let cell_seeds: Vec<u8> = (0..row_ids.len())
        .map(narrow_usize)
        .map(BasePosition::from_u32)
        .filter(|&position| atlas.morton.code(position) == first_key)
        .map(|position| u8::try_from(row_ids[position].as_u32()).expect("fixture rows fit u8"))
        .collect();

    let proof = mask_hiding(&atlas, &[]);
    let masking = MaskingActor {
        id: None,
        instance_admin: false,
    };
    let snapshot = Arc::new(withdrawing(&atlas, &cell_seeds));

    let folded = PendingCacheEntry::of(
        Arc::clone(&atlas),
        proof.clone(),
        masking,
        None,
        Some(Arc::clone(&snapshot)),
    )
    .await
    .expect("the folded entry builds");
    let bare = PendingCacheEntry::of(Arc::clone(&atlas), proof.clone(), masking, None, None)
        .await
        .expect("the bare entry builds");

    assert!(
        folded.occupancy.is_some(),
        "a scoped entry holds its aggregate",
    );
    assert_eq!(
        folded.occupancy, bare.occupancy,
        "no snapshot moves a mint's input",
    );
    assert_eq!(
        folded.occupancy,
        Some(atlas.visible_occupancy(&proof)),
        "the aggregate is the unfolded proof's own",
    );

    let mut hand_folded = proof.clone();
    hand_folded.fold_withdrawn(&snapshot);
    assert_ne!(
        atlas.visible_occupancy(&hand_folded),
        atlas.visible_occupancy(&proof),
        "the folded proof's occupancy differs, so the equalities above have teeth",
    );
}

/// The entry's own delivery hides the rows its cohort withdrew.
///
/// For a scoped view the cascade is the delivery authority: tile assembly reads the cut and
/// re-consults no mask per delivered row, so a schedule built before the fold keeps delivering
/// the withdrawn row while every aggregate-reading witness stays green. The witness therefore
/// takes the entry to bytes, bound exactly as a request whose ingress capture is the entry's
/// own publication binds it - with no capture left to subtract, so the entry's delivery is the
/// whole authority.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn entry_withholds_cohort_withdrawn() {
    let (_generation, atlas) = publish("cache-entry-delivery").await;
    let atlas = Arc::new(atlas);
    let proof = mask_hiding(&atlas, &[]);
    let masking = MaskingActor {
        id: None,
        instance_admin: false,
    };

    // A row the root delivers. Fixture node row `r` owns seed `r`.
    let row = atlas.row_ids()[BasePosition::from_u32(1)].as_u32();
    let seed = u8::try_from(row).expect("fixture rows fit u8");
    let snapshot = Arc::new(withdrawing(&atlas, &[seed]));

    let entry = PendingCacheEntry::of(
        Arc::clone(&atlas),
        proof,
        masking,
        None,
        Some(Arc::clone(&snapshot)),
    )
    .await
    .expect("the folded entry builds");

    // The nulled capture models the request whose ingress capture is this entry's own bound
    // publication: the extractor skips its admission walk, so the entry's own delivery is the
    // whole authority.
    let view = View::bind(
        atlas.grid,
        &entry.proof,
        entry.census,
        &entry.schedule,
        CutOffset::ZERO,
        PlacementCohort::of(entry.cohort.as_deref()),
        None,
    )
    .expect("the entry pairs its own proof and schedule");

    let bytes = atlas
        .tile(&request(0, 0, 0, Mode::Delta), TileLimits::default(), view)
        .expect("the fixture tile serves");
    let (chunks, remainder) = section(&bytes, ROW_IDS)
        .expect("ROW_IDS is present")
        .as_chunks::<4>();
    assert!(remainder.is_empty(), "row sections are whole u32 columns");

    let wire = test_codec(&atlas)
        .encode(NodeRowId::from_u32(row), atlas.node_universe())
        .get();
    assert!(
        !chunks
            .iter()
            .copied()
            .map(u32::from_le_bytes)
            .any(|delivered| delivered == wire),
        "the entry delivered a row its own cohort withdrew"
    );

    // Positive control: the same binding without a cohort delivers the row, so the absence
    // above is the fold's doing rather than the probe's. The count matches on both sides,
    // because the cascade substitutes the next survivor instead of shrinking the delivery.
    let unfolded = PendingCacheEntry::of(
        Arc::clone(&atlas),
        mask_hiding(&atlas, &[]),
        masking,
        None,
        None,
    )
    .await
    .expect("the unfolded entry builds");
    let control_view = View::bind(
        atlas.grid,
        &unfolded.proof,
        unfolded.census,
        &unfolded.schedule,
        CutOffset::ZERO,
        PlacementCohort::of(unfolded.cohort.as_deref()),
        None,
    )
    .expect("the entry pairs its own proof and schedule");
    let control = atlas
        .tile(
            &request(0, 0, 0, Mode::Delta),
            TileLimits::default(),
            control_view,
        )
        .expect("the fixture tile serves");
    let (control_chunks, control_remainder) = section(&control, ROW_IDS)
        .expect("ROW_IDS is present")
        .as_chunks::<4>();
    assert!(
        control_remainder.is_empty(),
        "row sections are whole u32 columns"
    );
    assert!(
        control_chunks
            .iter()
            .copied()
            .map(u32::from_le_bytes)
            .any(|delivered| delivered == wire),
        "the control must deliver the row the folded entry hides"
    );
    assert_eq!(
        control_chunks.len(),
        chunks.len(),
        "the fold substitutes the next survivor rather than shrinking the delivery"
    );
}

/// The weight fold saturates at the weight domain's top instead of failing or wrapping.
#[test]
fn weight_of_saturates() {
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
async fn stale_refresh_publishes_nothing() {
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
async fn refresh_scoped_to_own_entry() {
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
async fn removed_entry_refresh_noop() {
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

/// Identity tables of a generation that fitted nothing, so a snapshot resolves no rows.
struct Unfitted;

impl crate::serve::delta::IdentityTables for Unfitted {
    fn node_row_of(&self, _id: crate::postgres::id::ArchivedEntityId) -> Option<NodeRowId> {
        None
    }

    fn edge_row_of(&self, _id: crate::postgres::id::ArchivedEntityId) -> Option<EdgeRowId> {
        None
    }

    fn ontology_row_of(
        &self,
        _id: crate::postgres::id::ArchivedOntologyTypeUuid,
    ) -> Option<crate::identity::OntologyRowId> {
        None
    }
}

/// An entry hands requests the cohort its resolution bound.
///
/// The universe check reads the bound snapshot's own bound rather than the base the caller
/// offers, so the entry's arrival-sensitive reads follow the resolution's publication. An entry
/// resolved with no publication answers the base, which is the empty cohort's contract.
#[tokio::test]
async fn entry_exposes_bound_cohort() {
    use hash_graph_temporal_versioning::Timestamp;

    use crate::serve::{
        codec::Universe,
        delta::{DeltaRegister, DeltaRevision},
    };

    let register = DeltaRegister::new(
        Universe::new(NodeRowId::new(10)),
        Universe::new(crate::identity::EdgeRowId::new(6)),
        Universe::new(crate::identity::OntologyRowId::new(4)),
    );
    let snapshot = Arc::new(register.snapshot(
        &Unfitted,
        DeltaRevision::FIRST,
        Timestamp::from_unix_timestamp(1),
    ));

    let cache = VisibilityCache::new(LIMITS);
    let now = Instant::now();

    let bound = cache
        .resolve(key(), now, {
            let snapshot = Arc::clone(&snapshot);
            async move || {
                Ok::<_, ()>(
                    PendingCacheEntry::with_empty_view(proof_of(&[1])).with_cohort(snapshot),
                )
            }
        })
        .await
        .expect("the resolution answers");
    assert_eq!(
        bound.cohort().universe(Universe::new(NodeRowId::new(7))),
        Universe::new(NodeRowId::new(10)),
        "the bound snapshot's universe answers"
    );

    let unbound = cache
        .resolve(key_of(12), now, async || {
            Ok::<_, ()>(PendingCacheEntry::with_empty_view(proof_of(&[2])))
        })
        .await
        .expect("the resolution answers");
    assert_eq!(
        unbound.cohort().universe(Universe::new(NodeRowId::new(7))),
        Universe::new(NodeRowId::new(7)),
        "an empty cohort answers the base"
    );
}

/// An entry answers `folded` for exactly the publication its resolution bound.
///
/// Pointer identity is the release: an equal-content republication proves nothing about what
/// the masks folded and answers false, which costs the vacuous subtraction rather than a wrong
/// byte. A corpus entry declines the fold and never answers true, whatever snapshot it bound,
/// and an entry that bound none folded nothing.
#[tokio::test]
async fn folded_matches_bound_publication() {
    use hash_graph_temporal_versioning::Timestamp;

    use crate::serve::{
        codec::Universe,
        delta::{DeltaRegister, DeltaRevision},
    };

    let register = DeltaRegister::new(
        Universe::new(NodeRowId::new(10)),
        Universe::new(crate::identity::EdgeRowId::new(6)),
        Universe::new(crate::identity::OntologyRowId::new(4)),
    );
    let publish = || {
        Arc::new(register.snapshot(
            &Unfitted,
            DeltaRevision::FIRST,
            Timestamp::from_unix_timestamp(1),
        ))
    };
    let snapshot = publish();
    let republished = publish();
    assert_eq!(
        *snapshot, *republished,
        "the two publications carry one content"
    );

    let cache = VisibilityCache::new(LIMITS);
    let now = Instant::now();

    let scoped = cache
        .resolve(key(), now, {
            let snapshot = Arc::clone(&snapshot);
            async move || {
                Ok::<_, ()>(
                    PendingCacheEntry::with_empty_view(proof_of(&[1])).with_cohort(snapshot),
                )
            }
        })
        .await
        .expect("the resolution answers");
    assert!(scoped.folded(&snapshot), "the bound publication is folded");
    assert!(
        !scoped.folded(&republished),
        "an equal-content republication is not the bound one",
    );

    let corpus = cache
        .resolve(key_of(12), now, {
            let snapshot = Arc::clone(&snapshot);
            async move || {
                Ok::<_, ()>(
                    PendingCacheEntry::with_empty_view(VisibilityProof::full_visibility())
                        .with_cohort(snapshot),
                )
            }
        })
        .await
        .expect("the resolution answers");
    assert!(
        !corpus.folded(&snapshot),
        "a corpus proof declines the fold",
    );

    let unbound = cache
        .resolve(key_of(13), now, async || {
            Ok::<_, ()>(PendingCacheEntry::with_empty_view(proof_of(&[2])))
        })
        .await
        .expect("the resolution answers");
    assert!(
        !unbound.folded(&snapshot),
        "an entry that bound no publication folded nothing",
    );
}

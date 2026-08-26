//! Schedule-internal tests: the cascade law at its own vocabulary.
//!
//! These tests construct [`ScopeRow`]s and fixture schedules directly, so they live as the
//! schedule's own child. The route-level delivery battery, written against the documented
//! contract instead of these internals, stays in `serve::tests::schedule`.

#![expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]

use hashql_core::id::Id as _;

use super::{
    ArrivalIndex, ArrivalOverlay, ArrivalRow, ScopeRow, ScopeSchedule, ViewRow, ViewSchedule,
};
use crate::{
    allocator::MemoryUsageAllocator,
    identity::{BasePosition, ImportanceRank},
    morton::{Depth, MortonCell, MortonKey},
    postgres::id::ArchivedEntityId,
    serve::{
        VisibilityProof,
        delta::PlacementCohort,
        density::CutOffset,
        grid::Grid,
        tests::{FIXTURE_LOD, mask_hiding, publish},
    },
};

/// The cascade puts co-located rows in the catch-all and everything reads back by position.
///
/// The hand derivation uses four rows on a `span = 1, max_tile_depth = 1` grid, whose deepest
/// bucket is `2 + k`. Rows a and b share the complete key, so the better-ranked a claims depth 0
/// and b never claims a cell; c claims depth 1 - its first depth apart from a - and d claims depth
/// 2 under `k = 0`'s catch-all... at which the law stops distinguishing it from b.
#[test]
fn hand_cascade_pins_the_first_occupant_law() {
    // On the unit grid, a and b share the north-west cell, c takes the north-east, and d shares a's
    // depth-1 cell while occupying its own depth-2 cell, because a's x top bits read 00 and d's
    // read 01.
    let a = MortonKey::new(0x1000_0000, 0x1000_0000);
    let b = MortonKey::new(0x1000_0000, 0x1000_0000);
    let c = MortonKey::new(0xC000_0000, 0x2000_0000);
    let d = MortonKey::new(0x4000_0000, 0x1000_0000);
    let rows = vec![
        ScopeRow {
            vessel: ViewRow::Base(BasePosition::new(0)),
            key: a,
            rank: ImportanceRank::from_u32(0),
        },
        ScopeRow {
            vessel: ViewRow::Base(BasePosition::new(1)),
            key: b,
            rank: ImportanceRank::from_u32(3),
        },
        ScopeRow {
            vessel: ViewRow::Base(BasePosition::new(2)),
            key: c,
            rank: ImportanceRank::from_u32(1),
        },
        ScopeRow {
            vessel: ViewRow::Base(BasePosition::new(3)),
            key: d,
            rank: ImportanceRank::from_u32(2),
        },
    ];

    let schedule = ScopeSchedule::over(rows, Box::new_in([], MemoryUsageAllocator::global()));
    let grid = crate::serve::grid::Grid::new(crate::salt::lod::stage::LodConfig {
        span: crate::math::Log2::new(1).expect("1 lies below the shift width"),
        max_tile_depth: 1,
    })
    .expect("the hand grid is valid");

    let overlay = ArrivalOverlay::empty();
    let cut = schedule
        .cut(&overlay, grid, CutOffset::ZERO)
        .expect("k = 0 lies on the key width");
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("the root cell exists");

    // d(0) = 1: a claims depth 0 and c claims depth 1 (a's depth-1 cell differs from c's).
    // Hand-derivation: at depth 0 all four share the root cell, rank 0 (a) claims it; at depth 1
    // a and d share cell (0,0) - taken cells block b and d - while c's cell (1,0) is free and
    // c claims it; at depth 2 d's cell parts from a's and d claims it, which k = 0 clamps into
    // the catch-all beside b.
    let delta = cut.delta(0, root);
    assert_eq!(
        delta.rows,
        [0, 2].map(|n| ViewRow::Base(BasePosition::from_u32(n))),
        "the root delivers a then c",
    );
    assert_eq!(delta.runs, vec![1, 1], "one first-occupant per depth");
    assert_eq!(delta.first_bucket, 0);

    // The terminal total delivers everything; b and d sit in the catch-all in Morton order:
    // b's key interleaves x-bit 28 and y-bit 28 (bits 57 and 56), d's interleaves x-bit 30 and
    // y-bit 28 (bits 61 and 57), so b < d and the tail reads b then d.
    let total = cut.total(1, root);
    assert_eq!(
        total.rows,
        [0, 2, 1, 3].map(|n| ViewRow::Base(BasePosition::from_u32(n))),
        "the catch-all takes b and d"
    );
    assert_eq!(total.runs, vec![1, 1, 2]);

    assert_eq!(cut.root_delivered(), 2);
    assert_eq!(cut.min_resolution(), 2, "the catch-all is occupied");
    assert_eq!(
        cut.bucket_of(BasePosition::new(1)),
        Some(Depth::new(2).expect("2 is a depth"))
    );
    assert_eq!(
        cut.bucket_of(BasePosition::new(4)),
        None,
        "position 4 is not in the view"
    );

    // k = 1 deepens the catch-all to 3: d keeps its natural depth-2 bucket and only b stays
    // terminal, so bucket-major order now reads d before b.
    let deeper = schedule
        .cut(&overlay, grid, CutOffset::new(1))
        .expect("k = 1 lies on the key width");
    let total = deeper.total(1, root);
    assert_eq!(
        total.rows,
        [0, 2, 3, 1].map(|n| ViewRow::Base(BasePosition::from_u32(n)))
    );
    assert_eq!(
        total.runs,
        vec![1, 1, 1, 1],
        "d parts from the catch-all at k = 1"
    );
}

/// Arrivals extend the hand cascade under the same first-occupant law.
///
/// One arrival shares a's complete key with the worst rank, so it takes the catch-all
/// exactly as a co-located fitted row would, ordered after its better-ranked cell-mates. The
/// other arrival occupies a cell of its own and claims it at the first depth apart from a,
/// exactly as a fitted first occupant would.
#[test]
fn hand_cascade_places_arrivals_by_the_same_law() {
    let fitted = MortonKey::new(0x1000_0000, 0x1000_0000);
    let colocated = fitted;
    let apart = MortonKey::new(0xC000_0000, 0x2000_0000);

    let arrival_row = |index: u32| ArrivalRow {
        identity: ArchivedEntityId {
            web_id: uuid::Uuid::from_u128(0xAB).into(),
            entity_uuid: uuid::Uuid::from_u128(u128::from(index) + 1).into(),
        },
        position: crate::math::Vec2::new(0.25, -0.5),
        wire: crate::serve::WireRow::pinned(index),
        legend: crate::dataset::auxiliary::OwnedLegend::new(
            crate::identity::OntologyRowId::new(0),
            crate::dataset::auxiliary::Label::new("arrival"),
        ),
    };

    let rows = vec![
        ScopeRow {
            vessel: ViewRow::Base(BasePosition::new(0)),
            key: fitted,
            rank: ImportanceRank::from_u32(0),
        },
        ScopeRow {
            vessel: ViewRow::Arrival(ArrivalIndex::from_u32(0)),
            key: colocated,
            rank: ImportanceRank::from_u32(1),
        },
        ScopeRow {
            vessel: ViewRow::Arrival(ArrivalIndex::from_u32(1)),
            key: apart,
            rank: ImportanceRank::from_u32(2),
        },
    ];
    let schedule = ScopeSchedule::over(
        rows,
        Box::new_in(
            [arrival_row(0), arrival_row(1)],
            MemoryUsageAllocator::global(),
        ),
    );

    let grid = crate::serve::grid::Grid::new(crate::salt::lod::stage::LodConfig {
        span: crate::math::Log2::new(1).expect("1 lies below the shift width"),
        max_tile_depth: 1,
    })
    .expect("the hand grid is valid");
    let overlay = ArrivalOverlay::empty();
    let cut = schedule
        .cut(&overlay, grid, CutOffset::ZERO)
        .expect("k = 0 lies on the key width");
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("the root cell exists");

    // d(0) = 1: the fitted row claims depth 0, the apart arrival claims its own depth-1 cell,
    // and the co-located arrival never claims a cell, so the root delivers exactly two rows.
    let delta = cut.delta(0, root);
    assert_eq!(
        delta.rows,
        vec![
            ViewRow::Base(BasePosition::new(0)),
            ViewRow::Arrival(ArrivalIndex::from_u32(1)),
        ],
        "the apart arrival is a first occupant like any other row"
    );

    // The terminal total adds the co-located arrival in the catch-all, after its cell-mate.
    let total = cut.total(1, root);
    assert_eq!(
        total.rows,
        vec![
            ViewRow::Base(BasePosition::new(0)),
            ViewRow::Arrival(ArrivalIndex::from_u32(1)),
            ViewRow::Arrival(ArrivalIndex::from_u32(0)),
        ],
        "the co-located arrival takes the catch-all"
    );
    assert_eq!(total.runs, vec![1, 1, 1]);

    // The position lookup answers the base domain, and the arrival table answers by index.
    assert_eq!(cut.bucket_of(BasePosition::new(0)), Some(Depth::MIN));
    assert_eq!(cut.arrivals().len(), 2);
    assert_eq!(
        AsRef::<crate::dataset::auxiliary::Legend>::as_ref(
            &cut.arrivals()[ArrivalIndex::from_u32(0)].legend
        )
        .label(),
        crate::dataset::auxiliary::Label::new("arrival")
    );
}

/// An empty view builds an empty schedule: nothing delivers, nothing descends.
#[test]
fn empty_view_delivers_nothing() {
    let schedule = ScopeSchedule::over(Vec::new(), Box::new_in([], MemoryUsageAllocator::global()));
    let grid = crate::serve::grid::Grid::new(crate::salt::lod::stage::LodConfig {
        span: crate::math::Log2::new(1).expect("1 lies below the shift width"),
        max_tile_depth: 1,
    })
    .expect("the hand grid is valid");
    let overlay = ArrivalOverlay::empty();
    let cut = schedule
        .cut(&overlay, grid, CutOffset::ZERO)
        .expect("k = 0 lies on the key width");
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("the root cell exists");

    let delta = cut.delta(0, root);
    assert!(delta.rows.is_empty());
    assert_eq!(delta.runs, vec![0, 0], "empty runs keep their slots");
    assert_eq!(cut.root_delivered(), 0);
    assert_eq!(cut.min_resolution(), 0);
    assert_eq!(cut.children(0, root), 0);
}

/// The reverse-rank gather (`ScopeSchedule::of`) equals a naive forward gather - position order,
/// sorted by the corpus rank column, re-indexed dense - for EVERY node mask over the fixture.
///
/// The production gather traverses `position_of_rank` and never reads the forward rank column, so
/// this equality witnesses the loaded reverse against the column it claims to invert, over
/// saturated, empty, singleton, one-hidden, prefix, suffix, and random views.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn scope_of_equals_a_rank_sorted_forward_gather_for_every_node_mask() {
    let (_generation, atlas) = publish("morton-proof-exhaustive-masks").await;

    let row_ids = atlas.rows.view();
    let ranks = atlas.ranks.view();
    let count = u32::try_from(atlas.morton.count()).expect("fixture counts fit u32");

    // Structured masks first, then a deterministic random sweep.
    let mut masks: Vec<Vec<u32>> = vec![
        Vec::new(),                             // saturated
        (0..count).collect(),                   // empty view
        (0..count).step_by(2).collect(),        // every other row
        (0..count.saturating_sub(1)).collect(), // one visible row
        (count >> 1..count).collect(),          // a position suffix
        (0..count >> 1).collect(),              // a position prefix
    ];
    masks.extend((0..count).map(|row| vec![row])); // each single hidden row

    let mut state = 0x5EED_0F0F_5EED_0F0F_u64;
    for _ in 0..256 {
        let bits = replay_rng(&mut state);
        masks.push(
            (0..count)
                .filter(|&row| bits & (1 << (row & 63)) != 0)
                .collect(),
        );
    }

    for hidden in &masks {
        let proof = mask_hiding(&atlas, hidden);

        let built = ScopeSchedule::of(&atlas, &proof, PlacementCohort::EMPTY);

        // Gather forward in position order and sort by the corpus rank column, then re-index the
        // ranks dense by enumeration. The result is the input `of` derives from the reverse
        // column alone.
        let mut naive_rows: Vec<ScopeRow> = row_ids
            .iter_enumerated()
            .filter(|&(_, &row)| proof.contains(row))
            .map(|(position, _)| ScopeRow {
                vessel: ViewRow::Base(position),
                key: atlas.morton.code(position),
                rank: ranks[position],
            })
            .collect();
        naive_rows.sort_unstable_by_key(|row| row.rank);
        for (dense, row) in naive_rows.iter_mut().enumerate() {
            row.rank = ImportanceRank::from_usize(dense);
        }
        let naive =
            ScopeSchedule::over(naive_rows, Box::new_in([], MemoryUsageAllocator::global()));

        assert_eq!(
            format!("{built:?}"),
            format!("{naive:?}"),
            "mask {hidden:?} builds a different schedule through the reverse column"
        );
    }
}

/// The generation's saturated memo is byte-identical to a schedule built directly under the
/// saturated mask proof - equality of content, past the sharing the memo's own test pins.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn saturated_memo_equals_a_directly_built_scope_schedule() {
    let (_generation, atlas) = publish("morton-proof-saturated-content").await;

    let shared = ViewSchedule::of(&atlas, &mask_hiding(&atlas, &[]), PlacementCohort::EMPTY);
    let ViewSchedule::Scope(shared, _) = &shared else {
        panic!("a saturated mask is a declared scope");
    };

    let direct = ScopeSchedule::of(&atlas, &mask_hiding(&atlas, &[]), PlacementCohort::EMPTY);
    assert_eq!(
        format!("{shared:?}"),
        format!("{direct:?}"),
        "the memo serves different bytes than a direct build"
    );

    let full = ScopeSchedule::of(
        &atlas,
        &VisibilityProof::full_visibility(),
        PlacementCohort::EMPTY,
    );
    assert_eq!(
        format!("{direct:?}"),
        format!("{full:?}"),
        "a saturated mask and the full proof gather different views"
    );
}

/// A deterministic xorshift64* stream for adversarial cases without new dependencies.
fn replay_rng(state: &mut u64) -> u64 {
    *state ^= *state << 13;
    *state ^= *state >> 7;
    *state ^= *state << 17;
    state.wrapping_mul(0x2545_F491_4F6C_DD1D)
}

/// Draws a value below `bound` from the stream.
#[expect(
    clippy::integer_division_remainder_used,
    clippy::cast_possible_truncation,
    reason = "a bounded draw from the deterministic stream folds the word into the bound"
)]
fn replay_draw(state: &mut u64, bound: usize) -> usize {
    (replay_rng(state) as usize) % bound
}

/// The shared depth of two keys through `prefix` comparison alone, for the replay oracle.
fn replay_shared_depth(left: MortonKey, right: MortonKey) -> u8 {
    (0..=32_u8)
        .rev()
        .find(|&at| {
            let at = Depth::new(at).expect("the oracle sweeps the documented domain");
            left.prefix(at) == right.prefix(at)
        })
        .expect("depth zero prefixes are always equal")
}

/// Each row's natural bucket by the quadratic law, written without the production cascade.
fn replay_natural_buckets(rows: &[ScopeRow]) -> Vec<u8> {
    rows.iter()
        .map(|row| {
            let mut best: Option<u8> = None;
            for other in rows {
                if other.rank < row.rank {
                    let shared = replay_shared_depth(row.key, other.key);
                    best = Some(best.map_or(shared, |held| held.max(shared)));
                }
            }

            best.map_or(0, |shared| (shared + 1).min(Depth::MAX.get()))
        })
        .collect()
}

/// Hand-built adversarial row sets, each with pairwise-distinct ranks and positions.
fn replay_row_sets() -> Vec<Vec<ScopeRow>> {
    let row = |position: u32, key: u64, rank: u32| ScopeRow {
        vessel: ViewRow::Base(BasePosition::from_u32(position)),
        key: MortonKey::from_bits(key),
        rank: ImportanceRank::from_u32(rank),
    };

    let mut state = 0x00DD_B01D_FACE_D00D_u64;

    let mut sets = vec![
        // Nothing, then one row.
        Vec::new(),
        vec![row(7, 0xDEAD_BEEF_0000_0000, 0)],
        // Every row of this set shares one key, filling the catch-all.
        (0..6)
            .map(|at| row(at, 0xAAAA_0000_0000_1111, at))
            .collect(),
        // Two co-resident clusters parting at the first subdivision.
        (0..6)
            .map(|at| row(at, u64::from(at & 1) << 63, at))
            .collect(),
        // A nested-prefix chain, key `i` sharing exactly depth `i` with key zero.
        (0..16)
            .map(|at| row(at, 1_u64 << (63 - 2 * at), at))
            .collect(),
    ];

    // The chain again under monotone-descending and alternating ranks over key order.
    let chain = |at: u32| 1_u64 << (63 - 2 * at);
    sets.push((0..16).map(|at| row(at, chain(at), 15 - at)).collect());
    sets.push(
        (0..16)
            .map(|at| {
                let rank = if at & 1 == 0 { at >> 1 } else { 15 - (at >> 1) };
                row(at, chain(at), rank)
            })
            .collect(),
    );

    // Random draws from a four-key pool, and full-width randoms.
    let pool = [
        0x1234_5678_9ABC_DEF0_u64,
        0x1234_5678_9ABC_DEF1,
        0x1234_5678_0000_0000,
        0x9234_5678_9ABC_DEF0,
    ];
    let mut ranks: Vec<u32> = (0..24).collect();
    for at in (1..ranks.len()).rev() {
        let swap = replay_draw(&mut state, at + 1);
        ranks.swap(at, swap);
    }
    sets.push(
        (0..24)
            .map(|at| {
                let key = pool[replay_draw(&mut state, pool.len())];
                row(at, key, ranks[at as usize])
            })
            .collect(),
    );
    sets.push(
        (0..24)
            .map(|at| row(at, replay_rng(&mut state), ranks[at as usize]))
            .collect(),
    );

    sets
}

/// The occupied-children bitmask by the quadratic law: bit `i` is one exactly when child `i`
/// holds a row whose clamped bucket exceeds the cut.
fn replay_children_mask(rows: &[ScopeRow], clamped: &[u8], cell: MortonCell, cut_depth: u8) -> u8 {
    cell.children().map_or(0, |children| {
        children
            .iter()
            .enumerate()
            .fold(0_u8, |bits, (index, child)| {
                let occupied = rows
                    .iter()
                    .zip(clamped)
                    .any(|(row, &bucket)| child.contains(row.key) && bucket > cut_depth);
                bits | (u8::from(occupied) << index)
            })
    })
}

/// Replays every cut query against the quadratic law over the adversarial row sets: every
/// admissible offset, every served zoom, every occupied cell and an empty one, the per-bucket
/// run order, the catch-all tail, `children`, `first_zoom`, `bucket_of`, `root_delivered`,
/// and `min_resolution`.
#[test]
#[expect(
    clippy::too_many_lines,
    reason = "the replay sweeps every cut query in one place, and splitting it would part the \
              oracle from the assertions it feeds"
)]
fn cuts_match_the_quadratic_replay() {
    let grid = Grid::new(FIXTURE_LOD).expect("the fixture lod lies on the key width");
    let span = grid.span_log2();
    let max_tile = grid.max_tile_depth();

    for (case, rows) in replay_row_sets().into_iter().enumerate() {
        let schedule = ScopeSchedule::over(
            rows.clone(),
            Box::new_in([], MemoryUsageAllocator::global()),
        );
        let natural = replay_natural_buckets(&rows);

        let overlay = ArrivalOverlay::empty();
        for k in 0..=33_u8 {
            let bound = schedule.cut(&overlay, grid, CutOffset::new(k));
            let admissible =
                u16::from(max_tile) + u16::from(span) + u16::from(k) <= u16::from(Depth::MAX.get());
            let Ok(cut) = bound else {
                assert!(
                    !admissible,
                    "case {case}: binding refused an admissible offset"
                );
                continue;
            };
            assert!(
                admissible,
                "case {case}: binding accepted an offset past the width"
            );

            let deepest = max_tile + span + k;
            assert_eq!(cut.deepest().get(), deepest, "case {case} k {k}");

            let clamped: Vec<u8> = natural.iter().map(|&at| at.min(deepest)).collect();

            // Root delivery and the deepest occupied bucket.
            let cut_zero = span + k;
            let delivered = rows
                .iter()
                .zip(&clamped)
                .filter(|&(_, &bucket)| bucket <= cut_zero)
                .count() as u64;
            assert_eq!(cut.root_delivered(), delivered, "case {case} k {k}");
            let resolution = clamped.iter().copied().max().map_or(0, u64::from);
            assert_eq!(cut.min_resolution(), resolution, "case {case} k {k}");

            // Position lookups, including one the view never held.
            for (row, &bucket) in rows.iter().zip(&clamped) {
                let ViewRow::Base(position) = row.vessel else {
                    unreachable!("the replay sets hold base rows alone")
                };
                let held = cut.bucket_of(position).map(Depth::get);
                assert_eq!(held, Some(bucket), "case {case} k {k}");
                let zoom = cut.first_zoom(position);
                assert_eq!(
                    zoom,
                    Some(bucket.saturating_sub(span + k)),
                    "case {case} k {k}"
                );
            }
            assert_eq!(cut.bucket_of(BasePosition::from_u32(9_999)), None);
            assert_eq!(cut.first_zoom(BasePosition::from_u32(9_999)), None);

            for zoom in 0..=max_tile {
                let cut_depth = zoom + span + k;
                let zoom_grid = Depth::new(zoom).expect("served zooms lie within the key width");

                // Every occupied cell of the zoom, plus one cell nothing occupies.
                let mut cells: Vec<MortonCell> =
                    rows.iter().map(|row| row.key.cell(zoom_grid)).collect();
                cells.sort_unstable_by_key(|cell| cell.min_key());
                cells.dedup();
                cells.push(MortonKey::from_bits(0x5555_5555_5555_5555).cell(zoom_grid));

                for cell in cells {
                    // The expected delivery, bucket-major, (key, rank)-ascending per run.
                    let expect = |first: u8, last: u8| {
                        let mut positions = Vec::new();
                        let mut runs = Vec::new();
                        for bucket in first..=last {
                            let mut members: Vec<&ScopeRow> = rows
                                .iter()
                                .zip(&natural)
                                .filter(|&(row, &at)| {
                                    cell.contains(row.key)
                                        && if bucket == deepest {
                                            at >= deepest
                                        } else {
                                            at == bucket
                                        }
                                })
                                .map(|(row, _)| row)
                                .collect();
                            members.sort_unstable_by_key(|row| (row.key, row.rank));
                            runs.push(u32::try_from(members.len()).expect("fixture rows fit u32"));
                            positions.extend(members.iter().map(|row| row.vessel));
                        }
                        (positions, runs)
                    };

                    let total = cut.total(zoom, cell);
                    let (positions, runs) = expect(0, cut_depth);
                    assert_eq!(total.rows, positions, "case {case} k {k} z {zoom}");
                    assert_eq!(total.runs, runs, "case {case} k {k} z {zoom}");
                    assert_eq!(total.first_bucket, 0);

                    let delta = cut.delta(zoom, cell);
                    let first = if zoom == 0 { 0 } else { cut_depth };
                    let (positions, runs) = expect(first, cut_depth);
                    assert_eq!(delta.rows, positions, "case {case} k {k} z {zoom}");
                    assert_eq!(delta.runs, runs, "case {case} k {k} z {zoom}");
                    assert_eq!(delta.first_bucket, first);

                    // The occupied-children bitmask against the same law.
                    let mask = cut.children(zoom, cell);
                    let expected_mask = if cut_depth >= deepest {
                        0_u8
                    } else {
                        replay_children_mask(&rows, &clamped, cell, cut_depth)
                    };
                    assert_eq!(mask, expected_mask, "case {case} k {k} z {zoom}");
                }
            }
        }
    }
}

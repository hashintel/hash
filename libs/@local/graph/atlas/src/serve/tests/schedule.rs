//! The scope-cascade battery: the delivery law replayed against an independent reference.
//!
//! The reference in [`reference`] is the restricted delivery law written a second time, from the
//! documented contract rather than from `serve::schedule`: gather the visible rows with their
//! pinned keys and ranks, assign first-occupant buckets to the complete key depth, clamp into
//! the resolved catch-all, and deliver contiguous bucket intervals in `(bucket, key, rank)`
//! order. Agreement across the battery freezes the delivered rows, their order, the per-bucket
//! runs, the child bitmask, and the root's global metadata at once - and because the reference
//! reads nothing but the visible rows, every agreement is a witness that production delivery
//! reads nothing but the visible rows either.

#![expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]

use std::collections::{HashMap, HashSet};

use hashql_core::id::Id as _;

use super::{
    CutOffset, FIXTURE_LOD, FULL, HEAD, ROW_IDS, TileError, TileLimits, children_of, codec,
    decode_rows, head_counts, head_global, mask_hiding, publish, request, section, test_codec,
};
use crate::{
    identity::{BasePosition, NodeRowId},
    morton::{Depth, MortonCell, MortonKey},
    salt::wire::Mode,
    serve::{
        Atlas, VisibilityProof,
        schedule::{ScopeRow, ScopeSchedule, ViewSchedule},
    },
};

/// The restricted delivery law, written a second time.
pub(super) mod reference {
    use std::collections::HashSet;

    use crate::{
        morton::{Depth, MortonCell, MortonKey},
        salt::wire::Mode,
        serve::{Atlas, VisibilityProof},
    };

    /// One visible row: base position, pinned key, pinned rank.
    #[derive(Debug, Copy, Clone)]
    pub(in crate::serve) struct Row {
        pub position: u32,
        pub key: MortonKey,
        pub rank: u32,
    }

    /// Gathers the visible rows of `proof` with their generation-layout values.
    pub(in crate::serve) fn rows(atlas: &Atlas, proof: &VisibilityProof) -> Vec<Row> {
        let row_ids = atlas.rows.view();
        let ranks = atlas.ranks.view();
        let count = u32::try_from(atlas.morton.count()).expect("fixture counts fit u32");

        (0..count)
            .filter(|&position| proof.contains(row_ids[position as usize]))
            .map(|position| Row {
                position,
                key: atlas.morton.code(u64::from(position)),
                rank: ranks[position as usize],
            })
            .collect()
    }

    /// Assigns first-occupant buckets over exactly `rows`, to the complete key depth.
    ///
    /// Rank order, coarse to fine: a row takes the shallowest depth at which it is the first
    /// representative of its cell; rows never claiming a cell - co-located at the complete key -
    /// take the deepest bucket.
    pub(in crate::serve) fn buckets(rows: &[Row]) -> Vec<u8> {
        let mut by_rank: Vec<usize> = (0..rows.len()).collect();
        by_rank.sort_unstable_by_key(|&local| rows[local].rank);

        let mut buckets = vec![Depth::MAX.get(); rows.len()];
        let mut assigned: Vec<usize> = Vec::new();
        let mut unassigned = by_rank;
        for depth in 0..=Depth::MAX.get() {
            let depth = Depth::new(depth).expect("depths at or below MAX are valid");
            let represented: HashSet<u64> = assigned
                .iter()
                .map(|&local| rows[local].key.prefix(depth))
                .collect();
            let mut claimed = HashSet::new();

            unassigned.retain(|&local| {
                let cell = rows[local].key.prefix(depth);
                if represented.contains(&cell) || !claimed.insert(cell) {
                    return true;
                }

                buckets[local] = depth.get();
                assigned.push(local);
                false
            });
        }

        buckets
    }

    /// One reference delivery: positions in wire order plus the head's run vocabulary.
    #[derive(Debug)]
    pub(in crate::serve) struct Delivery {
        pub positions: Vec<u32>,
        pub runs: Vec<u64>,
    }

    /// The scope schedule of one view at offset `k`, replayed from the law.
    #[derive(Debug)]
    pub(in crate::serve) struct Schedule {
        rows: Vec<Row>,
        clamped: Vec<u8>,
        span: u8,
        k: u8,
        deepest: u8,
    }

    impl Schedule {
        /// Builds the reference schedule over `rows` at offset `k`.
        pub(in crate::serve) fn new(rows: Vec<Row>, span: u8, max_tile_depth: u8, k: u8) -> Self {
            let deepest = max_tile_depth + span + k;
            assert!(deepest <= Depth::MAX.get(), "the battery stays on the grid");
            let clamped = buckets(&rows)
                .into_iter()
                .map(|bucket| bucket.min(deepest))
                .collect();

            Self {
                rows,
                clamped,
                span,
                k,
                deepest,
            }
        }

        /// The resolved cut of zoom `z`.
        fn cut(&self, z: u8) -> u8 {
            z + self.span + self.k
        }

        /// One bucket's positions inside `cell`, ascending by `(key, rank)`.
        fn run(&self, bucket: u8, cell: MortonCell) -> Vec<u32> {
            let mut hits: Vec<&Row> = self
                .rows
                .iter()
                .zip(&self.clamped)
                .filter(|&(row, &clamped)| clamped == bucket && cell.contains(row.key))
                .map(|(row, _)| row)
                .collect();
            hits.sort_unstable_by_key(|row| (row.key, row.rank));
            hits.into_iter().map(|row| row.position).collect()
        }

        /// The delivery of `(z, cell, mode)`: contiguous bucket intervals, no fill.
        pub(in crate::serve) fn delivery(&self, z: u8, cell: MortonCell, mode: Mode) -> Delivery {
            let cut = self.cut(z);
            let first = match (mode, z) {
                (Mode::Total, _) | (Mode::Delta, 0) => 0,
                (Mode::Delta, _) => cut,
            };

            let mut positions = Vec::new();
            let mut runs = Vec::new();
            for bucket in first..=cut {
                let run = self.run(bucket, cell);
                runs.push(run.len() as u64);
                positions.extend(run);
            }

            Delivery { positions, runs }
        }

        /// The expected child bitmask of `(z, cell)`.
        pub(in crate::serve) fn children(&self, z: u8, cell: MortonCell) -> u8 {
            let cut = self.cut(z);
            if cut >= self.deepest {
                return 0;
            }
            let Some(children) = cell.children() else {
                return 0;
            };

            let mut bits = 0_u8;
            for (index, child) in children.into_iter().enumerate() {
                let occupied = self
                    .rows
                    .iter()
                    .zip(&self.clamped)
                    .any(|(row, &clamped)| clamped > cut && child.contains(row.key));
                bits |= u8::from(occupied) << index;
            }

            bits
        }

        /// The root's expected global metadata: visible count and deepest occupied bucket.
        pub(in crate::serve) fn global(&self) -> (u64, u64) {
            let visible = self
                .clamped
                .iter()
                .filter(|&&clamped| clamped <= self.cut(0))
                .count() as u64;
            let min_resolution = self.clamped.iter().copied().max().map_or(0, u64::from);

            (visible, min_resolution)
        }
    }
}

/// Proof shapes that exercise the cascade: the operator proof aside, independent hiding at two
/// rates, the corpus root schedule hidden whole, the densest `z = 1` subtree hidden whole,
/// near-total hiding, and everything hidden.
fn scope_battery(atlas: &Atlas) -> Vec<(&'static str, VisibilityProof)> {
    use rand::{RngExt as _, SeedableRng as _};
    use rand_xoshiro::Xoshiro256PlusPlus;

    let row_ids = atlas.row_ids();
    let universe = u32::try_from(row_ids.len()).expect("the fixture universe fits u32");
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x5C0F_E5CA);
    // The masks below speak the fixture's raw-u32 row vocabulary; convert at this one boundary.
    let row_at =
        |position: u64| row_ids[usize::try_from(position).expect("positions fit usize")].as_u32();

    let quarter: Vec<u32> = (0..universe).filter(|_| rng.random_ratio(1, 4)).collect();
    let most: Vec<u32> = (0..universe).filter(|_| rng.random_ratio(4, 5)).collect();

    // The corpus root schedule hidden whole: the shape that once drove the fill hardest.
    let root_cut = Depth::new(FIXTURE_LOD.span.get()).expect("the fixture span is a depth");
    let scheduled: Vec<u32> = (0..atlas.morton.fenceposts().segment(root_cut).end)
        .map(row_at)
        .collect();

    // The densest z = 1 subtree hidden whole.
    let densest = (0..2_u32)
        .flat_map(|x| (0..2_u32).map(move |y| (x, y)))
        .max_by_key(|&(x, y)| {
            let cell = MortonCell::new(Depth::new(1).expect("1 is a depth"), x, y)
                .expect("the z = 1 grid is on the key width");
            Depth::all()
                .map(|bucket| {
                    let run = atlas.morton.run(bucket, cell);
                    usize::try_from(run.end - run.start).expect("fixture runs fit usize")
                })
                .sum::<usize>()
        })
        .expect("the z = 1 grid is nonempty");
    let densest_cell = MortonCell::new(Depth::new(1).expect("1 is a depth"), densest.0, densest.1)
        .expect("the densest cell is on the key width");
    let subtree: Vec<u32> = Depth::all()
        .flat_map(|bucket| atlas.morton.run(bucket, densest_cell))
        .map(row_at)
        .collect();

    let sparse: Vec<u32> = (0..universe)
        .filter(|&row| !row.is_multiple_of(16))
        .collect();
    let all: Vec<u32> = (0..universe).collect();

    vec![
        ("quarter-hidden", mask_hiding(atlas, &quarter)),
        ("most-hidden", mask_hiding(atlas, &most)),
        ("schedule-hidden", mask_hiding(atlas, &scheduled)),
        ("subtree-hidden", mask_hiding(atlas, &subtree)),
        ("three-visible", mask_hiding(atlas, &sparse)),
        ("all-hidden", mask_hiding(atlas, &all)),
    ]
}

/// The two expressions of the delivery law agree on every restricted delivery.
///
/// The wire response against the reference, per proof shape, per offset, per coordinate of every
/// zoom, in both modes: the delivered wire ids in order, the per-bucket runs, the delivered
/// count, the child bitmask, and the root's global metadata. The same sweep accumulates every
/// delta chain and holds it against the total response, so accumulation-equals-total rides every
/// proof and offset rather than one fixture.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn restricted_delivery_agrees_with_the_scope_cascade_reference() {
    let (_generation, atlas) = publish("scope-reference").await;
    let node_codec = test_codec(&atlas);
    let position_of: HashMap<NodeRowId, u32> = atlas
        .row_ids()
        .iter()
        .enumerate()
        .map(|(position, &row)| (row, u32::try_from(position).expect("positions fit u32")))
        .collect();

    for (name, proof) in scope_battery(&atlas) {
        let rows = reference::rows(&atlas, &proof);
        for k in 0..=2_u8 {
            let schedule = reference::Schedule::new(
                rows.clone(),
                FIXTURE_LOD.span.get(),
                FIXTURE_LOD.max_tile_depth,
                k,
            );
            let offset = CutOffset::new(k);
            let mut deltas: HashMap<(u8, u32, u32), Vec<u32>> = HashMap::new();

            for z in 0..=FIXTURE_LOD.max_tile_depth {
                let cells = 1_u32 << z;
                for (x, y) in (0..cells).flat_map(|x| (0..cells).map(move |y| (x, y))) {
                    let cell = MortonCell::new(Depth::new(z).expect("zooms are depths"), x, y)
                        .expect("the sweep stays on each zoom's grid");

                    for mode in [Mode::Delta, Mode::Total] {
                        let at = format!("{name} k={k} {mode:?} {z}/{x}/{y}");
                        let bytes = atlas
                            .tile(
                                &request(z, x, y, mode),
                                TileLimits::default(),
                                &proof,
                                offset,
                            )
                            .expect("the restricted tile serves");
                        let head = section(&bytes, HEAD).expect("HEAD is present");
                        let (delivered, runs) = head_counts(head);
                        let wire_rows =
                            decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));
                        let positions: Vec<u32> = wire_rows
                            .iter()
                            .map(|&wire| {
                                let row = node_codec
                                    .decode(codec::WireRow::pinned(wire))
                                    .expect("delivered wire ids decode");
                                position_of[&row]
                            })
                            .collect();

                        let expected = schedule.delivery(z, cell, mode);
                        assert_eq!(
                            positions, expected.positions,
                            "{at} delivers the law's rows"
                        );
                        assert_eq!(runs, expected.runs, "{at} recounts the law's runs");
                        assert_eq!(
                            delivered,
                            expected.positions.len() as u64,
                            "{at} counts its rows",
                        );
                        assert_eq!(
                            u8::try_from(children_of(head)).expect("children fit u8"),
                            schedule.children(z, cell),
                            "{at} frontiers the law's children",
                        );

                        if z == 0 && mode == Mode::Delta {
                            let (visible, _bounds, min_resolution) =
                                head_global(head).expect("the root carries global metadata");
                            let (expected_visible, expected_resolution) = schedule.global();
                            assert_eq!(visible, expected_visible, "{at} counts the root view");
                            assert_eq!(
                                min_resolution, expected_resolution,
                                "{at} names the deepest occupied scope bucket",
                            );
                        }

                        if mode == Mode::Delta {
                            deltas.insert((z, x, y), positions.clone());
                        } else {
                            // Accumulating the delta chain reproduces the total as a set,
                            // without duplicates. An ancestor's delta spans its whole wider
                            // extent, so the chain restricts to this tile's cell before the
                            // comparison - exactly the accumulated state a client holds for it.
                            let accumulated: Vec<u32> = (0..=z)
                                .flat_map(|level| {
                                    let shift = z - level;
                                    deltas[&(level, x >> shift, y >> shift)].iter().copied()
                                })
                                .collect();
                            let chain_len = accumulated.len();
                            let chain: HashSet<u32> = accumulated.into_iter().collect();
                            assert_eq!(chain.len(), chain_len, "{at} repeats no row down chain");
                            let in_extent: HashSet<u32> = chain
                                .into_iter()
                                .filter(|&position| {
                                    cell.contains(atlas.morton.code(u64::from(position)))
                                })
                                .collect();
                            let total: HashSet<u32> = positions.iter().copied().collect();
                            assert_eq!(in_extent, total, "{at} accumulates to its total");
                        }
                    }
                }
            }
        }
    }
}

/// A resolved cut past the key width refuses the whole tile.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn an_out_of_domain_cut_refuses_delivery() {
    let (_generation, atlas) = publish("cut-refusal").await;
    let proof = mask_hiding(&atlas, &[0]);

    let result = atlas.tile(
        &request(0, 0, 0, Mode::Delta),
        TileLimits::default(),
        &proof,
        CutOffset::new(32),
    );
    assert!(
        matches!(result, Err(TileError::Schedule(_))),
        "a cut past the key width must refuse, got {result:?}",
    );
}

/// A proof paired with the other contract's schedule refuses before assembly.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn a_mismatched_proof_and_schedule_refuse_the_contract() {
    let (_generation, atlas) = publish("contract-refusal").await;
    let masked = mask_hiding(&atlas, &[0]);
    let scope = ViewSchedule::of(&atlas, &masked);

    let corpus_for_masked = atlas.assemble_tile(
        &request(0, 0, 0, Mode::Delta),
        TileLimits::default(),
        &masked,
        atlas.census(&masked),
        &ViewSchedule::Corpus,
        CutOffset::ZERO,
    );
    assert_eq!(
        corpus_for_masked.expect_err("a masked proof must not serve the corpus schedule"),
        TileError::Contract,
    );

    let scope_for_full = atlas.assemble_tile(
        &request(0, 0, 0, Mode::Delta),
        TileLimits::default(),
        &FULL,
        atlas.census(&FULL),
        &scope,
        CutOffset::ZERO,
    );
    assert_eq!(
        scope_for_full.expect_err("an operator proof must not serve a scope cascade"),
        TileError::Contract,
    );
}

/// The cascade puts co-located rows in the catch-all and everything reads back by position.
///
/// Hand-derived: four rows on a `span = 1, max_tile_depth = 1` grid, deepest bucket `2 + k`.
/// Rows a and b share the complete key, so the better-ranked a claims depth 0 and b never claims
/// a cell; c claims depth 1 - its first depth apart from a - and d claims depth 2 under `k = 0`'s
/// catch-all... at which the law stops distinguishing it from b.
#[test]
fn a_hand_cascade_pins_the_first_occupant_law() {
    // Keys on the unit grid: a and b co-located in the north-west, c north-east, and d in a's
    // depth-1 cell but its own depth-2 cell - a's x top bits read 00, d's read 01.
    let a = MortonKey::new(0x1000_0000, 0x1000_0000);
    let b = MortonKey::new(0x1000_0000, 0x1000_0000);
    let c = MortonKey::new(0xC000_0000, 0x2000_0000);
    let d = MortonKey::new(0x4000_0000, 0x1000_0000);
    let rows = vec![
        ScopeRow {
            position: BasePosition::new(0),
            key: a,
            rank: 0,
        },
        ScopeRow {
            position: BasePosition::new(1),
            key: b,
            rank: 3,
        },
        ScopeRow {
            position: BasePosition::new(2),
            key: c,
            rank: 1,
        },
        ScopeRow {
            position: BasePosition::new(3),
            key: d,
            rank: 2,
        },
    ];

    let schedule = ScopeSchedule::over(rows);
    let grid = crate::serve::grid::Grid::new(crate::salt::lod::stage::LodConfig {
        span: crate::math::Log2::new(1).expect("1 lies below the shift width"),
        max_tile_depth: 1,
    })
    .expect("the hand grid is valid");

    let cut = schedule
        .cut(grid, CutOffset::ZERO)
        .expect("k = 0 lies on the key width");
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("the root cell exists");

    // d(0) = 1: a claims depth 0; c claims depth 1 (a's depth-1 cell differs from c's).
    // Hand-derivation: at depth 0 all four share the root cell, rank 0 (a) claims it; at depth 1
    // a and d share cell (0,0) - taken cells block b and d - while c's cell (1,0) is free and
    // c claims it; at depth 2 d's cell parts from a's and d claims it, which k = 0 clamps into
    // the catch-all beside b.
    let delta = cut.delta(0, root);
    assert_eq!(delta.positions, vec![0, 2], "the root delivers a then c");
    assert_eq!(delta.runs, vec![1, 1], "one first-occupant per depth");
    assert_eq!(delta.first_bucket, 0);

    // The terminal total delivers everything; b and d sit in the catch-all in Morton order:
    // b's key interleaves x-bit 28 and y-bit 28 (bits 57 and 56), d's interleaves x-bit 30 and
    // y-bit 28 (bits 61 and 57), so b < d and the tail reads b then d.
    let total = cut.total(1, root);
    assert_eq!(
        total.positions,
        vec![0, 2, 1, 3],
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
        .cut(grid, CutOffset::new(1))
        .expect("k = 1 lies on the key width");
    let total = deeper.total(1, root);
    assert_eq!(total.positions, vec![0, 2, 3, 1]);
    assert_eq!(
        total.runs,
        vec![1, 1, 1, 1],
        "d parts from the catch-all at k = 1"
    );
}

/// An empty view builds an empty schedule: nothing delivers, nothing descends.
#[test]
fn an_empty_view_delivers_nothing() {
    let schedule = ScopeSchedule::over(Vec::new());
    let grid = crate::serve::grid::Grid::new(crate::salt::lod::stage::LodConfig {
        span: crate::math::Log2::new(1).expect("1 lies below the shift width"),
        max_tile_depth: 1,
    })
    .expect("the hand grid is valid");
    let cut = schedule
        .cut(grid, CutOffset::ZERO)
        .expect("k = 0 lies on the key width");
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("the root cell exists");

    let delta = cut.delta(0, root);
    assert!(delta.positions.is_empty());
    assert_eq!(delta.runs, vec![0, 0], "empty runs keep their slots");
    assert_eq!(cut.root_delivered(), 0);
    assert_eq!(cut.min_resolution(), 0);
    assert_eq!(cut.children(0, root), 0);
}

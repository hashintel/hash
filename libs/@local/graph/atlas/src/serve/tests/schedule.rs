//! Tests that replay the scope-cascade delivery law against an independent reference.
//!
//! The reference in [`reference`] is the restricted delivery law written a second time, from the
//! documented contract rather than from `serve::schedule`. It gathers the visible rows with their
//! pinned keys and ranks, then assigns first-occupant buckets to the complete key depth. It clamps
//! those buckets into the resolved catch-all and delivers contiguous bucket intervals in `(bucket,
//! key, rank)` order. Agreement across the battery freezes the delivered rows, their order, the
//! per-bucket runs, the child bitmask, and the root's global metadata at once, and because the
//! reference reads nothing but the visible rows, every agreement is a witness that production
//! delivery reads nothing but the visible rows either.

#![expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]

use alloc::sync::Arc;
use std::collections::{HashMap, HashSet};

use hashql_core::id::Id as _;

use super::{
    Bound, CutOffset, EdgesLimits, FIXTURE_LOD, FULL, HEAD, ROW_IDS, TileCoordinate, TileLimits,
    UntouchedStore, View, children_of, codec, decode_rows, edges_request, entity_string_of,
    expected_edges_bytes, head_counts, head_global, mask_hiding, mask_hiding_rows,
    open_edge_artifacts, publish, qualifying_columns, request, section, test_codec, wire_columns,
};
use crate::{
    identity::{BasePosition, ImportanceRank, NodeRowId},
    morton::{Depth, MortonCell, MortonKey},
    salt::wire::Mode,
    serve::{
        Atlas, ViewError, VisibilityProof,
        schedule::{ScopeRow, ScopeSchedule, ViewSchedule},
    },
};

/// The restricted delivery law, written a second time.
pub(super) mod reference {
    use std::collections::HashSet;

    use hashql_core::id::Id as _;

    use crate::{
        identity::BasePosition,
        morton::{Depth, MortonCell, MortonKey},
        salt::wire::Mode,
        serve::{Atlas, VisibilityProof},
    };

    /// One visible row with its base position, pinned key, and pinned rank.
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
            .filter(|&position| proof.contains(row_ids[BasePosition::from_u32(position)]))
            .map(|position| Row {
                position,
                key: atlas.morton.code(BasePosition::from_u32(position)),
                rank: ranks[BasePosition::from_u32(position)].as_u32(),
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

    /// One reference delivery of positions in wire order, with the head's run vocabulary.
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

        /// The delivery of `(z, cell, mode)`, made only of contiguous bucket intervals.
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

        /// The first zoom whose cumulative schedule delivers `position`, replayed from the law.
        ///
        /// [`Self::cut`] inverted: the smallest `z` with `clamped <= z + span + k`. Written as a
        /// search rather than as the subtraction the implementation uses, so the two derivations
        /// share no arithmetic. [`None`] when the view does not hold the position.
        pub(in crate::serve) fn first_zoom(&self, position: u32) -> Option<u8> {
            let local = self.rows.iter().position(|row| row.position == position)?;
            let bucket = self.clamped[local];

            (0..=u8::MAX).find(|&z| {
                u16::from(bucket) <= u16::from(z) + u16::from(self.span) + u16::from(self.k)
            })
        }

        /// The union of the listed tiles' delivered positions: the edges route's bounding set.
        ///
        /// A tile's delivered set is mode-independent, so the total delivery is the whole answer.
        pub(in crate::serve) fn delivered_union(&self, tiles: &[(u8, MortonCell)]) -> HashSet<u32> {
            tiles
                .iter()
                .flat_map(|&(z, cell)| self.delivery(z, cell, Mode::Total).positions)
                .collect()
        }

        /// The visible count and deepest occupied bucket expected in the root's global metadata.
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

/// Builds the proof shapes that exercise the cascade.
///
/// The operator proof aside, the shapes are independent hiding at two rates, the corpus root
/// schedule hidden whole, the densest `z = 1` subtree hidden whole, near-total hiding, and
/// everything hidden.
fn scope_battery(atlas: &Atlas) -> Vec<(&'static str, VisibilityProof)> {
    use rand::{RngExt as _, SeedableRng as _};
    use rand_xoshiro::Xoshiro256PlusPlus;

    let row_ids = atlas.row_ids();
    let universe = u32::try_from(row_ids.len()).expect("the fixture universe fits u32");
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x5C0F_E5CA);
    // The masks below speak the fixture's raw-u32 row vocabulary; narrow checked, at this one
    // boundary.
    let row_at = |position: BasePosition| row_ids[position].as_u32();

    let quarter: Vec<u32> = (0..universe).filter(|_| rng.random_ratio(1, 4)).collect();
    let most: Vec<u32> = (0..universe).filter(|_| rng.random_ratio(4, 5)).collect();

    // The corpus root schedule hidden whole: the shape that once drove the fill hardest.
    let root_cut = Depth::new(FIXTURE_LOD.span.get()).expect("the fixture span is a depth");
    let scheduled: Vec<u32> = (BasePosition::MIN..atlas.morton.fenceposts().segment(root_cut).end)
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
                    run.end.as_usize() - run.start.as_usize()
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

/// Both expressions of the delivery law agree on every restricted delivery.
///
/// The sweep compares the wire response with the reference at every proof shape, offset, zoom
/// coordinate, and mode. Each comparison covers the delivered wire ids in order, the per-bucket
/// runs, the delivered count, the child bitmask, and the root's global metadata. The same sweep
/// accumulates every delta chain and checks it against the total response, so
/// accumulation-equals-total covers every proof and offset rather than one fixture.
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
                                Bound::new(&atlas, &proof, offset).view(&atlas),
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
                            let code_of =
                                |position: u32| atlas.morton.code(BasePosition::from_u32(position));
                            let in_extent: HashSet<u32> = chain
                                .into_iter()
                                .filter(|&position| cell.contains(code_of(position)))
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

/// A resolved cut past the key width refuses at the binding, so no tile request can carry it.
///
/// Every route takes a bound view, so a refused offset never reaches assembly and the whole-tile
/// refusal holds by construction.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn resolved_cut_past_the_key_width_refuses_the_whole_tile() {
    let (_generation, atlas) = publish("cut-refusal").await;
    let proof = mask_hiding(&atlas, &[0]);

    let schedule = ViewSchedule::of(&atlas, &proof);
    let result = View::bind(
        atlas.grid,
        &proof,
        atlas.census(&proof),
        &schedule,
        CutOffset::new(32),
    );
    assert!(
        matches!(result, Err(ViewError::Schedule(_))),
        "a cut past the key width must refuse, got {result:?}",
    );
}

/// A proof paired with the other contract's schedule refuses at the binding.
///
/// The refusal moved out of assembly when the delivery inputs became one bound value. No endpoint
/// can receive a mismatched pair. The pair is checked where it is assembled, and [`View::bind`] is
/// the only entry point still accepting the four inputs apart.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn mismatched_proof_and_schedule_refuse_the_contract() {
    let (_generation, atlas) = publish("contract-refusal").await;
    let masked = mask_hiding(&atlas, &[0]);
    let scope = ViewSchedule::of(&atlas, &masked);

    let corpus = ViewSchedule::Corpus;
    let corpus_for_masked = View::bind(
        atlas.grid,
        &masked,
        atlas.census(&masked),
        &corpus,
        CutOffset::ZERO,
    );
    assert_eq!(
        corpus_for_masked.expect_err("a masked proof must not serve the corpus schedule"),
        ViewError::Contract,
    );

    let scope_for_full = View::bind(
        atlas.grid,
        &FULL,
        atlas.census(&FULL),
        &scope,
        CutOffset::ZERO,
    );
    assert_eq!(
        scope_for_full.expect_err("an operator proof must not serve a scope cascade"),
        ViewError::Contract,
    );
}

/// An operator proof carrying a nonzero offset refuses at the binding.
///
/// The corpus schedule has one cut per zoom, so an offset into it names bytes no route produces.
/// The case that reaches here is a token sealed before the mint fixed operator offsets at zero.
/// Refusing it keeps the manifest's declared cut and the served bytes one statement. The caller's
/// recovery is a renewal, whose fresh token seals zero.
///
/// The offset zero case runs beside it, so the refusal is about the value rather than about the
/// pair.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn operator_proof_refuses_a_nonzero_offset() {
    let (_generation, atlas) = publish("operator-offset-refusal").await;
    let corpus = ViewSchedule::Corpus;

    let refused = View::bind(
        atlas.grid,
        &FULL,
        atlas.census(&FULL),
        &corpus,
        CutOffset::new(1),
    );
    assert_eq!(
        refused.expect_err("an operator proof must not carry a nonzero offset"),
        ViewError::Offset(CutOffset::new(1)),
    );

    let bound = View::bind(
        atlas.grid,
        &FULL,
        atlas.census(&FULL),
        &corpus,
        CutOffset::ZERO,
    );
    assert!(
        bound.is_ok(),
        "the operator pair at offset zero must still bind, got {bound:?}",
    );
}

/// The tile lists that discriminate the two delivery laws.
///
/// The deepest zoom's cut is the catch-all under both laws, so a full-grid request delivers the
/// whole visible set either way and witnesses nothing. These lists stop short of it, where a row
/// the corpus cascade buried behind a hidden neighbour is a row the scope cascade lifts.
fn discriminating_tile_lists() -> Vec<Vec<TileCoordinate>> {
    vec![
        vec![TileCoordinate { z: 0, x: 0, y: 0 }],
        (0..2_u32)
            .flat_map(|x| (0..2_u32).map(move |y| TileCoordinate { z: 1, x, y }))
            .collect(),
    ]
}

/// The edges route bounds its subgraph by the view's own cascade, not by the corpus walk.
///
/// The listed tiles' delivered rows are what the tile route delivered under the same view, so the
/// expectation replays the reference cascade's cumulative prefixes and induces the subgraph over
/// exactly that union. Reading the corpus schedule under a scope answers about rows the client
/// never received: it drops an edge whose endpoint the scope lifted into a shallower bucket and
/// draws one between endpoints the scope's own tiles have yet to deliver.
///
/// The sweep carries its own negative control. It counts the cases where the two laws disagree and
/// asserts the count is nonzero, so a fixture that stopped discriminating fails loudly here rather
/// than passing this test for the wrong reason.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn scoped_edges_bound_the_view_cascade_delivery() {
    let (generation, atlas) = publish("scope-edges").await;
    let endpoints: Vec<[u64; 2]> = open_edge_artifacts(&generation)
        .endpoints
        .u64_le_pairs()
        .expect("the endpoint column is little-endian u64 pairs")
        .iter()
        .map(|pair| pair.map(zerocopy::U64::get))
        .collect();
    let row_ids = atlas.row_ids();
    let morton = &atlas.morton;
    let row_at = |position: u32| row_ids[BasePosition::from_u32(position)].as_u32();

    let mut discriminated = 0_usize;
    for (name, proof) in scope_battery(&atlas) {
        let rows = reference::rows(&atlas, &proof);
        for k in 0..=2_u8 {
            let schedule = reference::Schedule::new(
                rows.clone(),
                FIXTURE_LOD.span.get(),
                FIXTURE_LOD.max_tile_depth,
                k,
            );

            for tiles in discriminating_tile_lists() {
                let at = format!("{name} k={k} {} tiles", tiles.len());
                let cells: Vec<(u8, MortonCell)> = tiles
                    .iter()
                    .map(|&coordinate| {
                        let depth = Depth::new(coordinate.z).expect("zooms are depths");
                        (
                            coordinate.z,
                            MortonCell::new(depth, coordinate.x, coordinate.y)
                                .expect("the lists stay on each zoom's grid"),
                        )
                    })
                    .collect();

                let delivered: HashSet<u32> = schedule
                    .delivered_union(&cells)
                    .into_iter()
                    .map(row_at)
                    .collect();

                // The law this cut replaced is the corpus schedule's own runs, masked. Counting
                // where it parts from the cascade is what proves the sweep can fail.
                let corpus: HashSet<u32> = cells
                    .iter()
                    .flat_map(|&(z, cell)| {
                        (0..=(z + FIXTURE_LOD.span.get()))
                            .filter_map(Depth::new)
                            .flat_map(move |bucket| morton.run(bucket, cell))
                    })
                    .map(|position| row_at(position.as_u32()))
                    .filter(|&row| proof.contains(NodeRowId::from_u32(row)))
                    .collect();
                discriminated += usize::from(corpus != delivered);

                let bytes = atlas
                    .edges(
                        &edges_request(tiles),
                        EdgesLimits::default(),
                        Bound::new(&atlas, &proof, CutOffset::new(k)).view(&atlas),
                        UntouchedStore,
                    )
                    .expect("the scoped edges request serves");

                let (sources, targets, edge_rows) = qualifying_columns(&endpoints, &delivered);
                let (sources, targets, edge_rows) =
                    wire_columns(&atlas, &sources, &targets, &edge_rows);
                assert_eq!(
                    bytes,
                    expected_edges_bytes(&generation, true, &sources, &targets, &edge_rows),
                    "{at} draws the subgraph its own tiles delivered",
                );
            }
        }
    }

    assert!(
        discriminated > 0,
        "no case in the sweep parts the corpus walk from the cascade, so it witnesses nothing",
    );
}

/// A scoped locate names the zoom the view's own cascade first delivers the source at.
///
/// The fly-to zoom and the partner tie-break both read the source's first visible zoom. Under a
/// scope that zoom must invert the view's own cut `z + span + k` over the view's own cascade. A
/// corpus bucket is a first-occupant result over hidden rows too. Answering from one flies the
/// client to a zoom its own tiles never deliver the source at. It also hands a hidden row the
/// choice of which authorized partners survive the cap.
///
/// The reference finds the zoom by search where the implementation subtracts. No arithmetic is
/// shared between them. The sweep then counts where the scope answer parts from the corpus one.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn scoped_locate_flies_to_the_view_cut_zoom() {
    let (_generation, atlas) = publish("scope-locate").await;
    let row_ids = atlas.row_ids();

    let mut discriminated = 0_usize;
    let mut resolved = 0_usize;
    for (name, proof) in scope_battery(&atlas) {
        let rows = reference::rows(&atlas, &proof);
        for k in 0..=2_u8 {
            let schedule = reference::Schedule::new(
                rows.clone(),
                FIXTURE_LOD.span.get(),
                FIXTURE_LOD.max_tile_depth,
                k,
            );
            let bound = Bound::new(&atlas, &proof, CutOffset::new(k));
            let view = bound.view(&atlas);

            for &row in &rows {
                let at = format!("{name} k={k} position {}", row.position);
                let entity = row_ids[BasePosition::from_u32(row.position)].as_u32();
                let source = atlas
                    .resolve_source(
                        &view,
                        &entity_string_of(u8::try_from(entity).expect("fixture rows fit u8")),
                    )
                    .expect("a visible row's own entity id resolves");
                resolved += 1;

                let expected = schedule
                    .first_zoom(row.position)
                    .expect("the reference holds every visible row");
                assert_eq!(source.zoom, expected, "{at} names the cut's first zoom");

                // The fly-to tile is that zoom's cell holding the source, checked by containment
                // rather than by replaying the addressing the implementation used.
                assert_eq!(source.cell.z, source.zoom, "{at} flies to its own zoom");
                let cell = MortonCell::new(
                    Depth::new(source.cell.z).expect("zooms are depths"),
                    source.cell.x,
                    source.cell.y,
                )
                .expect("the fly-to target is on its zoom's grid");
                assert!(
                    cell.contains(row.key),
                    "{at} flies to a tile holding the source"
                );

                let corpus = atlas
                    .morton
                    .bucket_of(BasePosition::from_u32(row.position))
                    .get()
                    .saturating_sub(FIXTURE_LOD.span.get());
                discriminated += usize::from(corpus != source.zoom);
            }
        }
    }

    assert!(resolved > 0, "the sweep resolved no source at all");
    assert!(
        discriminated > 0,
        "no case in the sweep parts the corpus first zoom from the cascade's, so it witnesses \
         nothing",
    );
}

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
            position: BasePosition::new(0),
            key: a,
            rank: ImportanceRank::from_u32(0),
        },
        ScopeRow {
            position: BasePosition::new(1),
            key: b,
            rank: ImportanceRank::from_u32(3),
        },
        ScopeRow {
            position: BasePosition::new(2),
            key: c,
            rank: ImportanceRank::from_u32(1),
        },
        ScopeRow {
            position: BasePosition::new(3),
            key: d,
            rank: ImportanceRank::from_u32(2),
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

    // d(0) = 1: a claims depth 0 and c claims depth 1 (a's depth-1 cell differs from c's).
    // Hand-derivation: at depth 0 all four share the root cell, rank 0 (a) claims it; at depth 1
    // a and d share cell (0,0) - taken cells block b and d - while c's cell (1,0) is free and
    // c claims it; at depth 2 d's cell parts from a's and d claims it, which k = 0 clamps into
    // the catch-all beside b.
    let delta = cut.delta(0, root);
    assert_eq!(
        delta.positions,
        [0, 2].map(BasePosition::from_u32),
        "the root delivers a then c",
    );
    assert_eq!(delta.runs, vec![1, 1], "one first-occupant per depth");
    assert_eq!(delta.first_bucket, 0);

    // The terminal total delivers everything; b and d sit in the catch-all in Morton order:
    // b's key interleaves x-bit 28 and y-bit 28 (bits 57 and 56), d's interleaves x-bit 30 and
    // y-bit 28 (bits 61 and 57), so b < d and the tail reads b then d.
    let total = cut.total(1, root);
    assert_eq!(
        total.positions,
        [0, 2, 1, 3].map(BasePosition::from_u32),
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
    assert_eq!(total.positions, [0, 2, 3, 1].map(BasePosition::from_u32));
    assert_eq!(
        total.runs,
        vec![1, 1, 1, 1],
        "d parts from the catch-all at k = 1"
    );
}

/// An empty view builds an empty schedule: nothing delivers, nothing descends.
#[test]
fn empty_view_delivers_nothing() {
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

/// A scope admitting every corpus row still receives the restricted contract.
///
/// The saturated mask is the shape a normalization would be tempted by. Its visible set is the
/// whole corpus. A delivery path that recognized saturation could therefore answer from the corpus
/// schedule without anyone seeing a wrong row.
///
/// What such a path would lose is the declaration. This caller declared a scope and its manifest
/// sealed a scope's `k`. An offset is a value the corpus contract has no bytes for.
///
/// The sweep therefore serves the whole grid at three offsets against the cascade reference. It
/// pins beside that the operator contract's refusal of the offset this caller is served at.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn an_all_row_scope_serves_the_restricted_contract() {
    let (_generation, atlas) = publish("scope-all-rows").await;
    let all_rows = mask_hiding(&atlas, &[]);

    assert_eq!(
        all_rows.kind(),
        crate::serve::visibility::ProofKind::Scope,
        "a mask admitting every row is still a scope declaration",
    );
    let rows = reference::rows(&atlas, &all_rows);
    assert_eq!(
        rows.len(),
        atlas.row_ids().len(),
        "the case needs `V` equal to the corpus, or it is an ordinary scope",
    );

    for k in 0..=2_u8 {
        let schedule = reference::Schedule::new(
            rows.clone(),
            FIXTURE_LOD.span.get(),
            FIXTURE_LOD.max_tile_depth,
            k,
        );
        let offset = CutOffset::new(k);
        assert_saturated_scope_grid(&atlas, &all_rows, &schedule, k);

        // The offset this caller is served at is one the corpus contract has no bytes for.
        if k > 0 {
            assert_eq!(
                View::bind(
                    atlas.grid,
                    &FULL,
                    atlas.census(&FULL),
                    &ViewSchedule::Corpus,
                    offset
                )
                .expect_err("the operator contract admits no offset"),
                ViewError::Offset(offset),
            );
        }
    }
}

/// Saturated scopes share one cascade, and a scope hiding any row builds its own.
///
/// A scope schedule is a function of the visible node rows alone, so every scope whose node mask
/// admits the whole corpus builds identical buckets, and one shared allocation answers them all.
/// The link mask never enters the cascade, so a scope masking link rows over a saturated node
/// axis shares it too. The overfire is the bug class on the other side. A scope hiding even one
/// node row must build its own cascade, because the shared one delivers the hidden row.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn saturated_scopes_share_one_cascade() {
    let (_generation, atlas) = publish("saturated-memo").await;

    let first = ViewSchedule::of(&atlas, &mask_hiding(&atlas, &[]));
    let second = ViewSchedule::of(&atlas, &mask_hiding(&atlas, &[]));
    let (ViewSchedule::Scope(first), ViewSchedule::Scope(second)) = (&first, &second) else {
        panic!("a saturated mask is a declared scope and serves the scope contract");
    };
    assert!(
        Arc::ptr_eq(first, second),
        "two saturated scopes read one cascade"
    );

    let link_masked = ViewSchedule::of(&atlas, &mask_hiding_rows(&atlas, &[], &[0]));
    let ViewSchedule::Scope(link_masked) = &link_masked else {
        panic!("a link-masked proof is a declared scope");
    };
    assert!(
        Arc::ptr_eq(first, link_masked),
        "the link mask never enters the cascade, so a saturated node axis shares it"
    );

    let masked = ViewSchedule::of(&atlas, &mask_hiding(&atlas, &[0]));
    let ViewSchedule::Scope(masked) = &masked else {
        panic!("a masked proof is a declared scope");
    };
    assert!(
        !Arc::ptr_eq(first, masked),
        "a scope hiding a node row builds its own cascade"
    );
}

/// Sweeps the whole fixture grid at one offset for
/// [`an_all_row_scope_serves_the_restricted_contract`].
fn assert_saturated_scope_grid(
    atlas: &Atlas,
    all_rows: &VisibilityProof,
    schedule: &reference::Schedule,
    k: u8,
) {
    let offset = CutOffset::new(k);
    let node_codec = test_codec(atlas);
    let position_of: HashMap<NodeRowId, u32> = atlas
        .row_ids()
        .iter()
        .enumerate()
        .map(|(position, &row)| (row, u32::try_from(position).expect("positions fit u32")))
        .collect();

    {
        for z in 0..=FIXTURE_LOD.max_tile_depth {
            let cells = 1_u32 << z;
            for (x, y) in (0..cells).flat_map(|x| (0..cells).map(move |y| (x, y))) {
                let cell = MortonCell::new(Depth::new(z).expect("zooms are depths"), x, y)
                    .expect("the sweep stays on each zoom's grid");

                for mode in [Mode::Delta, Mode::Total] {
                    let at = format!("all-rows k={k} {mode:?} {z}/{x}/{y}");
                    let bytes = atlas
                        .tile(
                            &request(z, x, y, mode),
                            TileLimits::default(),
                            Bound::new(atlas, all_rows, offset).view(atlas),
                        )
                        .expect("the saturated scope serves");
                    let head = section(&bytes, HEAD).expect("HEAD is present");
                    let (delivered, runs) = head_counts(head);
                    let positions: Vec<u32> =
                        decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"))
                            .iter()
                            .map(|&wire| {
                                position_of[&node_codec
                                    .decode(codec::WireRow::pinned(wire))
                                    .expect("delivered wire ids decode")]
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

                    // At the offset both contracts can serve, they serve the same bytes. That
                    // coincidence is the reason a byte comparison cannot police this case: a
                    // normalization into the operator variant would be invisible here. It is
                    // pinned rather than avoided, so that the day the two responses part, someone
                    // has to decide which of them moved.
                    if k == 0 {
                        let operator = atlas
                            .tile(
                                &request(z, x, y, mode),
                                TileLimits::default(),
                                Bound::new(atlas, &FULL, CutOffset::ZERO).view(atlas),
                            )
                            .expect("the operator contract serves");
                        assert_eq!(
                            operator, bytes,
                            "{at} parts from the corpus contract's bytes"
                        );
                    }
                }
            }
        }

        // The offset this caller is served at is one the corpus contract has no bytes for.
        if k > 0 {
            assert_eq!(
                View::bind(
                    atlas.grid,
                    &FULL,
                    atlas.census(&FULL),
                    &ViewSchedule::Corpus,
                    offset
                )
                .expect_err("the operator contract admits no offset"),
                ViewError::Offset(offset),
            );
        }
    }
}

/// Under a scope, the locate cap selects among authorized partners by the view's own zoom.
///
/// The cap's tie-break reads each partner's first visible zoom. Under a scope it must read the
/// zoom the caller's own cascade delivers that partner at.
///
/// Reading the corpus bucket instead would hand rows the caller cannot see the choice of which
/// authorized partner survives a binding cap. The source would be the same and its authorized
/// neighbours would be the same. The survivors would not.
///
/// The expectation derives the survivor set from the reference cascade's zoom. The reference finds
/// that zoom by search where the implementation subtracts.
///
/// What this corpus witnesses is bounded. The cap binds in thirty cases. The survivors are exactly
/// the independent derivation's in all of them. In eight of those cases the two laws deliver some
/// authorized partner at different zooms. The scope-derived input is therefore read rather than
/// assumed. No binding cap turns on it. The fixture's squared distances separate every pair before
/// the zoom is consulted. A case that turns on it needs two authorized partners equidistant from
/// one source and delivered at different cascade zooms. This corpus holds no such pair. The
/// counters assert that state rather than describe it. A corpus that gains such a pair therefore
/// fails here and earns the stronger assertion it then deserves.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn a_scoped_locate_cap_selects_among_authorised_partners() {
    let (_generation, atlas) = publish("scope-locate-cap").await;
    let row_ids = atlas.row_ids();

    let mut counts = CapCounts::default();
    for (name, proof) in scope_battery(&atlas) {
        let rows = reference::rows(&atlas, &proof);
        let visible: HashSet<u32> = rows
            .iter()
            .map(|row| row_ids[BasePosition::from_u32(row.position)].as_u32())
            .collect();

        for k in 0..=2_u8 {
            let schedule = reference::Schedule::new(
                rows.clone(),
                FIXTURE_LOD.span.get(),
                FIXTURE_LOD.max_tile_depth,
                k,
            );
            let bound = Bound::new(&atlas, &proof, CutOffset::new(k));
            let view = bound.view(&atlas);

            for source_row in [0_u32, 1, 2, 3, 5, 7, 40] {
                if visible.contains(&source_row) {
                    counts.add(assert_scoped_caps(
                        &atlas,
                        &view,
                        &schedule,
                        source_row,
                        &format!("{name} k={k}"),
                    ));
                }
            }
        }
    }

    let CapCounts {
        bound_caps,
        parted_inputs,
        discriminated,
    } = counts;
    assert!(bound_caps > 0, "no cap in the sweep binds at all");
    assert!(
        parted_inputs > 0,
        "no binding cap in the sweep reaches a partner the two laws deliver at different zooms, \
         so the tie-break's scope-derived input is never exercised ({bound_caps} binding caps)",
    );
    assert_eq!(
        discriminated, 0,
        "a binding cap now turns on the zoom the tie-break reads, which is stronger evidence than \
         this case claims: assert the surviving partner directly instead of counting agreement",
    );
}

/// What one sweep of [`a_scoped_locate_cap_selects_among_authorised_partners`] observed.
#[derive(Debug, Default, Copy, Clone)]
struct CapCounts {
    /// Caps that truncated the ego graph.
    bound_caps: usize,
    /// Caps whose tie-break read a partner zoom the two laws disagree on.
    parted_inputs: usize,
    /// Caps where that disagreement changed which partners survived.
    discriminated: usize,
}

impl CapCounts {
    fn add(&mut self, other: Self) {
        self.bound_caps += other.bound_caps;
        self.parted_inputs += other.parted_inputs;
        self.discriminated += other.discriminated;
    }
}

/// Asserts every binding cap of one scoped source, and counts what the sweep saw.
fn assert_scoped_caps(
    atlas: &Atlas,
    view: &crate::serve::View<'_>,
    schedule: &reference::Schedule,
    source_row: u32,
    at: &str,
) -> CapCounts {
    use crate::serve::locate::LocateLimits;

    let position_of = |row: u32| atlas.positions_of_row()[NodeRowId::from_u32(row)];
    let distance_of = |from: u32, to: u32| {
        let positions = atlas.positions();
        let origin = positions[position_of(from)];
        let point = positions[position_of(to)];
        let (dx, dy) = (point.x() - origin.x(), point.y() - origin.y());
        // The derivation must mirror the selection key bit for bit: a fused mul_add rounds
        // differently and reorders near-ties.
        #[expect(
            clippy::suboptimal_flops,
            reason = "unfused arithmetic mirrors the selection key exactly"
        )]
        (dx * dx + dy * dy).to_bits()
    };
    let corpus_zoom = |row: u32| {
        atlas
            .morton
            .bucket_of(position_of(row))
            .get()
            .saturating_sub(FIXTURE_LOD.span.get())
    };
    let scope_zoom = |row: u32| {
        schedule
            .first_zoom(position_of(row).as_u32())
            .expect("an authorized partner is in the view")
    };
    let partner_of = |edge: &crate::serve::neighbourhood::DeliveredEdge| {
        if edge.source.as_u32() == source_row {
            edge.target.as_u32()
        } else {
            edge.source.as_u32()
        }
    };

    let source = atlas
        .resolve_source(
            view,
            &entity_string_of(u8::try_from(source_row).expect("fixture rows fit u8")),
        )
        .expect("a visible source resolves");
    let full = atlas.locate_subgraph(source, LocateLimits::default(), view);

    let mut counts = CapCounts::default();
    for cap in 0..full.edges.len() {
        let at = format!("{at} ego({source_row}) cap {cap}");
        counts.bound_caps += 1;

        let survivors = |zoom: &dyn Fn(u32) -> u8| {
            let mut ordered = full.edges.clone();
            ordered.sort_unstable_by_key(|&(edge, id)| {
                let partner = partner_of(&edge);
                (distance_of(source_row, partner), zoom(partner), id)
            });
            ordered.truncate(cap);
            ordered.sort_unstable_by_key(|&(_, id)| id);
            ordered
        };

        let subgraph = atlas.locate_subgraph(
            source,
            LocateLimits {
                edges: u32::try_from(cap).expect("fixture edge counts are small"),
                ..LocateLimits::default()
            },
            view,
        );
        assert!(
            !subgraph.complete,
            "{at} does not bind, so it selects nothing",
        );

        let expected = survivors(&scope_zoom);
        assert_eq!(subgraph.edges, expected, "{at} keeps other partners");

        // The delivered nodes are exactly the survivors' partners beside the source.
        let mut expected_rows: Vec<u32> = vec![source_row];
        let mut partners: Vec<u32> = expected
            .iter()
            .map(|&(edge, _)| partner_of(&edge))
            .filter(|&row| row != source_row)
            .collect();
        partners.sort_unstable();
        partners.dedup();
        expected_rows.extend(partners);
        let mut delivered: Vec<u32> = subgraph.rows.iter().map(|row| row.as_u32()).collect();
        delivered.sort_unstable();
        expected_rows.sort_unstable();
        assert_eq!(delivered, expected_rows, "{at} delivers other partners");

        counts.discriminated += usize::from(survivors(&corpus_zoom) != expected);
        counts.parted_inputs += usize::from(full.edges.iter().any(|&(edge, _)| {
            let partner = partner_of(&edge);
            scope_zoom(partner) != corpus_zoom(partner)
        }));
    }

    counts
}

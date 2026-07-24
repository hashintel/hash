//! The restricted-view backfill battery: the selection law replayed against the reference.

use super::*;
use crate::identity::NodeRowId;

/// The restricted-view selection law, written a second time.
///
/// From the card's construction and the independently opened artifacts rather than from
/// `serve::tile`: extents narrow by scanning the raw code column against
/// [`MortonCell::contains`], the schedule rule, the ancestor chain, and the fill order re-derive
/// from the documented law alone. The chain replays every level in full - the production dry
/// short-circuit is absent by design, so agreement across the battery proves that shortcut
/// behaviour-preserving. Agreement freezes the delivered rows, their order, the per-bucket
/// recounts, and the tail length at once.
mod backfill_reference {
    use std::collections::HashSet;

    use crate::{
        file::morton::read::MortonFile,
        identity::{Identity as _, NodeRowId},
        morton::{Depth, MortonCell, MortonKey},
        serve::VisibilityProof,
    };

    /// One delivery as the law states it: positions in wire order plus the head counts.
    pub(super) struct Delivery {
        /// Delivered base positions: the natural segment first, the tail after, order preserved.
        pub positions: Vec<u64>,
        /// The natural segment's per-bucket recounts.
        pub runs: Vec<u64>,
        /// The tail's length.
        pub backfilled: u64,
        /// The schedule's unmasked count: the fill target.
        pub budget: u64,
    }

    /// Returns the cell one tile coordinate addresses.
    pub(super) fn cell(z: u8, x: u32, y: u32) -> MortonCell {
        MortonCell::new(
            Depth::new(z).expect("tile zooms lie within the key width"),
            x,
            y,
        )
        .expect("the sweep stays on each zoom's grid")
    }

    /// The extent's positions inside `bucket`, in base order.
    ///
    /// A whole-segment membership scan: no fencepost run arithmetic and no contiguity
    /// assumption, so the reference cannot inherit a run-derivation defect.
    pub(super) fn extent_positions(morton: &MortonFile, bucket: u8, cell: MortonCell) -> Vec<u64> {
        morton
            .fenceposts()
            .segment(Depth::new(bucket).expect("every bucket index names a valid depth"))
            .filter(|&position| cell.contains(morton.code(position)))
            .collect()
    }

    /// The deepest bucket holding any point.
    fn deepest(morton: &MortonFile) -> u8 {
        let lengths = morton.fenceposts().lengths();
        let last = lengths
            .iter()
            .rposition(|&length| length > 0)
            .expect("the fixture corpus is nonempty");
        u8::try_from(last).expect("bucket indexes fit u8")
    }

    /// One corpus as the reference walks it: extent scans, depth, schedule, and visibility.
    ///
    /// The law's replay below is corpus-agnostic: it reads extents, the deepest bucket, the
    /// schedule's span, and per-position visibility through this surface, so the fixture's
    /// opened artifacts and a plain-columns corpus replay through the same loops.
    pub(super) struct Corpus<P, V> {
        /// Returns the extent's positions inside a bucket, in base order.
        pub positions: P,
        /// The deepest bucket holding any point.
        pub deepest: u8,
        /// The schedule's span exponent.
        pub span: u8,
        /// Returns whether a position's row is visible.
        pub visible: V,
    }

    /// The fixture corpus: independently opened artifacts under a serving-side proof.
    pub(super) fn fixture<'c>(
        morton: &'c MortonFile,
        row_ids: &'c [u32],
        proof: &'c VisibilityProof,
    ) -> Corpus<impl Fn(u8, MortonCell) -> Vec<u64> + 'c, impl Fn(u64) -> bool + 'c> {
        Corpus {
            positions: move |bucket, cell| extent_positions(morton, bucket, cell),
            deepest: deepest(morton),
            span: super::FIXTURE_LOD.span.get(),
            visible: move |position| {
                let index = usize::try_from(position).expect("fixture positions fit usize");
                proof.contains(NodeRowId::from_u32(row_ids[index]))
            },
        }
    }

    /// A plain-columns corpus under a per-row visibility column.
    ///
    /// The mirror of the fixture shape for a corpus that exists only as columns; `span` names
    /// the schedule the corpus was cascaded under.
    pub(super) fn columns<'c>(
        codes: &'c [u64],
        segments: &'c [(usize, usize)],
        rows: &'c [u32],
        span: u8,
        visible: &'c [bool],
    ) -> Corpus<impl Fn(u8, MortonCell) -> Vec<u64> + 'c, impl Fn(u64) -> bool + 'c> {
        let deepest = segments
            .iter()
            .rposition(|&(start, end)| end > start)
            .expect("the corpus is nonempty");
        Corpus {
            positions: move |bucket: u8, cell: MortonCell| {
                let (start, end) = segments[usize::from(bucket)];
                (start..end)
                    .filter(|&position| cell.contains(MortonKey::from_bits(codes[position])))
                    .map(|position| u64::try_from(position).expect("positions fit u64"))
                    .collect()
            },
            deepest: u8::try_from(deepest).expect("bucket indexes fit u8"),
            span,
            visible: move |position| {
                let index = usize::try_from(position).expect("positions fit usize");
                visible[usize::try_from(rows[index]).expect("row ids fit usize")]
            },
        }
    }

    /// Delivers one level per the law: naturals per scheduled bucket, then the fill.
    fn level<P: Fn(u8, MortonCell) -> Vec<u64>, V: Fn(u64) -> bool>(
        corpus: &Corpus<P, V>,
        z: u8,
        x: u32,
        y: u32,
        taken: &mut HashSet<u64>,
    ) -> Delivery {
        let cell = cell(z, x, y);
        let cut = z + corpus.span;
        let first = if z == 0 { 0 } else { cut };

        let mut delivery = Delivery {
            positions: Vec::new(),
            runs: Vec::new(),
            backfilled: 0,
            budget: 0,
        };
        for bucket in first..=cut {
            let candidates = (corpus.positions)(bucket, cell);
            delivery.budget += u64::try_from(candidates.len()).expect("corpus counts fit u64");
            let before = delivery.positions.len();
            for position in candidates {
                if (corpus.visible)(position) && taken.insert(position) {
                    delivery.positions.push(position);
                }
            }
            delivery.runs.push(
                u64::try_from(delivery.positions.len() - before).expect("corpus counts fit u64"),
            );
        }

        let mut count = u64::try_from(delivery.positions.len()).expect("corpus counts fit u64");
        'fill: for bucket in (cut + 1)..=corpus.deepest {
            if count == delivery.budget {
                break;
            }
            for position in (corpus.positions)(bucket, cell) {
                if (corpus.visible)(position) && taken.insert(position) {
                    delivery.positions.push(position);
                    delivery.backfilled += 1;
                    count += 1;
                    if count == delivery.budget {
                        break 'fill;
                    }
                }
            }
        }

        delivery
    }

    /// The delta response: every ancestor replayed top-down, then the level itself.
    ///
    /// Returns the delivery and the chain's whole taken set, the level included.
    pub(super) fn delta<P: Fn(u8, MortonCell) -> Vec<u64>, V: Fn(u64) -> bool>(
        corpus: &Corpus<P, V>,
        z: u8,
        x: u32,
        y: u32,
    ) -> (Delivery, HashSet<u64>) {
        let mut taken = HashSet::new();
        for ancestor in 0..z {
            let shift = z - ancestor;
            // The ancestor's delivery matters only through `taken`.
            level(corpus, ancestor, x >> shift, y >> shift, &mut taken);
        }
        let own = level(corpus, z, x, y, &mut taken);

        (own, taken)
    }

    /// The total response: the cumulative visible schedule, then the chain's pull-ups.
    pub(super) fn total<P: Fn(u8, MortonCell) -> Vec<u64>, V: Fn(u64) -> bool>(
        corpus: &Corpus<P, V>,
        z: u8,
        x: u32,
        y: u32,
    ) -> Delivery {
        let (_, taken) = delta(corpus, z, x, y);

        let cell = cell(z, x, y);
        let cut = z + corpus.span;

        let mut delivery = Delivery {
            positions: Vec::new(),
            runs: Vec::new(),
            backfilled: 0,
            budget: 0,
        };
        // Every visible scheduled point is delivered by its own level of the chain, so the
        // cumulative natural segment is the schedule's visible survivors verbatim.
        for bucket in 0..=cut {
            let candidates = (corpus.positions)(bucket, cell);
            delivery.budget += u64::try_from(candidates.len()).expect("corpus counts fit u64");
            let before = delivery.positions.len();
            for position in candidates {
                if (corpus.visible)(position) {
                    delivery.positions.push(position);
                }
            }
            delivery.runs.push(
                u64::try_from(delivery.positions.len() - before).expect("corpus counts fit u64"),
            );
        }
        // The tail: deeper extent points some level of the chain pulled up, in bucket-major
        // base order.
        for bucket in (cut + 1)..=corpus.deepest {
            for position in (corpus.positions)(bucket, cell) {
                if taken.contains(&position) {
                    delivery.positions.push(position);
                    delivery.backfilled += 1;
                }
            }
        }

        delivery
    }

    /// Replays a root-anchored descent path, returning each coordinate's delta delivery.
    ///
    /// Along a descent path every coordinate's ancestor chain is exactly the path's prefix, so
    /// one shared taken set replays each tile's chain without re-walking it: entry `i` equals
    /// [`delta`] at `path[i]`.
    ///
    /// # Panics
    ///
    /// Panics when the path is not root-anchored or skips a generation.
    pub(super) fn path_deliveries<P: Fn(u8, MortonCell) -> Vec<u64>, V: Fn(u64) -> bool>(
        corpus: &Corpus<P, V>,
        path: &[(u8, u32, u32)],
    ) -> Vec<Delivery> {
        assert_eq!(
            path.first(),
            Some(&(0, 0, 0)),
            "a chain replay is root-anchored"
        );
        for (&(z, x, y), &(below, cx, cy)) in path.iter().zip(&path[1..]) {
            assert!(
                below == z + 1 && cx >> 1 == x && cy >> 1 == y,
                "the path descends one child at a time",
            );
        }

        let mut taken = HashSet::new();
        path.iter()
            .map(|&(z, x, y)| level(corpus, z, x, y, &mut taken))
            .collect()
    }
}

/// Proof shapes that exercise the fill: the operator proof, independent hiding at two rates, the
/// root schedule hidden whole, the densest `z = 1` subtree hidden whole, and near-total hiding.
fn backfill_battery(
    atlas: &Atlas,
    morton: &MortonFile,
    row_ids: &[u32],
) -> Vec<(&'static str, VisibilityProof)> {
    let universe = u32::try_from(row_ids.len()).expect("the fixture universe fits u32");
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x0BAC_F111);
    let row_at = |position: u64| row_ids[usize::try_from(position).expect("positions fit usize")];

    let quarter: Vec<u32> = (0..universe).filter(|_| rng.random_ratio(1, 4)).collect();
    let most: Vec<u32> = (0..universe).filter(|_| rng.random_ratio(4, 5)).collect();

    // The root's whole schedule: every fill starts from a dead standstill.
    let mut scheduled = Vec::new();
    for bucket in 0..=FIXTURE_LOD.span.get() {
        let root = backfill_reference::cell(0, 0, 0);
        scheduled.extend(
            backfill_reference::extent_positions(morton, bucket, root)
                .into_iter()
                .map(row_at),
        );
    }

    // The densest z = 1 subtree, hidden whole: its tiles exhaust, its neighbours fill.
    let densest = (0..2_u32)
        .flat_map(|x| (0..2_u32).map(move |y| (x, y)))
        .max_by_key(|&(x, y)| {
            (0..=32_u8)
                .map(|bucket| {
                    backfill_reference::extent_positions(
                        morton,
                        bucket,
                        backfill_reference::cell(1, x, y),
                    )
                    .len()
                })
                .sum::<usize>()
        })
        .expect("the z = 1 grid is nonempty");
    let subtree: Vec<u32> = (0..=32_u8)
        .flat_map(|bucket| {
            backfill_reference::extent_positions(
                morton,
                bucket,
                backfill_reference::cell(1, densest.0, densest.1),
            )
        })
        .map(row_at)
        .collect();

    let sparse: Vec<u32> = (0..universe)
        .filter(|&row| !row.is_multiple_of(16))
        .collect();

    vec![
        ("operator", VisibilityProof::full_visibility()),
        ("quarter-hidden", mask_hiding(atlas, &quarter)),
        ("most-hidden", mask_hiding(atlas, &most)),
        ("schedule-hidden", mask_hiding(atlas, &scheduled)),
        ("subtree-hidden", mask_hiding(atlas, &subtree)),
        ("three-visible", mask_hiding(atlas, &sparse)),
    ]
}

/// The base-position map of the delivered wire ids, decode-verified.
fn delivered_positions(
    bytes: &[u8],
    node_codec: &codec::RowCodec<NodeRowId>,
    position_of: &HashMap<u32, u64>,
) -> Vec<u64> {
    decode_rows(section(bytes, ROW_IDS).expect("ROW_IDS is present"))
        .iter()
        .map(|&wire| {
            let row = node_codec
                .decode(codec::WireRow::pinned(wire))
                .expect("delivered wire ids decode");
            position_of[&row.u32()]
        })
        .collect()
}

/// The two expressions of the selection law agree on every delivery.
///
/// The wire response against the spec reference, per proof shape, per coordinate of every zoom,
/// in both modes: the delivered wire ids in order, the per-bucket recounts, the tail length, and
/// the HEAD's delivered count are one assertion each. The reference replays the whole chain, so
/// every agreement under an exhausting mask also certifies the production dry short-circuit.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn masked_delivery_agrees_with_the_selection_reference() {
    let (generation, atlas) = publish("backfill-reference").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = artifacts
        .rows
        .u32_elements()
        .expect("the row column is u32");
    let node_codec = test_codec(&atlas);

    for (name, proof) in backfill_battery(&atlas, &artifacts.morton, row_ids) {
        let corpus = backfill_reference::fixture(&artifacts.morton, row_ids, &proof);
        for z in 0..=FIXTURE_LOD.max_tile_depth {
            let cells = 1_u32 << z;
            for (x, y) in (0..cells).flat_map(|x| (0..cells).map(move |y| (x, y))) {
                for mode in [Mode::Delta, Mode::Total] {
                    let bytes = atlas
                        .tile(&request(z, x, y, mode), TileLimits::default(), &proof)
                        .expect("the masked tile serves");
                    let rows = decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));
                    let (delivered, runs, backfilled) =
                        head_counts(section(&bytes, HEAD).expect("HEAD is present"));

                    let expected = match mode {
                        Mode::Delta => backfill_reference::delta(&corpus, z, x, y).0,
                        Mode::Total => backfill_reference::total(&corpus, z, x, y),
                    };
                    let expected_rows: Vec<u32> = expected
                        .positions
                        .iter()
                        .map(|&position| {
                            let index =
                                usize::try_from(position).expect("fixture positions fit usize");
                            node_codec.encode(NodeRowId::from_u32(row_ids[index])).get()
                        })
                        .collect();

                    let at = format!("{name}: the {mode:?} tile {z}/{x}/{y}");
                    assert_eq!(rows, expected_rows, "{at} delivers the law's rows in order");
                    assert_eq!(runs, expected.runs, "{at} recounts the law's runs");
                    assert_eq!(backfilled, expected.backfilled, "{at} sizes the law's tail");
                    assert_eq!(
                        usize::try_from(delivered).expect("fixture counts fit usize"),
                        rows.len(),
                        "{at} heads its own count",
                    );
                }
            }
        }
    }
}

/// A fill that stops short certifies exhaustion: the strong form of saturation.
///
/// Wherever a masked delta delivers fewer points than its schedule's budget, every visible
/// position of the whole extent is accounted for by the chain through that tile - the fill never
/// under-delivers while visible candidates remain. The chain derives from the wire itself and
/// the pool from the raw code column, so the certificate is independent of both expressions of
/// the selection law. The battery must reach the short-fill regime for the pin to bind, and the
/// sweep asserts that it does.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn a_short_fill_certifies_the_extent_exhausted() {
    let (generation, atlas) = publish("backfill-exhaustion").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = artifacts
        .rows
        .u32_elements()
        .expect("the row column is u32");
    let node_codec = test_codec(&atlas);
    let position_of: HashMap<u32, u64> = row_ids
        .iter()
        .enumerate()
        .map(|(position, &row)| {
            (
                row,
                u64::try_from(position).expect("fixture positions fit u64"),
            )
        })
        .collect();

    let mut shorts = 0_u32;
    for (name, proof) in backfill_battery(&atlas, &artifacts.morton, row_ids) {
        let visible = |position: u64| {
            let index = usize::try_from(position).expect("fixture positions fit usize");
            proof.contains(NodeRowId::from_u32(row_ids[index]))
        };

        // Wire-derived chain state: the z-ascending sweep guarantees every ancestor's delta is
        // present when its descendants read it.
        let mut deltas: HashMap<(u8, u32, u32), Vec<u64>> = HashMap::new();
        for z in 0..=FIXTURE_LOD.max_tile_depth {
            let cells = 1_u32 << z;
            for (x, y) in (0..cells).flat_map(|x| (0..cells).map(move |y| (x, y))) {
                let bytes = atlas
                    .tile(
                        &request(z, x, y, Mode::Delta),
                        TileLimits::default(),
                        &proof,
                    )
                    .expect("the masked tile serves");
                let positions = delivered_positions(&bytes, &node_codec, &position_of);

                let cell = backfill_reference::cell(z, x, y);
                let span = FIXTURE_LOD.span.get();
                let scheduled = if z == 0 {
                    0..=span
                } else {
                    (z + span)..=(z + span)
                };
                let budget: usize = scheduled
                    .map(|bucket| {
                        backfill_reference::extent_positions(&artifacts.morton, bucket, cell).len()
                    })
                    .sum();

                if positions.len() < budget {
                    shorts += 1;
                    let taken: HashSet<u64> = (0..z)
                        .flat_map(|level| {
                            let shift = z - level;
                            deltas[&(level, x >> shift, y >> shift)].iter().copied()
                        })
                        .chain(positions.iter().copied())
                        .collect();
                    for bucket in 0..=32_u8 {
                        for position in
                            backfill_reference::extent_positions(&artifacts.morton, bucket, cell)
                        {
                            assert!(
                                !visible(position) || taken.contains(&position),
                                "{name}: the short {z}/{x}/{y} leaves position {position} visible \
                                 and undelivered",
                            );
                        }
                    }
                }

                deltas.insert((z, x, y), positions);
            }
        }
    }

    assert!(shorts > 0, "the battery reaches the short-fill regime");
}

/// The fill saturates at the boundary, and a partial fill is a base-order prefix.
///
/// At the root, proofs sized one below, at, and one above the schedule's budget pin
/// `delivered = min(budget, pool)` at the boundary, and the surviving candidate order pins the
/// morton tie-break: the one undelivered candidate at `budget + 1` is exactly the base-order
/// last.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn the_fill_saturates_at_the_boundary_in_base_order() {
    let (generation, atlas) = publish("backfill-boundary").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = artifacts
        .rows
        .u32_elements()
        .expect("the row column is u32");
    let node_codec = test_codec(&atlas);
    let position_of: HashMap<u32, u64> = row_ids
        .iter()
        .enumerate()
        .map(|(position, &row)| {
            (
                row,
                u64::try_from(position).expect("fixture positions fit u64"),
            )
        })
        .collect();
    let row_at = |position: u64| row_ids[usize::try_from(position).expect("positions fit usize")];

    // The root's candidates in bucket-major base order, and its schedule's budget.
    let root = backfill_reference::cell(0, 0, 0);
    let candidates: Vec<u64> = (0..=32_u8)
        .flat_map(|bucket| backfill_reference::extent_positions(&artifacts.morton, bucket, root))
        .collect();
    let budget: usize = (0..=FIXTURE_LOD.span.get())
        .map(|bucket| backfill_reference::extent_positions(&artifacts.morton, bucket, root).len())
        .sum();
    assert!(
        budget < candidates.len() - budget,
        "the fixture's deep pool covers the boundary sweep",
    );

    for excess in [-1_i64, 0, 1] {
        let pool = usize::try_from(i64::try_from(budget).expect("budgets fit i64") + excess)
            .expect("the boundary sizes are positive");
        // The deep end of the base order: the schedule is hidden whole, so the delivery is all
        // fill and the fill order is nakedly observable.
        let visible = &candidates[candidates.len() - pool..];
        let visible_rows: HashSet<u32> = visible.iter().map(|&position| row_at(position)).collect();
        let hidden: Vec<u32> = row_ids
            .iter()
            .copied()
            .filter(|row| !visible_rows.contains(row))
            .collect();
        let proof = mask_hiding(&atlas, &hidden);

        let bytes = atlas
            .tile(
                &request(0, 0, 0, Mode::Delta),
                TileLimits::default(),
                &proof,
            )
            .expect("the masked root serves");
        let positions = delivered_positions(&bytes, &node_codec, &position_of);

        let expected: Vec<u64> = visible[..budget.min(pool)].to_vec();
        assert_eq!(
            positions, expected,
            "a pool of budget {excess:+} delivers min(budget, pool) in base order",
        );
        if excess == 1 {
            assert!(
                !positions.contains(visible.last().expect("the pool is nonempty")),
                "the one undelivered candidate is the base-order last",
            );
        }
    }
}

/// The delivered count is a function of the masked view alone.
///
/// Across the whole battery and every tile, the count law
/// `delivered = min(budget, |visible ∩ extent| - |chain takes|)` holds with the chain read off
/// the wire: the budget is the schedule's public count and the pool is the raw code column's
/// visible extent, so the cardinality discloses nothing a masked view does not already imply.
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn delivered_count_is_a_function_of_the_masked_view_alone() {
    let (generation, atlas) = publish("backfill-count-law").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = artifacts
        .rows
        .u32_elements()
        .expect("the row column is u32");
    let node_codec = test_codec(&atlas);
    let position_of: HashMap<u32, u64> = row_ids
        .iter()
        .enumerate()
        .map(|(position, &row)| {
            (
                row,
                u64::try_from(position).expect("fixture positions fit u64"),
            )
        })
        .collect();

    // The count law across the battery: every tile, chain read off the wire.
    for (name, proof) in backfill_battery(&atlas, &artifacts.morton, row_ids) {
        let mut deltas: HashMap<(u8, u32, u32), Vec<u64>> = HashMap::new();
        for z in 0..=FIXTURE_LOD.max_tile_depth {
            let cells = 1_u32 << z;
            for (x, y) in (0..cells).flat_map(|x| (0..cells).map(move |y| (x, y))) {
                let bytes = atlas
                    .tile(
                        &request(z, x, y, Mode::Delta),
                        TileLimits::default(),
                        &proof,
                    )
                    .expect("the masked tile serves");
                let positions = delivered_positions(&bytes, &node_codec, &position_of);

                let cell = backfill_reference::cell(z, x, y);
                let span = FIXTURE_LOD.span.get();
                let scheduled = if z == 0 {
                    0..=span
                } else {
                    (z + span)..=(z + span)
                };
                let budget: usize = scheduled
                    .map(|bucket| {
                        backfill_reference::extent_positions(&artifacts.morton, bucket, cell).len()
                    })
                    .sum();

                let chain: HashSet<u64> = (0..z)
                    .flat_map(|level| {
                        let shift = z - level;
                        deltas[&(level, x >> shift, y >> shift)].iter().copied()
                    })
                    .collect();
                let pool = (0..=32_u8)
                    .flat_map(|bucket| {
                        backfill_reference::extent_positions(&artifacts.morton, bucket, cell)
                    })
                    .filter(|&position| {
                        let index = usize::try_from(position).expect("positions fit usize");
                        proof.contains(NodeRowId::from_u32(row_ids[index]))
                            && !chain.contains(&position)
                    })
                    .count();

                assert_eq!(
                    positions.len(),
                    budget.min(pool),
                    "{name}: the {z}/{x}/{y} count is min(budget, pool) - a function of the \
                     masked view alone",
                );

                deltas.insert((z, x, y), positions);
            }
        }
    }
}

/// The wire and the walk instrument agree across the battery.
///
/// `WalkBench::from_parts` rebuilds the walk instrument over the fixture's independently opened
/// artifacts, so a delta tile's wire rows and the instrument's chained walk are the two
/// implementations crossing on one corpus: a disagreement is a walk defect on one side or
/// artifact plumbing, never corpus mismatch. Rows must match in order; the head's counts must
/// match the instrument's selection.
#[cfg(feature = "bench")]
#[tokio::test]
#[cfg_attr(miri, ignore = "the search backend maps LMDB files through FFI")]
async fn masked_delivery_agrees_with_the_walk_instrument() {
    use crate::salt::lod::bench::WalkBench;

    let (generation, atlas) = publish("backfill-crossing").await;
    let artifacts = open_artifacts(&generation);
    let row_ids = artifacts
        .rows
        .u32_elements()
        .expect("the row column is u32");
    let node_codec = test_codec(&atlas);

    let code_bits: Vec<u64> = (0..u64::try_from(row_ids.len()).expect("fixture counts fit u64"))
        .map(|position| artifacts.morton.code(position).to_bits())
        .collect();
    let lengths = artifacts.morton.fenceposts().lengths();
    let mut bench = WalkBench::from_parts(
        &code_bits,
        &lengths,
        row_ids.to_vec(),
        FIXTURE_LOD.span.get(),
        FIXTURE_LOD.max_tile_depth,
    );

    let universe = u32::try_from(row_ids.len()).expect("the fixture universe fits u32");
    for (name, proof) in backfill_battery(&atlas, &artifacts.morton, row_ids) {
        bench.mask_rows((0..universe).filter(|&row| proof.contains(NodeRowId::from_u32(row))));
        for z in 0..=FIXTURE_LOD.max_tile_depth {
            let cells = 1_u32 << z;
            for (x, y) in (0..cells).flat_map(|x| (0..cells).map(move |y| (x, y))) {
                let bytes = atlas
                    .tile(
                        &request(z, x, y, Mode::Delta),
                        TileLimits::default(),
                        &proof,
                    )
                    .expect("the masked tile serves");
                let rows = decode_rows(section(&bytes, ROW_IDS).expect("ROW_IDS is present"));
                let (delivered, _, backfilled) =
                    head_counts(section(&bytes, HEAD).expect("HEAD is present"));

                let walked: Vec<u32> = bench
                    .chained_delivery(z, x, y)
                    .iter()
                    .map(|&position| {
                        let index = usize::try_from(position).expect("positions fit usize");
                        node_codec.encode(NodeRowId::from_u32(row_ids[index])).get()
                    })
                    .collect();
                let selection = bench.chained(z, x, y);

                let at = format!("{name}: the delta tile {z}/{x}/{y}");
                assert_eq!(rows, walked, "{at} delivers the instrument's rows in order");
                assert_eq!(
                    usize::try_from(delivered).expect("fixture counts fit usize"),
                    selection.natural + selection.tail,
                    "{at} heads the instrument's count",
                );
                assert_eq!(
                    usize::try_from(backfilled).expect("fixture counts fit usize"),
                    selection.tail,
                    "{at} sizes the instrument's tail",
                );
            }
        }
    }
}

/// The reference and the walk instrument agree on the synthetic corpus at scale.
///
/// The 48-node fixture pins the law where extents are enumerable by hand; the clustered
/// synthetic corpus pins it at depth. The law's replay visits the instrument's own corpus
/// through its exported columns - the crossing in the opposite direction from the wire
/// comparison - along the densest descent path, under the operator view, independent hiding,
/// and a subtree on the path hidden whole. The sweep must reach the fill and the short-fill
/// regimes for the pin to bind, and it asserts that it does.
#[cfg(feature = "bench")]
#[test]
fn the_selection_reference_agrees_with_the_walk_instrument_at_scale() {
    use crate::{morton::MortonKey, salt::lod::bench::WalkBench};

    let mut bench = WalkBench::build(300_000, 0x0BAC_F111);
    let (code_bits, rows, segments) = bench.columns();
    let span = LodConfig::default().span.get();
    let points = bench.points();

    let path = bench.descent();
    assert!(
        path.len() > 10,
        "the clustered corpus descends past zoom 10"
    );
    let (depth, x, y) = path[5];
    assert_eq!(depth, 5, "the path's sixth entry sits at zoom 5");

    let everyone = vec![true; points];
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x0BAC_F111);
    let independent: Vec<bool> = core::iter::repeat_with(|| rng.random_ratio(3, 5))
        .take(points)
        .collect();
    let hidden = backfill_reference::cell(5, x, y);
    let mut subtree = vec![true; points];
    for (position, &bits) in code_bits.iter().enumerate() {
        if hidden.contains(MortonKey::from_bits(bits)) {
            subtree[usize::try_from(rows[position]).expect("row ids fit usize")] = false;
        }
    }

    let masks: [(&str, &[bool]); 3] = [
        ("operator", &everyone),
        ("independent-hiding", &independent),
        ("subtree-hidden", &subtree),
    ];

    let mut backfills = 0_u64;
    let mut shorts = 0_u32;
    for (name, visible) in masks {
        bench.mask_rows(
            visible
                .iter()
                .enumerate()
                .filter(|&(_, &visible)| visible)
                .map(|(row, _)| u32::try_from(row).expect("the corpus fits the u32 row domain")),
        );
        let corpus = backfill_reference::columns(&code_bits, &segments, &rows, span, visible);

        let deliveries = backfill_reference::path_deliveries(&corpus, &path);
        for (&(z, x, y), delivery) in path.iter().zip(&deliveries) {
            let walked: Vec<u64> = bench
                .chained_delivery(z, x, y)
                .iter()
                .map(|&position| u64::from(position))
                .collect();
            let selection = bench.chained(z, x, y);

            let at = format!("{name}: the tile {z}/{x}/{y}");
            assert_eq!(
                delivery.positions, walked,
                "{at} delivers the law's positions in order",
            );
            assert_eq!(
                delivery.budget,
                u64::try_from(selection.budget).expect("corpus counts fit u64"),
                "{at} agrees on the budget",
            );
            assert_eq!(
                delivery.backfilled,
                u64::try_from(selection.tail).expect("corpus counts fit u64"),
                "{at} sizes the tail alike",
            );

            backfills += delivery.backfilled;
            let delivered = u64::try_from(delivery.positions.len()).expect("corpus counts fit u64");
            shorts += u32::from(delivered < delivery.budget);
        }
    }
    assert!(backfills > 0, "the sweep reaches the fill regime");
    assert!(shorts > 0, "the sweep reaches the short-fill regime");
}

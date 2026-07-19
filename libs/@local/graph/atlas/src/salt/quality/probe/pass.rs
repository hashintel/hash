//! The probe's ranking passes: per-anchor workers over shared inputs.
//!
//! Both passes rank anchors independently and in parallel under one
//! total order - distances by [`f32::total_cmp`], ties by ascending
//! row - and return per-anchor aggregate cells cloned from a
//! prevalidated template. The corpus pass counts ranks against
//! bounded threshold sets, so its per-thread memory follows the search
//! depth, never the corpus; the sampled pass sorts whole comparison
//! universes, whose size the probe design bounds.

// PERF: at the default search depth (K = 50) the linear threshold-
// counting loops in `corpus_anchor` cost cycles comparable to the
// 512-component distance kernel itself, so the corpus pass is
// plausibly 30-40% scalar counting. If the suite's runtime ever
// matters, the fix is algorithmic before it is SIMD: sort the K
// thresholds once per anchor, binary-search each candidate's
// insertion point (log K compares instead of K), and suffix-sum a
// small histogram into the per-threshold counts - exact, and cheaper
// than vectorizing compares whose order is lexicographic
// (distance, row) rather than a plain float compare. Measure at live
// shape (1M rows x 256 anchors) before acting.
#![expect(
    clippy::cast_possible_truncation,
    reason = "the corpus row domain is checked against the crate's u32 row encoding at probe entry"
)]
#![expect(
    clippy::min_ident_chars,
    reason = "k is the canonical neighbourhood-size name across the metric literature"
)]

use alloc::collections::BinaryHeap;
use core::{cmp::Ordering, num::NonZero};

use rayon::prelude::*;

use super::{
    super::metric::{NeighbourhoodAggregate, RankScratch, TripletAggregate},
    RadiusPair, SpacePair,
};
use crate::{
    bitset::BitSet,
    dataset::{CANONICAL_DIMENSIONS, PROJECTOR_DIMENSIONS},
    math::{AlignedVecN, BoxedVecN, Vec2},
};

/// Runs the corpus pass: every anchor against every non-anchor row.
///
/// Returns each anchor's aggregate cells and its neighbourhood radii,
/// one of each per neighbourhood size.
pub(super) fn corpus_pass(
    representations: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    coordinates: &[Vec2],
    anchor_mask: &BitSet,
    anchor_rows: &[usize],
    search: usize,
    template: &[NeighbourhoodAggregate],
    neighbourhoods: &[NonZero<usize>],
) -> (Vec<Vec<NeighbourhoodAggregate>>, Vec<Vec<RadiusPair>>) {
    anchor_rows
        .par_iter()
        .map_init(CorpusScratch::default, |scratch, &anchor| {
            corpus_anchor(
                representations,
                coordinates,
                anchor_mask,
                anchor,
                search,
                template,
                neighbourhoods,
                scratch,
            )
        })
        .collect()
}

/// Runs the sampled pass: every anchor against the comparison rows in
/// all three spaces.
///
/// Returns each anchor's aggregate cells per space pair and its
/// triplet readings over the shared `pairs`, in the same pair order:
/// map-representation, map-canonical, representation-canonical.
#[expect(
    clippy::too_many_arguments,
    reason = "the pass driver binds the shared inputs once each"
)]
pub(super) fn sampled_pass(
    representations: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    coordinates: &[Vec2],
    anchor_canonical: &[BoxedVecN<CANONICAL_DIMENSIONS>],
    comparison_canonical: &[BoxedVecN<CANONICAL_DIMENSIONS>],
    anchor_rows: &[usize],
    comparison_rows: &[usize],
    template: &[NeighbourhoodAggregate],
    pairs: &[[u32; 2]],
) -> (
    Vec<[Vec<NeighbourhoodAggregate>; SpacePair::COUNT]>,
    Vec<[TripletAggregate; SpacePair::COUNT]>,
) {
    anchor_rows
        .par_iter()
        .enumerate()
        .map_init(
            || SampledScratch::new(comparison_rows.len()),
            |scratch, (index, &anchor)| {
                sampled_anchor(
                    representations,
                    coordinates,
                    &anchor_canonical[index],
                    comparison_canonical,
                    comparison_rows,
                    anchor,
                    template,
                    pairs,
                    scratch,
                )
            },
        )
        .collect()
}

/// One ranked row under the probe's total order.
///
/// Distances order by [`f32::total_cmp`] and ties resolve by ascending
/// row, so equal distances rank in one order in every pass.
#[derive(Debug, Copy, Clone)]
struct Ranked {
    distance: f32,
    row: u32,
}

impl PartialEq for Ranked {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}

impl Eq for Ranked {}

impl PartialOrd for Ranked {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Ranked {
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        self.distance
            .total_cmp(&other.distance)
            .then_with(|| self.row.cmp(&other.row))
    }
}

/// Offers `candidate` to a max-heap keeping the `bound` least entries.
fn push_bounded(heap: &mut BinaryHeap<Ranked>, candidate: Ranked, bound: usize) {
    if heap.len() < bound {
        heap.push(candidate);
        return;
    }

    let Some(mut farthest) = heap.peek_mut() else {
        return;
    };
    if candidate < *farthest {
        // `PeekMut` sifts the replacement into place on drop.
        *farthest = candidate;
    }
}

/// Reusable per-thread buffers for the corpus pass, each bounded by the
/// search depth.
#[derive(Default)]
struct CorpusScratch {
    heap: BinaryHeap<Ranked>,
    map_nearest: Vec<Ranked>,
    reference_nearest: Vec<Ranked>,
    thresholds: Vec<Ranked>,
    counts: Vec<u32>,
    reference_ranks: Vec<u32>,
}

impl CorpusScratch {
    /// Empties the heap into `into`, sorted nearest-first.
    fn drain_sorted(heap: &mut BinaryHeap<Ranked>, into: &mut Vec<Ranked>) {
        into.clear();
        into.extend(heap.drain());
        into.sort_unstable();
    }
}

/// Ranks one anchor against every non-anchor row in both corpus spaces.
///
/// The rank of a neighbour is the count of universe rows strictly
/// nearer under the total order, accumulated against the opposite
/// space's nearest `search` rows during each scan; the representation
/// matrix is scanned once and the coordinate frame twice.
#[expect(
    clippy::too_many_arguments,
    reason = "the per-anchor worker binds the pass's shared inputs once each"
)]
fn corpus_anchor(
    representations: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    coordinates: &[Vec2],
    anchor_mask: &BitSet,
    anchor: usize,
    search: usize,
    template: &[NeighbourhoodAggregate],
    neighbourhoods: &[NonZero<usize>],
    scratch: &mut CorpusScratch,
) -> (Vec<NeighbourhoodAggregate>, Vec<RadiusPair>) {
    let anchor_point = coordinates[anchor];
    let anchor_embedding = &representations[anchor];

    // The map's nearest rows, from the first coordinate scan.
    scratch.heap.clear();
    for (row, &point) in coordinates.iter().enumerate() {
        if anchor_mask.contains(row) {
            continue;
        }
        let candidate = Ranked {
            distance: anchor_point.distance_squared(point),
            row: row as u32,
        };

        push_bounded(&mut scratch.heap, candidate, search);
    }
    CorpusScratch::drain_sorted(&mut scratch.heap, &mut scratch.map_nearest);

    // Representation scan: the reference nearest rows, and each map
    // neighbour's reference rank counted against its distance.
    scratch.thresholds.clear();
    scratch
        .thresholds
        .extend(scratch.map_nearest.iter().map(|member| Ranked {
            distance: anchor_embedding.cosine_distance(&representations[member.row as usize]),
            row: member.row,
        }));
    scratch.counts.clear();
    scratch.counts.resize(scratch.thresholds.len(), 0);

    for (row, embedding) in representations.iter().enumerate() {
        if anchor_mask.contains(row) {
            continue;
        }

        let candidate = Ranked {
            distance: anchor_embedding.cosine_distance(embedding),
            row: row as u32,
        };

        for (threshold, count) in scratch.thresholds.iter().zip(&mut scratch.counts) {
            if candidate < *threshold {
                *count += 1;
            }
        }

        push_bounded(&mut scratch.heap, candidate, search);
    }
    CorpusScratch::drain_sorted(&mut scratch.heap, &mut scratch.reference_nearest);
    scratch.reference_ranks.clear();
    scratch.reference_ranks.extend_from_slice(&scratch.counts);

    // Second coordinate scan: each reference neighbour's map rank.
    scratch.thresholds.clear();
    scratch
        .thresholds
        .extend(scratch.reference_nearest.iter().map(|member| Ranked {
            distance: anchor_point.distance_squared(coordinates[member.row as usize]),
            row: member.row,
        }));
    scratch.counts.clear();
    scratch.counts.resize(scratch.thresholds.len(), 0);

    for (row, &point) in coordinates.iter().enumerate() {
        if anchor_mask.contains(row) {
            continue;
        }

        let candidate = Ranked {
            distance: anchor_point.distance_squared(point),
            row: row as u32,
        };

        for (threshold, count) in scratch.thresholds.iter().zip(&mut scratch.counts) {
            if candidate < *threshold {
                *count += 1;
            }
        }
    }

    let mut cells = template.to_vec();
    let mut radii = Vec::with_capacity(neighbourhoods.len());
    for (aggregate, &k) in cells.iter_mut().zip(neighbourhoods) {
        aggregate.observe_ranks(
            &scratch.reference_ranks[..k.get()],
            &scratch.counts[..k.get()],
        );
        radii.push(RadiusPair {
            // The map scans rank by squared distance; the radius is
            // the distance itself.
            map: scratch.map_nearest[k.get() - 1].distance.sqrt(),
            representation: scratch.reference_nearest[k.get() - 1].distance,
        });
    }
    (cells, radii)
}

/// Reusable per-thread buffers for the sampled pass, each sized by the
/// comparison universe.
struct SampledScratch {
    map_distances: Vec<f32>,
    representation_distances: Vec<f32>,
    canonical_distances: Vec<f32>,
    map_order: Vec<u32>,
    representation_order: Vec<u32>,
    canonical_order: Vec<u32>,
    ranks: RankScratch,
}

impl SampledScratch {
    fn new(comparisons: usize) -> Self {
        Self {
            map_distances: Vec::with_capacity(comparisons),
            representation_distances: Vec::with_capacity(comparisons),
            canonical_distances: Vec::with_capacity(comparisons),
            map_order: Vec::with_capacity(comparisons),
            representation_order: Vec::with_capacity(comparisons),
            canonical_order: Vec::with_capacity(comparisons),
            ranks: RankScratch::new(comparisons),
        }
    }
}

/// Sorts universe indices nearest-first, ties by ascending row.
fn order_into(order: &mut Vec<u32>, distances: &[f32], rows: &[usize]) {
    order.clear();
    order.extend(0..distances.len() as u32);
    order.sort_unstable_by(|&one, &other| {
        distances[one as usize]
            .total_cmp(&distances[other as usize])
            .then_with(|| rows[one as usize].cmp(&rows[other as usize]))
    });
}

/// Ranks one anchor's comparison universe in all three spaces and reads
/// the three space pairs.
#[expect(
    clippy::too_many_arguments,
    reason = "the per-anchor worker binds the pass's shared inputs once each"
)]
fn sampled_anchor(
    representations: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    coordinates: &[Vec2],
    anchor_canonical: &BoxedVecN<CANONICAL_DIMENSIONS>,
    comparison_canonical: &[BoxedVecN<CANONICAL_DIMENSIONS>],
    comparison_rows: &[usize],
    anchor: usize,
    template: &[NeighbourhoodAggregate],
    pairs: &[[u32; 2]],
    scratch: &mut SampledScratch,
) -> (
    [Vec<NeighbourhoodAggregate>; SpacePair::COUNT],
    [TripletAggregate; SpacePair::COUNT],
) {
    let anchor_point = coordinates[anchor];
    let anchor_embedding = &representations[anchor];
    let SampledScratch {
        map_distances,
        representation_distances,
        canonical_distances,
        map_order,
        representation_order,
        canonical_order,
        ranks,
    } = scratch;

    map_distances.clear();
    representation_distances.clear();
    canonical_distances.clear();
    for (index, &row) in comparison_rows.iter().enumerate() {
        map_distances.push(anchor_point.distance_squared(coordinates[row]));
        representation_distances.push(anchor_embedding.cosine_distance(&representations[row]));
        canonical_distances.push(anchor_canonical.cosine_distance(&comparison_canonical[index]));
    }

    order_into(map_order, map_distances, comparison_rows);
    order_into(
        representation_order,
        representation_distances,
        comparison_rows,
    );
    order_into(canonical_order, canonical_distances, comparison_rows);

    let mut observed = |by_reference: &[u32], by_map: &[u32]| {
        let mut cells = template.to_vec();
        for aggregate in &mut cells {
            aggregate.observe(by_reference, by_map, ranks);
        }
        cells
    };

    let map_representation = observed(representation_order, map_order);
    let map_canonical = observed(canonical_order, map_order);
    let representation_canonical = observed(canonical_order, representation_order);

    // Triplet verdicts: whether each space orders the pair's two
    // points the same way from this anchor, under the shared
    // (distance, row) total order. Distinct rows leave no ties.
    let mut triplets = [TripletAggregate::default(); SpacePair::COUNT];
    for &[first, second] in pairs {
        let nearer_first = |distances: &[f32]| {
            distances[first as usize]
                .total_cmp(&distances[second as usize])
                .then_with(|| {
                    comparison_rows[first as usize].cmp(&comparison_rows[second as usize])
                })
                .is_lt()
        };
        let map = nearer_first(map_distances);
        let representation = nearer_first(representation_distances);
        let canonical = nearer_first(canonical_distances);

        triplets[SpacePair::MapRepresentation as usize].observe(map == representation);
        triplets[SpacePair::MapCanonical as usize].observe(map == canonical);
        triplets[SpacePair::RepresentationCanonical as usize].observe(representation == canonical);
    }

    let mut cells: [Vec<NeighbourhoodAggregate>; SpacePair::COUNT] = Default::default();
    cells[SpacePair::MapRepresentation as usize] = map_representation;
    cells[SpacePair::MapCanonical as usize] = map_canonical;
    cells[SpacePair::RepresentationCanonical as usize] = representation_canonical;

    (cells, triplets)
}

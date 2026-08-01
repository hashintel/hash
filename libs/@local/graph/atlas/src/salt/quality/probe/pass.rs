//! Per-anchor ranking workers over the probe's shared inputs.
//!
//! Each pass is a context binding its shared inputs once; running one ranks the anchors
//! independently and in parallel under one total order - distances by [`f32::total_cmp`], ties by
//! ascending row - and yields per-anchor cells cloned from a prevalidated template. The corpus pass
//! counts ranks against bounded threshold sets, so its per-thread memory follows the search depth,
//! never the corpus; the sampled pass sorts whole comparison universes, whose size the probe design
//! bounds.
#![expect(
    clippy::cast_possible_truncation,
    reason = "the corpus row domain is checked against the crate's u32 row encoding at probe entry"
)]
#![expect(
    clippy::min_ident_chars,
    reason = "k is the canonical neighbourhood-size name across the metric literature"
)]

// PERF: at the default search depth (K = 50) the linear threshold-
// counting loops in the corpus pass cost cycles comparable to the
// 512-component distance kernel itself. The corpus pass is then
// plausibly 30-40% scalar counting. If the suite's runtime ever
// matters, the algorithmic fix comes before SIMD. Sort the K
// thresholds once per anchor. Then binary-search each candidate's
// insertion point for log K compares instead of K and suffix-sum a
// small histogram into the per-threshold counts. That stays exact and
// costs less than vectorizing compares whose order is lexicographic
// over distance and row rather than a plain float compare. Measure at
// live shape (1M rows x 256 anchors) before acting.

use alloc::collections::BinaryHeap;
use core::{cmp::Ordering, num::NonZero};
use std::alloc::Allocator;

use hashql_core::{
    heap::{ResetAllocator as _, Scratch},
    id::{Id, IdSlice, bit_vec::DenseBitSet},
};
use rayon::iter::{IndexedParallelIterator as _, IntoParallelRefIterator as _, ParallelIterator};

use super::{
    super::{
        clump::{ClumpAggregate, Clumps},
        metric::{NeighbourhoodAggregate, RankScratch, TripletAggregate},
    },
    RadiusPair, SpacePair,
    readings::SpacePairArray,
};
use crate::{
    dataset::{CANONICAL_DIMENSIONS, PROJECTOR_DIMENSIONS},
    identity::NodeRowId,
    math::{AlignedVecN, BoxedVecN, Vec2},
};

/// One ranked row under the probe's total order.
///
/// Distances order by [`f32::total_cmp`] and ties resolve by ascending row, so equal distances rank
/// in one order in every pass.
#[derive(Debug, Copy, Clone)]
struct Ranked<N> {
    row: N,
    distance: f32,
}

impl<N> PartialEq for Ranked<N>
where
    N: Id,
{
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}

impl<N> Eq for Ranked<N> where N: Id {}

impl<N> PartialOrd for Ranked<N>
where
    N: Id,
{
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<N> Ord for Ranked<N>
where
    N: Id,
{
    #[inline]
    fn cmp(&self, other: &Self) -> Ordering {
        self.distance
            .total_cmp(&other.distance)
            .then_with(|| self.row.cmp(&other.row))
    }
}

/// Offers `candidate` to a max-heap keeping the `bound` least entries.
fn push_bounded<N, A: Allocator>(
    heap: &mut BinaryHeap<Ranked<N>, A>,
    candidate: Ranked<N>,
    bound: usize,
) where
    N: Id,
{
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

/// Sorts universe indices nearest-first, ties by ascending row.
fn order_into<A: Allocator>(order: &mut Vec<u32, A>, distances: &[f32], rows: &[NodeRowId]) {
    order.clear();
    order.extend(0..distances.len() as u32);
    order.sort_unstable_by(|&one, &other| {
        distances[one as usize]
            .total_cmp(&distances[other as usize])
            .then_with(|| rows[one as usize].cmp(&rows[other as usize]))
    });
}

/// One anchor's corpus-pass output across the neighbourhood sizes.
///
/// Readings outlive the per-thread scratch arena, so they own plain heap storage; only the ranking
/// intermediates live in the arena.
pub(super) struct AnchorReading {
    /// Rank aggregates, one per neighbourhood size.
    pub cells: Vec<NeighbourhoodAggregate>,
    /// Neighbourhood radii, one per neighbourhood size.
    pub radii: Vec<RadiusPair>,
    /// Clump-collapsed aggregates, one per neighbourhood size.
    ///
    /// Empty when the pass carries no clump grouping.
    pub clumps: Vec<ClumpAggregate>,
}

/// Shared inputs for ranking every anchor against every non-anchor row.
pub(super) struct CorpusPass<'pass, N> {
    /// The representation matrix, in row order.
    pub representations: &'pass IdSlice<N, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    /// The coordinate frame, in row order.
    pub coordinates: &'pass IdSlice<N, Vec2>,
    /// The anchor rows every scan excludes.
    pub anchor_mask: &'pass DenseBitSet<N>,
    /// Nearest rows kept per space: the largest neighbourhood size.
    pub search: usize,
    /// Prevalidated empty aggregates, one per neighbourhood size.
    pub template: &'pass [NeighbourhoodAggregate],
    /// The neighbourhood sizes, in the template's order.
    pub neighbourhoods: &'pass [NonZero<usize>],
    /// Clump labels over the corpus rows.
    ///
    /// When the probe reads recall collapsed onto clump ids beside the plain reading.
    pub clumps: Option<&'pass Clumps<N>>,
}

impl<N> CorpusPass<'_, N>
where
    N: Id,
{
    /// Ranks every anchor, yielding per-neighbourhood readings in anchor order.
    pub(super) fn run<'call>(
        &'call self,
        anchor_rows: &'call [N],
    ) -> impl ParallelIterator<Item = AnchorReading> + 'call {
        let mut negated_anchor_mask = self.anchor_mask.clone();
        negated_anchor_mask.negate();

        anchor_rows
            .par_iter()
            .map_init(Scratch::new, move |scratch, &anchor| {
                self.anchor(anchor, &negated_anchor_mask, scratch)
            })
    }

    /// Ranks one anchor against every non-anchor row in both spaces.
    ///
    /// The rank of a neighbour is the count of universe rows strictly nearer under the total order,
    /// accumulated against the opposite space's nearest [`search`](Self::search) rows during each
    /// scan. The pass scans the representation matrix once and the coordinate frame twice.
    fn anchor(
        &self,
        anchor: N,
        negated_anchor_mask: &DenseBitSet<N>,
        scratch: &mut Scratch,
    ) -> AnchorReading {
        scratch.reset();

        let anchor_point = self.coordinates[anchor];
        let anchor_embedding = &self.representations[anchor];

        // The map's nearest rows, from the first coordinate scan.
        let mut heap = BinaryHeap::new_in(&*scratch);

        for row in negated_anchor_mask {
            let point = self.coordinates[row];

            let candidate = Ranked {
                row,
                distance: anchor_point.distance_squared(point),
            };
            push_bounded(&mut heap, candidate, self.search);
        }

        let nearest = heap.into_sorted_vec();

        // Representation scan: the reference nearest rows, and each map
        // neighbour's reference rank counted against its distance.
        let mut thresholds = Vec::with_capacity_in(nearest.len(), &*scratch);
        thresholds.extend(nearest.iter().map(|member| Ranked {
            distance: anchor_embedding.cosine_distance(&self.representations[member.row]),
            row: member.row,
        }));

        let mut counts = Vec::with_capacity_in(thresholds.len(), &*scratch);
        counts.resize(thresholds.len(), 0);

        let mut heap = BinaryHeap::with_capacity_in(thresholds.len(), &*scratch);

        for row in negated_anchor_mask {
            let embedding = &self.representations[row];

            let candidate = Ranked {
                row,
                distance: anchor_embedding.cosine_distance(embedding),
            };

            for (threshold, count) in thresholds.iter().zip(&mut counts) {
                if candidate < *threshold {
                    *count += 1;
                }
            }

            push_bounded(&mut heap, candidate, self.search);
        }

        let reference_nearest = heap.into_sorted_vec();
        let reference_ranks = counts.clone();

        // Second coordinate scan: each reference neighbour's map rank.
        thresholds.clear();
        thresholds.extend(reference_nearest.iter().map(|member| Ranked {
            distance: anchor_point.distance_squared(self.coordinates[member.row]),
            row: member.row,
        }));

        counts.clear();
        counts.resize(thresholds.len(), 0);

        for row in negated_anchor_mask {
            let point = self.coordinates[row];

            let candidate = Ranked {
                distance: anchor_point.distance_squared(point),
                row,
            };

            for (threshold, count) in thresholds.iter().zip(&mut counts) {
                if candidate < *threshold {
                    *count += 1;
                }
            }
        }

        let mut cells = self.template.to_vec();
        let mut radii = Vec::with_capacity(self.neighbourhoods.len());

        for (aggregate, &k) in cells.iter_mut().zip(self.neighbourhoods) {
            aggregate.observe_ranks(&reference_ranks[..k.get()], &counts[..k.get()]);
            radii.push(RadiusPair {
                // The map scans rank by squared distance; the radius is
                // the distance itself.
                map: nearest[k.get() - 1].distance.sqrt(),
                representation: reference_nearest[k.get() - 1].distance,
            });
        }

        AnchorReading {
            cells,
            radii,
            clumps: self.clump_cells(&nearest, &reference_nearest, scratch),
        }
    }

    /// Reads the clump-collapsed cells from the anchor's nearest lists, empty without a grouping.
    ///
    /// Both nearest lists arrive nearest-first from the anchor's scans, so the collapsed reading
    /// costs two small label sweeps per neighbourhood size.
    fn clump_cells(
        &self,
        map_nearest: &[Ranked<N>],
        reference_nearest: &[Ranked<N>],
        scratch: &Scratch,
    ) -> Vec<ClumpAggregate> {
        let Some(clumps) = self.clumps else {
            return Vec::new();
        };

        let mut reference_labels = Vec::new_in(scratch);
        let mut map_labels = Vec::new_in(scratch);

        let mut cells = Vec::with_capacity(self.neighbourhoods.len());
        for &k in self.neighbourhoods {
            reference_labels.clear();
            reference_labels.extend(
                reference_nearest[..k.get()]
                    .iter()
                    .map(|member| clumps.clump(member.row)),
            );
            map_labels.clear();
            map_labels.extend(
                map_nearest[..k.get()]
                    .iter()
                    .map(|member| clumps.clump(member.row)),
            );

            let mut aggregate = ClumpAggregate::new(k);
            aggregate.observe(&mut reference_labels, &mut map_labels);
            cells.push(aggregate);
        }
        cells
    }
}

/// One anchor's sampled-pass output across the space pairs.
///
/// Readings outlive the per-thread scratch arena, so they own plain heap storage; only the ranking
/// intermediates live in the arena.
pub(super) struct SampledReading {
    /// Rank aggregates per space pair, one cell per neighbourhood size.
    pub cells: SpacePairArray<Vec<NeighbourhoodAggregate>>,
    /// Triplet aggregates per space pair.
    pub triplets: SpacePairArray<TripletAggregate>,
    /// Clump-collapsed representation-versus-canonical aggregates, one per neighbourhood size.
    ///
    /// Empty when the pass carries no clump grouping.
    pub baseline_clumps: Vec<ClumpAggregate>,
}

/// Shared inputs for ranking every anchor against the comparison rows in all three spaces.
pub(super) struct SampledPass<'pass> {
    /// The representation matrix, in row order.
    pub representations: &'pass IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    /// The coordinate frame, in row order.
    pub coordinates: &'pass IdSlice<NodeRowId, Vec2>,
    /// The anchors' canonical embeddings, in anchor order.
    pub anchor_canonical: &'pass [BoxedVecN<CANONICAL_DIMENSIONS>],
    /// The comparison rows' canonical embeddings, in comparison order.
    pub comparison_canonical: &'pass [BoxedVecN<CANONICAL_DIMENSIONS>],
    /// The pass's shared universe of comparison rows.
    pub comparison_rows: &'pass [NodeRowId],
    /// Prevalidated empty aggregates, one per neighbourhood size.
    pub template: &'pass [NeighbourhoodAggregate],
    /// The neighbourhood sizes, in the template's order.
    pub neighbourhoods: &'pass [NonZero<usize>],
    /// The shared comparison-index pairs the triplet readings sample.
    pub pairs: &'pass [[u32; 2]],
    /// Clump labels over the corpus rows.
    ///
    /// When the probe reads the representation baseline collapsed onto clump ids beside the plain
    /// reading.
    pub clumps: Option<&'pass Clumps<NodeRowId>>,
}

impl SampledPass<'_> {
    /// Ranks every anchor, yielding per-space-pair and clump-collapsed readings in anchor order.
    pub(super) fn run<'call>(
        &'call self,
        anchor_rows: &'call [NodeRowId],
    ) -> impl ParallelIterator<Item = SampledReading> + 'call {
        anchor_rows
            .par_iter()
            .enumerate()
            .map_init(Scratch::new, |scratch, (index, &anchor)| {
                self.anchor(index, anchor, scratch)
            })
    }

    /// Ranks one anchor's comparison universe in all three spaces.
    ///
    /// Reads the space pairs, the triplet verdicts, and the clump-collapsed baseline.
    fn anchor(&self, index: usize, anchor: NodeRowId, scratch: &mut Scratch) -> SampledReading {
        scratch.reset();

        let anchor_point = self.coordinates[anchor];
        let anchor_embedding = &self.representations[anchor];
        let anchor_canonical = &self.anchor_canonical[index];

        let mut map_distances = Vec::with_capacity_in(self.comparison_rows.len(), &*scratch);
        let mut representation_distances =
            Vec::with_capacity_in(self.comparison_rows.len(), &*scratch);
        let mut canonical_distances = Vec::with_capacity_in(self.comparison_rows.len(), &*scratch);

        for (universe, &row) in self.comparison_rows.iter().enumerate() {
            map_distances.push(anchor_point.distance_squared(self.coordinates[row]));
            representation_distances
                .push(anchor_embedding.cosine_distance(&self.representations[row]));
            canonical_distances
                .push(anchor_canonical.cosine_distance(&self.comparison_canonical[universe]));
        }

        let mut map_order = Vec::with_capacity_in(self.comparison_rows.len(), &*scratch);
        let mut representation_order = Vec::with_capacity_in(self.comparison_rows.len(), &*scratch);
        let mut canonical_order = Vec::with_capacity_in(self.comparison_rows.len(), &*scratch);

        order_into(&mut map_order, &map_distances, self.comparison_rows);
        order_into(
            &mut representation_order,
            &representation_distances,
            self.comparison_rows,
        );
        order_into(
            &mut canonical_order,
            &canonical_distances,
            self.comparison_rows,
        );

        let mut ranks = RankScratch::new(self.comparison_rows.len());
        let observed = |by_reference: &[u32], by_map: &[u32], ranks: &mut RankScratch| {
            let mut cells = self.template.to_vec();
            for aggregate in &mut cells {
                aggregate.observe(by_reference, by_map, ranks);
            }
            cells
        };

        let map_representation = observed(&representation_order, &map_order, &mut ranks);
        let map_canonical = observed(&canonical_order, &map_order, &mut ranks);
        let representation_canonical =
            observed(&canonical_order, &representation_order, &mut ranks);

        // Triplet verdicts: whether each space orders the pair's two
        // points the same way from this anchor, under the shared
        // (distance, row) total order. Distinct rows leave no ties.
        let mut triplets = SpacePairArray::from_elem(TripletAggregate::default());
        for &[first, second] in self.pairs {
            let nearer_first = |distances: &[f32]| {
                distances[first as usize]
                    .total_cmp(&distances[second as usize])
                    .then_with(|| {
                        self.comparison_rows[first as usize]
                            .cmp(&self.comparison_rows[second as usize])
                    })
                    .is_lt()
            };

            let map = nearer_first(&map_distances);
            let representation = nearer_first(&representation_distances);
            let canonical = nearer_first(&canonical_distances);

            triplets[SpacePair::MapRepresentation].observe(map == representation);
            triplets[SpacePair::MapCanonical].observe(map == canonical);
            triplets[SpacePair::RepresentationCanonical].observe(representation == canonical);
        }

        let baseline_clumps = self.clump_cells(&canonical_order, &representation_order, scratch);

        let mut cells = SpacePairArray::from_elem(Vec::new());
        cells[SpacePair::MapRepresentation] = map_representation;
        cells[SpacePair::MapCanonical] = map_canonical;
        cells[SpacePair::RepresentationCanonical] = representation_canonical;

        SampledReading {
            cells,
            triplets,
            baseline_clumps,
        }
    }

    /// Reads the clump-collapsed representation-versus-canonical cells from the anchor's orderings.
    ///
    /// Empty without a grouping.
    ///
    /// Both orderings arrive whole-universe nearest-first, so the collapsed baseline costs two
    /// small label sweeps per neighbourhood size. The canonical ordering is the reference: the
    /// collapse reads how much of each exact canonical neighbourhood the representation keeps after
    /// relabeling rows by their connected-component id.
    fn clump_cells(
        &self,
        canonical_order: &[u32],
        representation_order: &[u32],
        scratch: &Scratch,
    ) -> Vec<ClumpAggregate> {
        let Some(clumps) = self.clumps else {
            return Vec::new();
        };

        let mut reference_labels = Vec::new_in(scratch);
        let mut judged_labels = Vec::new_in(scratch);

        let mut cells = Vec::with_capacity(self.neighbourhoods.len());
        for &k in self.neighbourhoods {
            reference_labels.clear();
            reference_labels.extend(
                canonical_order[..k.get()]
                    .iter()
                    .map(|&universe| clumps.clump(self.comparison_rows[universe as usize])),
            );
            judged_labels.clear();
            judged_labels.extend(
                representation_order[..k.get()]
                    .iter()
                    .map(|&universe| clumps.clump(self.comparison_rows[universe as usize])),
            );

            let mut aggregate = ClumpAggregate::new(k);
            aggregate.observe(&mut reference_labels, &mut judged_labels);
            cells.push(aggregate);
        }

        cells
    }
}

//! Per-anchor ranking workers over the probe's shared inputs.
//!
//! Both passes rank anchors independently in parallel, ordering [`NonNegative`] distances first and
//! breaking ties by ascending row. They produce per-anchor cells from shape-validated templates.
//! The corpus pass counts ranks against bounded threshold sets, using O(K) ranking scratch for
//! search depth K and a shared corpus-sized anchor mask. The sampled pass sorts its whole
//! comparison universe, with O(m) ranking scratch for m comparisons. Output cells are additional to
//! that scratch.
#![expect(
    clippy::cast_possible_truncation,
    reason = "the corpus row domain is checked against the crate's u32 row encoding at probe entry"
)]
#![expect(
    clippy::min_ident_chars,
    reason = "k is the canonical neighbourhood-size name across the metric literature"
)]

// PERF: threshold counting compares every candidate with K thresholds. A possible alternative sorts
// thresholds, binary-searches the first threshold greater than each candidate and accumulates those
// suffix increments into per-threshold counts. This uses O(log K) comparisons per candidate under
// the same lexicographic distance/row order. Measure counting and distance-kernel costs at live
// shape (1M rows and 256 anchors) before choosing this change or vectorizing comparisons.

use alloc::{borrow::Cow, collections::BinaryHeap};
use core::{cmp::Ordering, num::NonZero};
use std::alloc::Allocator;

use hashql_core::{
    heap::{ResetAllocator as _, Scratch},
    id::{Id, IdSlice, bit_vec::DenseBitSet},
};
use rayon::iter::{IndexedParallelIterator, IntoParallelRefIterator as _, ParallelIterator as _};

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
    math::{AlignedVecN, FinitePointField, NonNegative},
};

/// One ranked row under the probe's total order.
#[derive(Debug, Copy, Clone)]
struct Ranked<N> {
    row: N,
    distance: NonNegative,
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
            .cmp(&other.distance)
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
        // PeekMut restores heap order on drop
        *farthest = candidate;
    }
}

/// Sorts universe indices nearest-first, ties by ascending row.
///
/// `rows` must cover the distance array, whose length must fit u32.
///
/// # Panics
///
/// Panics when a compared row index lies outside `rows`.
fn order_into<A: Allocator>(
    order: &mut Vec<u32, A>,
    distances: &[NonNegative],
    rows: &[NodeRowId],
) {
    order.clear();
    order.extend(0..distances.len() as u32);
    order.sort_unstable_by(|&one, &other| {
        distances[one as usize]
            .cmp(&distances[other as usize])
            .then_with(|| rows[one as usize].cmp(&rows[other as usize]))
    });
}

/// One anchor's corpus-pass output across the neighbourhood sizes.
///
/// Readings own their storage independently of the reusable ranking scratch.
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
///
/// Row-aligned inputs must cover the mask domain. `search` must reach every neighbourhood size and
/// fit the non-anchor universe. Templates must match the neighbourhood list and universe, with
/// capacity for the intended aggregate totals. These relationships are established by the probe's
/// construction, except for arithmetic capacity, which it does not check.
pub(super) struct CorpusPass<'pass, N> {
    /// The representation matrix, in row order.
    pub representations: &'pass IdSlice<N, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    /// The coordinate frame, in row order.
    pub coordinates: &'pass FinitePointField<N>,
    /// The anchor rows every scan excludes.
    pub anchor_mask: &'pass DenseBitSet<N>,
    /// Nearest rows kept per space: the largest neighbourhood size.
    pub search: usize,
    /// Shape-validated empty aggregates, one per neighbourhood size.
    pub template: &'pass [NeighbourhoodAggregate],
    /// The neighbourhood sizes, in the template's order.
    pub neighbourhoods: &'pass [NonZero<usize>],
    /// Density radius sizes, also bounded by `search`.
    pub density_neighbourhoods: &'pass [NonZero<usize>],
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
    ///
    /// # Panics
    ///
    /// Evaluating the iterator panics when an anchor or scanned row exceeds an input's row domain,
    /// or the search depth cannot supply a requested neighbourhood.
    pub(super) fn run<'call>(
        &'call self,
        anchor_rows: &'call [N],
    ) -> impl IndexedParallelIterator<Item = AnchorReading> + 'call {
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
    /// scan. The pass scans the representation matrix once and the coordinate frame twice, with
    /// additional distance evaluations for the retained thresholds.
    ///
    /// # Panics
    ///
    /// Panics on an out-of-domain row or when retained neighbours cannot cover a requested size.
    /// Aggregate shape mismatches also panic during observation.
    fn anchor(
        &self,
        anchor: N,
        negated_anchor_mask: &DenseBitSet<N>,
        scratch: &mut Scratch,
    ) -> AnchorReading {
        scratch.reset();

        let anchor_point = self.coordinates[anchor];
        let anchor_embedding = &self.representations[anchor];

        // the first coordinate scan supplies map neighbours whose reference ranks are needed
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

        // one representation scan finds its nearest rows and counts the opposite ranks of map
        // neighbours
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

        // the second coordinate scan counts the map ranks of reference neighbours
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
        for (aggregate, &k) in cells.iter_mut().zip(self.neighbourhoods) {
            aggregate.observe_ranks(&reference_ranks[..k.get()], &counts[..k.get()]);
        }

        let radii = self
            .density_neighbourhoods
            .iter()
            .map(|k| RadiusPair {
                // rankings use squared distance, but density ratios use Euclidean radii
                map: nearest[k.get() - 1].distance.sqrt(),
                representation: reference_nearest[k.get() - 1].distance,
            })
            .collect();

        AnchorReading {
            cells,
            radii,
            clumps: self.clump_cells(&nearest, &reference_nearest, scratch),
        }
    }

    /// Computes collapsed recall from nearest-first row lists.
    ///
    /// Returns an empty vector without a grouping. For each neighbourhood size k, label collection
    /// and overlap cost O(k log k) time, including sorting the label lists.
    ///
    /// # Panics
    ///
    /// Panics when a nearest list is shorter than a requested neighbourhood or a row lies outside
    /// the grouping.
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
/// Readings own their storage independently of the reusable ranking scratch.
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

/// Shared inputs for ranking anchors against sampled comparisons in all three spaces.
///
/// Canonical arrays must align with their respective anchor and comparison rows. Other row-indexed
/// inputs must cover those rows. Templates must match the comparison universe and neighbourhood
/// sizes, with supported totals. Pair indices must address distinct comparison rows. Canonical
/// embeddings may borrow dataset storage or own decoded vectors.
pub(super) struct SampledPass<'pass> {
    /// The representation matrix, in row order.
    pub representations: &'pass IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    /// The coordinate frame, in row order.
    pub coordinates: &'pass FinitePointField<NodeRowId>,
    /// The anchors' canonical embeddings, in anchor order.
    pub anchor_canonical: &'pass [Cow<'pass, AlignedVecN<CANONICAL_DIMENSIONS>>],
    /// The comparison rows' canonical embeddings, in comparison order.
    pub comparison_canonical: &'pass [Cow<'pass, AlignedVecN<CANONICAL_DIMENSIONS>>],
    /// The pass's shared universe of comparison rows.
    pub comparison_rows: &'pass [NodeRowId],
    /// Shape-validated empty aggregates, one per neighbourhood size.
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
    ///
    /// # Panics
    ///
    /// Evaluating the iterator panics when a row or pair index exceeds its input domain, or a
    /// template disagrees with the comparison universe.
    pub(super) fn run<'call>(
        &'call self,
        anchor_rows: &'call [NodeRowId],
    ) -> impl IndexedParallelIterator<Item = SampledReading> + 'call {
        anchor_rows
            .par_iter()
            .enumerate()
            .map_init(Scratch::new, |scratch, (index, &anchor)| {
                self.anchor(index, anchor, scratch)
            })
    }

    /// Ranks one anchor's comparison universe in all three spaces.
    ///
    /// Produces neighbourhood cells, triplet verdicts and the clump-collapsed baseline.
    ///
    /// # Panics
    ///
    /// Panics on an out-of-domain row, anchor ordinal or pair index, or a template universe
    /// inconsistent with the comparison count.
    fn anchor(&self, index: usize, anchor: NodeRowId, scratch: &mut Scratch) -> SampledReading {
        scratch.reset();

        let anchor_point = self.coordinates[anchor];
        let anchor_embedding = &self.representations[anchor];
        let anchor_canonical = self.anchor_canonical[index].as_ref();

        let mut map_distances = Vec::with_capacity_in(self.comparison_rows.len(), &*scratch);
        let mut representation_distances =
            Vec::with_capacity_in(self.comparison_rows.len(), &*scratch);
        let mut canonical_distances = Vec::with_capacity_in(self.comparison_rows.len(), &*scratch);

        for (universe, &row) in self.comparison_rows.iter().enumerate() {
            map_distances.push(anchor_point.distance_squared(self.coordinates[row]));
            representation_distances
                .push(anchor_embedding.cosine_distance(&self.representations[row]));
            canonical_distances.push(
                anchor_canonical.cosine_distance(self.comparison_canonical[universe].as_ref()),
            );
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

        // distinct rows resolve equal distances, giving each space one order for the pair
        let mut triplets = SpacePairArray::from_elem(TripletAggregate::default());
        for &[first, second] in self.pairs {
            let nearer_first = |distances: &[NonNegative]| {
                distances[first as usize]
                    .cmp(&distances[second as usize])
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

    /// Computes collapsed baseline recall from nearest-first comparison orderings.
    ///
    /// Returns an empty vector without a grouping. The canonical ordering is the reference.
    /// Relabeling measures how much of its neighbourhood the representation keeps with row identity
    /// relaxed to the component. Label collection and overlap cost O(k log k) per size k, including
    /// sorting.
    ///
    /// # Panics
    ///
    /// Panics when an ordering is shorter than a requested neighbourhood, an index exceeds the
    /// comparison universe, or a row lies outside the grouping.
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

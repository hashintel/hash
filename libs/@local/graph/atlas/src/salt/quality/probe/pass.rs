//! The probe's ranking passes: per-anchor workers over shared inputs.
//!
//! Each pass is a context binding its shared inputs once; running one ranks the anchors
//! independently and in parallel under one total order - distances by [`f32::total_cmp`], ties by
//! ascending row - and yields per-anchor cells cloned from a prevalidated template. The corpus
//! pass counts ranks against bounded threshold sets, so its per-thread memory follows the search
//! depth, never the corpus; the sampled pass sorts whole comparison universes, whose size the probe
//! design bounds.
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
// 512-component distance kernel itself, so the corpus pass is
// plausibly 30-40% scalar counting. If the suite's runtime ever
// matters, the fix is algorithmic before it is SIMD: sort the K
// thresholds once per anchor, binary-search each candidate's
// insertion point (log K compares instead of K), and suffix-sum a
// small histogram into the per-threshold counts - exact, and cheaper
// than vectorizing compares whose order is lexicographic
// (distance, row) rather than a plain float compare. Measure at live
// shape (1M rows x 256 anchors) before acting.

use alloc::collections::BinaryHeap;
use core::{cmp::Ordering, num::NonZero};

use rayon::iter::{IndexedParallelIterator as _, IntoParallelRefIterator as _, ParallelIterator};

use super::{
    super::{
        clump::{ClumpAggregate, Clumps},
        metric::{NeighbourhoodAggregate, RankScratch, TripletAggregate},
    },
    RadiusPair, SpacePair,
};
use crate::{
    bitset::BitSet,
    dataset::{CANONICAL_DIMENSIONS, PROJECTOR_DIMENSIONS},
    math::{AlignedVecN, BoxedVecN, Vec2},
};

/// One anchor's corpus-pass output across the neighbourhood sizes.
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

/// The corpus pass's shared inputs: every anchor against every non-anchor row.
pub(super) struct CorpusPass<'pass> {
    /// The representation matrix, in row order.
    pub representations: &'pass [AlignedVecN<PROJECTOR_DIMENSIONS>],
    /// The coordinate frame, in row order.
    pub coordinates: &'pass [Vec2],
    /// The anchor rows every scan excludes.
    pub anchor_mask: &'pass BitSet,
    /// Nearest rows kept per space: the largest neighbourhood size.
    pub search: usize,
    /// Prevalidated empty aggregates, one per neighbourhood size.
    pub template: &'pass [NeighbourhoodAggregate],
    /// The neighbourhood sizes, in the template's order.
    pub neighbourhoods: &'pass [NonZero<usize>],
    /// Clump labels over the corpus rows.
    ///
    /// When the probe reads clump-granularity recall beside the plain reading.
    pub clumps: Option<&'pass Clumps>,
}

impl CorpusPass<'_> {
    /// Ranks every anchor, yielding per-neighbourhood readings in anchor order.
    pub(super) fn run<'call>(
        &'call self,
        anchor_rows: &'call [usize],
    ) -> impl ParallelIterator<Item = AnchorReading> + 'call {
        anchor_rows
            .par_iter()
            .map_init(CorpusScratch::default, |scratch, &anchor| {
                self.anchor(anchor, scratch)
            })
    }

    /// Ranks one anchor against every non-anchor row in both spaces.
    ///
    /// The rank of a neighbour is the count of universe rows strictly nearer under the total order,
    /// accumulated against the opposite space's nearest [`search`](Self::search) rows during each
    /// scan; the representation matrix is scanned once and the coordinate frame twice.
    fn anchor(&self, anchor: usize, scratch: &mut CorpusScratch) -> AnchorReading {
        let anchor_point = self.coordinates[anchor];
        let anchor_embedding = &self.representations[anchor];

        // The map's nearest rows, from the first coordinate scan.
        scratch.heap.clear();
        for (row, &point) in self.coordinates.iter().enumerate() {
            if self.anchor_mask.contains(row) {
                continue;
            }
            let candidate = Ranked {
                distance: anchor_point.distance_squared(point),
                row: row as u32,
            };
            push_bounded(&mut scratch.heap, candidate, self.search);
        }
        CorpusScratch::drain_sorted(&mut scratch.heap, &mut scratch.map_nearest);

        // Representation scan: the reference nearest rows, and each map
        // neighbour's reference rank counted against its distance.
        scratch.thresholds.clear();
        scratch
            .thresholds
            .extend(scratch.map_nearest.iter().map(|member| Ranked {
                distance:
                    anchor_embedding.cosine_distance(&self.representations[member.row as usize]),
                row: member.row,
            }));
        scratch.counts.clear();
        scratch.counts.resize(scratch.thresholds.len(), 0);

        for (row, embedding) in self.representations.iter().enumerate() {
            if self.anchor_mask.contains(row) {
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
            push_bounded(&mut scratch.heap, candidate, self.search);
        }
        CorpusScratch::drain_sorted(&mut scratch.heap, &mut scratch.reference_nearest);
        scratch.reference_ranks.clear();
        scratch.reference_ranks.extend_from_slice(&scratch.counts);

        // Second coordinate scan: each reference neighbour's map rank.
        scratch.thresholds.clear();
        scratch
            .thresholds
            .extend(scratch.reference_nearest.iter().map(|member| Ranked {
                distance: anchor_point.distance_squared(self.coordinates[member.row as usize]),
                row: member.row,
            }));
        scratch.counts.clear();
        scratch.counts.resize(scratch.thresholds.len(), 0);

        for (row, &point) in self.coordinates.iter().enumerate() {
            if self.anchor_mask.contains(row) {
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

        let mut cells = self.template.to_vec();
        let mut radii = Vec::with_capacity(self.neighbourhoods.len());
        for (aggregate, &k) in cells.iter_mut().zip(self.neighbourhoods) {
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

        AnchorReading {
            cells,
            radii,
            clumps: self.clump_cells(scratch),
        }
    }

    /// Reads the clump-collapsed cells from the anchor's nearest lists, empty without a grouping.
    ///
    /// Both nearest lists already exist in scratch, so the collapsed reading costs two small sorts
    /// per neighbourhood size.
    fn clump_cells(&self, scratch: &mut CorpusScratch) -> Vec<ClumpAggregate> {
        let Some(clumps) = self.clumps else {
            return Vec::new();
        };

        let mut cells = Vec::with_capacity(self.neighbourhoods.len());
        for &k in self.neighbourhoods {
            let labels_into = |nearest: &[Ranked], labels: &mut Vec<u32>| {
                labels.clear();
                labels.extend(
                    nearest[..k.get()]
                        .iter()
                        .map(|member| clumps.clump(member.row as usize)),
                );
            };
            labels_into(&scratch.reference_nearest, &mut scratch.clump_reference);
            labels_into(&scratch.map_nearest, &mut scratch.clump_map);

            let mut aggregate = ClumpAggregate::new(k);
            aggregate.observe(&mut scratch.clump_reference, &mut scratch.clump_map);
            cells.push(aggregate);
        }
        cells
    }
}

/// One anchor's sampled-pass output across the space pairs.
pub(super) struct SampledReading {
    /// Rank aggregates per space pair.
    ///
    /// Each one cell per neighbourhood size, in [`SpacePair`] order.
    pub cells: [Vec<NeighbourhoodAggregate>; SpacePair::COUNT],
    /// Triplet aggregates, in [`SpacePair`] order.
    pub triplets: [TripletAggregate; SpacePair::COUNT],
    /// Clump-collapsed representation-versus-canonical aggregates, one per neighbourhood size.
    ///
    /// Empty when the pass carries no clump grouping.
    pub baseline_clumps: Vec<ClumpAggregate>,
}

/// The sampled pass's shared inputs: every anchor against the comparison rows in all three spaces.
pub(super) struct SampledPass<'pass> {
    /// The representation matrix, in row order.
    pub representations: &'pass [AlignedVecN<PROJECTOR_DIMENSIONS>],
    /// The coordinate frame, in row order.
    pub coordinates: &'pass [Vec2],
    /// The anchors' canonical embeddings, in anchor order.
    pub anchor_canonical: &'pass [BoxedVecN<CANONICAL_DIMENSIONS>],
    /// The comparison rows' canonical embeddings, in comparison order.
    pub comparison_canonical: &'pass [BoxedVecN<CANONICAL_DIMENSIONS>],
    /// The comparison rows: the pass's shared universe.
    pub comparison_rows: &'pass [usize],
    /// Prevalidated empty aggregates, one per neighbourhood size.
    pub template: &'pass [NeighbourhoodAggregate],
    /// The neighbourhood sizes, in the template's order.
    pub neighbourhoods: &'pass [NonZero<usize>],
    /// The shared comparison-index pairs the triplet readings sample.
    pub pairs: &'pass [[u32; 2]],
    /// Clump labels over the corpus rows.
    ///
    /// When the probe reads the representation baseline at clump granularity beside the plain
    /// reading.
    pub clumps: Option<&'pass Clumps>,
}

impl SampledPass<'_> {
    /// Ranks every anchor, yielding per-space-pair and clump-collapsed readings in anchor order.
    pub(super) fn run<'call>(
        &'call self,
        anchor_rows: &'call [usize],
    ) -> impl ParallelIterator<Item = SampledReading> + 'call {
        anchor_rows.par_iter().enumerate().map_init(
            || SampledScratch::new(self.comparison_rows.len()),
            |scratch, (index, &anchor)| {
                let (cells, triplets) = self.anchor(index, anchor, scratch);
                SampledReading {
                    cells,
                    triplets,
                    baseline_clumps: self.clump_cells(scratch),
                }
            },
        )
    }

    /// Ranks one anchor's comparison universe in all three spaces.
    ///
    /// Reads the space pairs and triplet verdicts.
    fn anchor(
        &self,
        index: usize,
        anchor: usize,
        scratch: &mut SampledScratch,
    ) -> (
        [Vec<NeighbourhoodAggregate>; SpacePair::COUNT],
        [TripletAggregate; SpacePair::COUNT],
    ) {
        let anchor_point = self.coordinates[anchor];
        let anchor_embedding = &self.representations[anchor];
        let anchor_canonical = &self.anchor_canonical[index];
        // The clump buffers stay behind: the collapse reads the
        // orderings this method leaves in scratch.
        let SampledScratch {
            map_distances,
            representation_distances,
            canonical_distances,
            map_order,
            representation_order,
            canonical_order,
            ranks,
            ..
        } = scratch;

        map_distances.clear();
        representation_distances.clear();
        canonical_distances.clear();
        for (universe, &row) in self.comparison_rows.iter().enumerate() {
            map_distances.push(anchor_point.distance_squared(self.coordinates[row]));
            representation_distances
                .push(anchor_embedding.cosine_distance(&self.representations[row]));
            canonical_distances
                .push(anchor_canonical.cosine_distance(&self.comparison_canonical[universe]));
        }

        order_into(map_order, map_distances, self.comparison_rows);
        order_into(
            representation_order,
            representation_distances,
            self.comparison_rows,
        );
        order_into(canonical_order, canonical_distances, self.comparison_rows);

        let mut observed = |by_reference: &[u32], by_map: &[u32]| {
            let mut cells = self.template.to_vec();
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
            let map = nearer_first(map_distances);
            let representation = nearer_first(representation_distances);
            let canonical = nearer_first(canonical_distances);

            triplets[SpacePair::MapRepresentation as usize].observe(map == representation);
            triplets[SpacePair::MapCanonical as usize].observe(map == canonical);
            triplets[SpacePair::RepresentationCanonical as usize]
                .observe(representation == canonical);
        }

        let mut cells: [Vec<NeighbourhoodAggregate>; SpacePair::COUNT] = Default::default();
        cells[SpacePair::MapRepresentation as usize] = map_representation;
        cells[SpacePair::MapCanonical as usize] = map_canonical;
        cells[SpacePair::RepresentationCanonical as usize] = representation_canonical;

        (cells, triplets)
    }

    /// Reads the clump-collapsed representation-versus-canonical cells from the anchor's orderings.
    ///
    /// Empty without a grouping.
    ///
    /// Both orderings already exist in scratch after [`anchor`](Self::anchor), so the collapsed
    /// baseline costs two small sorts per neighbourhood size. The canonical ordering is the
    /// reference: the collapse reads how much of each exact canonical neighbourhood the
    /// representation keeps once near-duplicate siblings are interchangeable.
    fn clump_cells(&self, scratch: &mut SampledScratch) -> Vec<ClumpAggregate> {
        let Some(clumps) = self.clumps else {
            return Vec::new();
        };

        let mut cells = Vec::with_capacity(self.neighbourhoods.len());
        for &k in self.neighbourhoods {
            let labels_into = |order: &[u32], labels: &mut Vec<u32>| {
                labels.clear();
                labels.extend(
                    order[..k.get()]
                        .iter()
                        .map(|&universe| clumps.clump(self.comparison_rows[universe as usize])),
                );
            };
            labels_into(&scratch.canonical_order, &mut scratch.clump_reference);
            labels_into(&scratch.representation_order, &mut scratch.clump_judged);

            let mut aggregate = ClumpAggregate::new(k);
            aggregate.observe(&mut scratch.clump_reference, &mut scratch.clump_judged);
            cells.push(aggregate);
        }
        cells
    }
}

/// One ranked row under the probe's total order.
///
/// Distances order by [`f32::total_cmp`] and ties resolve by ascending row, so equal distances rank
/// in one order in every pass.
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

/// Reusable per-thread buffers for the corpus pass, each bounded by the search depth.
#[derive(Default)]
struct CorpusScratch {
    heap: BinaryHeap<Ranked>,
    map_nearest: Vec<Ranked>,
    reference_nearest: Vec<Ranked>,
    thresholds: Vec<Ranked>,
    counts: Vec<u32>,
    reference_ranks: Vec<u32>,
    clump_reference: Vec<u32>,
    clump_map: Vec<u32>,
}

impl CorpusScratch {
    /// Empties the heap into `into`, sorted nearest-first.
    fn drain_sorted(heap: &mut BinaryHeap<Ranked>, into: &mut Vec<Ranked>) {
        into.clear();
        into.extend(heap.drain());
        into.sort_unstable();
    }
}

/// Reusable per-thread buffers for the sampled pass, each sized by the comparison universe.
struct SampledScratch {
    map_distances: Vec<f32>,
    representation_distances: Vec<f32>,
    canonical_distances: Vec<f32>,
    map_order: Vec<u32>,
    representation_order: Vec<u32>,
    canonical_order: Vec<u32>,
    ranks: RankScratch,
    clump_reference: Vec<u32>,
    clump_judged: Vec<u32>,
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
            clump_reference: Vec::new(),
            clump_judged: Vec::new(),
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

//! Near-duplicate clumps over the 512-component neighbour table.
//!
//! A [`Clumps`] label identifies a connected component formed by stored neighbour edges at cosine
//! distance at most ε. Collapsing recall onto these component labels relaxes row identity for
//! diagnostic comparison. Single-linkage chains can span distances much larger than ε. A shared
//! label certifies neither component compactness nor within-component placement, and collapsed
//! readings never affect admission.
//!
//! When stored distances agree with the full ε graph, restricting to stored k-NN edges yields a
//! subgraph of that graph. Removing edges can split a connected component but cannot join different
//! components. Therefore the stored-edge labels refine the full-graph labels. For fixed
//! neighbourhood lists, this refinement can only reduce their collapsed overlap. A checked table
//! validates distance ranges and structure, not correspondence to the embedding matrix.
//!
//! [`DEFAULT_EPSILON`] records development-corpus calibration readings and their generation
//! dependence. [`calibration`](super::report::calibration) measures grouping shape
//! over a published k-NN table. Compare that shape and the subgroup readings before choosing a
//! threshold for another generation.
//!
//! [`ClumpAggregate`] is the collapsed counterpart of the plain recall reading: both neighbour
//! lists relabel onto clump ids and overlap as multisets. Each shared row still matches its own
//! label after relabeling, and additional same-label matches may appear. Therefore clump recall is
//! always at least plain recall over those same lists, with equality for singleton labels. A clump
//! the map underrepresents earns only the credit its observed multiplicity supplies.
#![expect(
    clippy::min_ident_chars,
    reason = "k is the canonical neighbourhood-size name across the metric literature"
)]

use core::{cmp::Ordering, num::NonZero};

use hashql_core::id::{Id, IdUnionFind, IdVec};

use super::super::knn::table::KnnView;
use crate::math::UnitFraction;

/// The default cosine-distance threshold over the 512-component representation.
///
/// The value 0.002 corresponds to cosine similarity 0.998. Calibration depends on the generation,
/// including its stored neighbour graph.
///
/// Recorded sweeps over development-corpus fits with 985,932 rows and 30 stored neighbours per row
/// motivate this value. One fit (generation prefix `2ea9cb45`) records 131,773, 131,760 and 131,147
/// multi-row groups at ε = 0.0012, 0.002 and 0.0028: about 0.48% variation while coverage grows
/// from 48.7% to 60.9%. At 0.002 it records 55.9% coverage and mean group size 4.18. A second fit
/// (generation prefix `c1d00be7`) has recorded readings differing by less than 0.02%.
///
/// A third fit (generation prefix `bfc67cbc`) records 85,794, 91,162 and 95,179 groups over those
/// thresholds, a 10.9% rise, with coverage from 39.0% to 53.3%. Its group counts are respectively
/// 34.9%, 30.8% and 27.4% below the first fit's. This generation has no comparable plateau over
/// that interval. A fixed ε does not establish comparable component structure across generations.
/// Use [`calibration`](super::report::calibration) to measure the grouping curve for a new table,
/// and compare subgroup readings before adopting the threshold.
pub(crate) const DEFAULT_EPSILON: f32 = 0.002;

/// Connected-component labels for rows joined by stored edges within a distance threshold.
///
/// Every row carries a dense clump id in `0..clumps`, ordered by each component's first row. A
/// singleton row is its own clump. For equal tables and thresholds, the partition and labels are
/// deterministic.
#[derive(Debug, Clone)]
pub(crate) struct Clumps<N> {
    labels: IdVec<N, u32>,
    epsilon: f32,
    count: usize,
    groups: usize,
    grouped_rows: usize,
}

impl<N> Clumps<N>
where
    N: Id,
{
    /// Groups the table's rows at the `epsilon` distance threshold.
    ///
    /// An edge joins two rows when either row stores the other at distance at most `epsilon`. A
    /// stored zero-distance edge joins at every non-negative threshold. NaN and negative thresholds
    /// admit no edges, while positive infinity admits every stored edge. The row count must fit
    /// u32, and the table must support row access over its complete domain.
    ///
    /// # Complexity
    ///
    /// For n rows and e stored edges, grouping takes O((n + e) · α(n)) time with union-find and
    /// O(n) additional storage. Labels retain O(n) storage.
    pub(crate) fn from_knn(table: &KnnView<'_, N>, epsilon: f32) -> Self {
        let rows = table.rows();
        let mut components = IdUnionFind::<N>::new(rows);

        for row in 0..rows {
            let row = N::from_usize(row);

            for neighbour in table.row(row) {
                if neighbour.distance <= epsilon {
                    components.unify(row, neighbour.id);
                }
            }
        }

        // first-row relabeling makes labels depend on the partition, not the union-find roots
        let mut labels = IdVec::from_elem(0_u32, rows);
        let mut label_of = IdVec::from_elem(u32::MAX, rows);
        let mut clumps = 0_u32;

        for (row, slot) in labels.iter_enumerated_mut() {
            let representative = components.find(row);
            let label = &mut label_of[representative];
            if *label == u32::MAX {
                *label = clumps;
                clumps += 1;
            }

            *slot = *label;
        }

        Self::from_dense_labels(labels, clumps as usize, epsilon)
    }

    /// Computes grouping counts from labels already dense in first-row order.
    ///
    /// Every label must lie in `0..count`, first appearances must ascend, and each component's row
    /// count must fit u32.
    ///
    /// # Panics
    ///
    /// Panics when a label lies outside `0..count`.
    fn from_dense_labels(labels: IdVec<N, u32>, count: usize, epsilon: f32) -> Self {
        let mut sizes = vec![0_u32; count];
        for &clump in &labels {
            sizes[clump as usize] += 1;
        }

        let groups = sizes.iter().filter(|&&size| size >= 2).count();
        let grouped_rows = sizes
            .iter()
            .filter(|&&size| size >= 2)
            .map(|&size| size as usize)
            .sum();

        Self {
            labels,
            epsilon,
            count,
            groups,
            grouped_rows,
        }
    }

    /// Validates first-row label order and computes grouping counts for a fixture.
    ///
    /// # Panics
    ///
    /// This panics unless the labels are dense in first-row order: each new label is exactly one
    /// past the largest seen so far.
    #[cfg(test)]
    pub(crate) fn from_labels(labels: IdVec<N, u32>, epsilon: f32) -> Self {
        let mut next = 0_u32;
        for &label in &labels {
            assert!(
                label <= next,
                "labels must be dense in first-row order: {label} appears before {next}",
            );

            if label == next {
                next += 1;
            }
        }

        Self::from_dense_labels(labels, next as usize, epsilon)
    }

    /// Returns row `row`'s clump id.
    ///
    /// # Panics
    ///
    /// This panics when `row` is outside the labelled domain.
    #[inline]
    #[must_use]
    pub(crate) const fn clump(&self, row: N) -> u32
    where
        N: [const] Id,
    {
        self.labels[row]
    }

    /// Returns the distance threshold the grouping was built at.
    #[inline]
    #[must_use]
    pub(crate) const fn epsilon(&self) -> f32 {
        self.epsilon
    }

    /// Returns the labelled row count.
    #[inline]
    #[must_use]
    pub(crate) const fn rows(&self) -> usize {
        self.labels.len()
    }

    /// Returns the clump count, singletons included.
    #[inline]
    #[must_use]
    pub(crate) const fn clumps(&self) -> usize {
        self.count
    }

    /// Returns the count of clumps holding at least two rows.
    #[inline]
    #[must_use]
    pub(crate) const fn groups(&self) -> usize {
        self.groups
    }

    /// Returns the count of rows inside multi-row clumps.
    #[inline]
    #[must_use]
    pub(crate) const fn grouped_rows(&self) -> usize {
        self.grouped_rows
    }
}

/// Accumulated clump-granularity neighbourhood overlap.
///
/// One aggregate fixes a neighbourhood size k. A query's overlap is Σ min(r(c), m(c)) over
/// component labels c, where r(c) and m(c) count that label's occurrences in the reference and map
/// neighbourhoods. Each reference neighbour matches a distinct map neighbour from the same clump.
/// Reshuffling siblings keeps full credit, while a clump the map underrepresents earns only its
/// observed multiplicity.
///
/// Observations and merges must keep the query count and query-times-k product within usize and the
/// matched total within u64.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ClumpAggregate {
    k: usize,
    queries: usize,
    matched: u64,
}

impl ClumpAggregate {
    /// Creates an empty aggregate at neighbourhood size `k`.
    #[inline]
    #[must_use]
    pub(crate) const fn new(k: NonZero<usize>) -> Self {
        Self {
            k: k.get(),
            queries: 0,
            matched: 0,
        }
    }

    /// Accumulates one query's pair of collapsed neighbourhoods.
    ///
    /// Each slice holds the clump ids of the query's k nearest points in its space. Both slices are
    /// sorted in place because overlap ignores order.
    ///
    /// # Panics
    ///
    /// This panics when either slice's length differs from `k`.
    pub(crate) fn observe(&mut self, reference: &mut [u32], map: &mut [u32]) {
        assert_eq!(
            reference.len(),
            self.k,
            "the reference neighbourhood must hold exactly k clump ids",
        );
        assert_eq!(
            map.len(),
            self.k,
            "the map neighbourhood must hold exactly k clump ids",
        );

        reference.sort_unstable();
        map.sort_unstable();

        let (mut in_reference, mut in_map) = (0, 0);
        while in_reference < reference.len() && in_map < map.len() {
            match reference[in_reference].cmp(&map[in_map]) {
                Ordering::Less => in_reference += 1,
                Ordering::Greater => in_map += 1,
                Ordering::Equal => {
                    self.matched += 1;
                    in_reference += 1;
                    in_map += 1;
                }
            }
        }

        self.queries += 1;
    }

    /// Folds another aggregate's observations into this one.
    ///
    /// # Panics
    ///
    /// This panics when the aggregates disagree about the neighbourhood size.
    pub(crate) const fn merge(&mut self, other: &Self) {
        assert!(
            self.k == other.k,
            "merged aggregates must share the neighbourhood size",
        );

        self.queries += other.queries;
        self.matched += other.matched;
    }

    /// Returns the observed query count.
    #[inline]
    #[must_use]
    pub(crate) const fn queries(&self) -> usize {
        self.queries
    }

    /// Returns the mean matched fraction of the k-neighbourhoods, in `[0, 1]`.
    ///
    /// An empty aggregate reads 1.
    #[expect(
        clippy::cast_precision_loss,
        reason = "supported integer totals may round when converted to f64"
    )]
    #[must_use]
    pub(crate) fn recall(&self) -> UnitFraction {
        if self.queries == 0 {
            return UnitFraction::ONE;
        }

        UnitFraction::new_unchecked(self.matched as f64 / (self.queries * self.k) as f64)
    }
}

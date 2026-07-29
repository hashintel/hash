//! Near-duplicate clumps over the 512-component neighbour table.
//!
//! A clump is a connected component of the k-nearest-neighbour graph restricted to edges at cosine
//! distance at most ε: rows whose representations chain through near-identical neighbours share a
//! component label. Collapsing neighbour orderings onto clump ids relabels recall at component
//! granularity - a triage diagnostic and nothing stronger: ε chains can reach arbitrary diameter,
//! so a shared label certifies neither component compactness nor within-component placement, and
//! the collapsed readings never affect admission.
//!
//! The kNN restriction reads a subgraph of the full ε graph: a group larger than the table's k
//! connects only through chains of stored edges, so a true ε-ball component can split but never
//! spuriously merge - a split clump makes clump-granularity readings stricter, never looser.
//!
//! ε is a calibrated configuration value: [`DEFAULT_EPSILON`] carries the corpus evidence it
//! was pinned on, and the grouping is judged against measured corpus structure (group count,
//! coverage, size distribution) and against the flagged subgroups it is expected to resolve. The
//! [`calibration`](super::report::calibration) instrument re-derives the readings against any
//! published k-NN table.
//!
//! [`ClumpAggregate`] is the collapsed counterpart of the plain recall reading: both neighbour
//! lists relabel onto clump ids and overlap as multisets, so same-component siblings satisfy each
//! other under the relabeling while a clump the map underrepresents earns only the credit it
//! shows. Under singleton
//! labels the multiset overlap is exactly the shared-row count, so clump recall is always at least
//! plain recall and equals it when nothing clumps.
#![expect(
    clippy::min_ident_chars,
    reason = "k is the canonical neighbourhood-size name across the metric literature"
)]

use core::{cmp::Ordering, num::NonZero};

use hashql_core::id::Id as _;

use super::super::knn::table::KnnView;
use crate::disjoint::DisjointSet;

/// The default clump threshold, as cosine distance over the 512-component representation.
///
/// Calibrated against a fitted development corpus (985,932 rows, 30 stored neighbours per row): the
/// multi-row group count is flat at 131.5K within 0.1% across thresholds in `[0.0012,
/// 0.0028]` while coverage grows from 49% to 61%, so every value on that plateau produces the same
/// grouping structure. At 0.002 - cosine similarity 0.998 - the grouping reads 131,560 groups
/// covering 55.8% of the corpus at mean size 4.2. Below the plateau exact duplicates stay split;
/// above roughly 0.0045 the components percolate (group count falls while sizes grow without
/// bound). An earlier audit structure (165K groups, 66% coverage, mean size near 4) came from a
/// different grouping construction and is not reproducible by ε-connected components over the
/// k-NN table at any threshold; it anchors the scale of this value, not the value itself.
pub(crate) const DEFAULT_EPSILON: f32 = 0.002;

/// A dense clump labelling of the node-row domain.
///
/// Every row carries a clump id in `0..clumps`; ids are assigned in ascending order of each clump's
/// first row, so equal tables and thresholds label equally. A singleton row is its own clump.
#[derive(Debug, Clone)]
pub(crate) struct Clumps {
    labels: Vec<u32>,
    epsilon: f32,
    count: usize,
    groups: usize,
    grouped_rows: usize,
}

impl Clumps {
    /// Groups the table's rows at the `epsilon` distance threshold.
    ///
    /// An edge joins two rows when either row stores the other at cosine distance at most
    /// `epsilon`; exact-duplicate embeddings (distance 0) group at every threshold. A non-finite
    /// `epsilon` admits no edges.
    pub(crate) fn from_knn(table: &KnnView<'_>, epsilon: f32) -> Self {
        let rows = table.rows();
        let mut components = DisjointSet::new(rows);

        for row in 0..rows {
            for neighbour in table.row(row) {
                if neighbour.distance <= epsilon {
                    #[expect(
                        clippy::cast_possible_truncation,
                        reason = "the table's row domain is bound to the u32 column encoding"
                    )]
                    components.unite(row as u32, neighbour.id.as_u64() as u32);
                }
            }
        }

        // Dense relabelling by first row: deterministic in the
        // partition alone.
        let mut labels = vec![0_u32; rows];
        let mut label_of = vec![u32::MAX; rows];
        let mut clumps = 0_u32;

        for (row, slot) in labels.iter_mut().enumerate() {
            #[expect(
                clippy::cast_possible_truncation,
                reason = "the table's row domain is bound to the u32 column encoding"
            )]
            let representative = components.find(row as u32);
            let label = &mut label_of[representative as usize];
            if *label == u32::MAX {
                *label = clumps;
                clumps += 1;
            }

            *slot = *label;
        }

        Self::from_dense_labels(labels, clumps as usize, epsilon)
    }

    /// Wraps a labelling that is already dense in first-row order.
    ///
    /// The caller promises every label lies in `0..count` and that labels first appear in ascending
    /// order; the fixture paths that use this assert both.
    fn from_dense_labels(labels: Vec<u32>, count: usize, epsilon: f32) -> Self {
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

    /// Wraps a hand-built labelling for kernel and report tests.
    ///
    /// # Panics
    ///
    /// Panics unless the labels are dense in first-row order: each new label is exactly one past
    /// the largest seen so far.
    #[cfg(test)]
    pub(crate) fn from_labels(labels: Vec<u32>, epsilon: f32) -> Self {
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
    /// Panics when `row` is outside the labelled domain.
    #[inline]
    #[must_use]
    pub(crate) const fn clump(&self, row: usize) -> u32 {
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
    ///
    /// The calibration reading compared against measured corpus structure.
    #[inline]
    #[must_use]
    pub(crate) const fn groups(&self) -> usize {
        self.groups
    }

    /// Returns the count of rows inside multi-row clumps.
    ///
    /// The coverage side of the calibration reading.
    #[inline]
    #[must_use]
    pub(crate) const fn grouped_rows(&self) -> usize {
        self.grouped_rows
    }
}

/// Accumulated clump-granularity neighbourhood overlap.
///
/// One aggregate fixes a neighbourhood size at construction; queries accumulate through
/// [`observe`](Self::observe) and the recall reading divides the totals on demand. A query's
/// overlap is the multiset intersection of its two neighbourhoods' clump ids: each reference
/// neighbour is matched by a distinct map neighbour from the same clump, so siblings reshuffling
/// inside one clump keep full credit while a clump the map shows fewer members of earns exactly the
/// members shown.
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
    /// Each slice holds the clump ids of the query's `k` nearest points in its space; both are
    /// sorted in place, since the overlap is order-free.
    ///
    /// # Panics
    ///
    /// Panics when either slice's length differs from `k`.
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
    /// Panics when the aggregates disagree about the neighbourhood size.
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
        reason = "probe neighbourhood sizes and query counts are bounded orders of magnitude \
                  below the f64 mantissa"
    )]
    #[must_use]
    pub(crate) fn recall(&self) -> f64 {
        if self.queries == 0 {
            return 1.0;
        }

        self.matched as f64 / (self.queries * self.k) as f64
    }
}

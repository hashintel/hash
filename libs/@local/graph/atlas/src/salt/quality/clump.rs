//! Near-duplicate clumps over the 512-component neighbour table.
//!
//! A clump is a connected component of the k-nearest-neighbour graph
//! restricted to edges at cosine distance at most epsilon: rows whose
//! representations chain through near-identical neighbours are placed
//! by the group they form, and within-clump order is not a
//! representable quantity. Collapsing neighbour orderings onto clump
//! ids therefore separates genuine placement error from reshuffling
//! among near-duplicate siblings.
//!
//! The kNN restriction is conservative: a group larger than the
//! table's k connects only through chains of stored edges, so a true
//! epsilon-ball component can split but never spuriously merge. For a
//! release gate that is the safe direction - a split clump makes
//! clump-granularity readings stricter.
//!
//! Epsilon is a calibrated configuration value, not a constant: the
//! grouping is judged against measured corpus structure (group count,
//! coverage, size distribution) and against the flagged subgroups it
//! is expected to resolve.

use super::super::knn::table::KnnView;
use crate::disjoint::DisjointSet;

/// A dense clump labelling of the node-row domain.
///
/// Every row carries a clump id in `0..clumps`; ids are assigned in
/// ascending order of each clump's first row, so equal tables and
/// thresholds label equally. A singleton row is its own clump.
#[derive(Debug, Clone)]
pub(crate) struct Clumps {
    labels: Vec<u32>,
    count: usize,
    groups: usize,
    grouped_rows: usize,
}

impl Clumps {
    /// Groups the table's rows at the `epsilon` distance threshold.
    ///
    /// An edge joins two rows when either row stores the other at
    /// cosine distance at most `epsilon`; exact-duplicate embeddings
    /// (distance 0) group at every threshold. A non-finite `epsilon`
    /// admits no edges.
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
                    components.unite(row as u32, neighbour.id.get() as u32);
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

        let mut sizes = vec![0_u32; clumps as usize];
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
            count: clumps as usize,
            groups,
            grouped_rows,
        }
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

    /// Returns the count of clumps holding at least two rows - the
    /// calibration reading compared against measured corpus structure.
    #[inline]
    #[must_use]
    pub(crate) const fn groups(&self) -> usize {
        self.groups
    }

    /// Returns the count of rows inside multi-row clumps - the
    /// coverage side of the calibration reading.
    #[inline]
    #[must_use]
    pub(crate) const fn grouped_rows(&self) -> usize {
        self.grouped_rows
    }
}

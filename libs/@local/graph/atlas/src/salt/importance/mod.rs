//! Importance signals: the configured column behind the delivery ranking.
//!
//! The base delivery order ranks rows by importance first ([`crate::salt::lod::rank`]), so the
//! importance column decides what a zoomed-out tile shows. [`ImportanceSignal`] is the derivation
//! seam: an implementation turns published generation artifacts into one `f32[N]` column, and
//! [`RankingConfig`] selects which one a fit runs - adding a signal is one implementation plus one
//! variant, and the exhaustive matches carry it into the config echo and the metadata origin
//! marker.
//!
//! Every signal is a pure function of published artifacts and the configuration: equal generations
//! derive equal columns, so the ranking stays reproducible from the manifest alone.

use hashql_core::id::IdVec;

use crate::{identity::NodeRowId, salt::adjacency::AdjacencyArchive};

#[cfg(test)]
mod tests;

/// Selects the importance signal of one fit.
///
/// The manifest echoes the variant and the metadata's ranking origin mirrors it, so a published
/// generation names the signal its delivery order ran under.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum RankingConfig {
    /// A constant column.
    ///
    /// The delivery order reduces to the seeded identity tiebreak, a deterministic unbiased sample.
    ConstantColumns,
    /// Incident degree over the adjacency: hub entities deliver first.
    IncidentDegree,
}

const impl Default for RankingConfig {
    fn default() -> Self {
        Self::IncidentDegree
    }
}

/// One importance derivation over published generation artifacts.
///
/// The column is an ordinal sort key: the ranking consumes it through IEEE 754 `totalOrder`
/// comparisons alone, greater delivers first, and monotone transforms of a signal rank identically:
/// magnitudes are never read. Every entry is finite: under `totalOrder` a NaN fails nowhere, it
/// silently delivers its row at an extreme zoom. The column holds exactly one entry per node row.
///
/// Implementations are deterministic: the column is a function of the artifacts and the
/// configuration alone, never of thread count or timing.
// The first signal whose entries are not finite by construction (a learned score read from an
// artifact) validates them behind a column newtype at its own boundary. The constant and
// integer-cast signals prove finiteness structurally. PERF: `derive` materializes one f32[N] column
// per fit (4 MB at a million rows) that the rank pass borrows and then drops. A lazy return cannot
// remove the column, because the rank comparator indexes by row. If the allocation ever shows in a
// fit profile, the fix is the house `derive_in(allocator)` variant.
pub(crate) trait ImportanceSignal {
    /// Derives the importance column, one entry per node row.
    fn derive(&self, rows: usize) -> IdVec<NodeRowId, f32>;
}

/// A signal that weighs every row the same.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ConstantImportance;

impl ImportanceSignal for ConstantImportance {
    fn derive(&self, rows: usize) -> IdVec<NodeRowId, f32> {
        IdVec::from_elem(0.0, rows)
    }
}

/// Incident degree: each row's importance is the number of edge slots touching it.
///
/// Degrees read straight off the adjacency fenceposts, so the derivation is `O(N)` over an artifact
/// the fit already published. A self-loop occupies both slots of its node and counts twice, the
/// same reading the adjacency documents. Degrees convert to `f32` exactly up to 2^24 incident slots
/// per node; beyond that the ranking key rounds, which reorders only rows already within a quarter
/// of a percent of each other.
#[derive(Debug, Copy, Clone)]
pub(crate) struct DegreeImportance<'map> {
    adjacency: &'map AdjacencyArchive,
}

impl<'map> DegreeImportance<'map> {
    /// Wraps the adjacency the degrees read from.
    #[inline]
    #[must_use]
    pub(crate) const fn new(adjacency: &'map AdjacencyArchive) -> Self {
        Self { adjacency }
    }
}

impl ImportanceSignal for DegreeImportance<'_> {
    /// Derives the degree column.
    ///
    /// # Panics
    ///
    /// This panics when `rows` disagrees with the adjacency's node domain, which the row-aligned
    /// artifact contract excludes.
    #[expect(
        clippy::cast_precision_loss,
        reason = "degrees stay exactly representable in f32 far beyond any plausible fan-in; the \
                  documented rounding beyond 2^24 reorders near-ties only"
    )]
    fn derive(&self, rows: usize) -> IdVec<NodeRowId, f32> {
        assert_eq!(
            self.adjacency.rows(),
            rows as u64,
            "the adjacency spans the generation's node rows",
        );

        IdVec::from_fn(rows, |row| {
            let degree = self
                .adjacency
                .degree(row)
                .expect("the domain was asserted above");
            degree as f32
        })
    }
}

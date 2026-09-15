//! Per-node importance scores for coarse delivery selection.
//!
//! [`ImportanceSignal`] derives the primary sort key for [`crate::salt::lod::rank::Ranking`].
//! Higher scores receive earlier ranks, affecting which points represent coarse cells.
//! [`RankingConfig`] selects a constant signal or incident degree.
//!
//! Both signals reproduce their columns from equal inputs. Full ranking replay additionally depends
//! on the priority and identity columns, seed, and sorting contract documented by
//! [`crate::salt::lod::rank::Ranking::new`].

use hashql_core::id::IdVec;

use crate::{identity::NodeRowId, salt::adjacency::Adjacency};

#[cfg(test)]
mod tests;

/// The importance signal selected for a fit.
///
/// The manifest echoes the variant and the metadata's ranking origin mirrors it, so a published
/// generation names the signal its delivery order ran under.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum RankingConfig {
    /// A constant column.
    ///
    /// With equal priority scores, ranking uses the seeded identity hash. This introduces no degree
    /// preference and does not guarantee an unbiased sample.
    ConstantColumns,
    /// Incident degree over the adjacency, favoring nodes with more incident edge slots.
    IncidentDegree,
}

const impl Default for RankingConfig {
    fn default() -> Self {
        Self::IncidentDegree
    }
}

/// A derivation of per-node ordinal importance scores.
///
/// Ranking compares scores with [`f32::total_cmp`], greater first, without using their magnitudes.
/// A transform preserves this comparison only if it preserves strict order and ties in the
/// resulting `f32` values. A merely nondecreasing transform can create ties, as can floating-point
/// rounding.
///
/// Each derivation materializes a four-byte score per node for row-indexed comparisons. A million
/// rows require 4,000,000 score bytes, excluding container overhead.
pub(crate) trait ImportanceSignal {
    /// Derives the importance column, one entry per node row.
    ///
    /// # Implementation Note
    ///
    /// Return exactly `rows` finite entries. Equal artifacts and configuration must produce equal
    /// columns, never depending on thread count or timing. The ranking layer rejects no NaNs and
    /// supplies no finiteness check for an implementation.
    fn derive(&self, rows: usize) -> IdVec<NodeRowId, f32>;
}

/// A signal assigning positive zero to every row.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ConstantImportance;

impl ImportanceSignal for ConstantImportance {
    fn derive(&self, rows: usize) -> IdVec<NodeRowId, f32> {
        IdVec::from_elem(0.0, rows)
    }
}

/// A signal assigning each row its incident-edge slot count.
///
/// Derivation takes O(N) time for N nodes. A self-loop counts twice, once in each direction, under
/// [`Adjacency`]'s degree contract.
///
/// # Warning
///
/// Integer degrees convert to `f32` exactly through 2²⁴. Larger degrees may round to the same
/// score. The conversion is nondecreasing, but distinct degrees can become ties resolved by
/// priority and identity hash.
///
/// # Panics
///
/// Derivation panics when `rows` differs from the adjacency's node count.
#[derive(Debug, Copy, Clone)]
pub(crate) struct DegreeImportance<'graph> {
    adjacency: &'graph Adjacency,
}

impl<'graph> DegreeImportance<'graph> {
    /// Selects the adjacency supplying the incident-edge counts.
    #[inline]
    #[must_use]
    pub(crate) const fn new(adjacency: &'graph Adjacency) -> Self {
        Self { adjacency }
    }
}

impl ImportanceSignal for DegreeImportance<'_> {
    #[expect(
        clippy::cast_precision_loss,
        reason = "degrees stay exactly representable in f32 far beyond any plausible fan-in; the \
                  documented rounding beyond 2^24 reorders near-ties only"
    )]
    fn derive(&self, rows: usize) -> IdVec<NodeRowId, f32> {
        assert_eq!(
            self.adjacency.rows(),
            rows,
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

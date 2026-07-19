//! Budget reporting buckets: overall, per relation type, per degree
//! decile.
//!
//! The budget's training metrics answer one question per bucket: is
//! any slice of the relation evidence overpowering the semantic layout
//! at its nodes? A node's clip outcome lands in the overall bucket and
//! its relation-degree decile bucket as-is. Per relation type the
//! recorded outcome is that type's own share: the clip factor is a
//! scalar on the node's summed relation vector, so a type contributing
//! the gradient `g` has exactly `factor * g` applied, and its bucket
//! records that contribution against the node's baseline rather than
//! double-counting the whole node into every type touching it.

use alloc::collections::BTreeMap;

use crate::{
    dataset::OntologyRowId,
    salt::{
        projector::budget::{BudgetSummary, ClippedRelation},
        relation::attraction::AttractionIndex,
    },
};

/// Decile bucket count.
pub(crate) const DECILES: usize = 10;

/// The decile marker for rows without attraction evidence.
const NO_PARTICIPATION: u8 = u8::MAX;

/// Per-row relation-degree deciles over the attraction evidence.
///
/// A row's degree is the number of attraction instances incident to
/// it across every relation type. Deciles are rank-based over the
/// rows that participate at all: equal degrees share a bucket, and
/// the buckets split the participating rows as evenly as ties allow.
/// Rows without attraction evidence have no decile - they receive no
/// relation gradient and appear in no decile bucket.
#[derive(Debug)]
pub(crate) struct DegreeDeciles {
    deciles: Box<[u8]>,
}

impl DegreeDeciles {
    /// Measures per-row degrees and their decile assignment.
    ///
    /// # Panics
    ///
    /// Panics when an attraction edge references a row at or beyond
    /// `rows`; the index and the row domain come from one generation,
    /// so a mismatch is a wiring defect.
    #[must_use]
    pub(crate) fn new(index: &AttractionIndex, rows: usize) -> Self {
        let mut degrees = vec![0_u32; rows];
        for group in index.groups() {
            for edge in group.edges() {
                degrees[edge.source.usize()] += 1;
                degrees[edge.target.usize()] += 1;
            }
        }

        let mut participating: Vec<u32> = degrees
            .iter()
            .copied()
            .filter(|&degree| degree > 0)
            .collect();
        participating.sort_unstable();

        let deciles = degrees
            .iter()
            .map(|&degree| {
                if degree == 0 {
                    return NO_PARTICIPATION;
                }
                // Upper rank: the number of participating degrees at
                // or below this one, at least one for a participant.
                let rank = participating.partition_point(|&value| value <= degree);
                #[expect(
                    clippy::integer_division,
                    clippy::integer_division_remainder_used,
                    reason = "the floored rank-to-bucket division is the decile definition"
                )]
                let decile = (rank - 1) * DECILES / participating.len();
                u8::try_from(decile).expect("a decile index lies below ten")
            })
            .collect();

        Self { deciles }
    }

    /// Returns the row's decile, [`None`] for rows without attraction
    /// evidence.
    #[inline]
    #[must_use]
    pub(crate) fn decile(&self, row: usize) -> Option<usize> {
        let value = self.deciles[row];

        (value != NO_PARTICIPATION).then(|| usize::from(value))
    }
}

/// The budget outcome accumulator across steps, per reporting bucket.
///
/// Type buckets are keyed by the relation's ontology row and ordered
/// by it; decile buckets follow [`DegreeDeciles`]. Buckets accumulate
/// for the whole run - the loop owns when to snapshot them into
/// evidence.
#[derive(Debug, Default)]
pub(crate) struct BudgetBreakdown {
    overall: BudgetSummary,
    by_type: BTreeMap<u64, BudgetSummary>,
    by_decile: [BudgetSummary; DECILES],
}

impl BudgetBreakdown {
    /// Creates an empty breakdown.
    #[must_use]
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Records one relation-active node's outcome.
    pub(crate) fn record_node(&mut self, decile: Option<usize>, outcome: &ClippedRelation) {
        self.overall.record(outcome);
        if let Some(decile) = decile {
            self.by_decile[decile].record(outcome);
        }
    }

    /// Records one relation type's share of a node's outcome.
    pub(crate) fn record_type(&mut self, relation: OntologyRowId, outcome: &ClippedRelation) {
        self.by_type
            .entry(relation.get())
            .or_default()
            .record(outcome);
    }

    /// Returns the run-wide summary over every relation-active node.
    #[inline]
    #[must_use]
    pub(crate) const fn overall(&self) -> &BudgetSummary {
        &self.overall
    }

    /// Returns the per-relation-type summaries, ascending by ontology
    /// row.
    pub(crate) fn types(&self) -> impl Iterator<Item = (OntologyRowId, &BudgetSummary)> {
        self.by_type
            .iter()
            .map(|(&relation, summary)| (OntologyRowId::new(relation), summary))
    }

    /// Returns the per-degree-decile summaries, ascending.
    #[inline]
    #[must_use]
    pub(crate) const fn deciles(&self) -> &[BudgetSummary; DECILES] {
        &self.by_decile
    }
}

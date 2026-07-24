//! Budget reporting buckets and displacement telemetry.
//!
//! Overall, per relation type, per degree decile.
//!
//! The budget's training metrics answer one question per bucket: is any slice of the relation
//! evidence overpowering the semantic layout at its nodes? A node's clip outcome lands in the
//! overall bucket and its relation-degree decile bucket as-is. Per relation type the recorded
//! outcome is that type's own share: the clip factor is a scalar on the node's summed relation
//! vector, so a type contributing the gradient `g` has exactly `factor · g` applied, and its bucket
//! records that contribution against the node's baseline rather than double-counting the whole node
//! into every type touching it.
//!
//! Displacement telemetry measures the relation lens's integrated effect at every refresh tick:
//! with coordinates at both lens extremes in hand, the per-node displacement `Δ_i = ‖y_i(1) -
//! y_i(0)‖` summarizes how far the lens moves each node, reported over the same axes as the
//! budget. The displacement is evidence only: it never steers training.

use alloc::collections::BTreeMap;
use core::mem;

use crate::{
    identity::{Identity as _, OntologyRowId},
    math::Vec2,
    salt::{
        projector::budget::{BudgetSummary, ClippedRelation},
        relation::attraction::AttractionIndex,
    },
};

/// A degree decile, `D1` (lowest participating degrees) through `D10` (highest).
///
/// `Option<Decile>` is one row's participation state: rows without attraction evidence have no
/// decile at all, so no sentinel value exists to misread as a bucket.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(u8)]
enum Decile {
    D1 = 1,
    D2 = 2,
    D3 = 3,
    D4 = 4,
    D5 = 5,
    D6 = 6,
    D7 = 7,
    D8 = 8,
    D9 = 9,
    D10 = 10,
}

impl Decile {
    /// The deciles ascending: the bucket order of every per-decile array.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the index ranges over the ten variants"
    )]
    const ALL: [Self; Self::COUNT] = core::array::from_fn(const |index| {
        // SAFETY: `index` ranges over `0..COUNT`, so `index + 1` ranges over `1..=COUNT` -
        // exactly the enum's `repr(u8)` discriminants `D1 = 1` through `D10 = COUNT`, which
        // `variant_count` ties to the variant list itself.
        unsafe { core::mem::transmute::<u8, Self>(index as u8 + 1) }
    });
    const COUNT: usize = mem::variant_count::<Self>();

    /// Returns the 0-based bucket position, [`D1`](Self::D1) at zero.
    const fn bucket(self) -> usize {
        self as usize - 1
    }
}

/// Per-row relation-degree deciles over the attraction evidence.
///
/// A row's degree is the number of attraction instances incident to it across every relation type.
/// Deciles are rank-based over the rows that participate at all: equal degrees share a bucket, and
/// the buckets split the participating rows as evenly as ties allow. Rows without attraction
/// evidence have no decile - they receive no relation gradient and appear in no decile bucket.
#[derive(Debug)]
pub(crate) struct DegreeDeciles {
    deciles: Box<[Option<Decile>]>,
}

impl DegreeDeciles {
    /// Measures per-row degrees and their decile assignment.
    ///
    /// # Panics
    ///
    /// Panics when an attraction edge references a row at or beyond `rows`; the index and the row
    /// domain come from one generation, so a mismatch is a wiring defect.
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
                    return None;
                }

                // Upper rank: the number of participating degrees at
                // or below this one, at least one for a participant.
                let rank = participating.partition_point(|&value| value <= degree);
                #[expect(
                    clippy::integer_division,
                    clippy::integer_division_remainder_used,
                    reason = "the floored rank-to-bucket division is the decile definition"
                )]
                let decile = (rank - 1) * Decile::COUNT / participating.len();
                Some(Decile::ALL[decile])
            })
            .collect();

        Self { deciles }
    }

    /// Returns the row's decile, [`None`] for rows without attraction evidence.
    #[inline]
    #[must_use]
    pub(crate) fn decile(&self, row: usize) -> Option<usize> {
        self.deciles[row].map(Decile::bucket)
    }
}

/// The budget outcome accumulator across steps, per reporting bucket.
///
/// Type buckets are keyed by the relation's ontology row and ordered by it; decile buckets follow
/// [`DegreeDeciles`]. Buckets accumulate for the whole run - the loop owns when to snapshot them
/// into evidence.
#[derive(Debug, Default)]
pub(crate) struct BudgetBreakdown {
    overall: BudgetSummary,
    by_type: BTreeMap<u64, BudgetSummary>,
    by_decile: [BudgetSummary; Decile::COUNT],
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

    /// Returns the per-relation-type summaries, ascending by ontology row.
    pub(crate) fn types(&self) -> impl Iterator<Item = (OntologyRowId, &BudgetSummary)> {
        self.by_type
            .iter()
            .map(|(&relation, summary)| (OntologyRowId::new(relation), summary))
    }

    /// Returns the per-degree-decile summaries, ascending.
    #[inline]
    #[must_use]
    pub(crate) const fn deciles(&self) -> &[BudgetSummary; Decile::COUNT] {
        &self.by_decile
    }
}

/// Distinct participating rows per relation type, ascending by ontology row.
///
/// A row participates in a type when any attraction instance of that type touches it; several
/// instances count once. Built once per training run and reused by every telemetry tick, so the
/// per-tick cost is the participant lists, not the edge lists.
#[derive(Debug)]
pub(crate) struct TypeParticipants {
    types: Vec<(OntologyRowId, Box<[usize]>)>,
}

impl TypeParticipants {
    /// Collects each relation type's distinct participating rows.
    #[must_use]
    pub(crate) fn new(index: &AttractionIndex) -> Self {
        let types = index
            .groups()
            .iter()
            .map(|group| {
                let mut rows: Vec<usize> = group
                    .edges()
                    .iter()
                    .flat_map(|edge| [edge.source.usize(), edge.target.usize()])
                    .collect();
                rows.sort_unstable();
                rows.dedup();
                (group.relation(), rows.into_boxed_slice())
            })
            .collect();

        Self { types }
    }

    /// Iterates the types and their participants, ascending by ontology row.
    pub(crate) fn iter(&self) -> impl Iterator<Item = (OntologyRowId, &[usize])> {
        self.types
            .iter()
            .map(|(relation, rows)| (*relation, &**rows))
    }
}

/// Streaming summary statistics for one displacement bucket.
///
/// The sums are accumulated in double precision; `maximum` is zero until the first record.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct DisplacementMoments {
    count: u64,
    sum: f64,
    sum_squares: f64,
    maximum: f32,
}

impl DisplacementMoments {
    /// Records one displacement.
    pub(crate) fn record(&mut self, displacement: f32) {
        let value = f64::from(displacement);

        self.count += 1;
        self.sum += value;
        self.sum_squares = value.mul_add(value, self.sum_squares);
        self.maximum = self.maximum.max(displacement);
    }

    /// Returns the recorded displacement count.
    #[inline]
    #[must_use]
    pub(crate) const fn count(&self) -> u64 {
        self.count
    }

    /// Returns the displacement sum.
    #[inline]
    #[must_use]
    pub(crate) const fn sum(&self) -> f64 {
        self.sum
    }

    /// Returns the sum of squared displacements.
    #[inline]
    #[must_use]
    pub(crate) const fn sum_squares(&self) -> f64 {
        self.sum_squares
    }

    /// Returns the largest recorded displacement, zero when empty.
    #[inline]
    #[must_use]
    pub(crate) const fn maximum(&self) -> f32 {
        self.maximum
    }
}

/// Bucket count of [`DisplacementHistogram`]: one bucket per `f32` biased exponent.
pub(crate) const EXPONENT_BUCKETS: usize = 256;

/// A displacement histogram over the `f32` exponent grid.
///
/// Bucket `b` counts displacements whose biased exponent is `b`: bucket 0 holds exact zeros and
/// subnormals, and bucket `b` for `1 ≤ b ≤ 254` holds values in `[2^(b - 127), 2^(b - 126))`. The
/// format's own grid needs no configured edges and resolves nine decades to within a factor of two,
/// which is the resolution the telemetry questions ask at.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct DisplacementHistogram {
    counts: [u64; EXPONENT_BUCKETS],
    moments: DisplacementMoments,
}

impl Default for DisplacementHistogram {
    fn default() -> Self {
        Self {
            counts: [0; EXPONENT_BUCKETS],
            moments: DisplacementMoments::default(),
        }
    }
}

impl DisplacementHistogram {
    /// Records one finite, non-negative displacement.
    pub(crate) fn record(&mut self, displacement: f32) {
        debug_assert!(
            displacement.is_finite() && displacement >= 0.0,
            "displacements are norms of finite coordinates"
        );
        // `abs` clears the sign bit so the exponent index is total
        // over finite inputs; a negative zero would otherwise shift
        // its sign into the index.
        self.counts[(displacement.abs().to_bits() >> 23) as usize] += 1;
        self.moments.record(displacement);
    }

    /// Returns the per-exponent bucket counts.
    #[inline]
    #[must_use]
    pub(crate) const fn counts(&self) -> &[u64; EXPONENT_BUCKETS] {
        &self.counts
    }

    /// Returns the summary statistics over every recorded value.
    #[inline]
    #[must_use]
    pub(crate) const fn moments(&self) -> &DisplacementMoments {
        &self.moments
    }
}

/// One refresh tick's displacement field, per reporting bucket.
///
/// The overall and per-decile buckets carry full histograms; the per-type buckets carry summary
/// moments only, because a corpus has thousands of relation types and the per-type question - is a
/// type moving nodes it has little evidence for - reads from location and spread, not shape. Rows
/// without attraction evidence land in the overall bucket only: the lens can move them indirectly,
/// and the map-wide field is exactly what the overall histogram reports.
#[derive(Debug, Clone, PartialEq, Default)]
pub(crate) struct DisplacementSummary {
    overall: DisplacementHistogram,
    by_type: BTreeMap<u64, DisplacementMoments>,
    by_decile: [DisplacementHistogram; Decile::COUNT],
}

impl DisplacementSummary {
    /// Measures the displacement field between two lens extremes.
    ///
    /// `low` and `high` are the corpus coordinates at the two lens extremes, in row order.
    ///
    /// # Panics
    ///
    /// Panics when the frames disagree in length or a participant row lies outside them; the
    /// frames, the participants, and the deciles all describe one corpus, so a mismatch is a wiring
    /// defect.
    #[must_use]
    pub(crate) fn measure(
        low: &[Vec2],
        high: &[Vec2],
        participants: &TypeParticipants,
        deciles: &DegreeDeciles,
    ) -> Self {
        assert_eq!(
            low.len(),
            high.len(),
            "the two extreme frames should cover the same rows"
        );

        let displacements: Vec<f32> = low
            .iter()
            .zip(high)
            .map(|(&low, &high)| low.distance(high))
            .collect();

        let mut summary = Self::default();
        for (row, &displacement) in displacements.iter().enumerate() {
            summary.overall.record(displacement);
            if let Some(decile) = deciles.decile(row) {
                summary.by_decile[decile].record(displacement);
            }
        }

        for (relation, rows) in participants.iter() {
            let mut moments = DisplacementMoments::default();
            for &row in rows {
                moments.record(displacements[row]);
            }
            summary.by_type.insert(relation.get(), moments);
        }

        summary
    }

    /// Returns the whole-corpus histogram.
    #[inline]
    #[must_use]
    pub(crate) const fn overall(&self) -> &DisplacementHistogram {
        &self.overall
    }

    /// Returns the per-relation-type moments, ascending by ontology row.
    pub(crate) fn types(&self) -> impl Iterator<Item = (OntologyRowId, &DisplacementMoments)> {
        self.by_type
            .iter()
            .map(|(&relation, moments)| (OntologyRowId::new(relation), moments))
    }

    /// Returns the per-degree-decile histograms, ascending.
    #[inline]
    #[must_use]
    pub(crate) const fn deciles(&self) -> &[DisplacementHistogram; Decile::COUNT] {
        &self.by_decile
    }
}

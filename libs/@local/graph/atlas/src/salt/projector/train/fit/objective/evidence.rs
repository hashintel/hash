//! The target objective's run evidence.
//!
//! [`TargetEvidence`] is the record one target-configured run segment leaves for the writer
//! that persists a generation, and [`RulerTables`] carries the frozen ruler's two tables
//! inside it.

use hashql_core::id::{Id, IdMatrix, IdSlice};

use crate::{
    integrity::Sha256Digest,
    math::{DNonNegative, Finite, FinitePointCloud, NonNegative},
    salt::{
        knn::construction::NeighbourSlot,
        projector::{
            evidence::{EnforcementSummary, EvaluationEvidence, RulerIdentity},
            loss::UnitLaw,
        },
    },
};

/// The frozen ruler's two tables, in node-row order.
///
/// The scales are the exact `ρ₀` readings the estimand divides by, and the neighbour sets are
/// the index sets they were measured over - one boundary field admits many rulers, and the
/// tables are what tie this run to this one. Both containers keep their row domain and their
/// shape until the writer that persists a generation serializes them, and that writer owns
/// their file identity.
#[derive(Debug, PartialEq)]
pub(crate) struct RulerTables<N> {
    scales: Box<IdSlice<N, NonNegative>>,
    neighbours: IdMatrix<N, NeighbourSlot, N>,
}

impl<N> RulerTables<N>
where
    N: Id,
{
    /// Pairs the frozen scale table with its neighbour sets.
    ///
    /// # Panics
    ///
    /// This panics when the two tables disagree about the row count. Both leave one frozen
    /// ruler, so a mismatch is a wiring defect.
    pub(crate) fn new(
        scales: Box<IdSlice<N, NonNegative>>,
        neighbours: IdMatrix<N, NeighbourSlot, N>,
    ) -> Self {
        assert_eq!(
            scales.len(),
            neighbours.rows(),
            "the scale table and the neighbour sets cover one row domain"
        );

        Self { scales, neighbours }
    }

    /// Borrows the frozen `ρ₀` readings, in node-row order.
    pub(crate) fn scales(&self) -> &IdSlice<N, NonNegative> {
        &self.scales
    }

    /// Borrows the frozen neighbour sets.
    ///
    /// Each row's entries keep the freeze's own order - ascending stored distance with ties in
    /// row order.
    pub(crate) const fn neighbours(&self) -> &IdMatrix<N, NeighbourSlot, N> {
        &self.neighbours
    }

    /// Neighbour entries per row.
    pub(crate) const fn width(&self) -> usize {
        self.neighbours.columns()
    }
}

/// The target objective's run evidence, one record per target-configured run segment.
///
/// The identity carries the freeze's scalar constants, and the typed artifacts - the boundary
/// field and the ruler's tables - ride beside it in their own containers, so the writer that
/// persists a generation receives the exact values every reading was measured on and owns
/// their file identity. The estimand trajectory and the per-evaluation readings hold the
/// run's measurements, and the enforcement record's final state closes the record.
#[derive(Debug, PartialEq)]
pub(crate) struct TargetEvidence<N> {
    /// The frozen ruler's identity, the constants every reading normalizes against.
    pub identity: RulerIdentity,
    /// The declared unit law every population derivation conditioned on.
    pub unit_law: UnitLaw,
    /// The versioned split rule's content digest.
    ///
    /// The rule it names fixed every declared population's membership before optimization.
    pub split_digest: Sha256Digest,
    /// The boundary field `Z_K`, in node-row order, finite by construction.
    ///
    /// The zero-condition coordinates every frozen reference was measured on.
    pub boundary_field: Box<FinitePointCloud<N>>,
    /// The frozen ruler's two tables.
    pub tables: RulerTables<N>,
    /// The unscaled estimand reading `L̂` of every post-boundary step, in step order.
    ///
    /// Live at every activation, including zero: the reference replicate reads what the target
    /// term would score.
    pub estimands: Vec<Finite>,
    /// The per-evaluation evidence readings, in step order.
    pub evaluations: Vec<EvaluationEvidence>,
    /// The final per-row enforcement maxima `u(n) = max ‖z_pre − z_K‖/s_ref`, node-row order.
    ///
    /// Already dimensionless: the band record divides every displacement by the reference
    /// spread as it accumulates, so the calibration consumes these readings unscaled.
    pub row_maxima: Box<IdSlice<N, DNonNegative>>,
    /// The enforcement record's final cumulative readings.
    pub enforcement: EnforcementSummary,
}

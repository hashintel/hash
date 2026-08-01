//! Training-step machinery for the conditioned projector.
//!
//! One training step draws a minibatch over the built artifacts and projects its rows at the step's
//! relation-lens rung. The step then evaluates the composite objective against the detached
//! coordinates and measures the relation forces per node for the budget diagnostics. Its return
//! value is one backward-ready scalar whose gradient carries exactly the combined per-node field
//! through the shared model parameters.
//!
//! The step splits along the module seams: [`batch`] draws the step's populations and re-indexes
//! them into a batch-local coordinate domain, [`step`] evaluates the objective over the assembled
//! batch, [`metrics`] accumulates the budget outcomes and the displacement telemetry into the
//! reporting buckets (overall, per relation type, per relation-degree decile), [`refresh`]
//! re-measures everything defined over current coordinates at the configured cadence, and
//! [`mod@fit`] composes them all into the optimization loop with its lens schedule and phase
//! boundary.
//!
//! Every family shares one estimator convention. Each term scales its batch sum so the expectation
//! stays independent of the batch plan's draw counts, which keeps the loss coefficients' meaning
//! stable across configurations.
//!
//! - Semantic attraction scales by `W / m` (total positive edge weight over drawn pairs), the
//!   unbiased estimator of the full weighted attraction.
//! - Ordinary repulsion scales by `W / m` as well, so the ordinary coefficient over the semantic
//!   one reads directly as the repulsion-to-attraction balance.
//! - Hard-negative repulsion scales by `N / m` (corpus rows over drawn query rows), the unbiased
//!   estimator of the pooled mined-frame total.
//! - Relation attraction scales by `G / g` (total relation groups over drawn groups), the unbiased
//!   estimator of the capped relation objective. That objective is the specified per-type clipped
//!   total over the same force-mass population the boundary calibration measures its radius over.
//!   Changing the per-type factor re-derives both surfaces together, so they move in lockstep by
//!   contract.
//! - Support terms scale by their pool size over the drawn count.

pub(crate) mod batch;
mod fit;
pub(crate) mod metrics;
pub(crate) mod refresh;
pub(crate) mod step;
#[cfg(test)]
mod tests;

use core::{error::Error, fmt, num::NonZero};

pub(crate) use self::{
    batch::{NodeColumns, SupportAnchor},
    fit::{
        BoundaryState, Fitted, FrozenRadius, RelationLens, TrainError, TrainOptions, TrainerInputs,
        TrainerOptimizerRecord, TrainingSchedule, fit,
    },
};
#[expect(
    unused_imports,
    reason = "the evidence and boundary-fork surfaces await their consumers: training-telemetry \
              metadata summaries and the checkpoint-fork tuning protocol"
)]
pub(crate) use self::{
    fit::{BoundaryEvidence, TickTelemetry, TrainingEvidence, fit_from_boundary, fit_to_boundary},
    metrics::{BudgetBreakdown, DisplacementHistogram, DisplacementMoments, DisplacementSummary},
    step::LossBreakdown,
};
use crate::{
    math::{NonNegative, Positive},
    salt::projector::{
        budget::Budget,
        loss::{AffinityEnergy, RelationEnergy, SupportOptions},
    },
};

/// The relation-lens rungs the trainer schedules, ascending.
///
/// The first and last entries are the lens extremes.
///
/// This is the training curriculum rather than the published schedule. The lens is a continuous
/// conditioning input, and these three points (both extremes plus the midpoint) are where the
/// trainer samples it. The configurable rung set lives on the ladder
/// ([`LadderOptions`](crate::salt::ladder::LadderOptions)), which decides where the fitted model is
/// *evaluated* for publication. Publication admits any rung in `[0, 1]`, independent of the
/// curriculum.
pub(crate) const RUNGS: [NonNegative; 3] = [
    NonNegative::ZERO,
    NonNegative::new(0.5).expect("the midpoint rung is finite and non-negative"),
    NonNegative::ONE,
];

/// A training step failed.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum StepError<N> {
    /// The forward pass produced a non-finite coordinate: training diverged at this corpus row.
    Diverged { row: N },
}

impl<N> StepError<N> {
    /// Maps the row the error names into another row domain.
    pub(crate) fn map_rows<M>(self, row: impl FnOnce(N) -> M) -> StepError<M> {
        match self {
            Self::Diverged { row: diverged } => StepError::Diverged { row: row(diverged) },
        }
    }
}

impl<N> fmt::Display for StepError<N>
where
    N: fmt::Display,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Diverged { row } => write!(
                fmt,
                "training diverged: row {row} projected to a non-finite coordinate",
            ),
        }
    }
}

impl<N> Error for StepError<N> where N: fmt::Debug + fmt::Display {}

/// Objective coefficients, one per loss family.
///
/// The semantic attraction coefficient is strictly positive - the semantic layout is the frame for
/// every other force, and a run without it has no baseline to measure by - and every other
/// coefficient is finite and non-negative.
///
/// The relation coefficient is the lens-independent factor; the training loop multiplies it by the
/// step's rung, so a zero rung contributes nothing regardless of the configured value.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Coefficients {
    semantic: Positive,
    ordinary: NonNegative,
    hard: NonNegative,
    relation: NonNegative,
    anchor: NonNegative,
    landmark: NonNegative,
}

impl Coefficients {
    /// Assembles objective coefficients.
    #[must_use]
    pub(crate) const fn new(
        semantic: Positive,
        ordinary: NonNegative,
        hard: NonNegative,
        relation: NonNegative,
        anchor: NonNegative,
        landmark: NonNegative,
    ) -> Self {
        Self {
            semantic,
            ordinary,
            hard,
            relation,
            anchor,
            landmark,
        }
    }

    /// Returns the semantic attraction coefficient.
    #[inline]
    #[must_use]
    pub(crate) const fn semantic(self) -> Positive {
        self.semantic
    }

    /// Returns the ordinary repulsion coefficient.
    #[inline]
    #[must_use]
    pub(crate) const fn ordinary(self) -> NonNegative {
        self.ordinary
    }

    /// Returns the hard-negative repulsion coefficient.
    #[inline]
    #[must_use]
    pub(crate) const fn hard(self) -> NonNegative {
        self.hard
    }

    /// Returns the lens-independent relation coefficient.
    #[inline]
    #[must_use]
    pub(crate) const fn relation(self) -> NonNegative {
        self.relation
    }

    /// Returns the temporal-anchor support coefficient.
    #[inline]
    #[must_use]
    pub(crate) const fn anchor(self) -> NonNegative {
        self.anchor
    }

    /// Returns the landmark support coefficient.
    #[inline]
    #[must_use]
    pub(crate) const fn landmark(self) -> NonNegative {
        self.landmark
    }
}

/// The per-step sampling plan, with one draw count per family.
///
/// A zero count disables its family for the run; the semantic draw and the relation cap are
/// structurally positive because a batch without semantic pairs cannot train and a zero cap would
/// admit no edges from a selected type.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct BatchPlan {
    /// Semantic positive pairs per step, drawn weight-proportionally.
    pub semantic_pairs: NonZero<usize>,
    /// Ordinary negative pairs per step, drawn uniformly past the vetoes.
    pub ordinary_pairs: usize,
    /// Relation types per step, drawn uniformly without replacement.
    pub relation_types: usize,
    /// Distinct attraction edges each drawn type contributes at most.
    pub relation_cap: NonZero<usize>,
    /// Query rows per step whose pooled mined pairs enter the batch.
    pub hard_queries: usize,
    /// Landmark anchors per step, drawn uniformly from the skeleton.
    pub landmark_anchors: usize,
    /// Temporal anchors per step, drawn uniformly from the retained set.
    pub temporal_anchors: usize,
}

/// The step objective's numerical contract.
///
/// Every field is a validated value. The struct is plain wiring. The relation energy is absent
/// exactly while the run has no frozen Proximal radius - the opening semantic-only segment - and
/// the loop supplies it when the ladder opens.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ObjectiveOptions {
    /// The semantic affinity energy shared by attraction and both repulsion families.
    pub affinity: AffinityEnergy,
    /// The relation class-mixture energy.
    ///
    /// [`None`] before the boundary freezes the Proximal radius.
    pub relation: Option<RelationEnergy>,
    /// The support-term constants shared by anchors and landmarks.
    pub support: SupportOptions,
    /// The per-node relation-gradient diagnostics' baseline convention.
    pub budget: Budget,
    /// The objective coefficients.
    pub coefficients: Coefficients,
}

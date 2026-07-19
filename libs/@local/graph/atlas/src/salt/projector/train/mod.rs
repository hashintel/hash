//! Training-step machinery for the conditioned projector.
//!
//! One training step draws a minibatch over the built artifacts,
//! projects its rows at the step's relation-lens rung, evaluates the
//! composite objective against the detached coordinates, clips the
//! relation forces per node, and returns one backward-ready scalar
//! whose gradient carries exactly the budgeted per-node field through
//! the shared model parameters.
//!
//! The step splits along the module seams: [`batch`] draws the step's
//! populations and re-indexes them into a batch-local coordinate
//! domain, [`step`] evaluates the objective over the assembled batch,
//! [`metrics`] accumulates the budget outcomes and the displacement
//! telemetry into the reporting buckets (overall, per relation type,
//! per relation-degree decile), [`refresh`] re-measures everything
//! defined over current coordinates at the configured cadence, and
//! [`fit`] composes them all into the optimization loop with its lens
//! schedule and phase boundary.
//!
//! Estimator conventions, shared by every family: each term's batch
//! sum is scaled so its expectation is independent of the batch plan's
//! draw counts, keeping the loss coefficients' meaning stable across
//! configurations.
//!
//! - Semantic attraction scales by `W / m`: total positive edge weight over drawn pairs, the
//!   unbiased estimator of the full weighted attraction.
//! - Ordinary repulsion scales by `W / m` as well, so the ordinary coefficient over the semantic
//!   one reads directly as the repulsion-to-attraction balance.
//! - Hard-negative repulsion scales by `N / m`: corpus rows over drawn query rows, the unbiased
//!   estimator of the pooled mined-frame total.
//! - Relation attraction scales by `G / g`: total relation groups over drawn groups, the unbiased
//!   estimator of the capped-sampling objective - the same force-mass population the boundary
//!   calibration measures its radius over.
//! - Support terms scale by their pool size over the drawn count.

mod batch;
mod fit;
mod metrics;
mod refresh;
mod step;
#[cfg(test)]
mod tests;

use core::{error::Error, fmt, num::NonZero};

#[expect(
    unused_imports,
    reason = "the trainer's surface awaits its consumer: the fit pipeline's projector stage"
)]
pub(crate) use self::{
    batch::NodeColumns,
    fit::{
        BoundaryEvidence, Fitted, FrozenRadius, RelationLens, TickTelemetry, TrainError,
        TrainOptions, TrainerInputs, TrainingEvidence, TrainingSchedule, fit,
    },
    metrics::{BudgetBreakdown, DisplacementHistogram, DisplacementMoments, DisplacementSummary},
    step::LossBreakdown,
};
use crate::{
    dataset::NodeRowId,
    salt::projector::{
        budget::BudgetOptions,
        loss::{AffinityEnergy, RelationEnergy, SupportOptions},
    },
};

/// The relation-lens rungs the trainer schedules, ascending; the
/// first and last entries are the lens extremes.
pub(crate) const RUNGS: [f32; 3] = [0.0, 0.5, 1.0];

/// A training step failed.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum StepError {
    /// The forward pass produced a non-finite coordinate: training
    /// diverged at this corpus row.
    Diverged { row: NodeRowId },
}

impl fmt::Display for StepError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Diverged { row } => write!(
                formatter,
                "training diverged: row {} projected to a non-finite coordinate",
                row.get()
            ),
        }
    }
}

impl Error for StepError {}

/// Validated objective coefficients, one per loss family.
///
/// Every coefficient is finite and non-negative, and the semantic
/// attraction coefficient is strictly positive: the semantic layout is
/// the frame every other force is budgeted against, and a run without
/// it has no baseline to budget by.
///
/// The relation coefficient is the lens-independent factor; the
/// training loop multiplies it by the step's rung, so a zero rung
/// contributes nothing regardless of the configured value.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Coefficients {
    semantic: f32,
    ordinary: f32,
    hard: f32,
    relation: f32,
    anchor: f32,
    landmark: f32,
}

impl Coefficients {
    /// Validates objective coefficients.
    ///
    /// Returns [`None`] unless every coefficient is finite and
    /// non-negative and the semantic coefficient is strictly positive.
    #[must_use]
    pub(crate) fn new(
        semantic: f32,
        ordinary: f32,
        hard: f32,
        relation: f32,
        anchor: f32,
        landmark: f32,
    ) -> Option<Self> {
        let non_negative = [semantic, ordinary, hard, relation, anchor, landmark]
            .into_iter()
            .all(|value| value.is_finite() && value >= 0.0);

        (non_negative && semantic > 0.0).then_some(Self {
            semantic,
            ordinary,
            hard,
            relation,
            anchor,
            landmark,
        })
    }
}

/// The per-step sampling plan: how many draws each family receives.
///
/// A zero count disables its family for the run; the semantic draw and
/// the relation cap are structurally positive because a batch without
/// semantic pairs cannot train and a zero cap would admit no edges
/// from a selected type.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct BatchPlan {
    /// Semantic positive pairs per step, drawn weight-proportionally.
    pub semantic_pairs: NonZero<usize>,
    /// Ordinary negative pairs per step, drawn uniformly past the
    /// vetoes.
    pub ordinary_pairs: usize,
    /// Relation types per step, drawn uniformly without replacement.
    pub relation_types: usize,
    /// Distinct attraction edges each drawn type contributes at most.
    pub relation_cap: NonZero<usize>,
    /// Query rows per step whose pooled mined pairs enter the batch.
    pub hard_queries: usize,
    /// Landmark anchors per step, drawn uniformly from the skeleton.
    pub landmark_anchors: usize,
    /// Temporal anchors per step, drawn uniformly from the retained
    /// set.
    pub temporal_anchors: usize,
}

/// The step objective's numerical contract.
///
/// Every field is a validated value; the struct is plain wiring. The
/// relation energy is absent exactly while no Proximal radius has been
/// frozen - the opening semantic-only segment - and the loop supplies
/// it when the ladder opens.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ObjectiveOptions {
    /// The semantic affinity energy shared by attraction and both
    /// repulsion families.
    pub affinity: AffinityEnergy,
    /// The relation class-mixture energy; [`None`] before the boundary
    /// freezes the Proximal radius.
    pub relation: Option<RelationEnergy>,
    /// The support-term constants shared by anchors and landmarks.
    pub support: SupportOptions,
    /// The per-node relation-gradient budget.
    pub budget: BudgetOptions,
    /// The objective coefficients.
    pub coefficients: Coefficients,
}

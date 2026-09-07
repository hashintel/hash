//! The record a training run keeps about itself.
//!
//! Training measures itself as it runs, and the measurements return with the trained model, so
//! a reader judges a run from its published record alone. Step-indexed readings append in step
//! order, and the boundary's record carries the full measurement it froze from.

use super::{objective::TargetEvidence, options::RelationLens};
use crate::{
    math::{DNonNegative, NonNegative},
    salt::projector::{
        loss::RelationEnergy,
        train::{
            metrics::{BudgetBreakdown, DisplacementSummary},
            step::LossBreakdown,
        },
        verdict::calibrate::ProximalCalibration,
    },
};

/// How the boundary froze the Proximal radius.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum FrozenRadius {
    /// Measured from the reviewed-Proximal pairs.
    Measured { radius: NonNegative },
    /// Nothing to freeze: the attraction index carries no force.
    Vacuous,
}

impl FrozenRadius {
    /// Composes the relation energy the ladder measures with, from the configured lens.
    ///
    /// Returns [`None`] for a vacuous boundary: no force means no relation loss to measure.
    ///
    /// # Panics
    ///
    /// This panics when a measured radius fails the lens's radius ordering. The trainer composed
    /// this exact energy at the boundary before freezing the radius, so the failure is a defect
    /// of the freeze rather than a data condition.
    #[must_use]
    pub(crate) fn energy(self, lens: &RelationLens) -> Option<RelationEnergy> {
        match self {
            Self::Measured { radius } => Some(
                lens.energy(radius)
                    .expect("the trainer composed this energy at the boundary"),
            ),
            Self::Vacuous => None,
        }
    }
}

/// The step the phase boundary ran at, what it froze, and the measurement it froze from.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct BoundaryEvidence {
    /// The step index the boundary ran at.
    pub step: usize,
    /// The frozen radius and its provenance.
    pub radius: FrozenRadius,
    /// The full measurement.
    ///
    /// Pooled radius, per-type quantiles, mass shares, and leave-one-type-out radii. Empty on a
    /// vacuous run.
    pub calibration: ProximalCalibration,
}

/// One refresh tick's boundary-drift reading.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RefreshFraction {
    /// The step index the tick ran at.
    pub step: usize,
    /// The weighted fraction of reviewed-Proximal mass at or below the frozen radius.
    ///
    /// Measured over the tick's low-step frame and its low-step scale table, the same
    /// step/frame-scale pair the freeze measured on, so the series reads calibration drift and
    /// never answers a movement question. The boundary tick contributes the first entry, and
    /// later entries drift against it.
    pub fraction: DNonNegative,
}

/// One refresh tick's displacement telemetry.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TickTelemetry {
    /// The step index the tick ran at.
    pub step: usize,
    /// The displacement field between the lens extremes.
    pub displacement: DisplacementSummary,
}

/// Everything a training run measured about itself.
///
/// `N` is the trainer's own row domain: the target record's containers stay typed in it until
/// the writer that persists a generation serializes them.
#[derive(Debug)]
pub(crate) struct TrainingEvidence<N> {
    /// The phase boundary's record, or [`None`] when the boundary never ran.
    pub boundary: Option<BoundaryEvidence>,
    /// The run-wide budget outcomes per reporting bucket.
    pub budget: BudgetBreakdown,
    /// Per-step loss values, in step order.
    pub losses: Vec<LossBreakdown>,
    /// Per-tick displacement telemetry, in step order.
    pub telemetry: Vec<TickTelemetry>,
    /// Per-tick boundary-drift readings, in step order.
    ///
    /// Empty until the boundary froze a measured radius: the fraction is defined against the
    /// frozen radius, so pre-boundary and vacuous ticks have nothing to read.
    pub fractions: Vec<RefreshFraction>,
    /// The target objective's run evidence.
    ///
    /// Present exactly when a target-configured segment crossed the boundary.
    pub target: Option<TargetEvidence<N>>,
}

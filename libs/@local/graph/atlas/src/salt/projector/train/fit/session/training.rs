//! The mutable training state and its builders.
//!
//! [`Training`] is exactly the state that crosses the phase boundary, and the two builders
//! construct the optimizer and scheduler a validated schedule describes. One construction
//! site each keeps a resumed run's machinery identical to the opening segment's.

use burn::{
    lr_scheduler::cosine::{CosineAnnealingLrScheduler, CosineAnnealingLrSchedulerConfig},
    optim::{Adam, AdamConfig, Optimizer, adaptor::OptimizerAdaptor},
    tensor::backend::AutodiffBackend,
};

use super::super::{TargetRefusal, TargetRefusalCause, TrainingEvidence, TrainingSchedule};
use crate::salt::projector::model::Projector;

/// The trainer's optimizer: Adam adapted over the projector.
pub(crate) type TrainerOptimizer<B> = OptimizerAdaptor<Adam, Projector<B>, B>;

/// Per-parameter Adam moments for the trainer's optimizer.
#[cfg_attr(
    not(test),
    expect(
        dead_code,
        reason = "the resume checkpoint record is its consumer, and nothing resumes yet"
    )
)]
pub(crate) type TrainerOptimizerRecord<B> =
    <TrainerOptimizer<B> as Optimizer<Projector<B>, B>>::Record;

/// The mutable training state one step advances.
///
/// This is exactly the state that crosses the phase boundary. The checkpoint artifact serializes it
/// (with the caller's generator position) and a resumed ladder starts from it.
// No Debug: the optimizer adaptor does not implement it.
pub(crate) struct Training<N, B: AutodiffBackend<FloatElem = f32>> {
    pub model: Projector<B>,
    pub optimizer: TrainerOptimizer<B>,
    pub scheduler: CosineAnnealingLrScheduler,
    pub evidence: TrainingEvidence<N>,
}

/// Builds a fresh trainer optimizer.
///
/// Every call constructs a new optimizer and shares no state across calls. One construction site
/// keeps a resumed run's optimizer identical to the one the opening segment trained under.
pub(crate) fn optimizer<B: AutodiffBackend<FloatElem = f32>>() -> TrainerOptimizer<B> {
    AdamConfig::new().with_epsilon(1.0e-8).init()
}

/// Builds the cosine scheduler a validated schedule describes.
pub(crate) fn scheduler(schedule: TrainingSchedule) -> CosineAnnealingLrScheduler {
    CosineAnnealingLrSchedulerConfig::new(
        schedule.initial_learning_rate().get(),
        schedule.steps().get(),
    )
    .with_min_lr(schedule.minimum_learning_rate().get())
    .init()
    .expect("a validated schedule satisfies the scheduler's domain")
}

/// The terminal state of one run segment.
///
/// A segment either completes with the advanced training state or ends at the target refusal.
/// The record measured before the refusal rides the refusal as a value, so no unwinding call
/// can drop it.
// No Debug: the optimizer adaptor inside `Training` does not implement it.
#[expect(
    clippy::large_enum_variant,
    reason = "the outcome is constructed and consumed once per run segment, so the size \
              difference never rides a hot path"
)]
pub(crate) enum RunOutcome<N, B: AutodiffBackend<FloatElem = f32>> {
    /// The segment completed and the training state advanced.
    Completed(Training<N, B>),
    /// The target objective refused, so the run publishes no activation candidate and
    /// everything measured before the refusal rides it.
    Refused(TargetRefusal<N>),
}

impl<N, B: AutodiffBackend<FloatElem = f32>> RunOutcome<N, B> {
    /// Seals the run record into a refusal at the failing step.
    pub(super) fn refused(
        step: usize,
        cause: TargetRefusalCause<N>,
        evidence: TrainingEvidence<N>,
    ) -> Self {
        Self::Refused(TargetRefusal {
            step,
            cause,
            evidence: Box::new(evidence),
        })
    }
}

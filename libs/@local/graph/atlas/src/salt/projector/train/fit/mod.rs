//! The schedule, phase boundary, refresh ticks, and optimization loop of a training run.
//!
//! One run trains the conditioned projector end to end. It opens with a semantic-only segment at
//! the zero step. At the configured boundary step it freezes the Proximal radius from data - the
//! force-mass-weighted 25th percentile of the locally normalized distance `z` over the
//! reviewed-Proximal attraction pairs, measured against the boundary's own coordinates - composes
//! the relation energy, and opens the step ladder, round-robining the steps across the lens steps
//! with the relation term scaled by each step's step. Refresh ticks at a configured cadence
//! re-measure everything defined over current coordinates: per-step local scales, hard negatives
//! mined at both lens extremes, and the displacement telemetry.
//!
//! Optimization is Adam under a cosine learning-rate schedule, with one backward pass per step
//! through the budget surrogate. A seed fixes every batch draw, so draws are deterministic. The
//! backend's gradient accumulation need not be deterministic.
//!
//! The boundary measures the frozen radius from reviewed evidence, and the full measurement -
//! per-type quantiles, mass shares, leave-one-type-out radii, and the evaluated stability
//! certificate - persists in generation evidence, so a reader judges the freeze against data
//! from the published artifact alone. Each scale-bearing tick also re-measures the weighted
//! fraction of reviewed mass inside the frozen radius, the drift series beside the freeze.
//! A corpus whose attraction index carries no force at all trains vacuously: the relation term
//! stays absent and the run records why.
//!
//! A target-configured run additionally trains the declared estimand from the boundary on: the
//! boundary freezes the target references against the same zero-condition frame the radius
//! measures on, every ladder step enforces the band constraint and folds the batch estimator at
//! the estimand's two steps, and every post-boundary tick reads the per-evaluation evidence.
//! [`mod@objective`] owns that machinery, and its whole configuration is optional: a released run
//! passes none of it and trains exactly as before.

mod error;
mod evidence;
#[cfg(test)]
mod fixture;
mod inputs;
mod objective;
mod options;
mod session;
#[cfg(test)]
mod tests;

use core::num::NonZero;
use std::io;

use burn::{
    lr_scheduler::LrScheduler as _,
    module::Module as _,
    optim::Optimizer as _,
    record::{FullPrecisionSettings, NamedMpkBytesRecorder, Record, Recorder as _},
    tensor::backend::AutodiffBackend,
};
use hashql_core::id::Id;
use rand::{Rng, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;

use self::session::{RunOutcome, Session, Training};
pub(crate) use self::{
    error::{TargetRefusal, TargetRefusalCause, TrainError},
    evidence::{BoundaryEvidence, FrozenRadius, RefreshFraction, TickTelemetry, TrainingEvidence},
    inputs::TrainerInputs,
    options::{RelationLens, TrainOptions, TrainingSchedule},
};
use super::metrics::BudgetBreakdown;
use crate::{
    math::{PositiveUnitFraction, UnitFraction},
    progress::Progress,
    salt::projector::{
        artifact::CheckpointError,
        model::{Architecture, Projector, ProjectorRecord},
    },
};

/// A trained projector and the evidence of its training.
#[derive(Debug)]
pub(crate) struct Model<N, B: AutodiffBackend> {
    /// The trained model.
    pub projector: Projector<B>,
    /// The run's evidence.
    pub evidence: TrainingEvidence<N>,
}

/// One training run's terminal state.
///
/// A run that does not error ends as a trained projector with its sealed evidence, or as
/// the target objective's refusal carrying everything measured before it. The refusal is an
/// outcome rather than an error because a refused run terminates lawfully with a record - it
/// publishes no activation candidate and the prior active generation stays. A diverged
/// forward or a failed step stays an error, and no record survives it.
#[derive(Debug)]
#[expect(
    clippy::large_enum_variant,
    reason = "the outcome is constructed and consumed once per run, so the size difference never \
              rides a hot path"
)]
pub(crate) enum FitOutcome<N, B: AutodiffBackend> {
    /// A completed run's trained model beside its evidence.
    Trained(Model<N, B>),
    /// The target objective refused, with the run record preserved through the refusing step.
    TargetRefused(TargetRefusal<N>),
}

/// A decoded resume checkpoint holding the boundary state and the run's batch-draw stream.
// No Debug: `BoundaryState` carries the optimizer adaptor, which does not implement it.
#[cfg_attr(
    not(test),
    expect(dead_code, reason = "no fit caller resumes from a checkpoint yet")
)]
pub(crate) struct ResumePoint<N, B: AutodiffBackend<FloatElem = f32>> {
    /// The training state at entry of the boundary step.
    pub state: BoundaryState<N, B>,
    /// The run's batch-draw stream, positioned at the boundary.
    pub generator: Xoshiro256PlusPlus,
}

/// The resume checkpoint's record of the training state at entry of the boundary step.
///
/// The schedule rides in full so a resumed run can verify it trains under the schedule the opening
/// segment ran under. The scheduler position is redundant with the boundary by construction, and
/// the open path rejects a record where the two disagree. The generator rides as the generator's
/// own 32 state bytes, which pins the pipeline's generator algorithm.
#[cfg_attr(
    not(test),
    expect(dead_code, reason = "no fit caller resumes from a checkpoint yet")
)]
#[derive(Record)]
struct ResumeRecord<B: AutodiffBackend<FloatElem = f32>> {
    model: ProjectorRecord<B>,
    optimizer: session::TrainerOptimizerRecord<B>,
    scheduler: usize,
    steps: usize,
    boundary: usize,
    refresh_interval: usize,
    initial_learning_rate: f64,
    minimum_learning_rate: f64,
    generator: [u8; 32],
}

/// The training state at entry of the boundary step.
///
/// This is the fork point of a run. The opening segment produces the state and the ladder consumes
/// it. [`Self::write_checkpoint`] serializes it with the caller's generator position, so a resumed
/// ladder starts from the same boundary. The state is opaque and exists only as the output of
/// [`fit_to_boundary`] or of [`Self::open_checkpoint`], so no ladder ever starts from a state no
/// opening segment produced.
///
/// The state excludes the boundary work itself, the radius freeze and the opening refresh. That
/// work happens at entry of [`fit_from_boundary`] and derives from the model alone, so every ladder
/// resumed from one boundary state freezes the bit-equal radius on a deterministic backend.
// No Debug: the optimizer adaptor does not implement it.
pub(crate) struct BoundaryState<N, B: AutodiffBackend<FloatElem = f32>> {
    training: Training<N, B>,
    schedule: TrainingSchedule,
}

impl<N, B: AutodiffBackend<FloatElem = f32>> BoundaryState<N, B> {
    /// Writes this state and the run's generator as a resume checkpoint.
    ///
    /// The generator is the run's batch-draw stream as it stands at the boundary. A resumed
    /// ladder continues that stream, which is what makes the resumed run's draws identical to
    /// the straight run's. The opening segment's evidence stays out of the checkpoint: a resumed
    /// ladder records its own from the boundary on.
    ///
    /// The written bytes are not canonical. The optimizer record is a map whose serialization
    /// order may differ between processes, so two writes of one training state need not be
    /// byte-equal. Identity lives in the decoded state and round-trips exactly.
    ///
    /// # Errors
    ///
    /// Returns an error when encoding or writing fails.
    #[cfg_attr(
        not(test),
        expect(dead_code, reason = "no fit caller resumes from a checkpoint yet")
    )]
    pub(crate) fn write_checkpoint(
        &self,
        generator: &Xoshiro256PlusPlus,
        writer: &mut impl io::Write,
    ) -> Result<(), CheckpointError> {
        let Self {
            training:
                Training {
                    model,
                    optimizer,
                    scheduler,
                    evidence: _,
                },
            schedule,
        } = self;

        let record = ResumeRecord {
            model: model.clone().into_record(),
            optimizer: optimizer.to_record(),
            scheduler: scheduler.to_record::<B>(),
            steps: schedule.steps().get(),
            boundary: schedule.boundary(),
            refresh_interval: schedule.refresh_interval().get(),
            initial_learning_rate: schedule.initial_learning_rate().get(),
            minimum_learning_rate: schedule.minimum_learning_rate().get(),
            generator: generator.state(),
        };
        let recorder = NamedMpkBytesRecorder::<FullPrecisionSettings>::new();
        let bytes = recorder.record(record, ())?;
        writer.write_all(&bytes)?;

        Ok(())
    }

    /// Opens a resume checkpoint.
    ///
    /// The open path verifies the parameters against `architecture`, the schedule against its
    /// own validity domain, and the scheduler position against the boundary before it returns
    /// the state. The record type fixes the generator state's length. The state round-trip is
    /// exact: a generator captured from a live stream is never the all-zero state the
    /// generator's seeding remaps.
    ///
    /// The reopened state's evidence starts fresh and covers the segment it runs, including the
    /// boundary measurement. The opening segment's evidence belongs to the run that produced the
    /// checkpoint.
    ///
    /// # Errors
    ///
    /// Returns an error when reading or decoding fails or any decoded value fails its
    /// verification.
    #[cfg_attr(
        not(test),
        expect(dead_code, reason = "no fit caller resumes from a checkpoint yet")
    )]
    #[tracing::instrument(skip_all)]
    pub(crate) fn open_checkpoint(
        mut reader: impl io::Read,
        architecture: Architecture,
        device: &B::Device,
    ) -> Result<ResumePoint<N, B>, CheckpointError> {
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes)?;
        let recorder = NamedMpkBytesRecorder::<FullPrecisionSettings>::new();
        let record: ResumeRecord<B> = recorder.load(bytes, device)?;

        let schedule = NonZero::new(record.steps)
            .zip(NonZero::new(record.refresh_interval))
            .zip(
                PositiveUnitFraction::new(record.initial_learning_rate)
                    .zip(UnitFraction::new(record.minimum_learning_rate)),
            )
            .and_then(|((steps, refresh_interval), (initial, minimum))| {
                TrainingSchedule::new(steps, record.boundary, refresh_interval, initial, minimum)
            })
            .ok_or(CheckpointError::InvalidSchedule)?;

        // The scheduler advances once per step and reads its position before use, so after the
        // opening segment's `boundary` steps it sits at `boundary - 1`. A boundary of zero
        // leaves the pre-first-step sentinel, which is what the wrapping subtraction produces.
        if record.scheduler != schedule.boundary().wrapping_sub(1) {
            return Err(CheckpointError::SchedulerPosition {
                position: record.scheduler,
                boundary: schedule.boundary(),
            });
        }

        let model = Projector::from_record(architecture, record.model, device)?;

        Ok(ResumePoint {
            state: Self {
                training: Training {
                    model,
                    optimizer: session::optimizer().load_record(record.optimizer),
                    scheduler: session::scheduler(schedule).load_record::<B>(record.scheduler),
                    evidence: TrainingEvidence {
                        boundary: None,
                        budget: BudgetBreakdown::new(),
                        losses: Vec::new(),
                        telemetry: Vec::new(),
                        fractions: Vec::new(),
                        target: None,
                    },
                },
                schedule,
            },
            generator: Xoshiro256PlusPlus::from_seed(record.generator),
        })
    }
}

/// Trains the projector over one generation's artifacts.
///
/// The caller owns model initialization and seeds it before the call, and batch draws consume
/// `rng`. Equal models, inputs, options, and seeds draw equal batches. Coordinate-level
/// reproducibility additionally depends on the backend's own determinism.
///
/// Every step reports its loss to `progress` on evaluation. The run behaves identically under any
/// observer.
///
/// The run is the composition of [`fit_to_boundary`] and [`fit_from_boundary`]; call the phases
/// directly to checkpoint or fork at the boundary.
///
/// A target objective's refusal is not an error: it returns as [`FitOutcome::TargetRefused`]
/// with the run record preserved through the refusing step.
///
/// # Errors
///
/// Returns an error when the corpus cannot train (no semantic edge weight), when the boundary
/// cannot freeze a Proximal radius (a measured radius with no opening segment in front of the
/// boundary, Proximal force without reviewed coverage, Coincident force
/// without any Proximal force, or a radius ordering the energy rejects), or when training diverges
/// in a step or a tick.
///
/// # Panics
///
/// This panics when the inputs disagree about the corpus row domain or an anchor references a row
/// outside it. All inputs come from one generation, so a mismatch is a wiring defect.
pub(crate) fn fit<
    N: Id,
    E: Id,
    B: AutodiffBackend<FloatElem = f32>,
    R: Rng + ?Sized,
    P: Progress,
>(
    model: Projector<B>,
    inputs: &TrainerInputs<'_, N, E>,
    options: &TrainOptions,
    rng: &mut R,
    device: &B::Device,
    progress: &P,
) -> Result<FitOutcome<N, B>, TrainError<N>> {
    let state = fit_to_boundary(model, inputs, options, rng, device, progress)?;
    fit_from_boundary(state, inputs, options, rng, device, progress)
}

/// Trains the opening segment: steps zero to the phase boundary, all at the zero step.
///
/// The returned state is the run's fork point. Hand it to [`fit_from_boundary`] to continue, or
/// serialize it through the checkpoint artifact first. A boundary equal to the run length makes
/// this the whole run.
///
/// # Errors
///
/// Returns an error when the corpus cannot train, the boundary is structurally inadmissible, or
/// training diverges in a step or a tick.
///
/// # Panics
///
/// This panics when the inputs disagree about the corpus row domain or an anchor references a row
/// outside it.
pub(crate) fn fit_to_boundary<
    N: Id,
    E: Id,
    B: AutodiffBackend<FloatElem = f32>,
    R: Rng + ?Sized,
    P: Progress,
>(
    model: Projector<B>,
    inputs: &TrainerInputs<'_, N, E>,
    options: &TrainOptions,
    rng: &mut R,
    device: &B::Device,
    progress: &P,
) -> Result<BoundaryState<N, B>, TrainError<N>> {
    let schedule = options.schedule;
    let mut session = Session::new(inputs, options)?;
    let outcome = session.run(
        Training {
            model,
            optimizer: session::optimizer(),
            scheduler: session::scheduler(schedule),
            evidence: TrainingEvidence {
                boundary: None,
                budget: BudgetBreakdown::new(),
                losses: Vec::with_capacity(schedule.steps().get()),
                telemetry: Vec::new(),
                fractions: Vec::new(),
                target: None,
            },
        },
        0..schedule.boundary(),
        rng,
        device,
        progress,
    )?;
    let training = match outcome {
        RunOutcome::Completed(training) => training,
        RunOutcome::Refused(refusal) => {
            unreachable!("the opening segment runs no target phase, yet it refused: {refusal}")
        }
    };

    Ok(BoundaryState { training, schedule })
}

/// Trains the ladder from a boundary state.
///
/// Freezes the Proximal radius against the state's own coordinates, then round-robins the remaining
/// steps across the lens steps.
///
/// The options must carry the schedule the opening segment ran under. Everything else may differ,
/// which is what a boundary fork varies.
///
/// A target objective's refusal is not an error: it returns as [`FitOutcome::TargetRefused`]
/// with the run record preserved through the refusing step.
///
/// # Errors
///
/// Returns an error when the schedule differs from the boundary state's, when the corpus cannot
/// train, the boundary is structurally inadmissible, the boundary cannot freeze a Proximal radius,
/// or training diverges in a step or a tick.
///
/// # Panics
///
/// This panics when the inputs disagree about the corpus row domain or an anchor references a row
/// outside it.
pub(crate) fn fit_from_boundary<
    N: Id,
    E: Id,
    B: AutodiffBackend<FloatElem = f32>,
    R: Rng + ?Sized,
    P: Progress,
>(
    state: BoundaryState<N, B>,
    inputs: &TrainerInputs<'_, N, E>,
    options: &TrainOptions,
    rng: &mut R,
    device: &B::Device,
    progress: &P,
) -> Result<FitOutcome<N, B>, TrainError<N>> {
    if options.schedule != state.schedule {
        return Err(TrainError::ScheduleChanged {
            opening: state.schedule,
            resumed: options.schedule,
        });
    }

    let schedule = state.schedule;
    let mut session = Session::new(inputs, options)?;
    let outcome = session.run(
        state.training,
        schedule.boundary()..schedule.steps().get(),
        rng,
        device,
        progress,
    )?;

    Ok(match outcome {
        RunOutcome::Completed(training) => FitOutcome::Trained(Model {
            projector: training.model,
            evidence: training.evidence,
        }),
        RunOutcome::Refused(refusal) => FitOutcome::TargetRefused(refusal),
    })
}

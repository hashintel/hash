//! The schedule, phase boundary, refresh ticks, and optimization loop of a training run.
//!
//! One run trains the conditioned projector end to end. It opens with a semantic-only segment at
//! the zero rung; at the configured boundary step it freezes the Proximal radius from data - the
//! force-mass-weighted 25th percentile of the locally normalized distance `z` over the
//! reviewed-Proximal attraction pairs, measured against the boundary's own coordinates - composes
//! the relation energy, and opens the rung ladder, round-robining the steps across the lens rungs
//! with the relation term scaled by each step's rung. Refresh ticks at a configured cadence
//! re-measure everything defined over current coordinates: per-rung local scales, hard negatives
//! mined at both lens extremes, and the displacement telemetry.
//!
//! Optimization is Adam under a cosine learning-rate schedule, with one backward pass per step
//! through the budget surrogate. A seed fixes every batch draw, so draws are deterministic. The
//! backend's gradient accumulation need not be deterministic.
//!
//! The frozen radius follows the policy pattern. Measurement from reviewed evidence is the default,
//! a configured assertion supersedes it, and the report always carries the measured quantiles
//! beside it so a reader can judge the assertion against data. A corpus whose attraction index
//! carries no force at all trains vacuously: the relation term stays absent and the run records
//! why.

mod error;
mod session;
#[cfg(test)]
mod tests;

use core::num::NonZero;

use burn::{
    lr_scheduler::LrScheduler as _, optim::Optimizer as _, tensor::backend::AutodiffBackend,
};
use hashql_core::id::Id;
use rand::Rng;

use self::session::{Session, Training};
pub(crate) use self::{error::TrainError, session::TrainerOptimizerRecord};
use super::{
    BatchPlan, Coefficients,
    batch::{NodeColumns, SupportAnchor},
    metrics::{BudgetBreakdown, DisplacementSummary},
    step::LossBreakdown,
};
use crate::{
    math::{Finite, Positive, UnitFraction},
    progress::Progress,
    salt::{
        knn::table::KnnView,
        projector::{
            budget::Budget,
            loss::{AffinityEnergy, CoincidentEnergy, SupportOptions},
            miner::MinerOptions,
            model::Projector,
            verdict::{ResolvedVerdict, calibrate::ProximalCalibration},
        },
        relation::{
            attraction::AttractionIndex,
            protection::{ProtectionConfig, ProtectionView},
        },
        semantic::SemanticGraphView,
    },
};

/// A validated step schedule.
///
/// Run length, phase boundary, refresh cadence, and the learning-rate envelope.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TrainingSchedule {
    steps: NonZero<usize>,
    boundary: usize,
    refresh_interval: NonZero<usize>,
    initial_learning_rate: UnitFraction,
    minimum_learning_rate: UnitFraction,
}

impl TrainingSchedule {
    /// Validates a schedule.
    ///
    /// The boundary is the step index at which the Proximal radius freezes and the rung ladder
    /// opens. Steps below it train at the zero rung only. A boundary equal to the step count never
    /// opens the ladder: the run is semantic-only and records no boundary evidence. Refresh ticks
    /// run at step zero and every `refresh_interval` steps after it.
    ///
    /// Returns [`None`] unless the boundary lies within the run and the rates satisfy the cosine
    /// schedule's domain: both are unit fractions by type, the initial rate is strictly positive,
    /// and the minimum does not exceed it.
    #[must_use]
    pub(crate) const fn new(
        steps: NonZero<usize>,
        boundary: usize,
        refresh_interval: NonZero<usize>,
        initial_learning_rate: UnitFraction,
        minimum_learning_rate: UnitFraction,
    ) -> Option<Self> {
        let rates = initial_learning_rate.get() > 0.0
            && minimum_learning_rate.get() <= initial_learning_rate.get();

        if !(boundary <= steps.get() && rates) {
            return None;
        }
        Some(Self {
            steps,
            boundary,
            refresh_interval,
            initial_learning_rate,
            minimum_learning_rate,
        })
    }

    /// Returns the run length in steps.
    #[inline]
    #[must_use]
    pub(crate) const fn steps(self) -> NonZero<usize> {
        self.steps
    }

    /// Returns the phase-boundary step index.
    #[inline]
    #[must_use]
    pub(crate) const fn boundary(self) -> usize {
        self.boundary
    }

    /// Returns the refresh cadence in steps.
    #[inline]
    #[must_use]
    pub(crate) const fn refresh_interval(self) -> NonZero<usize> {
        self.refresh_interval
    }

    /// Returns the cosine schedule's opening learning rate.
    #[inline]
    #[must_use]
    pub(crate) const fn initial_learning_rate(self) -> f64 {
        self.initial_learning_rate.get()
    }

    /// Returns the cosine schedule's floor learning rate.
    #[inline]
    #[must_use]
    pub(crate) const fn minimum_learning_rate(self) -> f64 {
        self.minimum_learning_rate.get()
    }
}

/// The validated relation-lens constants the boundary composes with.
///
/// The Coincident energy arrives fully configured - its radius is a configuration value until a
/// reviewed-Coincident calibration exists. The boundary measures only the Proximal radius, while
/// `temperature` and the scale guard `epsilon` complete the composed energy.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RelationLens {
    coincident: CoincidentEnergy,
    temperature: Positive,
    epsilon: Positive,
}

impl RelationLens {
    /// Composes the lens constants.
    ///
    /// Every field arrives valid by type, so the composition is plain wiring.
    #[must_use]
    pub(crate) const fn new(
        coincident: CoincidentEnergy,
        temperature: Positive,
        epsilon: Positive,
    ) -> Self {
        Self {
            coincident,
            temperature,
            epsilon,
        }
    }

    /// Returns the configured Coincident energy.
    #[inline]
    #[must_use]
    pub(crate) const fn coincident(self) -> CoincidentEnergy {
        self.coincident
    }

    /// Returns the Proximal transition temperature.
    #[inline]
    #[must_use]
    pub(crate) const fn temperature(self) -> Positive {
        self.temperature
    }

    /// Returns the local-scale guard.
    #[inline]
    #[must_use]
    pub(crate) const fn epsilon(self) -> Positive {
        self.epsilon
    }
}

/// The training run's numerical contract.
///
/// Every field is a validated value, and the struct is plain wiring. `forward_rows` bounds each
/// corpus-forward slice at refresh ticks and the boundary, and with it the peak device memory of a
/// whole-corpus pass.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct TrainOptions {
    /// The step schedule.
    pub schedule: TrainingSchedule,
    /// The per-step sampling plan.
    pub plan: BatchPlan,
    /// The semantic affinity energy.
    pub affinity: AffinityEnergy,
    /// The support-term constants.
    pub support: SupportOptions,
    /// The per-node relation-gradient diagnostics' baseline convention.
    pub budget: Budget,
    /// The objective coefficients.
    pub coefficients: Coefficients,
    /// The hard-negative mining schedule.
    pub miner: MinerOptions,
    /// The relation-lens constants.
    pub lens: RelationLens,
    /// Rows per corpus-forward slice.
    pub forward_rows: NonZero<usize>,
}

/// One generation's borrowed training inputs.
///
/// Every view describes the same corpus rows; the run asserts the row domains agree and treats a
/// mismatch as a wiring defect.
#[derive(Debug, Clone)]
pub(crate) struct TrainerInputs<'run, N, E> {
    /// The semantic graph.
    pub semantic: SemanticGraphView<'run, N>,
    /// The protection evidence.
    pub protection: ProtectionView<'run, N>,
    /// The protection channel thresholds.
    pub protection_config: ProtectionConfig,
    /// The relation attraction evidence.
    pub attraction: &'run AttractionIndex<N, E>,
    /// The 512-dimensional neighbour table local scales measure over.
    pub knn: KnnView<'run, N>,
    /// The per-row model input columns.
    pub columns: NodeColumns<'run, N>,
    /// The landmark skeleton's support anchors, corpus rows.
    pub landmarks: &'run [SupportAnchor<N>],
    /// The temporal support anchors as corpus rows, empty for a first generation.
    pub anchors: &'run [SupportAnchor<N>],
    /// The resolved reviewed verdicts.
    pub verdicts: &'run [ResolvedVerdict],
}

/// How the boundary froze the Proximal radius.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum FrozenRadius {
    /// Measured from the reviewed-Proximal pairs.
    Measured { radius: Finite },
    /// Nothing to freeze: the attraction index carries no force.
    Vacuous,
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

/// One refresh tick's displacement telemetry.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TickTelemetry {
    /// The step index the tick ran at.
    pub step: usize,
    /// The displacement field between the lens extremes.
    pub displacement: DisplacementSummary,
}

/// Everything a training run measured about itself.
#[derive(Debug)]
pub(crate) struct TrainingEvidence {
    /// The phase boundary's record, or [`None`] when the boundary never ran.
    pub boundary: Option<BoundaryEvidence>,
    /// The run-wide budget outcomes per reporting bucket.
    pub budget: BudgetBreakdown,
    /// Per-step loss values, in step order.
    pub losses: Vec<LossBreakdown>,
    /// Per-tick displacement telemetry, in step order.
    pub telemetry: Vec<TickTelemetry>,
}

/// A trained projector and the evidence of its training.
#[derive(Debug)]
pub(crate) struct Fitted<B: AutodiffBackend> {
    /// The trained model.
    pub model: Projector<B>,
    /// The run's evidence.
    pub evidence: TrainingEvidence,
}

/// The training state at entry of the boundary step.
///
/// This is the fork point of a run. The opening segment produces the state and the ladder consumes
/// it. The checkpoint artifact serializes it with the caller's generator position, so a resumed
/// ladder starts from the same boundary. The state is opaque and exists only as the output of
/// [`fit_to_boundary`] or of the checkpoint artifact's validated open path, so no ladder ever
/// starts from a state no opening segment produced.
///
/// The state excludes the boundary work itself, the radius freeze and the opening refresh. That
/// work happens at entry of [`fit_from_boundary`] and derives from the model alone, so every ladder
/// resumed from one boundary state freezes the bit-equal radius on a deterministic backend.
// No Debug: the optimizer adaptor does not implement it.
pub(crate) struct BoundaryState<B: AutodiffBackend<FloatElem = f32>> {
    training: Training<B>,
    schedule: TrainingSchedule,
}

impl<B: AutodiffBackend<FloatElem = f32>> BoundaryState<B> {
    /// Returns the model at the boundary.
    #[inline]
    #[must_use]
    pub(crate) const fn model(&self) -> &Projector<B> {
        &self.training.model
    }

    /// Returns the schedule the opening segment ran under.
    #[inline]
    #[must_use]
    pub(crate) const fn schedule(&self) -> TrainingSchedule {
        self.schedule
    }

    /// Returns the optimizer's record.
    #[must_use]
    pub(crate) fn optimizer_record(&self) -> session::TrainerOptimizerRecord<B> {
        self.training.optimizer.to_record()
    }

    /// Returns the scheduler's position record.
    #[must_use]
    pub(crate) fn scheduler_position(&self) -> usize {
        self.training.scheduler.to_record::<B>()
    }

    /// Rebuilds a boundary state from its serialized parts.
    ///
    /// A resumed ladder's evidence starts fresh and covers the segment it runs, including the
    /// boundary measurement. The opening segment's evidence belongs to the run that produced the
    /// checkpoint.
    ///
    /// Returns [`None`] when the scheduler position does not sit at the schedule's boundary - the
    /// parts describe two different runs.
    #[must_use]
    pub(crate) fn from_parts(
        model: Projector<B>,
        optimizer: session::TrainerOptimizerRecord<B>,
        scheduler_position: usize,
        schedule: TrainingSchedule,
    ) -> Option<Self> {
        // The scheduler advances once per step and reads its position
        // before use, so after the opening segment's `boundary` steps
        // it sits at `boundary - 1`; a boundary of zero leaves the
        // pre-first-step sentinel, which is what the wrapping
        // subtraction produces.
        if scheduler_position != schedule.boundary.wrapping_sub(1) {
            return None;
        }

        Some(Self {
            training: Training {
                model,
                optimizer: session::optimizer().load_record(optimizer),
                scheduler: session::scheduler(schedule).load_record::<B>(scheduler_position),
                evidence: TrainingEvidence {
                    boundary: None,
                    budget: BudgetBreakdown::new(),
                    losses: Vec::new(),
                    telemetry: Vec::new(),
                },
            },
            schedule,
        })
    }
}

/// Trains the projector over one generation's artifacts.
///
/// The caller owns model initialization and seeds it before the call, and batch draws consume
/// `rng`. Equal models, inputs, options, and seeds draw equal batches; coordinate-level
/// reproducibility additionally depends on the backend's own determinism.
///
/// Every step reports its loss to `progress` on evaluation. The run behaves identically under any
/// observer.
///
/// The run is the composition of [`fit_to_boundary`] and [`fit_from_boundary`]; call the phases
/// directly to checkpoint or fork at the boundary.
///
/// # Errors
///
/// Returns an error when the corpus cannot train (no semantic edge weight), when the boundary
/// cannot freeze a Proximal radius (a measured radius with no opening segment in front of the
/// boundary, Proximal force without reviewed coverage or a configured assertion, Coincident force
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
) -> Result<Fitted<B>, TrainError<N>> {
    let state = fit_to_boundary(model, inputs, options, rng, device, progress)?;
    fit_from_boundary(state, inputs, options, rng, device, progress)
}

/// Trains the opening segment: steps zero to the phase boundary, all at the zero rung.
///
/// The returned state is the run's fork point; hand it to [`fit_from_boundary`] to continue, or
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
) -> Result<BoundaryState<B>, TrainError<N>> {
    let schedule = options.schedule;
    let mut session = Session::new(inputs, options)?;
    let training = session.run(
        Training {
            model,
            optimizer: session::optimizer(),
            scheduler: session::scheduler(schedule),
            evidence: TrainingEvidence {
                boundary: None,
                budget: BudgetBreakdown::new(),
                losses: Vec::with_capacity(schedule.steps.get()),
                telemetry: Vec::new(),
            },
        },
        0..schedule.boundary,
        rng,
        device,
        progress,
    )?;

    Ok(BoundaryState { training, schedule })
}

/// Trains the ladder from a boundary state.
///
/// Freezes the Proximal radius against the state's own coordinates, then round-robins the remaining
/// steps across the lens rungs.
///
/// The options must carry the schedule the opening segment ran under; everything else may differ,
/// which is what a boundary fork varies.
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
    state: BoundaryState<B>,
    inputs: &TrainerInputs<'_, N, E>,
    options: &TrainOptions,
    rng: &mut R,
    device: &B::Device,
    progress: &P,
) -> Result<Fitted<B>, TrainError<N>> {
    if options.schedule != state.schedule {
        return Err(TrainError::ScheduleChanged {
            opening: state.schedule,
            resumed: options.schedule,
        });
    }

    let schedule = state.schedule;
    let mut session = Session::new(inputs, options)?;
    let training = session.run(
        state.training,
        schedule.boundary..schedule.steps.get(),
        rng,
        device,
        progress,
    )?;

    Ok(Fitted {
        model: training.model,
        evidence: training.evidence,
    })
}

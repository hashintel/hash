//! The training run: schedule, phase boundary, refresh ticks, and the
//! optimization loop.
//!
//! One run trains the conditioned projector end to end. It opens with
//! a semantic-only segment at the zero rung; at the configured
//! boundary step it freezes the Proximal radius from data - the
//! force-mass-weighted 75th percentile of the locally normalized
//! distance `z` over the reviewed-Proximal attraction pairs, measured
//! against the boundary's own coordinates - composes the relation
//! energy, and opens the rung ladder, round-robining the steps across
//! the lens rungs with the relation term scaled by each step's rung.
//! Refresh ticks at a configured cadence re-measure everything defined
//! over current coordinates: per-rung local scales, hard negatives
//! mined at both lens extremes, and the displacement telemetry.
//!
//! Optimization is Adam under a cosine learning-rate schedule, with
//! one backward pass per step through the budget surrogate. Batch
//! draws are seeded and deterministic; gradient accumulation inside
//! the backend is allowed to be nondeterministic.
//!
//! The frozen radius follows the policy pattern: measured from
//! reviewed evidence by default, superseded by a configured assertion
//! when one is supplied, and always reported next to the measured
//! quantiles so the assertion can be judged against data. A corpus
//! whose attraction index carries no force at all trains vacuously:
//! the relation term stays absent and the run records why.

mod session;
#[cfg(test)]
mod tests;

use core::{error::Error, fmt, num::NonZero};

use burn::{
    lr_scheduler::LrScheduler as _, optim::Optimizer as _, tensor::backend::AutodiffBackend,
};
use rand::Rng;

pub(crate) use self::session::TrainerOptimizerRecord;
use self::session::{Session, Training};
use super::{
    BatchPlan, Coefficients, StepError,
    batch::{NodeColumns, SupportAnchor},
    metrics::{BudgetBreakdown, DisplacementSummary},
    refresh::RefreshError,
    step::LossBreakdown,
};
use crate::salt::{
    knn::table::KnnView,
    projector::{
        budget::BudgetOptions,
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
};

/// A training run failed.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum TrainError {
    /// The semantic graph carries no edge weight: there is no layout
    /// evidence to train against.
    NoSemanticEvidence,
    /// The schedule's boundary is step zero, so the Proximal radius
    /// would be measured on an untrained map instead of the
    /// semantic-only baseline the measurement is defined over.
    UnbaselinedRadius,
    /// The attraction index carries Proximal force but no reviewed
    /// verdict covers any of it, so no radius can be measured.
    MissingProximalReviews,
    /// The attraction index carries Coincident force but no Proximal
    /// force, so no measurement can set the Proximal radius the
    /// relation energy composes with.
    CoincidentWithoutProximal,
    /// The frozen Proximal radius does not exceed the Coincident one.
    DegenerateRadius { radius: f32, coincident: f32 },
    /// A refresh tick or boundary measurement failed.
    Refresh(RefreshError),
    /// A training step failed.
    Step(StepError),
    /// A resumed ladder was handed a schedule differing from the one
    /// its opening segment ran under, so the scheduler position and
    /// the phase boundary no longer describe the same run.
    ScheduleChanged {
        opening: TrainingSchedule,
        resumed: TrainingSchedule,
    },
}

impl fmt::Display for TrainError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::NoSemanticEvidence => {
                formatter.write_str("the semantic graph carries no edge weight to train against")
            }
            Self::UnbaselinedRadius => formatter.write_str(
                "the boundary sits at step zero, so the Proximal radius would be measured on an \
                 untrained map; give the opening segment steps or supply the configured radius \
                 assertion",
            ),
            Self::MissingProximalReviews => formatter.write_str(
                "the attraction index carries Proximal force but no reviewed-Proximal verdict \
                 covers any of it; confirm Proximal types in review or supply the configured \
                 radius assertion",
            ),
            Self::CoincidentWithoutProximal => formatter.write_str(
                "the attraction index carries Coincident force but no Proximal force, so no \
                 measurement can set the Proximal radius; supply the configured radius assertion",
            ),
            Self::DegenerateRadius { radius, coincident } => write!(
                formatter,
                "the frozen Proximal radius {radius} does not exceed the Coincident radius \
                 {coincident}",
            ),
            Self::Refresh(error) => error.fmt(formatter),
            Self::Step(error) => error.fmt(formatter),
            Self::ScheduleChanged { .. } => formatter.write_str(
                "the resumed schedule differs from the one the opening segment ran under; resume \
                 with the schedule the checkpoint was trained under",
            ),
        }
    }
}

impl Error for TrainError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Refresh(error) => Some(error),
            Self::Step(error) => Some(error),
            Self::NoSemanticEvidence
            | Self::UnbaselinedRadius
            | Self::MissingProximalReviews
            | Self::CoincidentWithoutProximal
            | Self::DegenerateRadius { .. }
            | Self::ScheduleChanged { .. } => None,
        }
    }
}

impl From<RefreshError> for TrainError {
    fn from(error: RefreshError) -> Self {
        Self::Refresh(error)
    }
}

impl From<StepError> for TrainError {
    fn from(error: StepError) -> Self {
        Self::Step(error)
    }
}

/// A validated step schedule: run length, phase boundary, refresh
/// cadence, and the learning-rate envelope.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct TrainingSchedule {
    steps: NonZero<usize>,
    boundary: usize,
    refresh_interval: NonZero<usize>,
    initial_learning_rate: f64,
    minimum_learning_rate: f64,
}

impl TrainingSchedule {
    /// Validates a schedule.
    ///
    /// The boundary is the step index at which the Proximal radius
    /// freezes and the rung ladder opens; steps below it train at the
    /// zero rung only. A boundary equal to the step count never opens
    /// the ladder: the run is semantic-only and records no boundary
    /// evidence. Refresh ticks run at step zero and every
    /// `refresh_interval` steps after it.
    ///
    /// Returns [`None`] unless the boundary lies within the run and
    /// the learning rates satisfy the cosine schedule's domain:
    /// `0 < initial <= 1` and `0 <= minimum <= initial`.
    #[must_use]
    pub(crate) const fn new(
        steps: NonZero<usize>,
        boundary: usize,
        refresh_interval: NonZero<usize>,
        initial_learning_rate: f64,
        minimum_learning_rate: f64,
    ) -> Option<Self> {
        let rates = initial_learning_rate > 0.0
            && initial_learning_rate <= 1.0
            && minimum_learning_rate >= 0.0
            && minimum_learning_rate <= initial_learning_rate;

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
        self.initial_learning_rate
    }

    /// Returns the cosine schedule's floor learning rate.
    #[inline]
    #[must_use]
    pub(crate) const fn minimum_learning_rate(self) -> f64 {
        self.minimum_learning_rate
    }
}

/// The validated relation-lens constants the boundary composes with.
///
/// The Coincident energy arrives fully configured - its radius is a
/// configuration value until a reviewed-Coincident calibration exists.
/// Only the Proximal radius is measured at the boundary; `temperature`
/// and the scale guard `epsilon` complete the composed energy. An
/// asserted radius, when supplied, supersedes the measurement in the
/// composed energy while the measured quantiles still land in
/// evidence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RelationLens {
    coincident: CoincidentEnergy,
    temperature: f32,
    epsilon: f32,
    asserted_radius: Option<f32>,
}

impl RelationLens {
    /// Validates the lens constants.
    ///
    /// Returns [`None`] unless the temperature and the scale guard are
    /// finite and strictly positive, and the asserted radius - when
    /// supplied - is finite and strictly above the Coincident radius,
    /// the ordering the composed energy requires.
    #[must_use]
    pub(crate) const fn new(
        coincident: CoincidentEnergy,
        temperature: f32,
        epsilon: f32,
        asserted_radius: Option<f32>,
    ) -> Option<Self> {
        let constants =
            temperature.is_finite() && temperature > 0.0 && epsilon.is_finite() && epsilon > 0.0;
        let assertion = match asserted_radius {
            Some(radius) => radius.is_finite() && radius > coincident.radius(),
            None => true,
        };

        if !(constants && assertion) {
            return None;
        }
        Some(Self {
            coincident,
            temperature,
            epsilon,
            asserted_radius,
        })
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
    pub(crate) const fn temperature(self) -> f32 {
        self.temperature
    }

    /// Returns the local-scale guard.
    #[inline]
    #[must_use]
    pub(crate) const fn epsilon(self) -> f32 {
        self.epsilon
    }

    /// Returns the configured radius superseding the boundary
    /// measurement, when one is asserted.
    #[inline]
    #[must_use]
    pub(crate) const fn asserted_radius(self) -> Option<f32> {
        self.asserted_radius
    }
}

/// The training run's numerical contract.
///
/// Every field is a validated value; the struct is plain wiring.
/// `forward_rows` bounds each corpus-forward slice at refresh ticks
/// and the boundary, and with it the peak device memory of a
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
    /// The per-node relation-gradient budget.
    pub budget: BudgetOptions,
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
/// Every view describes the same corpus rows; the run asserts the row
/// domains agree and treats a mismatch as a wiring defect.
#[derive(Debug, Clone)]
pub(crate) struct TrainerInputs<'run> {
    /// The semantic graph.
    pub semantic: SemanticGraphView<'run>,
    /// The protection evidence.
    pub protection: ProtectionView<'run>,
    /// The protection channel thresholds.
    pub protection_config: ProtectionConfig,
    /// The relation attraction evidence.
    pub attraction: &'run AttractionIndex,
    /// The 512-dimensional neighbour table local scales measure over.
    pub knn: KnnView<'run>,
    /// The per-row model input columns.
    pub columns: NodeColumns<'run>,
    /// The landmark skeleton's support anchors, corpus rows.
    pub landmarks: &'run [SupportAnchor],
    /// The temporal support anchors, corpus rows; empty for a first
    /// generation.
    pub anchors: &'run [SupportAnchor],
    /// The resolved reviewed verdicts.
    pub verdicts: &'run [ResolvedVerdict],
}

/// How the Proximal radius was frozen at the boundary.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum FrozenRadius {
    /// Measured from the reviewed-Proximal pairs.
    Measured { radius: f32 },
    /// Asserted by configuration, superseding the measurement.
    Asserted { radius: f32 },
    /// Nothing to freeze: the attraction index carries no force.
    Vacuous,
}

/// The phase boundary's record: when it ran, what it froze, and the
/// measurement it froze from.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct BoundaryEvidence {
    /// The step index the boundary ran at.
    pub step: usize,
    /// The frozen radius and its provenance.
    pub radius: FrozenRadius,
    /// The full measurement: pooled radius, per-type quantiles, mass
    /// shares, and leave-one-type-out radii. Empty on a vacuous run.
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

/// A training run's evidence: everything the run measured about
/// itself.
#[derive(Debug)]
pub(crate) struct TrainingEvidence {
    /// The phase boundary's record; [`None`] when the boundary never
    /// ran.
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
/// This is the fork point of a run: the opening segment produces it,
/// the ladder consumes it, and the checkpoint artifact serializes it
/// (with the caller's generator position) so a future ladder can
/// resume from the same boundary. The state is opaque - it exists
/// only as the output of [`fit_to_boundary`] or of the checkpoint
/// artifact's validated open path - so a ladder can never start from
/// a state no opening segment produced.
///
/// The boundary work itself (radius freeze, opening refresh) is not
/// part of the state: it happens at entry of [`fit_from_boundary`],
/// deterministically from the model, so every ladder resumed from one
/// boundary state freezes the bit-equal radius on a deterministic
/// backend.
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
    /// The evidence starts fresh: a resumed ladder's evidence covers
    /// the segment it runs, boundary measurement included; the opening
    /// segment's evidence belongs to the run that produced the
    /// checkpoint.
    ///
    /// Returns [`None`] when the scheduler position does not sit at
    /// the schedule's boundary - the parts describe two different
    /// runs.
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
/// The caller owns model initialization and seeds it before the call;
/// batch draws consume `rng`. Equal models, inputs, options, and seeds
/// draw equal batches; coordinate-level reproducibility additionally
/// depends on the backend's own determinism.
///
/// The run is the composition of [`fit_to_boundary`] and
/// [`fit_from_boundary`]; call the phases directly to checkpoint or
/// fork at the boundary.
///
/// # Errors
///
/// Returns an error when the corpus cannot train (no semantic edge
/// weight), when the boundary cannot freeze a Proximal radius (a
/// measured radius with no opening segment in front of the boundary,
/// Proximal force without reviewed coverage or a configured assertion,
/// Coincident force without any Proximal force, or a radius ordering
/// the energy rejects), or when training diverges in a step or a tick.
///
/// # Panics
///
/// Panics when the inputs disagree about the corpus row domain or an
/// anchor references a row outside it; all inputs come from one
/// generation, so a mismatch is a wiring defect.
pub(crate) fn fit<B: AutodiffBackend<FloatElem = f32>, R: Rng + ?Sized>(
    model: Projector<B>,
    inputs: &TrainerInputs<'_>,
    options: &TrainOptions,
    rng: &mut R,
    device: &B::Device,
) -> Result<Fitted<B>, TrainError> {
    let state = fit_to_boundary(model, inputs, options, rng, device)?;
    fit_from_boundary(state, inputs, options, rng, device)
}

/// Trains the opening segment: steps zero to the phase boundary, all
/// at the zero rung.
///
/// The returned state is the run's fork point; hand it to
/// [`fit_from_boundary`] to continue, or serialize it through the
/// checkpoint artifact first. A boundary equal to the run length makes
/// this the whole run.
///
/// # Errors
///
/// Returns an error when the corpus cannot train, the boundary is
/// structurally inadmissible, or training diverges in a step or a
/// tick.
///
/// # Panics
///
/// Panics when the inputs disagree about the corpus row domain or an
/// anchor references a row outside it.
pub(crate) fn fit_to_boundary<B: AutodiffBackend<FloatElem = f32>, R: Rng + ?Sized>(
    model: Projector<B>,
    inputs: &TrainerInputs<'_>,
    options: &TrainOptions,
    rng: &mut R,
    device: &B::Device,
) -> Result<BoundaryState<B>, TrainError> {
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
    )?;

    Ok(BoundaryState { training, schedule })
}

/// Trains the ladder from a boundary state: freezes the Proximal
/// radius against the state's own coordinates, then round-robins the
/// remaining steps across the lens rungs.
///
/// The options must carry the schedule the opening segment ran under;
/// everything else may differ, which is what a boundary fork varies.
///
/// # Errors
///
/// Returns an error when the schedule differs from the boundary
/// state's, when the corpus cannot train, the boundary is structurally
/// inadmissible, the boundary cannot freeze a Proximal radius, or
/// training diverges in a step or a tick.
///
/// # Panics
///
/// Panics when the inputs disagree about the corpus row domain or an
/// anchor references a row outside it.
pub(crate) fn fit_from_boundary<B: AutodiffBackend<FloatElem = f32>, R: Rng + ?Sized>(
    state: BoundaryState<B>,
    inputs: &TrainerInputs<'_>,
    options: &TrainOptions,
    rng: &mut R,
    device: &B::Device,
) -> Result<Fitted<B>, TrainError> {
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
    )?;

    Ok(Fitted {
        model: training.model,
        evidence: training.evidence,
    })
}

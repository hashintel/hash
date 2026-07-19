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

#[cfg(test)]
mod tests;

use core::{error::Error, fmt, num::NonZero};

use burn::{
    lr_scheduler::{LrScheduler as _, cosine::CosineAnnealingLrSchedulerConfig},
    module::AutodiffModule as _,
    optim::{AdamConfig, GradientsParams, Optimizer as _},
    tensor::backend::AutodiffBackend,
};
use rand::Rng;

use super::{
    BatchPlan, Coefficients, ObjectiveOptions, RUNGS, StepError,
    batch::{Batch, BatchSampler, NodeColumns},
    metrics::{BudgetBreakdown, DegreeDeciles, DisplacementSummary, TypeParticipants},
    refresh::{self, Refresh, RefreshError},
    step::{self, LossBreakdown},
};
use crate::salt::{
    knn::table::KnnView,
    projector::{
        budget::BudgetOptions,
        loss::{
            AffinityEnergy, CoincidentEnergy, ProximalEnergy, RelationEnergy, SupportAnchor,
            SupportOptions,
        },
        miner::{HardNegativeMiner, MinedFrame, MinerOptions},
        model::Projector,
        scale::LocalScales,
        verdict::{
            PlacementClass, ResolvedVerdict,
            calibrate::{CalibrationOptions, ProximalCalibration, calibrate},
        },
    },
    relation::{
        attraction::{AttractionGroup, AttractionIndex},
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
}

impl fmt::Display for TrainError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::NoSemanticEvidence => {
                formatter.write_str("the semantic graph carries no edge weight to train against")
            }
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
        }
    }
}

impl Error for TrainError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Refresh(error) => Some(error),
            Self::Step(error) => Some(error),
            Self::NoSemanticEvidence
            | Self::MissingProximalReviews
            | Self::CoincidentWithoutProximal
            | Self::DegenerateRadius { .. } => None,
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
    pub(crate) fn new(
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

        (boundary <= steps.get() && rates).then_some(Self {
            steps,
            boundary,
            refresh_interval,
            initial_learning_rate,
            minimum_learning_rate,
        })
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
    pub(crate) fn new(
        coincident: CoincidentEnergy,
        temperature: f32,
        epsilon: f32,
        asserted_radius: Option<f32>,
    ) -> Option<Self> {
        let constants =
            temperature.is_finite() && temperature > 0.0 && epsilon.is_finite() && epsilon > 0.0;
        let assertion =
            asserted_radius.is_none_or(|radius| radius.is_finite() && radius > coincident.radius());

        (constants && assertion).then_some(Self {
            coincident,
            temperature,
            epsilon,
            asserted_radius,
        })
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

/// Trains the projector over one generation's artifacts.
///
/// The caller owns model initialization and seeds it before the call;
/// batch draws consume `rng`. Equal models, inputs, options, and seeds
/// draw equal batches; coordinate-level reproducibility additionally
/// depends on the backend's own determinism.
///
/// # Errors
///
/// Returns an error when the corpus cannot train (no semantic edge
/// weight), when the boundary cannot freeze a Proximal radius (Proximal
/// force without reviewed coverage or a configured assertion, Coincident
/// force without any Proximal force, or a radius ordering the energy
/// rejects), or when training diverges in a step or a tick.
///
/// # Panics
///
/// Panics when the inputs disagree about the corpus row domain or an
/// anchor references a row outside it; all inputs come from one
/// generation, so a mismatch is a wiring defect.
pub(crate) fn fit<B: AutodiffBackend<FloatElem = f32>, R: Rng + ?Sized>(
    mut model: Projector<B>,
    inputs: &TrainerInputs<'_>,
    options: &TrainOptions,
    rng: &mut R,
    device: &B::Device,
) -> Result<Fitted<B>, TrainError> {
    let vacuous = admit(inputs, options)?;

    let rows = inputs.columns.representations.len();
    let schedule = options.schedule;
    let mut plan = options.plan;
    if vacuous {
        // No group exerts force, so relation draws would be dead
        // weight at every rung; the ladder still runs for the lens
        // conditioning.
        plan.relation_types = 0;
    }

    let sampler = BatchSampler::new(
        inputs.semantic.clone(),
        inputs.protection.clone(),
        inputs.protection_config,
        inputs.attraction,
        plan,
    )
    .ok_or(TrainError::NoSemanticEvidence)?;
    let deciles = DegreeDeciles::new(inputs.attraction, rows);
    let refresh = Refresh {
        columns: inputs.columns,
        knn: inputs.knn.clone(),
        miner: HardNegativeMiner::new(
            inputs.semantic.clone(),
            inputs.protection.clone(),
            inputs.protection_config,
            options.miner,
        ),
        participants: TypeParticipants::new(inputs.attraction),
        forward_rows: options.forward_rows,
    };

    let mut optimizer = AdamConfig::new().with_epsilon(1.0e-8).init();
    let mut scheduler =
        CosineAnnealingLrSchedulerConfig::new(schedule.initial_learning_rate, schedule.steps.get())
            .with_min_lr(schedule.minimum_learning_rate)
            .init()
            .expect("a validated schedule satisfies the scheduler's domain");

    let mut objective_options = ObjectiveOptions {
        affinity: options.affinity,
        relation: None,
        support: options.support,
        budget: options.budget,
        coefficients: options.coefficients,
    };
    let mut scales: Option<[LocalScales; RUNGS.len()]> = None;
    let mut mined: Option<MinedFrame> = None;
    let mut evidence = TrainingEvidence {
        boundary: None,
        budget: BudgetBreakdown::new(),
        losses: Vec::with_capacity(schedule.steps.get()),
        telemetry: Vec::new(),
    };

    for step_index in 0..schedule.steps.get() {
        if step_index == schedule.boundary {
            let (energy, boundary) =
                freeze_radius(&model, inputs, options, vacuous, step_index, device)?;
            objective_options.relation = energy;
            evidence.boundary = Some(boundary);
        }

        #[expect(
            clippy::integer_division_remainder_used,
            reason = "the refresh cadence is a step-count modulus"
        )]
        if step_index == schedule.boundary || step_index % schedule.refresh_interval.get() == 0 {
            let with_scales = objective_options.relation.is_some();
            let outcome = refresh.tick(&model.valid(), &deciles, with_scales, device)?;
            mined = Some(outcome.mined);
            if let Some(tables) = outcome.scales {
                scales = Some(tables);
            }
            evidence.telemetry.push(TickTelemetry {
                step: step_index,
                displacement: outcome.displacement,
            });
        }

        let rung_index = rung(step_index, schedule.boundary);
        let batch = draw_batch(
            &sampler,
            rung_index,
            mined.as_ref(),
            scales.as_ref(),
            inputs,
            rng,
        );

        let objective = step::objective(
            &model,
            &batch,
            inputs.columns,
            &objective_options,
            &deciles,
            &mut evidence.budget,
            device,
        )?;
        evidence.losses.push(objective.loss);

        let gradients = GradientsParams::from_grads(objective.surrogate.backward(), &model);
        model = optimizer.step(scheduler.step(), model, gradients);
    }

    Ok(Fitted { model, evidence })
}

/// Selects a step's rung index: zero through the opening segment,
/// round-robin across [`RUNGS`] once the ladder opens.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "the rung round-robin is a step-count modulus"
)]
const fn rung(step_index: usize, boundary: usize) -> usize {
    if step_index < boundary {
        0
    } else {
        (step_index - boundary) % RUNGS.len()
    }
}

/// Draws and assembles one step's batch at its rung.
///
/// # Panics
///
/// Panics when relation edges are drawn before a scale-bearing tick;
/// the boundary always runs one, so a miss is a wiring defect.
fn draw_batch<'index, R: Rng + ?Sized>(
    sampler: &BatchSampler<'index>,
    rung_index: usize,
    mined: Option<&MinedFrame>,
    scales: Option<&[LocalScales; RUNGS.len()]>,
    inputs: &TrainerInputs<'_>,
    rng: &mut R,
) -> Batch<'index> {
    let populations = sampler.draw(
        RUNGS[rung_index],
        mined,
        inputs.landmarks,
        inputs.anchors,
        rng,
    );
    let batch_scales = if populations.relation.is_empty() {
        None
    } else {
        Some(&scales.expect("relation draws happen only after a scale-bearing tick")[rung_index])
    };

    Batch::assemble(populations, batch_scales)
}

/// Validates the corpus row domain and the boundary's structural
/// admissibility; returns whether the run is vacuous.
///
/// The decision whether the boundary can freeze a radius is
/// structural: force and review coverage are properties of the index
/// and the verdicts, not of coordinates, so an impossible boundary
/// fails here instead of after the opening segment.
#[expect(
    clippy::panic_in_result_fn,
    reason = "a row-domain mismatch between one generation's artifacts is a wiring defect \
              contract, not a recoverable error"
)]
fn admit(inputs: &TrainerInputs<'_>, options: &TrainOptions) -> Result<bool, TrainError> {
    let rows = inputs.columns.representations.len();
    assert_eq!(
        rows,
        inputs.columns.roles.len(),
        "the representation and role columns should cover the same rows"
    );
    assert_eq!(
        rows,
        inputs.semantic.rows(),
        "the input columns and the semantic graph should cover the same rows"
    );

    for anchor in inputs.landmarks.iter().chain(inputs.anchors) {
        assert!(
            anchor.row < rows,
            "support anchors should reference corpus rows"
        );
    }

    let force = ForceClasses::measure(inputs.attraction);
    if options.lens.asserted_radius.is_none() {
        if force.proximal && !reviewed_proximal_force(inputs.attraction, inputs.verdicts) {
            return Err(TrainError::MissingProximalReviews);
        }
        if force.coincident && !force.proximal {
            return Err(TrainError::CoincidentWithoutProximal);
        }
    }

    Ok(!force.proximal && !force.coincident)
}

/// Runs the phase boundary: measures the reviewed-Proximal `z`
/// population against the boundary's own coordinates, freezes the
/// Proximal radius, and composes the relation energy.
///
/// On a vacuous run - no attraction force at all - there is nothing to
/// measure or compose, a configured assertion included; the evidence
/// records the fact and the relation term stays absent.
fn freeze_radius<B: AutodiffBackend<FloatElem = f32>>(
    model: &Projector<B>,
    inputs: &TrainerInputs<'_>,
    options: &TrainOptions,
    vacuous: bool,
    step: usize,
    device: &B::Device,
) -> Result<(Option<RelationEnergy>, BoundaryEvidence), TrainError> {
    if vacuous {
        return Ok((
            None,
            BoundaryEvidence {
                step,
                radius: FrozenRadius::Vacuous,
                calibration: ProximalCalibration {
                    radius: None,
                    types: Vec::new(),
                },
            },
        ));
    }

    let frame = refresh::forward(
        &model.valid(),
        inputs.columns,
        RUNGS[0],
        options.forward_rows,
        device,
    )?;
    let scales = refresh::scales(&frame, &inputs.knn, RUNGS[0])?;
    let calibration = calibrate(
        inputs.verdicts,
        inputs.attraction,
        &frame,
        &scales,
        CalibrationOptions::new(options.plan.relation_cap, options.lens.epsilon)
            .expect("a validated lens epsilon satisfies the calibration domain"),
    );

    let (frozen, radius) = match (calibration.radius, options.lens.asserted_radius) {
        (_, Some(radius)) => (radius, FrozenRadius::Asserted { radius }),
        (Some(radius), None) => (radius, FrozenRadius::Measured { radius }),
        // The entry check admits this run only with reviewed coverage
        // or an assertion; reaching here means the two mass walks
        // disagree, and failing honestly beats composing from nothing.
        (None, None) => return Err(TrainError::MissingProximalReviews),
    };

    let proximal = ProximalEnergy::new(frozen, options.lens.temperature)
        .expect("a measured quantile of finite z values is finite and non-negative");
    let energy = RelationEnergy::new(options.lens.coincident, proximal, options.lens.epsilon)
        .ok_or_else(|| TrainError::DegenerateRadius {
            radius: frozen,
            coincident: options.lens.coincident.radius(),
        })?;

    Ok((
        Some(energy),
        BoundaryEvidence {
            step,
            radius,
            calibration,
        },
    ))
}

/// Which relation classes carry force anywhere in the index.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct ForceClasses {
    proximal: bool,
    coincident: bool,
}

impl ForceClasses {
    /// Scans the groups for class weight backed by instances.
    fn measure(index: &AttractionIndex) -> Self {
        let mut classes = Self {
            proximal: false,
            coincident: false,
        };
        for group in index.groups().iter().filter(|group| exerts_force(group)) {
            let weights = group.weights();
            classes.proximal |= weights.proximal > 0.0;
            classes.coincident |= weights.coincident > 0.0;
        }
        classes
    }
}

/// Whether any reviewed-Proximal verdict covers a group that exerts
/// Proximal force.
///
/// This is the coordinate-free core of the boundary measurement: the
/// calibration's pair weights are positive exactly on these groups'
/// instances, so a positive measured mass exists if and only if this
/// holds.
fn reviewed_proximal_force(index: &AttractionIndex, verdicts: &[ResolvedVerdict]) -> bool {
    verdicts
        .iter()
        .filter(|verdict| verdict.placement == PlacementClass::Proximal)
        .any(|verdict| {
            let groups = index.groups();
            groups
                .binary_search_by_key(&verdict.relation.get(), |group| group.relation().get())
                .is_ok_and(|position| {
                    let group = &groups[position];
                    exerts_force(group) && group.weights().proximal > 0.0
                })
        })
}

/// Whether a group can exert any force: instances exist and the
/// strength multiplier passes them through.
fn exerts_force(group: &AttractionGroup) -> bool {
    !group.edges().is_empty() && group.weights().strength > 0.0
}

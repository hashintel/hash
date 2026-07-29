//! The run's machinery.
//!
//! Input admission, the samplers and evaluators derived from one generation's artifacts, and the
//! shared step loop both phases execute.
//!
//! A [`Session`] is everything the loop derives deterministically from the borrowed inputs and
//! options; [`Training`] is the mutable state a step advances - model, optimizer, scheduler,
//! evidence. The split is what makes the phase boundary a first-class seam: the opening segment and
//! the ladder run the same loop body over the same session, and a resumed ladder rebuilds its
//! session from the same artifacts while the training state arrives from the checkpoint.
//!
//! Refresh products (mined negatives, per-rung scale tables) never cross a [`Session::run`] call:
//! the boundary step opens with an unconditional refresh, so a ladder segment re-derives them from
//! the model it starts with. That property is what makes a checkpointed resume bit-equal to the
//! straight run on a deterministic backend.

use core::ops::Range;

use burn::{
    lr_scheduler::{
        LrScheduler as _,
        cosine::{CosineAnnealingLrScheduler, CosineAnnealingLrSchedulerConfig},
    },
    module::AutodiffModule as _,
    optim::{Adam, AdamConfig, GradientsParams, Optimizer, adaptor::OptimizerAdaptor},
    tensor::backend::AutodiffBackend,
};
use hashql_core::id::Id;
use rand::Rng;

use super::{
    super::{
        ObjectiveOptions, RUNGS,
        batch::{Batch, BatchSampler},
        metrics::{DegreeDeciles, TypeParticipants},
        refresh::{self, Refresh, SnapshotSample},
        step::Evaluation,
    },
    BoundaryEvidence, FrozenRadius, TickTelemetry, TrainError, TrainOptions, TrainerInputs,
    TrainingEvidence, TrainingSchedule,
};
use crate::{
    progress::Progress,
    salt::{
        projector::{
            loss::{BatchRowId, ProximalEnergy, RelationEnergy},
            miner::{HardNegativeMiner, MinedFrame},
            model::Projector,
            scale::LocalScales,
            verdict::{
                PlacementClass, ResolvedVerdict,
                calibrate::{CalibrationOptions, ProximalCalibration, calibrate},
            },
        },
        relation::attraction::{AttractionGroup, AttractionIndex},
    },
};

/// The trainer's optimizer: Adam adapted over the projector.
pub(crate) type TrainerOptimizer<B> = OptimizerAdaptor<Adam, Projector<B>, B>;

/// The trainer optimizer's record: per-parameter Adam moments.
pub(crate) type TrainerOptimizerRecord<B> =
    <TrainerOptimizer<B> as Optimizer<Projector<B>, B>>::Record;

/// The mutable training state one step advances.
///
/// This is exactly the state that crosses the phase boundary; the checkpoint artifact serializes it
/// (with the caller's generator position) and a resumed ladder starts from it.
// No Debug: the optimizer adaptor does not implement it.
pub(super) struct Training<B: AutodiffBackend<FloatElem = f32>> {
    pub model: Projector<B>,
    pub optimizer: TrainerOptimizer<B>,
    pub scheduler: CosineAnnealingLrScheduler,
    pub evidence: TrainingEvidence,
}

/// Builds a fresh trainer optimizer; every call constructs a new one, nothing is shared.
///
/// One construction site keeps a resumed run's optimizer identical to the one the opening segment
/// trained under.
pub(super) fn optimizer<B: AutodiffBackend<FloatElem = f32>>() -> TrainerOptimizer<B> {
    AdamConfig::new().with_epsilon(1.0e-8).init()
}

/// Builds the cosine scheduler a validated schedule describes.
pub(super) fn scheduler(schedule: TrainingSchedule) -> CosineAnnealingLrScheduler {
    CosineAnnealingLrSchedulerConfig::new(
        schedule.initial_learning_rate.get(),
        schedule.steps.get(),
    )
    .with_min_lr(schedule.minimum_learning_rate.get())
    .init()
    .expect("a validated schedule satisfies the scheduler's domain")
}

/// The loop-invariant machinery of one run, derived from the inputs.
// No Debug: the refresh machinery's spatial index does not implement
// it.
pub(super) struct Session<'run, N, E> {
    inputs: &'run TrainerInputs<'run, N, E>,
    options: &'run TrainOptions,
    sampler: BatchSampler<'run, N, E>,
    refresh: Refresh<'run, N>,
    evaluation: Evaluation<'run, N>,
    vacuous: bool,
}

impl<'run, N, E> Session<'run, N, E>
where
    N: Id,
    E: Id,
{
    /// Admits the inputs and derives the run's machinery.
    ///
    /// # Errors
    ///
    /// Returns an error when the corpus cannot train (no semantic edge weight) or the boundary is
    /// structurally inadmissible (a measured radius with no opening segment in front of the
    /// boundary, Proximal force without reviewed coverage or a configured assertion, or Coincident
    /// force without any Proximal force).
    pub(super) fn new(
        inputs: &'run TrainerInputs<'run, N, E>,
        options: &'run TrainOptions,
    ) -> Result<Self, TrainError> {
        let vacuous = admit(inputs, options)?;

        let rows = inputs.columns.representations.len();
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

        Ok(Self {
            inputs,
            options,
            sampler,
            refresh: Refresh {
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
            },
            evaluation: Evaluation {
                columns: inputs.columns,
                options: ObjectiveOptions {
                    affinity: options.affinity,
                    relation: None,
                    support: options.support,
                    budget: options.budget,
                    coefficients: options.coefficients,
                },
                deciles: DegreeDeciles::new(inputs.attraction, rows),
            },
            vacuous,
        })
    }

    /// Runs the loop over one step range and returns the advanced state.
    ///
    /// The body is phase-agnostic: the opening segment passes `0..boundary`, the ladder
    /// `boundary..steps`, and the boundary work (radius freeze, unconditional refresh) triggers on
    /// the step index alone.
    ///
    /// The loop is the only place a step's loss exists before the run ends, so it reports every
    /// step to `progress` against the whole schedule - not against its own range, which is one
    /// phase of it. The snapshot sample the refresh ticks report is chosen here, once per phase,
    /// from the observer's stated appetite; the choice consumes no randomness, so the run's draws
    /// are the same under every observer.
    pub(super) fn run<B: AutodiffBackend<FloatElem = f32>, R: Rng + ?Sized, P: Progress>(
        &mut self,
        Training {
            mut model,
            mut optimizer,
            mut scheduler,
            mut evidence,
        }: Training<B>,
        steps: Range<usize>,
        rng: &mut R,
        device: &B::Device,
        progress: &P,
    ) -> Result<Training<B>, TrainError> {
        let schedule = self.options.schedule;
        let sample = SnapshotSample::select(
            self.inputs.columns.representations.len(),
            self.inputs.landmarks,
            progress.projector_sample_size(),
        );
        let mut scales: Option<[LocalScales<BatchRowId>; RUNGS.len()]> = None;
        let mut mined: Option<MinedFrame<N>> = None;

        for step_index in steps {
            if step_index == schedule.boundary {
                let (energy, boundary) = freeze_radius(
                    &model,
                    self.inputs,
                    self.options,
                    self.vacuous,
                    step_index,
                    device,
                )?;
                self.evaluation.options.relation = energy;
                evidence.boundary = Some(boundary);
            }

            #[expect(
                clippy::integer_division_remainder_used,
                reason = "the refresh cadence is a step-count modulus"
            )]
            if step_index == schedule.boundary || step_index % schedule.refresh_interval.get() == 0
            {
                let outcome = self.refresh.tick(
                    &model.valid(),
                    &self.evaluation.deciles,
                    self.evaluation.options.relation.is_some(),
                    device,
                    &sample,
                    progress,
                )?;

                mined = Some(outcome.mined);
                if let Some(tables) = outcome.scales {
                    scales = Some(tables);
                }

                evidence.telemetry.push(TickTelemetry {
                    step: step_index,
                    displacement: outcome.displacement,
                });
            }

            let rung_index = rung(step_index, schedule.boundary, self.vacuous);
            let batch = draw_batch(
                &self.sampler,
                rung_index,
                mined.as_ref(),
                scales.as_ref(),
                self.inputs,
                rng,
            );

            let objective =
                self.evaluation
                    .objective(&model, &batch, &mut evidence.budget, device)?;
            progress.projector_step(step_index, schedule.steps.get(), &objective.loss);
            evidence.losses.push(objective.loss);

            let gradients = GradientsParams::from_grads(objective.surrogate.backward(), &model);
            model = optimizer.step(scheduler.step(), model, gradients);
        }

        Ok(Training {
            model,
            optimizer,
            scheduler,
            evidence,
        })
    }
}

/// Selects a step's rung index.
///
/// Zero through the opening segment, round-robin across [`RUNGS`] once the ladder opens.
///
/// A vacuous run pins the zero rung throughout. With no relation force the objective is identical
/// at every rung, so lens variation could teach the modulation head nothing but batch-sampling
/// noise; a zero condition instead leaves the head's condition weights with exactly zero gradient,
/// so every projected rung of a forceless corpus is bit-identical - the flat ladder is a
/// certificate, not an accident.
#[expect(
    clippy::integer_division_remainder_used,
    reason = "the rung round-robin is a step-count modulus"
)]
const fn rung(step_index: usize, boundary: usize, vacuous: bool) -> usize {
    if vacuous || step_index < boundary {
        0
    } else {
        (step_index - boundary) % RUNGS.len()
    }
}

/// Draws and assembles one step's batch at its rung.
///
/// # Panics
///
/// Panics when relation edges are drawn before a scale-bearing tick; the boundary always runs one,
/// so a miss is a wiring defect.
fn draw_batch<N, E>(
    sampler: &BatchSampler<'_, N, E>,
    rung_index: usize,
    mined: Option<&MinedFrame<N>>,
    scales: Option<&[LocalScales<BatchRowId>; RUNGS.len()]>,
    inputs: &TrainerInputs<'_, N, E>,
    mut rng: impl Rng,
) -> Batch<N>
where
    N: Id,
    E: Id,
{
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
        let scales = scales.unwrap_or_else(|| {
            unreachable!("relation draws happen only after a scale-bearing tick")
        });
        Some(&scales[rung_index])
    };

    Batch::assemble(populations, batch_scales)
}

/// Validates the corpus row domain and the boundary's structural admissibility.
///
/// Returns whether the run is vacuous.
///
/// Runs once per training run, at session construction: the `O(rows)` domain scans sit before the
/// step loop and no step re-enters admission.
///
/// The decision whether the boundary can freeze a radius is structural: force, review coverage, and
/// the presence of an opening segment to measure after are properties of the index, the verdicts,
/// and the schedule, not of coordinates, so an impossible boundary fails here instead of after the
/// opening segment.
#[expect(
    clippy::panic_in_result_fn,
    reason = "a row-domain mismatch between one generation's artifacts is a wiring defect \
              contract, not a recoverable error"
)]
fn admit<N, E>(inputs: &TrainerInputs<'_, N, E>, options: &TrainOptions) -> Result<bool, TrainError>
where
    N: Id,
    E: Id,
{
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
            anchor.row.as_usize() < rows,
            "support anchors should reference corpus rows"
        );
    }

    let force = ForceClasses::measure(inputs.attraction);
    if options.lens.asserted_radius.is_none() {
        // A measured radius needs the semantic-only baseline in front
        // of the boundary; measuring on the untrained init map would
        // freeze a meaningless radius.
        if force.proximal && options.schedule.boundary == 0 {
            return Err(TrainError::UnbaselinedRadius);
        }

        if force.proximal && !reviewed_proximal_force(inputs.attraction, inputs.verdicts) {
            return Err(TrainError::MissingProximalReviews);
        }

        if force.coincident && !force.proximal {
            return Err(TrainError::CoincidentWithoutProximal);
        }
    }

    Ok(!force.proximal && !force.coincident)
}

/// Runs the phase boundary.
///
/// Measures the reviewed-Proximal `z` population against the boundary's own coordinates, freezes
/// the Proximal radius, and composes the relation energy.
///
/// On a vacuous run - no attraction force at all - there is nothing to measure or compose, a
/// configured assertion included; the evidence records the fact and the relation term stays absent.
fn freeze_radius<N, E, B: AutodiffBackend<FloatElem = f32>>(
    model: &Projector<B>,
    inputs: &TrainerInputs<'_, N, E>,
    options: &TrainOptions,
    vacuous: bool,
    step: usize,
    device: &B::Device,
) -> Result<(Option<RelationEnergy>, BoundaryEvidence), TrainError>
where
    N: Id,
    E: Id,
{
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
        RUNGS[0].get(),
        options.forward_rows,
        device,
    )?;
    let scales = refresh::scales(&frame, &inputs.knn, RUNGS[0].get())?;
    let calibration = calibrate(
        inputs.verdicts,
        inputs.attraction,
        &frame,
        &scales,
        CalibrationOptions::new(options.plan.relation_cap, options.lens.epsilon.get())
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

    let proximal = ProximalEnergy::new(frozen, options.lens.temperature.get())
        .expect("a measured quantile of finite z values is finite and non-negative");
    let energy = RelationEnergy::new(
        options.lens.coincident,
        proximal,
        options.lens.epsilon.get(),
    )
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
    fn measure<N, E>(index: &AttractionIndex<N, E>) -> Self {
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

/// Whether any reviewed-Proximal verdict covers a group that exerts Proximal force.
///
/// This is the coordinate-free core of the boundary measurement: the calibration's pair weights are
/// positive exactly on these groups' instances, so a positive measured mass exists if and only if
/// this holds.
fn reviewed_proximal_force<N, E>(
    index: &AttractionIndex<N, E>,
    verdicts: &[ResolvedVerdict],
) -> bool {
    verdicts
        .iter()
        .filter(|verdict| verdict.placement == PlacementClass::Proximal)
        .any(|verdict| {
            let groups = index.groups();
            groups
                .binary_search_by_key(&verdict.relation.as_u64(), |group| {
                    group.relation().as_u64()
                })
                .is_ok_and(|position| {
                    let group = &groups[position];
                    exerts_force(group) && group.weights().proximal > 0.0
                })
        })
}

/// Whether a group can exert any force.
///
/// Instances exist and the strength multiplier passes them through.
fn exerts_force<N, E>(group: &AttractionGroup<N, E>) -> bool {
    !group.edges().is_empty() && group.weights().strength > 0.0
}

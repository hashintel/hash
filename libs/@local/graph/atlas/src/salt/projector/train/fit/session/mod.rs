//! The run's machinery.
//!
//! Input admission, the samplers and evaluators derived from one generation's artifacts, and the
//! shared step loop both phases execute.
//!
//! A [`Session`] is everything the loop derives deterministically from the borrowed inputs and
//! options; [`Training`] is the mutable state a step advances - model, optimizer, scheduler,
//! evidence. The split is what makes the phase boundary first-class: the opening segment and
//! the ladder run the same loop body over the same session, and a resumed ladder rebuilds its
//! session from the same artifacts while the training state arrives from the checkpoint.
//!
//! Refresh products (mined negatives, per-step scale tables) never cross a [`Session::run`] call:
//! the boundary step opens with an unconditional refresh, so a ladder segment re-derives them from
//! the model it starts with. That property is what makes a checkpointed resume bit-equal to the
//! straight run on a deterministic backend.

use core::ops::Range;

use burn::{
    lr_scheduler::LrScheduler as _,
    module::AutodiffModule as _,
    optim::{GradientsParams, Optimizer as _},
    tensor::backend::AutodiffBackend,
};
use hashql_core::id::Id;
use rand::Rng;

use super::{
    super::{
        ObjectiveOptions, STEPS,
        batch::{BatchSampler, DrawContext, Populations},
        metrics::{DegreeDeciles, TypeParticipants},
        refresh::{self, Refresh, SnapshotSample},
        step::Evaluation,
    },
    BoundaryEvidence, FrozenRadius, RefreshFraction, TargetRefusalCause, TickTelemetry, TrainError,
    TrainOptions, TrainerInputs,
    objective::{ForwardContext, TargetContext, TargetEvidence, TargetPhase, TargetStep},
};
use crate::{
    math::{DNonNegative, FinitePointField},
    progress::Progress,
    salt::projector::{
        miner::{HardNegativeMiner, MinedFrame},
        model::Projector,
        scale::LocalScales,
        verdict::calibrate::{ProximalCalibration, reviewed_fraction_within},
    },
};

mod admission;
mod boundary;
mod draw;
mod training;

#[cfg(test)]
pub(super) use self::boundary::warn_boundary_findings;
pub(crate) use self::training::TrainerOptimizerRecord;
pub(super) use self::training::{RunOutcome, Training, optimizer, scheduler};
use self::{
    admission::admit,
    boundary::{BoundaryOutcome, calibration_options, freeze_radius},
    draw::{assemble_batch, step},
};

/// One step's target-pass outcome.
///
/// A refusal is a lawful outcome rather than an error: the loop seals the run record and ends
/// the segment with it, while a diverged forward stays an error and carries no record.
enum TargetPass<N, B: AutodiffBackend> {
    /// No phase runs at this step.
    Idle,
    /// The pass completed and its contribution enters the step's objective.
    Step(TargetStep<N, B>),
    /// A reading refused, and the run ends at this step with the record preserved.
    Refused(TargetRefusalCause<N>),
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
    target: Option<TargetContext<'run, N>>,
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
    /// Returns an error when the corpus cannot train (no semantic edge weight), when the boundary
    /// is structurally inadmissible (a measured radius with no opening segment in front of the
    /// boundary, Proximal force without reviewed coverage, or Coincident force without any Proximal
    /// force), or when a target configuration fails its own admission.
    pub(super) fn new(
        inputs: &'run TrainerInputs<'run, N, E>,
        options: &'run TrainOptions,
    ) -> Result<Self, TrainError<N>> {
        let vacuous = admit(inputs, options)?;

        let rows = inputs.columns.representations.len();
        let target = match inputs.target {
            Some(configured) => Some(TargetContext::admit(
                configured,
                inputs.attraction,
                options.plan,
                options.schedule,
                rows,
                vacuous,
            )?),
            None => None,
        };
        let mut plan = options.plan;
        if vacuous {
            // No group exerts force, so relation draws would be dead
            // weight at every step; the ladder still runs for the lens
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
            target,
            vacuous,
        })
    }

    /// Runs the loop over one step range and returns the segment's terminal state: the
    /// advanced training state, or the target refusal carrying everything measured before it.
    ///
    /// The body is phase-agnostic. The opening segment passes `0..boundary` and the ladder passes
    /// `boundary..steps`, while the boundary work (radius freeze, unconditional refresh) triggers
    /// on the step index alone.
    ///
    /// The loop is the only place a step's loss exists before the run ends, so it reports every
    /// step to `progress` against the whole schedule rather than against its own range, which is
    /// one phase of it. This selects the snapshot sample the refresh ticks report once per phase
    /// from the observer's stated appetite. The choice consumes no randomness, so the run's draws
    /// are the same under every observer.
    pub(super) fn run<B: AutodiffBackend<FloatElem = f32>, R: Rng + ?Sized, P: Progress>(
        &mut self,
        Training {
            mut model,
            mut optimizer,
            mut scheduler,
            mut evidence,
        }: Training<N, B>,
        steps: Range<usize>,
        rng: &mut R,
        device: &B::Device,
        progress: &P,
    ) -> Result<RunOutcome<N, B>, TrainError<N>> {
        let schedule = self.options.schedule;
        let sample = SnapshotSample::select(
            self.inputs.columns.representations.len(),
            self.inputs.landmarks,
            progress.projector_sample_size(),
        );
        let mut scales: Option<[LocalScales<N>; STEPS.len()]> = None;
        let mut mined: Option<MinedFrame<N>> = None;
        let mut phase: Option<TargetPhase<N>> = None;

        for step_index in steps {
            if step_index == schedule.boundary() {
                let (energy, boundary, frame) = self.boundary(&model, step_index, device)?;
                self.evaluation.options.relation = energy;
                // The boundary record enters the run record the moment the radius freeze
                // completes, so a target freeze refusal takes the completed measurement
                // with it.
                evidence.boundary = Some(boundary);
                phase = match self.freeze_phase(frame, step_index) {
                    Ok(frozen) => frozen,
                    Err(cause) => return Ok(RunOutcome::refused(step_index, cause, evidence)),
                };
            }

            #[expect(
                clippy::integer_division_remainder_used,
                reason = "the refresh cadence is a step-count modulus"
            )]
            let tick = step_index == schedule.boundary()
                || step_index % schedule.refresh_interval().get() == 0;
            if tick {
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

                if let Some(fraction) = self.drift_fraction(&outcome.frame, scales.as_ref()) {
                    evidence.fractions.push(RefreshFraction {
                        step: step_index,
                        fraction,
                    });
                }

                evidence.telemetry.push(TickTelemetry {
                    step: step_index,
                    displacement: outcome.displacement,
                });
            }

            // The drawn ladder position is its own index: binding it over `step_index` would
            // hand the ladder position to every step-indexed consumer below.
            let ladder_step = step(step_index, schedule.boundary(), self.vacuous);
            let populations = self.sampler.draw(
                DrawContext {
                    eta: STEPS[ladder_step],
                    mined: mined.as_ref(),
                    landmarks: self.inputs.landmarks,
                    anchors: self.inputs.anchors,
                    target: phase.is_some(),
                },
                &mut *rng,
            );

            let target_step = match self.target_pass(
                &mut phase,
                &model,
                &populations,
                tick,
                step_index,
                device,
            )? {
                TargetPass::Idle => None,
                TargetPass::Step(step) => Some(step),
                TargetPass::Refused(cause) => {
                    // The phase seals its accumulated record into the run record, and the
                    // whole record rides the refusal.
                    evidence.target = Some(
                        phase
                            .take()
                            .expect("a target refusal fires only where a phase ran")
                            .into_evidence(),
                    );
                    return Ok(RunOutcome::refused(step_index, cause, evidence));
                }
            };

            let batch = assemble_batch(populations, ladder_step, scales.as_ref());

            let mut objective =
                self.evaluation
                    .objective(&model, &batch, &mut evidence.budget, device)?;
            if let Some(target_step) = target_step {
                objective.surrogate = objective.surrogate + target_step.surrogate;
                objective.loss.target = target_step.contribution;
            }
            progress.projector_step(step_index, schedule.steps().get(), &objective.loss);
            evidence.losses.push(objective.loss);

            let gradients = GradientsParams::from_grads(objective.surrogate.backward(), &model);
            model = optimizer.step(scheduler.step(), model, gradients);
        }

        evidence.target = self.seal_target(phase, &model, device, schedule.steps().get())?;

        Ok(RunOutcome::Completed(Training {
            model,
            optimizer,
            scheduler,
            evidence,
        }))
    }

    /// Seals the target phase into its run evidence, when a phase exists.
    ///
    /// The loop's final optimizer update landed after its own step's enforcement application,
    /// so the record closes over the returned model's zero field before the evidence seals:
    /// every update of the interval is read, the last one included.
    fn seal_target<B: AutodiffBackend<FloatElem = f32>>(
        &self,
        phase: Option<TargetPhase<N>>,
        model: &Projector<B>,
        device: &B::Device,
        steps: usize,
    ) -> Result<Option<TargetEvidence<N>>, TrainError<N>> {
        let Some(mut frozen) = phase else {
            return Ok(None);
        };

        frozen.close(
            &ForwardContext {
                model,
                columns: self.inputs.columns,
                forward_rows: self.options.forward_rows,
                device,
            },
            steps,
        )?;

        Ok(Some(frozen.into_evidence()))
    }

    /// Freezes the target phase over the boundary's frame, when the run is target-configured.
    ///
    /// # Errors
    ///
    /// Returns the refusal cause when a reference cannot freeze. The loop owns the
    /// consequence and seals the run record into the refusal.
    fn freeze_phase(
        &self,
        frame: Option<Box<FinitePointField<N>>>,
        step: usize,
    ) -> Result<Option<TargetPhase<N>>, TargetRefusalCause<N>> {
        match (self.target.as_ref(), frame) {
            (Some(context), Some(frame)) => {
                TargetPhase::freeze(context, frame, &self.inputs.knn, step).map(Some)
            }
            _ => Ok(None),
        }
    }

    /// Reads a scale-bearing tick's boundary-drift fraction, when the boundary froze a radius.
    ///
    /// The boundary froze against the low step, so each scale-bearing tick re-asks the
    /// freeze-time question of its own low-step frame: what share of reviewed mass now sits
    /// at or inside the frozen radius.
    fn drift_fraction(
        &self,
        frame: &FinitePointField<N>,
        scales: Option<&[LocalScales<N>; STEPS.len()]>,
    ) -> Option<DNonNegative> {
        let energy = self.evaluation.options.relation?;
        let tables = scales?;

        reviewed_fraction_within(
            self.inputs.verdicts,
            self.inputs.attraction,
            frame,
            &tables[0],
            calibration_options(self.options),
            energy.proximal().radius(),
        )
    }

    /// Runs one step's target pass, when a phase exists.
    ///
    /// The pass reads the draws in the corpus domain before assembly re-indexes the released
    /// families away from it. The evidence reading rides the tick cadence and consumes the
    /// pass's own live fit and projected zero field: the fit becomes the recorded
    /// objective-shape reading, and the bridge ends derive from the whole-corpus fields inside
    /// the reading itself.
    ///
    /// A gauge fit, a diverged reading, or an evaluation refusal returns as
    /// [`TargetPass::Refused`]: the loop owns the record and the consequence.
    ///
    /// # Errors
    ///
    /// Returns an error when a forward diverges.
    fn target_pass<B: AutodiffBackend<FloatElem = f32>>(
        &self,
        phase: &mut Option<TargetPhase<N>>,
        model: &Projector<B>,
        populations: &Populations<'_, N, E>,
        tick: bool,
        step_index: usize,
        device: &B::Device,
    ) -> Result<TargetPass<N, B>, TrainError<N>> {
        let (Some(frozen), Some(context)) = (phase.as_mut(), self.target.as_ref()) else {
            return Ok(TargetPass::Idle);
        };

        let forward = ForwardContext {
            model,
            columns: self.inputs.columns,
            forward_rows: self.options.forward_rows,
            device,
        };
        let outcome = match frozen.step(context, &forward, &populations.target, step_index) {
            Ok(outcome) => outcome,
            // Training refuses the step rather than descending through a degenerate frame.
            Err(TrainError::Gauge(refusal)) => {
                return Ok(TargetPass::Refused(TargetRefusalCause::Gauge(refusal)));
            }
            // A diverged reading is a data-dependent refusal the run record survives.
            Err(TrainError::TargetReading(diverged)) => {
                return Ok(TargetPass::Refused(TargetRefusalCause::Reading(diverged)));
            }
            Err(error) => return Err(error),
        };
        if tick {
            let canonical = refresh::forward(
                &model.valid(),
                self.inputs.columns,
                context.canonical_eta(),
                self.options.forward_rows,
                device,
            )?;

            if let Err(refusal) = frozen.evaluate(
                context,
                &outcome.fit,
                &canonical,
                &outcome.zero_field,
                step_index,
            ) {
                // An evaluation that cannot state its declared evidence publishes nothing.
                return Ok(TargetPass::Refused(TargetRefusalCause::Evidence(refusal)));
            }
        }

        Ok(TargetPass::Step(outcome))
    }

    /// Runs the phase boundary's measurement.
    ///
    /// Forwards the boundary's zero-condition frame once and freezes the Proximal radius
    /// against it. The frame returns beside the freeze's evidence, so the loop's target
    /// freeze reads the identical coordinates.
    ///
    /// On a vacuous run - no attraction force at all - nothing exists to measure or compose.
    /// The evidence records the fact and the relation term stays absent. No frame returns
    /// here, because target admission already refused any configuration on a forceless
    /// corpus.
    fn boundary<B: AutodiffBackend<FloatElem = f32>>(
        &self,
        model: &Projector<B>,
        step: usize,
        device: &B::Device,
    ) -> Result<BoundaryOutcome<N>, TrainError<N>> {
        if self.vacuous {
            return Ok((
                None,
                BoundaryEvidence {
                    step,
                    radius: FrozenRadius::Vacuous,
                    calibration: ProximalCalibration {
                        radius: None,
                        types: Vec::new(),
                        stability: None,
                    },
                },
                None,
            ));
        }

        let frame = refresh::forward(
            &model.valid(),
            self.inputs.columns,
            STEPS[0],
            self.options.forward_rows,
            device,
        )?;
        let (energy, boundary) = freeze_radius(&frame, self.inputs, self.options, step)?;

        Ok((Some(energy), boundary, Some(frame)))
    }
}

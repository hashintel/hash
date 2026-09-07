//! The placement stage runs either the trained projector or the landmark baseline.
//!
//! The stage is the one owner of a fit's coordinates. Under the baseline placement every row takes
//! its assigned landmark's layout coordinate. Under the projector placement the stage trains the
//! conditioned model over the staged artifacts and stages its checkpoint. It projects the whole
//! corpus at every ladder level and measures the ladder. It publishes the canonical level's field
//! aligned into the baseline frame. The metadata records which placement ran and, for a trained
//! one, the training and ladder measurements.
//!
//! Ladder frames are transient: each projects into the run's scratch directory and maps back for
//! measurement, so the stage's owned working set stays one frame regardless of the schedule
//! length. Only the canonical aligned column publishes - version 1 publishes one variant.

use burn::module::AutodiffModule as _;
use hashql_core::id::IdVec;

pub(super) use self::inputs::{DistinctInputs, PlacementInputs};
use self::{error::ProjectorError, inputs::PublishInputs, report::LadderPass};
use super::{Context, coordinates::Coordinates, quotient::DistinctRowId};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    device::Training,
    file::{
        array::SizedColumn,
        repository::Binding,
        salt::{
            artifact,
            metadata::{
                self, FrozenRadiusEvidence, ProjectorEvidence, ProximalCalibrationEvidence,
            },
        },
    },
    identity::{EdgeRowId, NodeRowId},
    math::NonNegative,
    progress::Progress,
    salt::{
        fit::{PlacementOptions, ProjectorOptions, Stage, stage_rng},
        projector::{
            artifact as checkpoint,
            loss::AffinityEnergy,
            model::{NodeRole, Projector},
            train::{
                self, Model, NodeColumns, SupportAnchor, TrainOptions, TrainerInputs, refresh,
            },
        },
        relation::attraction::AttractionIndex,
    },
};

pub(super) mod error;
pub(super) mod inputs;
mod report;
#[cfg(test)]
mod tests;

/// One fit's coordinates, with the record of which placement produced them.
pub(super) struct Placement {
    /// The staged canonical coordinate column.
    pub coordinates: Coordinates,
    /// The staged projector checkpoint.
    ///
    /// Present exactly for a trained placement.
    pub checkpoint: Option<Binding<artifact::Projector>>,
    /// Which placement ran.
    pub kind: metadata::Placement,
    /// The training and ladder measurements of a trained placement.
    pub evidence: Option<ProjectorEvidence>,
}

/// The placement plan [`PlacementPass::new`] resolves from the fit's configuration.
#[derive(Debug, Clone, Copy)]
enum Plan<'fit> {
    /// Every row takes its assigned landmark's layout coordinate.
    Baseline,
    /// Train the conditioned projector and publish the canonical level's aligned field.
    Projector {
        /// The validated projector configuration.
        options: &'fit ProjectorOptions,
        /// The composed affinity energy.
        affinity: AffinityEnergy,
    },
}

/// The placement process of one fit.
///
/// Construction resolves the configured plan and owns every configuration refusal, so a
/// contradictory configuration refuses before any placement span opens. [`run`](Self::run)
/// executes the resolved plan and stages the [`Placement`] coordinates.
pub(super) struct PlacementPass<'fit> {
    /// The stage's staging, scratch, configuration, and device.
    context: &'fit Context,
    /// The staged inputs the placement reads.
    inputs: &'fit PlacementInputs<'fit>,
    /// The resolved plan.
    plan: Plan<'fit>,
}

impl<'fit> PlacementPass<'fit> {
    /// Resolves the configured placement plan.
    ///
    /// Owns every configuration refusal. Each fires before the first placement span opens; a
    /// run that could not start never reaches a span.
    ///
    /// # Errors
    ///
    /// Returns a [`ProjectorError`] when the projector configuration refuses.
    pub(super) fn new(
        context: &'fit Context,
        inputs: &'fit PlacementInputs<'fit>,
    ) -> Result<Self, ProjectorError> {
        let PlacementOptions::Projector(options) = &context.config.placement else {
            return Ok(Self {
                context,
                inputs,
                plan: Plan::Baseline,
            });
        };

        let configured = options.architecture.representation_dimensions.get();
        if configured != PROJECTOR_DIMENSIONS {
            return Err(ProjectorError::RepresentationWidth { configured });
        }

        // The canonical level's membership in the schedule is decidable from the options alone,
        // so a contradictory configuration refuses here rather than after training runs the
        // schedule and every level projects.
        options.ladder.canonical_index()?;

        let Some(affinity) = AffinityEnergy::new(context.config.curve, options.affinity_offset)
        else {
            return Err(ProjectorError::ObjectiveCurve {
                exponent: context.config.curve.b(),
            });
        };

        Ok(Self {
            context,
            inputs,
            plan: Plan::Projector { options, affinity },
        })
    }

    /// Places the corpus under the resolved plan, staging the canonical coordinates.
    ///
    /// The trained placement is the run's only long loop with a per-iteration reading, so it
    /// reports every training step to `progress`, while the baseline places in one pass and
    /// reports nothing but its stage completion.
    ///
    /// # Errors
    ///
    /// Returns an error of the training loop translated onto corpus rows when training fails,
    /// and an I/O error when a staged output does not write or map back.
    pub(super) fn run<P: Progress>(self, progress: &P) -> Result<Placement, ProjectorError> {
        match self.plan {
            Plan::Baseline => self.baseline(),
            Plan::Projector { options, affinity } => self.projector(options, affinity, progress),
        }
    }

    /// Stages every row's assigned landmark coordinate as the canonical column.
    ///
    /// Every corpus row takes its assigned landmark's layout coordinate as the baseline
    /// placement, gathered into one owned column and staged as the `f32[N, 2]` coordinate
    /// artifact.
    #[tracing::instrument(name = "baseline-placement", skip_all)]
    fn baseline(self) -> Result<Placement, ProjectorError> {
        let skeleton = self.inputs.skeleton;
        let layout = skeleton.coordinates();
        let column: IdVec<NodeRowId, _> = skeleton
            .assignment()
            .iter()
            .map(|&ordinal| layout[ordinal])
            .collect();

        let binding = self
            .context
            .staging
            .stage(artifact::Coordinates, SizedColumn::new(&column))?;
        let coordinates = Coordinates::open(&self.context.staging, binding)?;
        tracing::info!("staged the baseline coordinates");

        Ok(Placement {
            coordinates,
            checkpoint: None,
            kind: metadata::Placement::LandmarkBaseline,
            evidence: None,
        })
    }

    /// Trains the projector and publishes the canonical level's aligned field.
    ///
    /// The checkpoint stages beside it.
    #[tracing::instrument(name = "projector-placement", skip_all)]
    fn projector<P: Progress>(
        self,
        options: &ProjectorOptions,
        affinity: AffinityEnergy,
        progress: &P,
    ) -> Result<Placement, ProjectorError> {
        let distinct = &self.inputs.distinct;
        // The corpus matrix is the publication domain: ladder frames and the canonical column
        // cover it, while training runs over the distinct rows. Both matrices live in the
        // quotient.
        let corpus = distinct.quotient.corpus();
        let training = distinct.quotient.training();

        // Every corpus row is a knowledge entity: the dataset streams entities, and no other role
        // projects yet. Each domain's uniform column is born in its own row domain, so neither view
        // relabels the other's rows.
        let corpus_roles = IdVec::from_elem(NodeRole::KnowledgeEntity, corpus.len());
        let training_roles = IdVec::from_elem(NodeRole::KnowledgeEntity, training.len());
        let landmarks = SupportAnchor::at_landmarks(
            self.inputs.skeleton,
            options.landmark_support.weight(),
            |row| distinct.quotient.class_of(row),
        );

        let columns = NodeColumns {
            representations: corpus,
            roles: &corpus_roles,
        };
        let trainer_columns = NodeColumns {
            representations: training,
            roles: &training_roles,
        };

        // A vacuous placement withholds the relation evidence. The trainer sees no force at all, so
        // no radius freezes and the trainer demands no reviewed verdicts, while the published
        // relation artifacts stay real for serving.
        let vacuous = AttractionIndex::vacuous();
        let attraction = if options.vacuous {
            tracing::info!("vacuous attraction select. no attraction term will be used");
            &vacuous
        } else {
            &distinct.indexes.attraction
        };

        let trainer_inputs = TrainerInputs {
            semantic: distinct.semantic.view(),
            protection: distinct.indexes.protection.view(),
            protection_config: options.protection,
            attraction,
            knn: distinct.knn.view(),
            columns: trainer_columns,
            landmarks: &landmarks,
            // No stage supplies temporal anchors, so the pool is empty.
            anchors: &[],
            verdicts: &self.inputs.resolution.resolved,
            // The released configuration trains no target objective: neither the declared
            // constants nor the draws exist here.
            target: None,
        };

        // The configured coefficients are corpus-free bases. The semantic and ordinary bases divide
        // by the total semantic edge weight, the hard-negative base by the row count, and the
        // support bases by the pools the trainer receives, so each base weighs the same objective
        // share on every corpus. The relation base is already mass-free. The masses are the
        // training domain's - the distinct rows and their graph - matching the objective the
        // trainer optimizes. A weightless graph passes the bases through - the trainer rejects it
        // as evidence-free immediately after.
        let coefficients = options.coefficients.normalized(
            distinct.semantic.view().total_weight(),
            training.len(),
            trainer_inputs.anchors.len(),
            trainer_inputs.landmarks.len(),
        );

        let model = self.train(
            options,
            &trainer_inputs,
            distinct,
            &TrainOptions {
                schedule: options.schedule,
                plan: options.plan,
                affinity,
                support: options.support,
                budget: options.budget,
                coefficients,
                miner: options.miner,
                lens: options.lens,
                forward_rows: options.forward_rows,
            },
            progress,
        )?;

        self.publish(options, model, columns)
    }

    /// Stages everything the projector placement publishes.
    ///
    /// The publish half of the placement reads a model and its frozen boundary evidence. It
    /// stages the checkpoint and the canonical coordinate column beside the placement's evidence. A
    /// boundary whose radius composes a relation energy opens the ladder, and the canonical level's
    /// aligned field publishes ([`LadderPass::measure_conditions`]).
    fn publish(
        &self,
        options: &ProjectorOptions,
        model: Model<DistinctRowId, Training>,
        columns: NodeColumns<'_, NodeRowId>,
    ) -> Result<Placement, ProjectorError> {
        let projector = model.projector.valid();
        let checkpoint = self.checkpoint(model.projector)?;

        let energy = model
            .evidence
            .boundary
            .as_ref()
            .and_then(|boundary| boundary.radius.energy(&options.lens));

        let (ladder, binding) = if let Some(energy) = energy {
            let (evidence, binding) = LadderPass::new(
                &self.context.staging,
                &self.context.scratch,
                &self.context.device,
            )
            .measure_conditions(
                options,
                &projector,
                columns,
                &PublishInputs {
                    quotient: self.inputs.distinct.quotient,
                    knn: self.inputs.distinct.knn.view(),
                    attraction: &self.inputs.distinct.indexes.attraction,
                    snapshot: self.inputs.snapshot,
                    reproducibility: self.inputs.reproducibility,
                },
                energy,
            )?;

            (Some(evidence), binding)
        } else {
            let frame = refresh::forward(
                &projector,
                columns,
                NonNegative::ZERO,
                options.forward_rows,
                &self.context.device,
            )?;

            let binding = self
                .context
                .staging
                .stage(artifact::Coordinates, SizedColumn::new(frame.as_slice()))?;
            (None, binding)
        };

        let coordinates = Coordinates::open(&self.context.staging, binding)?;
        tracing::info!("staged the canonical coordinates");

        Ok(Placement {
            coordinates,
            checkpoint: Some(checkpoint),
            kind: metadata::Placement::Projector,
            evidence: Some(ProjectorEvidence {
                steps: options.schedule.steps().get(),
                boundary: model
                    .evidence
                    .boundary
                    .as_ref()
                    .map(|boundary| FrozenRadiusEvidence::from(boundary.radius)),
                proximal_calibration: model.evidence.boundary.as_ref().and_then(|boundary| {
                    ProximalCalibrationEvidence::measured(boundary, &model.evidence.fractions)
                }),
                unresolved_verdicts: self.inputs.resolution.unresolved,
                ladder,
            }),
        })
    }

    /// Runs the training loop under its own span.
    ///
    /// Training speaks distinct rows, and its errors translate through the quotient onto
    /// corpus rows.
    #[tracing::instrument(name = "projector-training", skip_all)]
    fn train<P: Progress>(
        &self,
        options: &ProjectorOptions,
        inputs: &TrainerInputs<'_, DistinctRowId, EdgeRowId>,
        distinct: &DistinctInputs<'_>,
        train_options: &TrainOptions,
        progress: &P,
    ) -> Result<train::Model<DistinctRowId, Training>, ProjectorError> {
        let projector = Projector::<Training>::new(
            options.architecture,
            &self.context.device,
            stage_rng(self.context.config.seed, Stage::ProjectorInit),
        );

        let outcome = train::fit(
            projector,
            inputs,
            train_options,
            &mut stage_rng(self.context.config.seed, Stage::ProjectorDraws),
            &self.context.device,
            progress,
        )
        .map_err(|error| error.map_rows(|row| distinct.quotient.representative(row)))?;

        let model = match outcome {
            train::FitOutcome::Trained(model) => model,
            // This stage constructs no target inputs, and only a declared target objective can
            // refuse.
            train::FitOutcome::TargetRefused(refusal) => {
                unreachable!("no target objective is declared, yet training refused: {refusal}")
            }
        };
        tracing::info!(
            steps = options.schedule.steps().get(),
            "trained the projector"
        );

        Ok(model)
    }

    /// Stages the published model checkpoint.
    ///
    /// Recording moves a clone of the parameters into the record, so the model still projects
    /// the ladder after its checkpoint stages.
    #[tracing::instrument(skip_all, ret)]
    fn checkpoint(
        &self,
        model: Projector<Training>,
    ) -> Result<Binding<artifact::Projector>, ProjectorError> {
        let recorded = checkpoint::RecordedModel::record(model)?;

        self.context
            .staging
            .stage(artifact::Projector, &recorded)
            .map_err(From::from)
    }
}

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

use std::io;

use burn::module::AutodiffModule as _;
use hashql_core::id::IdVec;

pub(super) use self::inputs::{DistinctInputs, PlacementInputs, VerdictResolution};
use self::{evidence::calibration_evidence, inputs::PublishInputs, report::LadderPass};
use super::{Context, coordinates::Coordinates, error::ComputeError, quotient::DistinctRowId};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    device::Training,
    file::{
        array::SizedColumn,
        repository::Binding,
        salt::{
            artifact,
            metadata::{FrozenRadiusEvidence, Placement, ProjectorEvidence},
        },
    },
    identity::{EdgeRowId, NodeRowId},
    math::NonNegative,
    progress::Progress,
    salt::{
        fit::{PlacementOptions, ProjectorOptions, Stage, error::PlacementError, stage_rng},
        landmark::artifact::LandmarkSkeleton,
        projector::{
            artifact as checkpoint,
            loss::AffinityEnergy,
            model::{NodeRole, Projector},
            train::{
                self, BoundaryEvidence, NodeColumns, RefreshFraction, SupportAnchor, TrainOptions,
                TrainerInputs, refresh,
            },
        },
        relation::attraction::AttractionIndex,
    },
};

mod evidence;
pub(super) mod inputs;
mod report;
#[cfg(test)]
mod tests;

/// The staged placement of one fit: the coordinates with the record of how they were placed.
pub(super) struct StagedPlacement {
    /// The staged canonical coordinate column.
    pub coordinates: Coordinates,
    /// The staged projector checkpoint.
    ///
    /// Present exactly for a trained placement.
    pub checkpoint: Option<Binding<artifact::Projector>>,
    /// Which placement ran.
    pub placement: Placement,
    /// The training and ladder measurements of a trained placement.
    pub evidence: Option<ProjectorEvidence>,
}

impl StagedPlacement {
    /// Stages the canonical coordinates under the configured placement.
    ///
    /// The trained placement is the run's only long loop with a per-iteration reading, so it
    /// reports every training step to `progress`, while the baseline places in one pass and
    /// reports nothing but its stage completion.
    ///
    /// # Errors
    ///
    /// Returns [`ComputeError::Placement`] when the projector configuration refuses, an error of
    /// the training loop translated onto corpus rows when training fails, and an I/O error when
    /// a staged output does not write or map back.
    pub(super) fn stage<P: Progress>(
        context: &Context,
        inputs: &PlacementInputs<'_>,
        progress: &P,
    ) -> Result<Self, ComputeError> {
        let PlacementOptions::Projector(options) = &context.config.placement else {
            let binding = place_at_landmarks(context, inputs.skeleton)?;
            let coordinates = Coordinates::open(&context.staging, binding)?;
            tracing::info!("staged the baseline coordinates");
            return Ok(Self {
                coordinates,
                checkpoint: None,
                placement: Placement::LandmarkBaseline,
                evidence: None,
            });
        };

        let _span = tracing::info_span!("projector").entered();
        Self::projector(context, options, inputs, progress)
    }

    /// Trains the projector and publishes the canonical level's aligned field.
    ///
    /// The checkpoint stages beside it.
    fn projector<P: Progress>(
        context: &Context,
        options: &ProjectorOptions,
        inputs: &PlacementInputs<'_>,
        progress: &P,
    ) -> Result<Self, ComputeError> {
        let configured = options.architecture.representation_dimensions.get();
        if configured != PROJECTOR_DIMENSIONS {
            return Err(PlacementError::RepresentationWidth { configured }.into());
        }

        // The canonical level's membership in the schedule is decidable from the options alone,
        // so a contradictory configuration refuses here rather than after training runs the
        // schedule and every level projects.
        options.ladder.canonical_index()?;
        let affinity = AffinityEnergy::new(context.config.curve, options.affinity_offset)
            .ok_or_else(|| {
                ComputeError::from(PlacementError::ObjectiveCurve {
                    exponent: context.config.curve.b(),
                })
            })?;

        let distinct = &inputs.distinct;
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
            inputs.skeleton,
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

        // A vacuous placement withholds the relation evidence. The
        // trainer sees no force at all, so no radius freezes and the
        // trainer demands no reviewed verdicts, while the published
        // relation artifacts stay real for serving.
        let vacuous = AttractionIndex::vacuous();
        let attraction = if options.vacuous {
            tracing::info!("the placement is vacuous: the relation term stays absent");
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
            verdicts: &inputs.resolution.resolved,
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

        let train_options = TrainOptions {
            schedule: options.schedule,
            plan: options.plan,
            affinity,
            support: options.support,
            budget: options.budget,
            coefficients,
            miner: options.miner,
            lens: options.lens,
            forward_rows: options.forward_rows,
        };

        let fitted = Self::train(
            context,
            options,
            &trainer_inputs,
            distinct,
            &train_options,
            progress,
        )?;

        Self::publish(
            context,
            options,
            &PublishInputs {
                quotient: distinct.quotient,
                knn: distinct.knn.view(),
                attraction: &distinct.indexes.attraction,
                unresolved_verdicts: inputs.resolution.unresolved,
                snapshot: inputs.snapshot,
                reproducibility: inputs.reproducibility,
            },
            columns,
            &fitted.model,
            fitted.evidence.boundary.as_ref(),
            &fitted.evidence.fractions,
        )
    }

    /// Stages everything the projector placement publishes.
    ///
    /// The publish half of the placement: it reads a model and its frozen boundary evidence, and
    /// it stages the checkpoint, the canonical coordinate column, and the placement's evidence. A
    /// boundary whose radius composes a relation energy opens the ladder, and the canonical
    /// level's aligned field publishes ([`LadderPass::measure_conditions`]).
    fn publish(
        context: &Context,
        options: &ProjectorOptions,
        inputs: &PublishInputs<'_>,
        columns: NodeColumns<'_, NodeRowId>,
        model: &Projector<Training>,
        boundary: Option<&BoundaryEvidence>,
        fractions: &[RefreshFraction],
    ) -> Result<Self, ComputeError> {
        let checkpoint = Self::checkpoint(context, model)?;

        // Inference runs on the inner backend. The trainer fits the lens
        // exactly when the boundary froze a radius. Without one the
        // condition column received zero gradient at every step, every
        // level provably projects the identical field, and the baseline
        // publishes directly with no ladder to measure.
        let model = model.valid();
        let energy = boundary.and_then(|boundary| boundary.radius.energy(&options.lens));

        let (ladder, binding) = if let Some(energy) = energy {
            let _span = tracing::info_span!("ladder").entered();
            let (evidence, binding) =
                LadderPass::new(&context.staging, &context.scratch, context.device)
                    .measure_conditions(options, &model, columns, inputs, energy)?;
            (Some(evidence), binding)
        } else {
            let frame = refresh::forward(
                &model,
                columns,
                NonNegative::ZERO,
                options.forward_rows,
                &context.device,
            )?;
            let binding = context
                .staging
                .stage(artifact::Coordinates, SizedColumn::new(frame.as_slice()))?;
            (None, binding)
        };
        let coordinates = Coordinates::open(&context.staging, binding)?;
        tracing::info!("staged the canonical coordinates");

        Ok(Self {
            coordinates,
            checkpoint: Some(checkpoint),
            placement: Placement::Projector,
            evidence: Some(ProjectorEvidence {
                steps: options.schedule.steps().get(),
                boundary: boundary.map(|boundary| FrozenRadiusEvidence::from(boundary.radius)),
                proximal_calibration: boundary
                    .and_then(|boundary| calibration_evidence(boundary, fractions)),
                unresolved_verdicts: inputs.unresolved_verdicts,
                ladder,
            }),
        })
    }

    /// Runs the training loop under its own span.
    ///
    /// Training speaks distinct rows, and its errors translate through the quotient onto
    /// corpus rows.
    fn train<P: Progress>(
        context: &Context,
        options: &ProjectorOptions,
        inputs: &TrainerInputs<'_, DistinctRowId, EdgeRowId>,
        distinct: &DistinctInputs<'_>,
        train_options: &TrainOptions,
        progress: &P,
    ) -> Result<train::Fitted<DistinctRowId, Training>, ComputeError> {
        let _span = tracing::info_span!("train").entered();
        let model = Projector::<Training>::new(
            options.architecture,
            &context.device,
            stage_rng(context.config.seed, Stage::ProjectorInit),
        );
        let outcome = train::fit(
            model,
            inputs,
            train_options,
            &mut stage_rng(context.config.seed, Stage::ProjectorDraws),
            &context.device,
            progress,
        )
        .map_err(|error| error.map_rows(|row| distinct.quotient.representative(row)))?;
        let fitted = match outcome {
            train::FitOutcome::Trained(fitted) => fitted,
            // This stage constructs no target inputs, and only a declared target objective
            // can refuse.
            train::FitOutcome::TargetRefused(refusal) => {
                unreachable!("no target objective is declared, yet training refused: {refusal}")
            }
        };
        tracing::info!(
            steps = options.schedule.steps().get(),
            "trained the projector"
        );

        Ok(fitted)
    }

    /// Stages the published model checkpoint.
    ///
    /// Recording moves a clone of the parameters into the record, so the model still projects
    /// the ladder after its checkpoint stages.
    fn checkpoint(
        context: &Context,
        model: &Projector<Training>,
    ) -> Result<Binding<artifact::Projector>, ComputeError> {
        let recorded = checkpoint::RecordedModel::record(model.clone())?;
        let binding = context.staging.stage(artifact::Projector, &recorded)?;
        tracing::info!("staged the projector checkpoint");

        Ok(binding)
    }
}

/// Stages every row's assigned landmark coordinate as the canonical column.
///
/// Every corpus row takes its assigned landmark's layout coordinate as the baseline placement,
/// gathered into one owned column and staged as the `f32[N, 2]` coordinate artifact. Returns the
/// typed binding the staging boundary mints.
#[tracing::instrument(name = "coordinates", skip_all)]
fn place_at_landmarks(
    context: &Context,
    skeleton: &LandmarkSkeleton<NodeRowId>,
) -> Result<Binding<artifact::Coordinates>, io::Error> {
    let coordinates = skeleton.coordinates();
    let column: IdVec<NodeRowId, _> = skeleton
        .assignment()
        .iter()
        .map(|&ordinal| coordinates[ordinal])
        .collect();

    context
        .staging
        .stage(artifact::Coordinates, SizedColumn::new(&column))
}

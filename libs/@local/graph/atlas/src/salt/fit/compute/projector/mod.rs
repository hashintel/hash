//! The placement stage runs either the trained projector or the landmark baseline.
//!
//! The stage is the one owner of a fit's coordinates. Under the baseline placement every row takes
//! its assigned landmark's layout coordinate. Under the projector placement the stage trains the
//! conditioned model over the staged artifacts and stages its checkpoint. It projects the whole
//! corpus at every ladder rung and measures the ladder. It publishes the canonical rung's field
//! aligned into the baseline frame. The metadata records which placement ran and, for a trained
//! one, the training and ladder measurements.
//!
//! Rung frames are transient: each projects into the run's scratch directory and maps back for
//! measurement, so the stage's owned working set stays one frame regardless of the schedule length.
//! Only the canonical aligned column publishes - version 1 publishes one variant.

use std::io::{BufWriter, Write as _};

use burn::{backend::Autodiff, module::AutodiffModule as _};
use camino::Utf8Path;
use hashql_core::id::IdSlice;

use super::{
    super::{
        PlacementOptions, ProjectorOptions, Stage, SuppliedVerdicts,
        error::{PlacementError, StageError},
        prepare::identity::IdentityTableArchive,
        role::Role,
        stage_rng,
    },
    Context,
    quotient::{DistinctRowId, RowQuotient},
};
use crate::{
    dataset::{OntologyIdentity, PROJECTOR_DIMENSIONS},
    file::{
        identity::{Key, read::IdentityFile},
        repository::RepositoryFile,
        salt::metadata::{FrozenRadiusEvidence, Placement, ProjectorEvidence},
    },
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    integrity::{Sha256, Writer},
    math::NonNegative,
    progress::Progress,
    salt::{
        projector::{
            artifact,
            loss::AffinityEnergy,
            model::{NodeRole, Projector},
            train::{
                self, BoundaryEvidence, NodeColumns, RefreshFraction, TrainOptions, TrainerInputs,
                refresh,
            },
        },
        relation::attraction::AttractionIndex,
    },
};

/// The inference half of the placement backend.
///
/// The `gpu` feature selects Metal and its absence selects the CPU.
///
/// The CPU backend stays the fixture and determinism harness, so tests run without the feature.
///
/// The Metal flavor is the unfused `burn::backend::wgpu::CubeBackend`: under the fused
/// `burn::backend::Metal` alias, `burn-fusion`'s stream ordering (0.21.0, ordering.rs:65) panics
/// out of bounds on this workload's step-varying relation-batch shapes, killing the device
/// service thread.
#[cfg(feature = "gpu")]
pub(crate) type TrainerInner =
    burn::backend::wgpu::CubeBackend<burn::backend::wgpu::WgpuRuntime, f32, i32, u8>;
#[cfg(not(feature = "gpu"))]
pub(crate) type TrainerInner = burn::backend::NdArray;

/// The training and inference backend of the placement stage.
pub(super) type TrainerBackend = Autodiff<TrainerInner>;

/// Returns the placement backend's device.
#[cfg(feature = "gpu")]
pub(crate) fn device() -> burn::backend::wgpu::WgpuDevice {
    burn::backend::wgpu::WgpuDevice::default()
}

/// Returns the placement backend's device.
#[cfg(not(feature = "gpu"))]
pub(crate) fn device() -> burn::backend::ndarray::NdArrayDevice {
    burn::backend::ndarray::NdArrayDevice::default()
}

pub(super) mod inputs;

mod derive;
mod evidence;
mod report;
#[cfg(test)]
mod tests;

use self::{
    derive::{compose_energy, landmark_anchors, normalized_coefficients, semantic_weight},
    evidence::{calibration_evidence, stage_coordinate_column},
    inputs::{PlacementArtifacts, PlacementInputs, PublishInputs, VerdictResolution},
    report::LadderPass,
};

impl Context<'_> {
    /// Stages the canonical coordinates under the configured placement.
    ///
    /// The trained placement is the run's only long loop with a per-iteration reading, so it
    /// reports every training step to `progress`, while the baseline places in one pass and
    /// reports nothing but its stage completion.
    pub(super) fn stage_placement<P: Progress>(
        &self,
        inputs: &PlacementInputs<'_>,
        progress: &P,
    ) -> Result<PlacementArtifacts, StageError> {
        let PlacementOptions::Projector(options) = &self.config.placement else {
            let coordinates = self.stage_baseline_coordinates(inputs.skeleton)?;
            tracing::info!("staged the baseline coordinates");
            return Ok(PlacementArtifacts {
                coordinates,
                checkpoint: None,
                placement: Placement::LandmarkBaseline,
                evidence: None,
            });
        };

        let _span = tracing::info_span!("projector").entered();
        self.stage_projector(options, inputs, progress)
    }

    /// Trains the projector and publishes the canonical rung's aligned field.
    ///
    /// The checkpoint stages beside it.
    fn stage_projector<P: Progress>(
        &self,
        options: &ProjectorOptions,
        inputs: &PlacementInputs<'_>,
        progress: &P,
    ) -> Result<PlacementArtifacts, StageError> {
        let configured = options.architecture.representation_dimensions.get();
        if configured != PROJECTOR_DIMENSIONS {
            return Err(PlacementError::RepresentationWidth { configured }.into());
        }

        // The canonical rung's membership in the schedule is decidable from the options alone,
        // so a contradictory configuration refuses here rather than after training runs the
        // schedule and every rung projects.
        options.ladder.canonical_index()?;
        let affinity =
            AffinityEnergy::new(self.config.curve, options.affinity_offset).ok_or_else(|| {
                StageError::from(PlacementError::ObjectiveCurve {
                    exponent: self.config.curve.b(),
                })
            })?;

        let distinct = &inputs.distinct;
        // Every corpus row is a knowledge entity: the dataset streams
        // entities, and no other role projects yet. One column serves
        // both domains - the trainer's is its distinct-length prefix.
        let roles = vec![NodeRole::KnowledgeEntity; inputs.rows.len()];
        let landmarks = landmark_anchors(inputs.skeleton, options, distinct.quotient);

        let columns = NodeColumns {
            representations: inputs.rows,
            roles: IdSlice::from_raw(&roles),
        };
        let trainer_columns = NodeColumns {
            representations: distinct.rows,
            roles: IdSlice::from_raw(&roles[..distinct.rows.len()]),
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

        // The configured coefficients are corpus-free bases. The semantic and
        // ordinary bases divide by the total semantic edge weight, the hard-negative base
        // by the row count, and the support bases by the pools the trainer receives, so each base
        // weighs the same objective share on every corpus. The relation base is already mass-free.
        // The masses are the training domain's - the distinct rows and their graph -
        // matching the objective the trainer optimizes. A weightless graph passes the bases
        // through - the trainer rejects it as evidence-free immediately after.
        let coefficients = normalized_coefficients(
            options.coefficients,
            semantic_weight(&distinct.semantic.view()),
            distinct.rows.len(),
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

        let fitted = self.train(
            options,
            &trainer_inputs,
            distinct.quotient,
            &train_options,
            progress,
        )?;

        self.publish_projector(
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
    /// rung's aligned field publishes ([`LadderPass::measure_conditions`]).
    fn publish_projector(
        &self,
        options: &ProjectorOptions,
        inputs: &PublishInputs<'_>,
        columns: NodeColumns<'_, NodeRowId>,
        model: &Projector<TrainerBackend>,
        boundary: Option<&BoundaryEvidence>,
        fractions: &[RefreshFraction],
    ) -> Result<PlacementArtifacts, StageError> {
        let checkpoint = self.stage_checkpoint(model)?;

        // Inference runs on the inner backend. The trainer fits the lens
        // exactly when the boundary froze a radius. Without one the
        // condition column received zero gradient at every step, every
        // rung provably projects the identical field, and the baseline
        // publishes directly with no ladder to measure.
        let device = device();
        let model = model.valid();
        let energy = boundary.and_then(|boundary| compose_energy(options, boundary.radius));

        let (ladder, digest) = if let Some(energy) = energy {
            let _span = tracing::info_span!("ladder").entered();
            let (evidence, digest) = LadderPass::new(self.staging, self.scratch)
                .measure_conditions(options, &model, columns, inputs, energy)?;
            (Some(evidence), digest)
        } else {
            let frame = refresh::forward(
                &model,
                columns,
                NonNegative::ZERO,
                options.forward_rows,
                &device,
            )?;
            let digest =
                stage_coordinate_column(self.staging, frame.len() as u64, frame.iter().copied())?;
            (None, digest)
        };
        let coordinates = Role::Coordinates.file(digest);
        tracing::info!("staged the canonical coordinates");

        Ok(PlacementArtifacts {
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
        &self,
        options: &ProjectorOptions,
        inputs: &TrainerInputs<'_, DistinctRowId, EdgeRowId>,
        quotient: &RowQuotient,
        train_options: &TrainOptions,
        progress: &P,
    ) -> Result<train::Fitted<DistinctRowId, TrainerBackend>, StageError> {
        let _span = tracing::info_span!("train").entered();
        let device = device();
        let model = Projector::<TrainerBackend>::new(
            options.architecture,
            &device,
            stage_rng(self.config.seed, Stage::ProjectorInit),
        );
        let outcome = train::fit(
            model,
            inputs,
            train_options,
            &mut stage_rng(self.config.seed, Stage::ProjectorDraws),
            &device,
            progress,
        )
        .map_err(|error| error.map_rows(|row| quotient.first_row(row)))?;
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

    /// Stages the published model checkpoint, digesting the framework bytes as they stream.
    fn stage_checkpoint(
        &self,
        model: &Projector<TrainerBackend>,
    ) -> Result<RepositoryFile, StageError> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: BufWriter::new(self.staging.create(&Role::Projector.file_name())?),
        };
        artifact::write_model(model.clone(), &mut writer)?;
        writer.writer.flush()?;
        tracing::info!("staged the projector checkpoint");

        Ok(Role::Projector.file(writer.accumulator.finalize()))
    }

    /// Resolves the supplied verdicts against the staged ontology identity column.
    ///
    /// Typed by the dataset's own ontology id.
    pub(super) fn resolve_verdicts<O>(
        &self,
        verdicts: Option<&SuppliedVerdicts>,
    ) -> Result<VerdictResolution, StageError>
    where
        O: Key + OntologyIdentity + Eq + core::hash::Hash,
    {
        let Some(supplied) = verdicts else {
            return Ok(VerdictResolution::default());
        };

        resolve_supplied::<O>(
            &self.staging.path_of(&Role::OntologyIdentities.file_name()),
            supplied,
        )
    }
}

/// Resolves supplied verdicts against the ontology identity column at `path`.
///
/// Read under the dataset's ontology id type `O`.
///
/// Each verdict's reviewed versioned URL derives the id naming it in the corpus's own id space
/// ([`OntologyIdentity`]). Verdicts whose identity derives no id there record as unresolved. A
/// column file keyed by any other id type fails the open.
pub(in crate::salt::fit) fn resolve_supplied<O>(
    path: &Utf8Path,
    supplied: &SuppliedVerdicts,
) -> Result<VerdictResolution, StageError>
where
    O: Key + OntologyIdentity + Eq + core::hash::Hash,
{
    let table =
        IdentityTableArchive::<O, OntologyRowId>::new(IdentityFile::open(path.as_std_path())?)?;

    let resolution = supplied.document().resolve(table.ids());
    let unresolved = resolution.unresolved().len();
    tracing::info!(
        resolved = resolution.resolved().len(),
        unresolved,
        "resolved the supplied verdicts"
    );

    Ok(VerdictResolution {
        resolved: resolution.resolved().to_vec(),
        unresolved,
    })
}

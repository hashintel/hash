//! The placement stage runs either the trained projector or the landmark baseline.
//!
//! The stage owns the coordinate seam of one fit. Under the baseline placement every row takes its
//! assigned landmark's layout coordinate. Under the projector placement the stage trains the
//! conditioned model over the staged artifacts and stages its checkpoint. It projects the whole
//! corpus at every ladder rung and measures the ladder. It publishes the canonical rung's field
//! aligned into the baseline frame. The metadata records which placement ran and, for a trained
//! one, the training and ladder measurements.
//!
//! Rung frames are transient: each projects into the run's scratch directory and maps back for
//! measurement, so the stage's owned working set stays one frame regardless of the schedule length.
//! Only the canonical aligned column publishes - version 1 publishes one variant.

use std::{
    fs::File,
    io::{BufWriter, Write as _},
};

use burn::{backend::Autodiff, module::AutodiffModule as _};
use camino::{Utf8Path, Utf8PathBuf};
use hashql_core::id::{Id, IdSlice, IdVec};
use zerocopy::IntoBytes as _;

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
        array::{ArrayFile, ArrayVariant, ArrayWriter, Dim, SizedArrayWriter},
        attraction::read::AttractionFile,
        identity::{Key, read::IdentityFile},
        repository::RepositoryFile,
        salt::metadata::{
            FrozenRadiusEvidence, LadderEvidence, Placement, ProjectorEvidence,
            ProximalCalibrationEvidence, RefreshFractionEvidence, Reproducibility, RungEvidence,
            Snapshot, StabilityCertificateEvidence, TypeRelationLoss,
        },
    },
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    integrity::{Sha256, Sha256Digest, Writer},
    math::{AlignedVecN, DNonNegative, DPositive, NonNegative, Positive, Vec2},
    progress::Progress,
    salt::{
        knn::{artifact::KnnArchive, table::KnnView},
        ladder::{
            Field, RungMeasurement, measure_ladder,
            paired::{self, PairedMovementEvidence},
            select_canonical,
        },
        landmark::artifact::LandmarkSkeletonArchive,
        projector::{
            artifact,
            loss::{AffinityEnergy, ProximalEnergy, RelationEnergy},
            model::{NodeRole, Projector},
            scale::{LOCAL_SCALE_NEIGHBOURS, LocalScales, insert_nearest, sorted_median},
            train::{
                self, BoundaryEvidence, Coefficients, FrozenRadius, NodeColumns, RefreshFraction,
                SupportAnchor, TrainOptions, TrainerInputs, refresh,
            },
            verdict::ResolvedVerdict,
        },
        relation::{RelationIndexes, attraction::AttractionIndex},
        semantic::{SemanticGraphView, artifact::SemanticGraphArchive},
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
type TrainerBackend = Autodiff<TrainerInner>;

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

/// The mapped artifacts one placement consumes, bound once per fit.
pub(super) struct PlacementInputs<'fit> {
    /// The mapped representation matrix, one aligned row per corpus node.
    ///
    /// These rows are the publication domain that ladder frames and the canonical coordinate
    /// column cover.
    pub rows: &'fit IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    /// The staged landmark skeleton, over the corpus row domain.
    pub skeleton: &'fit LandmarkSkeletonArchive,
    /// The supplied verdicts, resolved into the corpus row domain.
    pub resolution: &'fit VerdictResolution,
    /// The metadata document's `snapshot` section, the value the seal serializes.
    ///
    /// With [`Self::reproducibility`] it forms the paired-movement salt preimage, so the
    /// readout's draw replays from the published document's input sections alone.
    pub snapshot: &'fit Snapshot,
    /// The metadata document's `reproducibility` section, the value the seal serializes.
    pub reproducibility: &'fit Reproducibility,
    /// The distinct-row training domain.
    pub distinct: DistinctInputs<'fit>,
}

/// The trainer's distinct-row view of the corpus.
///
/// Training and the ladder's loss measurements run over the quotient and the artifacts built on it,
/// where byte-identical rows are one point. Publication evaluates the full corpus, and identical
/// representations project identically, so the two domains describe one field.
pub(super) struct DistinctInputs<'fit> {
    /// The distinct representation rows, first occurrences in corpus order.
    pub rows: &'fit IdSlice<DistinctRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>,
    /// The corpus-to-distinct row quotient.
    pub quotient: &'fit RowQuotient,
    /// The distinct-domain neighbour table.
    pub knn: &'fit KnnArchive<DistinctRowId>,
    /// The distinct-domain semantic graph.
    pub semantic: &'fit SemanticGraphArchive<DistinctRowId>,
    /// The distinct-domain relation indexes.
    pub indexes: &'fit RelationIndexes<DistinctRowId, EdgeRowId>,
}

/// The training-domain views the publish half reads.
///
/// The quotient, the neighbour table, and the attraction index carry the ladder's per-rung loss
/// measurements over the distinct rows, and the unresolved-verdict count echoes into the
/// placement's evidence. The metadata document's input sections ride beside them as the
/// paired-movement salt preimage.
pub(super) struct PublishInputs<'fit> {
    /// The corpus-to-distinct row quotient.
    pub quotient: &'fit RowQuotient,
    /// The distinct-domain neighbour table.
    pub knn: KnnView<'fit, DistinctRowId>,
    /// The distinct-domain attraction index.
    pub attraction: &'fit AttractionIndex<DistinctRowId, EdgeRowId>,
    /// Verdicts naming no row of this corpus.
    pub unresolved_verdicts: usize,
    /// The metadata document's `snapshot` section, the value the seal serializes.
    ///
    /// With [`Self::reproducibility`] it forms the paired-movement salt preimage, so the
    /// readout's draw replays from the published document's input sections alone.
    pub snapshot: &'fit Snapshot,
    /// The metadata document's `reproducibility` section, the value the seal serializes.
    pub reproducibility: &'fit Reproducibility,
}

/// The supplied verdicts resolved into the corpus row domain.
#[derive(Debug, Default)]
pub(in crate::salt::fit) struct VerdictResolution {
    /// Verdicts naming a type table row, ascending by row.
    pub resolved: Vec<ResolvedVerdict>,
    /// Verdicts naming no row of this corpus.
    pub unresolved: usize,
}

/// What the placement stage hands the assembly.
pub(super) struct PlacementArtifacts {
    /// The staged canonical coordinate column.
    pub coordinates: RepositoryFile,
    /// The staged projector checkpoint.
    ///
    /// Present exactly for a trained placement.
    pub checkpoint: Option<RepositoryFile>,
    /// Which placement ran.
    pub placement: Placement,
    /// The training and ladder measurements of a trained placement.
    pub evidence: Option<ProjectorEvidence>,
}

impl Context<'_> {
    /// Stages the canonical coordinates under the configured placement.
    ///
    /// The trained placement is the run's only long loop with a per-iteration reading, so it
    /// reports every training step to `progress`; the baseline places in one pass and reports
    /// nothing but its stage completion.
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
    /// rung's aligned field publishes ([`Self::measure_conditions`]).
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
            let (evidence, digest) =
                self.measure_conditions(options, &model, columns, inputs, energy)?;
            (Some(evidence), digest)
        } else {
            let frame = refresh::forward(
                &model,
                columns,
                NonNegative::ZERO,
                options.forward_rows,
                &device,
            )?;
            let digest = self.stage_coordinate_column(frame.len() as u64, frame.iter().copied())?;
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
    /// Training speaks distinct rows; its failure surface translates through the quotient onto
    /// corpus rows.
    fn train<P: Progress>(
        &self,
        options: &ProjectorOptions,
        inputs: &TrainerInputs<'_, DistinctRowId, EdgeRowId>,
        quotient: &RowQuotient,
        train_options: &TrainOptions,
        progress: &P,
    ) -> Result<train::Fitted<TrainerBackend>, StageError> {
        let _span = tracing::info_span!("train").entered();
        let device = device();
        let model = Projector::<TrainerBackend>::new(
            options.architecture,
            &device,
            stage_rng(self.config.seed, Stage::ProjectorInit),
        );
        let fitted = train::fit(
            model,
            inputs,
            train_options,
            &mut stage_rng(self.config.seed, Stage::ProjectorDraws),
            &device,
            progress,
        )
        .map_err(|error| error.map_rows(|row| quotient.first_row(row)))?;
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

    /// Projects, measures, and publishes the condition ladder, returning its evidence.
    ///
    /// Every rung projects into the scratch directory and maps back. The canonical rung's field
    /// aligns into the baseline frame and stages as the coordinate column, and the relation loss
    /// re-measures over the persisted bytes.
    fn measure_conditions(
        &self,
        options: &ProjectorOptions,
        model: &Projector<TrainerInner>,
        columns: NodeColumns<'_, NodeRowId>,
        inputs: &PublishInputs<'_>,
        energy: RelationEnergy,
    ) -> Result<(LadderEvidence, Sha256Digest), StageError> {
        let device = device();
        let ladder = self.scratch.directory("ladder")?;
        let conditions = options.ladder.conditions.values();

        let mut readouts = Vec::with_capacity(conditions.len());
        for (index, &eta) in conditions.iter().enumerate() {
            let frame = refresh::forward(model, columns, eta, options.forward_rows, &device)?;
            // The loss population is the training domain: the full frame gathers at the quotient's
            // first rows - identical representations project identically, so the gather is the
            // distinct rows' own frame.
            let distinct_frame = gather_distinct(&frame, inputs.quotient);
            let scales = refresh::scales(&distinct_frame, &inputs.knn, eta)
                .map_err(|error| error.map_rows(|row| inputs.quotient.first_row(row)))?;
            readouts.push(relation_loss(
                &distinct_frame,
                &scales,
                inputs.attraction,
                energy,
            ));

            write_frame(rung_path(&ladder, index), &frame)?;
        }
        let losses: Vec<_> = readouts.iter().map(|readout| readout.total).collect();

        // Logged before the alignment fits and the canonical selection:
        // the raw series survives their failures.
        tracing::info!(
            radius = %energy.proximal().radius(),
            conditions = ?conditions,
            losses = ?losses,
            "measured the rung relation losses"
        );
        warn_loss_regressions(conditions, &losses);

        // The frames map back together for the alignment fits; each is
        // one scratch array file, so the resident set is the mapped
        // pages the fits touch, not the owned frames.
        let files = (0..conditions.len())
            .map(|index| {
                ArrayFile::open(rung_path(&ladder, index)).map_err(StageError::MapCoordinates)
            })
            .collect::<Result<Vec<_>, _>>()?;
        let fields: Vec<Field<'_>> = files
            .iter()
            .zip(&readouts)
            .map(|(file, readout)| Field {
                coordinates: file
                    .points()
                    .expect("the rung frame was written as f32 pairs"),
                relation_loss: readout.total,
            })
            .collect();

        let measurements = measure_ladder(&options.ladder.conditions, &fields)?;
        let selection = select_canonical(&measurements, options.ladder.canonical)?;
        let alignment = selection.measurement.alignment;
        tracing::info!(
            canonical = selection.measurement.condition.get(),
            index = selection.index,
            "selected the canonical rung"
        );

        let canonical = fields[selection.index].coordinates;
        let aligned: Vec<_> = canonical
            .iter()
            .map(|&point| alignment.apply(point))
            .collect();
        let digest = self.stage_coordinate_column(aligned.len() as u64, aligned.iter().copied())?;

        // Re-measured over the persisted bytes: the narrowing to `f32`
        // and the alignment application are inside the measurement,
        // ahead of the same distinct gather the rung losses used.
        let persisted_relation_loss = {
            let file = ArrayFile::open(self.staging.path_of(&Role::Coordinates.file_name()))
                .map_err(StageError::MapCoordinates)?;
            let frame = file
                .points()
                .expect("the coordinate column was sealed as f32 pairs");
            let distinct_frame = gather_distinct(IdSlice::from_raw(frame), inputs.quotient);
            let scales = refresh::scales(
                &distinct_frame,
                &inputs.knn,
                selection.measurement.condition,
            )
            .map_err(|error| error.map_rows(|row| inputs.quotient.first_row(row)))?;
            relation_loss(&distinct_frame, &scales, inputs.attraction, energy).total
        };

        // The schedule's first rung is bit-exactly `0.0` by
        // construction, so `losses[0]` is the zero-condition raw loss.
        warn_persisted_regression(
            selection.measurement.condition,
            persisted_relation_loss,
            losses[0],
        );

        // The readout measures between the two frames the evidence narrates: the baseline rung
        // and the published canonical field, both in the baseline basis.
        let paired_movement = self.measure_paired_movement(
            inputs.snapshot,
            inputs.reproducibility,
            fields[0].coordinates,
            &aligned,
        )?;

        Ok((
            LadderEvidence {
                rungs: rung_evidence(&measurements, readouts),
                canonical: selection.measurement.condition,
                canonical_index: selection.index,
                persisted_relation_loss,
                paired_movement: Some(paired_movement),
            },
            digest,
        ))
    }

    /// Measures the paired-movement readout over the staged attraction index.
    ///
    /// The readings run over the ladder's aligned frames: `zero` is the baseline rung's field
    /// and `canonical` the published rung's field in the baseline basis. [`paired::measure`]
    /// runs the whole readout, and every readout resolution is an evidence body, so the
    /// generation publishes around a vacuous or failed reading.
    ///
    /// # Errors
    ///
    /// - [`StageError::SaltPreimage`] when the salt preimage does not serialize. The preimage is a
    ///   strict subset of the metadata document, so the seal shares the failure.
    /// - [`StageError::MapAttraction`] when the staged attraction index does not map back.
    ///
    /// # Panics
    ///
    /// This panics when the staged index and the ladder frames disagree on the corpus row count.
    /// One fit stages both over one corpus, so the disagreement is a pipeline defect rather than
    /// a data condition, and no persisted refusal names it.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "the Result carries fit-level failures; a row-count contradiction between two \
                  artifacts of one fit is a pipeline contract violation, documented under Panics"
    )]
    fn measure_paired_movement(
        &self,
        snapshot: &Snapshot,
        reproducibility: &Reproducibility,
        zero: &[Vec2],
        canonical: &[Vec2],
    ) -> Result<PairedMovementEvidence, StageError> {
        let index = AttractionFile::open(self.staging.path_of(&Role::Attraction.file_name()))?;
        assert_eq!(
            index.rows(),
            zero.len() as u64,
            "the staged index and the ladder frames describe one corpus"
        );

        paired::measure(
            snapshot,
            reproducibility,
            index.groups(),
            index.edges(),
            IdSlice::from_raw(zero),
            IdSlice::from_raw(canonical),
        )
        .map_err(From::from)
    }

    /// Streams one coordinate frame of `rows` points into the staged canonical column.
    ///
    /// Returns the sealed file's digest.
    fn stage_coordinate_column(
        &self,
        rows: u64,
        points: impl Iterator<Item = Vec2>,
    ) -> Result<Sha256Digest, StageError> {
        let mut writer = BufWriter::new(self.staging.create(&Role::Coordinates.file_name())?);
        let mut array = SizedArrayWriter::new(
            &mut writer,
            ArrayVariant::F32,
            &[Dim::new(rows), Dim::new(2)],
        )?;
        for point in points {
            array.write_row(point.as_bytes())?;
        }
        Ok(array.finish()?)
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

/// Composes the relation energy the ladder measures with.
///
/// From the configured lens and the boundary's frozen radius.
///
/// Returns [`None`] for a vacuous boundary: no force means no relation loss to measure.
fn compose_energy(options: &ProjectorOptions, radius: FrozenRadius) -> Option<RelationEnergy> {
    let radius = match radius {
        FrozenRadius::Measured { radius } => radius,
        FrozenRadius::Vacuous => return None,
    };
    let proximal = ProximalEnergy::new(radius, options.lens.temperature());
    Some(
        RelationEnergy::new(options.lens.coincident(), proximal, options.lens.epsilon())
            .expect("the trainer composed this energy at the boundary"),
    )
}

/// One adjacent raw relation-loss regression in a measured series.
struct LossRegression {
    /// The regressing rung's condition value.
    condition: NonNegative,
    /// The predecessor's condition value.
    previous_condition: NonNegative,
    /// The loss increase over the predecessor.
    delta: DPositive,
    /// The increase relative to the predecessor's loss.
    ///
    /// Absent where the predecessor is zero or the quotient rounds outside the finite positive
    /// domain, rather than manufactured as inf/NaN.
    relative: Option<DPositive>,
}

/// Finds every adjacent raw relation-loss regression in a measured series.
///
/// Examines every adjacent transition and yields one entry per rung whose loss exceeds its
/// predecessor's, in schedule order.
fn loss_regressions<'series>(
    conditions: &'series [NonNegative],
    losses: &'series [DNonNegative],
) -> impl Iterator<Item = LossRegression> + 'series {
    conditions
        .iter()
        .zip(losses)
        .map_windows::<_, _, 2>(|window| *window)
        .filter_map(
            |[(&previous_condition, &previous), (&condition, &current)]| {
                let delta = current - previous;

                DPositive::new(delta).map(|delta| LossRegression {
                    condition,
                    previous_condition,
                    delta,
                    relative: (previous > DNonNegative::ZERO)
                        .then(|| DPositive::new(delta.get() / previous.get()))
                        .flatten(),
                })
            },
        )
}

/// Warns on every adjacent raw relation-loss regression in the measured series.
fn warn_loss_regressions(conditions: &[NonNegative], losses: &[DNonNegative]) {
    for LossRegression {
        condition,
        previous_condition,
        delta,
        relative,
    } in loss_regressions(conditions, losses)
    {
        if let Some(relative) = relative {
            tracing::warn!(
                condition = %condition,
                previous_condition = %previous_condition,
                delta = %delta,
                relative = %relative,
                "a rung's relation loss exceeds its predecessor's"
            );
        } else {
            tracing::warn!(
                condition = %condition,
                previous_condition = %previous_condition,
                delta = %delta,
                "a rung's relation loss exceeds its predecessor's"
            );
        }
    }
}

/// Warns when the persisted canonical loss is not below the zero-condition raw loss.
///
/// Reports the absolute delta. The relative delta is absent rather than manufactured where the
/// baseline is zero or the quotient rounds outside the finite non-negative domain.
fn warn_persisted_regression(
    canonical: NonNegative,
    persisted: DNonNegative,
    baseline: DNonNegative,
) {
    if persisted < baseline {
        return;
    }

    // In domain with no check: the guard proves the difference non-negative, and the
    // difference of two finite values is finite.
    let delta = DNonNegative::new_unchecked((persisted - baseline).get());
    let relative = (baseline > DNonNegative::ZERO)
        .then(|| DNonNegative::new(delta.get() / baseline.get()))
        .flatten();
    if let Some(relative) = relative {
        tracing::warn!(
            canonical = %canonical,
            persisted = %persisted,
            baseline = %baseline,
            delta = %delta,
            relative = %relative,
            "the persisted canonical loss is not below the zero-condition raw loss"
        );
    } else {
        tracing::warn!(
            canonical = %canonical,
            persisted = %persisted,
            baseline = %baseline,
            delta = %delta,
            "the persisted canonical loss is not below the zero-condition raw loss"
        );
    }
}

/// Anchors every skeleton landmark at its laid-out coordinate.
///
/// With the skeleton's own local ruler as its radius.
///
/// Anchor rows are the trainer's: the skeleton publishes corpus rows, and each selected row maps to
/// its distinct index through the quotient.
///
/// The radius is the median layout distance to the landmark's nearest skeleton neighbours. That is
/// the same local-scale convention the relation loss normalizes by. A landmark in a dense skeleton
/// region therefore holds its row tighter than one in a sparse region. A one-landmark skeleton has
/// no ruler and anchors at radius zero. The support term's ε guards the division.
fn landmark_anchors(
    skeleton: &LandmarkSkeletonArchive,
    options: &ProjectorOptions,
    quotient: &RowQuotient,
) -> Vec<SupportAnchor<DistinctRowId>> {
    let coordinates = skeleton.coordinates();

    skeleton
        .selected_rows()
        .iter_enumerated()
        .map(|(ordinal, &row)| SupportAnchor {
            row: quotient.representative(row),
            target: coordinates[ordinal],
            radius: skeleton_scale(coordinates, ordinal),
            weight: options.landmark_support.weight(),
        })
        .collect()
}

/// Gathers a corpus frame's rows at the quotient's first rows: the training domain's own frame.
fn gather_distinct(
    frame: &IdSlice<NodeRowId, Vec2>,
    quotient: &RowQuotient,
) -> IdVec<DistinctRowId, Vec2> {
    quotient
        .first_rows()
        .iter()
        .map(|&row| frame[row])
        .collect()
}

/// Computes one landmark's median layout distance to its nearest skeleton neighbours.
///
/// The neighbour count and median convention are the corpus local-scale kernel's
/// ([`insert_nearest`] and [`sorted_median`]); the skeleton is capacity-bounded, so the nearest set
/// comes from a plain pass over the layout.
// PERF: this runs once per landmark and is an all-nearest-neighbours
// scan. The cost is O(S^2) distance evaluations over the
// capacity-bounded skeleton and tens of milliseconds once per fit. If
// skeleton capacity ever rises enough to matter, the fix is algorithmic
// before it is SIMD. Build one kd-tree over the layout (kiddo is
// already in-tree for serving) and take the fifteen nearest per
// landmark in O(S log S) total. The median consumes distances only, so
// tied neighbour choices cannot change the result. An exact index
// reproduces the brute-force output bit for bit. Measure at a raised
// capacity before acting.
fn skeleton_scale<N>(coordinates: &IdSlice<N, Vec2>, ordinal: N) -> NonNegative
where
    N: Id,
{
    let mut nearest = [NonNegative::MAX; LOCAL_SCALE_NEIGHBOURS];
    let mut count = 0_usize;
    for (other, &coordinate) in coordinates.iter_enumerated() {
        if other == ordinal {
            continue;
        }

        if insert_nearest(&mut nearest, coordinates[ordinal].distance(coordinate)) {
            count += 1;
        }
    }

    let count = count.min(LOCAL_SCALE_NEIGHBOURS);
    sorted_median(&nearest[..count])
}

/// Sums the semantic graph's positive edge weight in double precision.
fn semantic_weight<N>(view: &SemanticGraphView<'_, N>) -> DNonNegative
where
    N: Id,
{
    let mut total = DNonNegative::ZERO;

    for row in 0..view.rows() {
        for edge in view.row(N::from_usize(row)) {
            total += edge.weight;
        }
    }

    total
}

/// Normalizes the configured coefficient bases by their objective masses.
///
/// Semantic and ordinary by the total semantic edge weight, hard by the corpus row count, and each
/// support base by its own pool size. The anchor base divides by the temporal anchor pool and the
/// landmark base by the landmark pool.
///
/// The relation base passes through, and a pool of zero keeps its base inert rather than dividing
/// by nothing. A weightless graph passes every base through unchanged.
#[expect(
    clippy::cast_precision_loss,
    reason = "corpus and pool counts remain exactly representable in f64 far beyond any corpus"
)]
fn normalized_coefficients(
    bases: Coefficients,
    weight: DNonNegative,
    rows: usize,
    anchor_pool: usize,
    landmark_pool: usize,
) -> Coefficients {
    if weight == DNonNegative::ZERO {
        return bases;
    }

    let scaled = |base: NonNegative, mass: f64| -> NonNegative {
        if mass <= 0.0 {
            return NonNegative::ZERO;
        }

        #[expect(
            clippy::cast_possible_truncation,
            reason = "the normalized coefficient narrows back to the trainer's f32 contract"
        )]
        let value = (f64::from(base.get()) / mass) as f32;
        NonNegative::new(value)
            .expect("an infinite coefficient needs a mass 38 orders below its base")
    };

    Coefficients::new(
        Positive::new(scaled(bases.semantic().into(), weight.get()).get()).expect(
            "a quotient leaves the positive domain only for a weight total more than 38 orders \
             from its base",
        ),
        scaled(bases.ordinary(), weight.get()),
        scaled(bases.hard(), rows as f64),
        bases.relation(),
        scaled(bases.anchor(), anchor_pool as f64),
        scaled(bases.landmark(), landmark_pool as f64),
    )
}

/// Returns one rung's scratch frame path.
fn rung_path(ladder: &Utf8Path, index: usize) -> Utf8PathBuf {
    ladder.join(format!("rung-{index}.arr"))
}

/// Writes one rung's frame as a scratch array file.
fn write_frame<N>(path: impl AsRef<Utf8Path>, frame: &IdSlice<N, Vec2>) -> Result<(), StageError>
where
    N: Id,
{
    let mut writer = BufWriter::new(File::create(path.as_ref().as_std_path())?);
    let mut array = ArrayWriter::new(&mut writer, ArrayVariant::F32, &[Dim::new(2)])?;
    for point in frame {
        array.write_row(point.as_bytes())?;
    }
    array.finish()?;
    writer.flush()?;
    Ok(())
}

/// Joins each rung's alignment measurement with its own walk's per-type loss shares.
fn rung_evidence(
    measurements: &[RungMeasurement],
    readouts: impl IntoIterator<Item = RelationLossReadout>,
) -> Vec<RungEvidence> {
    measurements
        .iter()
        .zip(readouts)
        .map(
            |(
                &RungMeasurement {
                    condition,
                    relation_loss,
                    alignment,
                    baseline_movement,
                    adjacent_movement,
                },
                readout,
            )| RungEvidence {
                relation_losses: readout
                    .per_type
                    .into_iter()
                    .map(|(relation, loss)| TypeRelationLoss { relation, loss })
                    .collect(),
                condition,
                relation_loss,
                alignment,
                baseline_movement,
                adjacent_movement,
            },
        )
        .collect()
}

/// Assembles the persisted calibration body of a measured boundary.
///
/// A vacuous boundary persists nothing. Its measurement holds no population, so a reader's
/// `None` means nothing was measured rather than a zero-valued body.
fn calibration_evidence(
    boundary: &BoundaryEvidence,
    fractions: &[RefreshFraction],
) -> Option<ProximalCalibrationEvidence> {
    let FrozenRadius::Measured { radius } = boundary.radius else {
        return None;
    };

    let stability = boundary
        .calibration
        .stability
        .as_ref()
        .expect("a measured boundary carries its evaluated certificate");

    Some(ProximalCalibrationEvidence {
        radius,
        types: boundary.calibration.types.iter().map(From::from).collect(),
        fractions: fractions
            .iter()
            .map(|reading| RefreshFractionEvidence {
                step: reading.step as u64,
                fraction: reading.fraction,
            })
            .collect(),
        stability: StabilityCertificateEvidence::from(stability),
    })
}

/// One frame's relation-loss readout.
#[derive(Debug)]
struct RelationLossReadout {
    /// The corpus total over every attraction instance.
    total: DNonNegative,
    /// Each group's own accumulated share, in the index's group order (ascending by relation).
    ///
    /// The shares carry their own accumulation chains, so their sum matches the total to
    /// rounding rather than bit-exactly; the total's chain is the persisted contract and stays
    /// as it was.
    per_type: Vec<(OntologyRowId, DNonNegative)>,
}

/// Measures the relation loss of one frame, corpus-total and per relation type.
///
/// Every attraction instance's weighted class-mixture energy at its locally normalized distance,
/// accumulated in double precision - one accumulator for the corpus and one per group in the
/// same walk.
///
/// The per-instance formula is the batch relation term's with the estimator scale at one; the twin
/// lives at [`relation_term`](crate::salt::projector::loss::relation_term).
fn relation_loss<N, E>(
    frame: &IdSlice<N, Vec2>,
    scales: &LocalScales<N>,
    index: &AttractionIndex<N, E>,
    energy: RelationEnergy,
) -> RelationLossReadout
where
    N: Id,
    E: Id,
{
    let epsilon = energy.epsilon();

    let mut total = DNonNegative::ZERO;
    let mut per_type = Vec::with_capacity(index.groups().len());
    for group in index.groups() {
        let weights = group.weights();
        let mut share = DNonNegative::ZERO;

        for edge in group.edges() {
            let source = edge.source;
            let target = edge.target;
            let difference = frame[source] - frame[target];
            let distance = difference.length();
            let normalization = scales.normalization(source, target, epsilon);
            let normalized = distance / normalization;

            let (value, _) = energy.mixture(normalized, weights.coincident, weights.proximal);
            let factor = (edge.confidence.value() * edge.normalization)
                * DNonNegative::from(weights.strength);

            total = factor.mul_add(value.into(), total);
            share = factor.mul_add(value.into(), share);
        }

        per_type.push((group.relation(), share));
    }

    RelationLossReadout { total, per_type }
}

#[cfg(test)]
mod tests {
    #![expect(
        clippy::float_cmp,
        reason = "exactness assertions on constructed dyadic values are bit-precise contracts"
    )]

    use std::fs;

    use super::{super::super::role::write_staged, loss_regressions, *};
    use crate::{
        file::generation::{GenerationRoot, StagedGeneration},
        integrity::Update as _,
        math::{
            AffinityCurve, BoxedVecN, NonNegative, Similarity, UnitFraction, d_non_negative,
            d_positive, non_negative, open_unit_fraction, positive,
        },
        salt::{
            embedding::EmbedderFingerprint,
            fit::FitConfig,
            knn::table::{Knn, KnnMatrix},
            ladder::Conditions,
            landmark::select::SelectionOptions,
            policy::ClassProbabilities,
            projector::{
                loss::CoincidentEnergy,
                model::Architecture,
                train::{RelationLens, TrainingSchedule},
                verdict::calibrate::{
                    ProximalCalibration,
                    stability::{StabilityBound, StabilityCertificate},
                },
            },
            relation::{
                Policies, RelationConfidence, RelationInstance, RelationPolicy,
                attraction::AttractionOptions,
            },
        },
    };

    #[test]
    fn loss_regressions_examine_the_even_to_odd_transition() {
        // Only 1→2 rises; a non-overlapping pairing ((0,1), (2,3))
        // sees two falling pairs and misses it.
        let conditions = [
            non_negative!(0.0),
            non_negative!(0.25),
            non_negative!(0.5),
            non_negative!(0.75),
        ];
        let losses = [
            d_non_negative!(1.0),
            d_non_negative!(0.5),
            d_non_negative!(0.75),
            d_non_negative!(0.5),
        ];

        let regressions: Vec<_> = loss_regressions(&conditions, &losses).collect();

        assert_eq!(regressions.len(), 1);
        let regression = &regressions[0];
        assert_eq!(regression.previous_condition, non_negative!(0.25));
        assert_eq!(regression.condition, non_negative!(0.5));
        assert_eq!(regression.delta, d_positive!(0.25));
        assert_eq!(regression.relative, Some(d_positive!(0.5)));
    }

    #[test]
    fn loss_regressions_examine_the_final_transition_of_an_odd_series() {
        // Only 3→4 rises; a non-overlapping pairing of a five-rung
        // series discards the final element with the remainder.
        let conditions = [
            non_negative!(0.0),
            non_negative!(0.25),
            non_negative!(0.5),
            non_negative!(0.75),
            non_negative!(1.0),
        ];
        let losses = [
            d_non_negative!(1.0),
            d_non_negative!(0.75),
            d_non_negative!(0.5),
            d_non_negative!(0.25),
            d_non_negative!(0.5),
        ];

        let regressions: Vec<_> = loss_regressions(&conditions, &losses).collect();

        assert_eq!(regressions.len(), 1);
        let regression = &regressions[0];
        assert_eq!(regression.previous_condition, non_negative!(0.75));
        assert_eq!(regression.condition, non_negative!(1.0));
        assert_eq!(regression.delta, d_positive!(0.25));
        assert_eq!(regression.relative, Some(d_positive!(1.0)));
    }

    #[test]
    fn loss_regression_relative_delta_is_absent_over_a_zero_predecessor() {
        let conditions = [non_negative!(0.0), non_negative!(1.0)];
        let losses = [d_non_negative!(0.0), d_non_negative!(1.0)];

        let regressions: Vec<_> = loss_regressions(&conditions, &losses).collect();

        assert_eq!(regressions.len(), 1);
        assert_eq!(regressions[0].delta, d_positive!(1.0));
        assert_eq!(regressions[0].relative, None);
    }

    /// Corpus rows of the publish fixture.
    ///
    /// Row 3 carries row 0's representation and row 5 carries row 2's, so the quotient collapses
    /// six corpus rows onto four distinct rows.
    const ROWS: usize = 6;
    const DISTINCT: usize = 4;
    const CORPUS_CAPACITY: usize = ROWS * PROJECTOR_DIMENSIONS;

    /// The reviewed relation type of the attraction fixture.
    const RELATION: u64 = 7;

    fn nonzero(value: usize) -> core::num::NonZero<usize> {
        core::num::NonZero::new(value).expect("fixture values are nonzero")
    }

    fn scratch_dir(name: &str) -> Utf8PathBuf {
        let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
            .expect("the temp directory is UTF-8")
            .join(format!(
                "hash-graph-atlas-publish-{}-{name}",
                std::process::id()
            ));
        let _: Result<(), std::io::Error> = fs::remove_dir_all(&dir);
        dir
    }

    /// The corpus representations, one distinct pattern per row with copies at rows 3 and 5.
    fn corpus_storage() -> BoxedVecN<CORPUS_CAPACITY> {
        let mut storage = BoxedVecN::zero();
        let array = storage.as_array_mut();
        for row in 0..ROWS {
            let source = match row {
                3 => 0,
                5 => 2,
                _ => row,
            };
            let base = row * PROJECTOR_DIMENSIONS;
            array[base + source] = 1.0;
            array[base + 16 + source] = -0.5;
        }
        storage
    }

    /// A complete-graph neighbour table over the distinct rows.
    fn distinct_knn() -> Knn<DistinctRowId> {
        let mut indptr = vec![0_u64];
        let mut columns = Vec::new();
        let mut values = Vec::new();
        for row in 0..DISTINCT {
            for column in (0..DISTINCT).filter(|&column| column != row) {
                columns.push(u32::try_from(column).expect("fixture columns fit u32"));
                values.push(non_negative!(0.75));
            }
            indptr.push(u64::try_from(columns.len()).expect("fixture entries fit u64"));
        }
        let matrix = KnnMatrix::try_new((DISTINCT, DISTINCT), indptr, columns, values)
            .map_err(|(_, _, _, error)| error)
            .expect("the fixture matrix is structurally valid");
        Knn::new(matrix).expect("the fixture table is a valid neighbour table")
    }

    /// Relation indexes carrying one full-Proximal relation over the distinct rows.
    fn distinct_indexes() -> RelationIndexes<DistinctRowId, EdgeRowId> {
        let policy = RelationPolicy {
            relation: OntologyRowId::new(RELATION),
            attraction: ClassProbabilities {
                coincident: UnitFraction::ZERO,
                proximal: UnitFraction::ONE,
            },
            selected: ClassProbabilities {
                coincident: UnitFraction::ZERO,
                proximal: UnitFraction::ONE,
            },
            applicability: UnitFraction::ONE,
            strength: NonNegative::ONE,
            _pad: [0; 4],
        };
        let instance = |edge: u64, source: usize, target: usize| RelationInstance {
            edge: EdgeRowId::new(edge),
            relation: OntologyRowId::new(RELATION),
            source: DistinctRowId::from_usize(source),
            target: DistinctRowId::from_usize(target),
            confidence: RelationConfidence::default(),
            multiplicity: 1,
        };
        let mut instances = vec![instance(0, 0, 2), instance(1, 1, 3)];
        RelationIndexes::build(
            DISTINCT,
            Policies::new(&[policy]).expect("the fixture policy is certified"),
            &mut instances,
            AttractionOptions::default(),
        )
        .expect("the fixture instances satisfy the input contract")
    }

    /// Relation indexes over the corpus rows, the staged counterpart of [`distinct_indexes`].
    ///
    /// The corpus instances restate the distinct pairs at the quotient's first rows: distinct
    /// rows 2 and 3 first occur at corpus rows 2 and 4.
    fn corpus_indexes() -> RelationIndexes<NodeRowId, EdgeRowId> {
        let policy = RelationPolicy {
            relation: OntologyRowId::new(RELATION),
            attraction: ClassProbabilities {
                coincident: UnitFraction::ZERO,
                proximal: UnitFraction::ONE,
            },
            selected: ClassProbabilities {
                coincident: UnitFraction::ZERO,
                proximal: UnitFraction::ONE,
            },
            applicability: UnitFraction::ONE,
            strength: NonNegative::ONE,
            _pad: [0; 4],
        };
        let instance = |edge: u64, source: u64, target: u64| RelationInstance {
            edge: EdgeRowId::new(edge),
            relation: OntologyRowId::new(RELATION),
            source: NodeRowId::new(source),
            target: NodeRowId::new(target),
            confidence: RelationConfidence::default(),
            multiplicity: 1,
        };
        let mut instances = vec![instance(0, 0, 2), instance(1, 1, 4)];
        RelationIndexes::build(
            ROWS,
            Policies::new(&[policy]).expect("the fixture policy is certified"),
            &mut instances,
            AttractionOptions::default(),
        )
        .expect("the fixture corpus instances satisfy the input contract")
    }

    /// Stages the corpus-domain attraction file, as the relation stage leaves it.
    ///
    /// The paired-movement readout replays over the published index, so the ladder-walking
    /// publish reads this file back.
    fn stage_attraction(staging: &StagedGeneration) {
        let relations = corpus_indexes();
        write_staged(staging, Role::Attraction, |writer| {
            relations.attraction.write_into(ROWS as u64, writer)
        })
        .expect("the attraction index should stage");
    }

    /// The skinny projector fixture.
    ///
    /// The representation width stays the pipeline's contract while the hidden architecture
    /// shrinks, so a forward pass costs a fraction of the ratified model's.
    fn skinny_options() -> ProjectorOptions {
        let mut options = ProjectorOptions::ratified();
        options.architecture = Architecture {
            width: nonzero(8),
            residual_blocks: nonzero(1),
            representation_dimensions: nonzero(PROJECTOR_DIMENSIONS),
            role_dimensions: nonzero(4),
            condition_dimensions: nonzero(1),
        };
        options.schedule = TrainingSchedule::new(
            nonzero(1),
            0,
            nonzero(1),
            UnitFraction::new(1.0e-3).expect("the fixture initial rate is a unit fraction"),
            UnitFraction::new(1.0e-5).expect("the fixture minimum rate is a unit fraction"),
        )
        .expect("the fixture schedule is valid");
        options.lens = RelationLens::new(
            CoincidentEnergy::new(non_negative!(0.01), positive!(0.5)),
            Positive::new(0.25).expect("the fixture temperature is positive"),
            Positive::new(1.0e-8).expect("the fixture scale guard is positive"),
        );
        options.ladder.conditions = Conditions::new(vec![NonNegative::ZERO, NonNegative::ONE])
            .expect("the fixture schedule is valid");
        options.ladder.canonical = NonNegative::ONE;
        options.forward_rows = nonzero(4);
        options
    }

    /// Reads the staged canonical column and asserts each duplicate cluster shares one coordinate.
    fn staged_column(staging: &StagedGeneration) -> Vec<Vec2> {
        let column = ArrayFile::open(staging.path_of(&Role::Coordinates.file_name()))
            .expect("the column should map");
        let placed = column.points().expect("the column holds 2D points");
        assert_eq!(placed.len(), ROWS);
        for (copy, first) in [(3_usize, 0_usize), (5, 2)] {
            assert_eq!(placed[copy].x().to_bits(), placed[first].x().to_bits());
            assert_eq!(placed[copy].y().to_bits(), placed[first].y().to_bits());
        }
        placed.to_vec()
    }

    /// Asserts the staged column is the staged checkpoint's canonical-rung projection under the
    /// recorded alignment, bit for bit: checkpoint, evidence, and column describe one field.
    fn assert_column_is_aligned_projection(
        staging: &StagedGeneration,
        options: &ProjectorOptions,
        ladder: &LadderEvidence,
        columns: NodeColumns<'_, NodeRowId>,
    ) {
        let device = device();
        let checkpoint = fs::read(staging.path_of(&Role::Projector.file_name()))
            .expect("the checkpoint should read");
        let reopened = artifact::open_model::<TrainerInner>(
            checkpoint.as_slice(),
            options.architecture,
            &device,
        )
        .expect("the checkpoint should open on the inner backend");
        let projected = refresh::forward(
            &reopened,
            columns,
            ladder.canonical,
            options.forward_rows,
            &device,
        )
        .expect("the reopened model projects finitely");

        let placed = staged_column(staging);
        let alignment = ladder.rungs[ladder.canonical_index].alignment;
        assert!(
            placed
                .iter()
                .zip(projected.iter())
                .all(|(persisted, fresh)| {
                    let aligned = alignment.apply(*fresh);
                    persisted.x().to_bits() == aligned.x().to_bits()
                        && persisted.y().to_bits() == aligned.y().to_bits()
                }),
            "the published column should be the aligned canonical projection",
        );
    }

    /// The drift readings a run would have recorded at its two scale-bearing ticks.
    fn tick_fractions() -> [RefreshFraction; 2] {
        [
            RefreshFraction {
                step: 0,
                fraction: d_non_negative!(0.25),
            },
            RefreshFraction {
                step: 8,
                fraction: d_non_negative!(0.3125),
            },
        ]
    }

    /// Asserts every rung's per-type shares add up to its total within accumulation rounding.
    ///
    /// The shares run their own chains, so the agreement is a relative tolerance, not bit
    /// equality.
    fn assert_per_type_additivity(ladder: &LadderEvidence) {
        for rung in &ladder.rungs {
            let shares = &rung.relation_losses;
            let sum: f64 = shares.iter().map(|entry| entry.loss.get()).sum();
            let total = rung.relation_loss.get();
            assert!(
                (sum - total).abs() <= 1e-12 * total.max(1.0),
                "per-type shares {sum} should add up to the rung total {total}",
            );
        }
    }

    /// Asserts the persisted calibration body echoes the boundary and the tick readings.
    fn assert_calibration_body(evidence: &ProjectorEvidence, boundary: &BoundaryEvidence) {
        let calibration = evidence
            .proximal_calibration
            .as_ref()
            .expect("a measured boundary persists its calibration body");
        assert_eq!(calibration.radius.get(), 0.5);
        assert_eq!(
            calibration.fractions,
            vec![
                RefreshFractionEvidence {
                    step: 0,
                    fraction: d_non_negative!(0.25),
                },
                RefreshFractionEvidence {
                    step: 8,
                    fraction: d_non_negative!(0.3125),
                },
            ]
        );
        assert_eq!(
            calibration.stability,
            StabilityCertificateEvidence::from(
                boundary
                    .calibration
                    .stability
                    .as_ref()
                    .expect("the fixture boundary carries a certificate")
            )
        );
    }

    /// A boundary that froze the fixture radius from reviewed pairs.
    fn measured_boundary() -> BoundaryEvidence {
        BoundaryEvidence {
            step: 0,
            radius: FrozenRadius::Measured {
                radius: non_negative!(0.5),
            },
            calibration: ProximalCalibration {
                radius: Some(non_negative!(0.5)),
                types: Vec::new(),
                // Exact dyadic literals: the publish path serializes the certificate as-is,
                // and this fixture exercises the wiring rather than the derivation.
                stability: Some(StabilityCertificate {
                    quantile: open_unit_fraction!(0.25),
                    delta: open_unit_fraction!(0.05),
                    kappa: d_positive!(1.0),
                    temperature: d_positive!(0.125),
                    tau: d_positive!(0.125),
                    effective_support: d_positive!(4.0),
                    pairs: 4,
                    mass: d_non_negative!(2.0),
                    epsilon_zero: d_positive!(0.5),
                    gap: d_non_negative!(0.25),
                    bound: StabilityBound::Unattainable,
                    pass: false,
                    type_effective_support: d_positive!(1.0),
                }),
            },
        }
    }

    /// A boundary that froze nothing.
    fn vacuous_boundary() -> BoundaryEvidence {
        BoundaryEvidence {
            step: 0,
            radius: FrozenRadius::Vacuous,
            calibration: ProximalCalibration {
                radius: None,
                types: Vec::new(),
                stability: None,
            },
        }
    }

    /// The metadata document's frozen-graph section of the publish fixture.
    fn snapshot() -> Snapshot {
        Snapshot {
            axes: None,
            nodes: 6,
            edges: 2,
            ontology_types: 1,
        }
    }

    /// The metadata document's declared-inputs section of the publish fixture.
    fn reproducibility() -> Reproducibility {
        let mut hasher = Sha256::new();
        hasher.update(b"publish fixture embedder");
        Reproducibility {
            config: fit_config(),
            embedder: EmbedderFingerprint::new(hasher.finalize()),
            prior: None,
        }
    }

    fn fit_config() -> FitConfig {
        FitConfig {
            seed: 11,
            selection: SelectionOptions {
                maximum_count: core::num::NonZero::new(4).expect("the fixture capacity is nonzero"),
                ..
            },
            curve: AffinityCurve::fit(1.0, 0.1).expect("the reference falloff is well-conditioned"),
            ..
        }
    }

    #[test]
    #[cfg_attr(miri, ignore = "the publish half stages files through the platform")]
    #[expect(
        clippy::significant_drop_tightening,
        reason = "the staging directory is read back after the publish returns; dropping it early \
                  would delete the files under assertion"
    )]
    fn publish_stages_the_baseline_field_for_a_vacuous_boundary() {
        let corpus = corpus_storage();
        let rows: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>> = IdSlice::from_raw(
            AlignedVecN::from_slice(&corpus.as_array()[..CORPUS_CAPACITY])
                .expect("boxed storage is aligned"),
        );
        let quotient = RowQuotient::build(rows);
        assert_eq!(quotient.distinct_len(), DISTINCT);

        let knn = distinct_knn();
        let indexes = distinct_indexes();
        let snapshot = snapshot();
        let reproducibility = reproducibility();
        let inputs = PublishInputs {
            quotient: &quotient,
            knn: knn.view(),
            attraction: &indexes.attraction,
            unresolved_verdicts: 3,
            snapshot: &snapshot,
            reproducibility: &reproducibility,
        };
        let roles = vec![NodeRole::KnowledgeEntity; ROWS];
        let columns = || NodeColumns {
            representations: rows,
            roles: IdSlice::from_raw(&roles),
        };

        let options = skinny_options();
        let device = device();
        let model = Projector::<TrainerBackend>::new(
            options.architecture,
            &device,
            stage_rng(11, Stage::ProjectorInit),
        );

        let config = fit_config();
        let root = GenerationRoot::new(scratch_dir("vacuous")).expect("the root should open");
        let staging = root.stage().expect("the staging directory should open");
        let scratch = root.scratch().expect("the scratch directory should open");
        let context = Context {
            staging: &staging,
            scratch: &scratch,
            config: &config,
        };

        let boundary = vacuous_boundary();
        let artifacts = context
            .publish_projector(&options, &inputs, columns(), &model, Some(&boundary), &[])
            .expect("the publish half should stage");

        assert_eq!(artifacts.placement, Placement::Projector);
        assert!(artifacts.checkpoint.is_some());
        let evidence = artifacts
            .evidence
            .as_ref()
            .expect("a projector placement records evidence");
        assert_eq!(evidence.steps, 1);
        assert_eq!(evidence.boundary, Some(FrozenRadiusEvidence::Vacuous));
        assert_eq!(evidence.unresolved_verdicts, 3);
        assert!(
            evidence.ladder.is_none(),
            "a vacuous boundary opens no ladder"
        );
        assert!(
            evidence.proximal_calibration.is_none(),
            "a vacuous boundary persists no calibration body, absent rather than zero"
        );

        // The staged column is the model's own zero-rung projection, bit
        // for bit, and byte-identical representations project to one
        // coordinate.
        let placed = staged_column(&staging);
        let projected = refresh::forward(
            &model.valid(),
            columns(),
            NonNegative::ZERO,
            options.forward_rows,
            &device,
        )
        .expect("the fixture model projects finitely");
        assert!(
            placed
                .iter()
                .zip(projected.iter())
                .all(
                    |(persisted, fresh)| persisted.x().to_bits() == fresh.x().to_bits()
                        && persisted.y().to_bits() == fresh.y().to_bits()
                ),
            "the published column should be the model's own projection",
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "the publish half stages files through the platform")]
    #[expect(
        clippy::significant_drop_tightening,
        reason = "the staging directory is read back after the publish returns; dropping it early \
                  would delete the files under assertion"
    )]
    fn publish_stages_the_aligned_canonical_rung_for_a_measured_boundary() {
        let corpus = corpus_storage();
        let rows: &IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>> = IdSlice::from_raw(
            AlignedVecN::from_slice(&corpus.as_array()[..CORPUS_CAPACITY])
                .expect("boxed storage is aligned"),
        );
        let quotient = RowQuotient::build(rows);
        let knn = distinct_knn();
        let indexes = distinct_indexes();
        let snapshot = snapshot();
        let reproducibility = reproducibility();
        let inputs = PublishInputs {
            quotient: &quotient,
            knn: knn.view(),
            attraction: &indexes.attraction,
            unresolved_verdicts: 0,
            snapshot: &snapshot,
            reproducibility: &reproducibility,
        };
        let roles = vec![NodeRole::KnowledgeEntity; ROWS];
        let columns = || NodeColumns {
            representations: rows,
            roles: IdSlice::from_raw(&roles),
        };

        let options = skinny_options();
        let device = device();
        let model = Projector::<TrainerBackend>::new(
            options.architecture,
            &device,
            stage_rng(13, Stage::ProjectorInit),
        );

        let config = fit_config();
        let root = GenerationRoot::new(scratch_dir("measured")).expect("the root should open");
        let staging = root.stage().expect("the staging directory should open");
        stage_attraction(&staging);
        let scratch = root.scratch().expect("the scratch directory should open");
        let context = Context {
            staging: &staging,
            scratch: &scratch,
            config: &config,
        };

        let boundary = measured_boundary();
        let artifacts = context
            .publish_projector(
                &options,
                &inputs,
                columns(),
                &model,
                Some(&boundary),
                &tick_fractions(),
            )
            .expect("the publish half should stage");

        let evidence = artifacts
            .evidence
            .as_ref()
            .expect("a projector placement records evidence");
        assert!(matches!(
            evidence.boundary,
            Some(FrozenRadiusEvidence::Measured { .. })
        ));
        assert_calibration_body(evidence, &boundary);
        let ladder = evidence
            .ladder
            .as_ref()
            .expect("a measured boundary measures the ladder");
        assert_eq!(ladder.rungs.len(), 2);
        assert_eq!(ladder.canonical.get().to_bits(), 1.0_f32.to_bits());
        assert_eq!(ladder.canonical_index, 1);
        assert_eq!(ladder.rungs[0].alignment, Similarity::IDENTITY);
        assert_eq!(
            ladder.rungs[0].baseline_movement.get().to_bits(),
            0.0_f64.to_bits()
        );
        assert_per_type_additivity(ladder);

        assert_column_is_aligned_projection(&staging, &options, ladder, columns());
    }
}

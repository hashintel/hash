//! The placement stage: the trained projector or the landmark baseline.
//!
//! The stage owns the coordinate seam of one fit. Under the baseline placement every row takes its
//! assigned landmark's layout coordinate; under the projector placement the stage trains the
//! conditioned model over the staged artifacts, stages its checkpoint, projects the whole corpus at
//! every ladder rung, measures the ladder, and publishes the canonical rung's field aligned into
//! the baseline frame. The metadata records which placement ran and, for a trained one, the
//! training and ladder measurements.
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
use hashql_core::id::Id as _;
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
};
use crate::{
    dataset::{OntologyIdentity, PROJECTOR_DIMENSIONS},
    file::{
        array::{ArrayFile, ArrayVariant, ArrayWriter, Dim, SizedArrayWriter},
        identity::read::IdentityFile,
        region::ByteStable,
        repository::RepositoryFile,
        salt::metadata::{
            FrozenRadiusEvidence, LadderEvidence, Placement, ProjectorEvidence, RungEvidence,
        },
    },
    identity::{NodeRowId, OntologyRowId},
    integrity::{Sha256, Sha256Digest, Writer},
    math::{AlignedVecN, NonNegative, Positive, Vec2},
    salt::{
        knn::artifact::KnnArchive,
        ladder::{Field, measure_ladder, select_canonical},
        landmark::artifact::LandmarkSkeletonArchive,
        projector::{
            artifact,
            loss::{AffinityEnergy, ProximalEnergy, RelationEnergy},
            model::{NodeRole, Projector},
            scale::{LOCAL_SCALE_NEIGHBOURS, LocalScales, insert_nearest, sorted_median},
            train::{
                self, Coefficients, FrozenRadius, NodeColumns, SupportAnchor, TrainOptions,
                TrainerInputs, refresh,
            },
            verdict::ResolvedVerdict,
        },
        relation::{RelationIndexes, attraction::AttractionIndex},
        semantic::{SemanticGraphView, artifact::SemanticGraphArchive},
    },
};

/// The inference half of the placement backend: Metal behind the `gpu` feature, the CPU otherwise.
///
/// The CPU backend stays the fixture and determinism harness, so tests run without the feature.
///
/// The Metal flavor is the unfused `CubeBackend`: under the fused `burn::backend::Metal` alias,
/// `burn-fusion`'s stream ordering (0.21.0, ordering.rs:65) panics out of bounds on this
/// workload's dynamic relation-batch shapes, killing the device service thread.
#[cfg(feature = "gpu")]
pub(in crate::salt::fit) type TrainerInner =
    burn::backend::wgpu::CubeBackend<burn::backend::wgpu::WgpuRuntime, f32, i32, u8>;
#[cfg(not(feature = "gpu"))]
pub(in crate::salt::fit) type TrainerInner = burn::backend::NdArray;

/// The training and inference backend of the placement stage.
type TrainerBackend = Autodiff<TrainerInner>;

/// Returns the placement backend's device.
#[cfg(feature = "gpu")]
pub(in crate::salt::fit) fn device() -> burn::backend::wgpu::WgpuDevice {
    burn::backend::wgpu::WgpuDevice::default()
}

/// Returns the placement backend's device.
#[cfg(not(feature = "gpu"))]
pub(in crate::salt::fit) fn device() -> burn::backend::ndarray::NdArrayDevice {
    burn::backend::ndarray::NdArrayDevice::default()
}

/// The mapped artifacts one placement consumes, bound once per fit.
pub(super) struct PlacementInputs<'fit> {
    /// The mapped representation matrix, one aligned row per node.
    pub rows: &'fit [AlignedVecN<PROJECTOR_DIMENSIONS>],
    /// The staged landmark skeleton.
    pub skeleton: &'fit LandmarkSkeletonArchive,
    /// The admitted neighbour table.
    pub knn: &'fit KnnArchive,
    /// The staged semantic graph.
    pub semantic: &'fit SemanticGraphArchive,
    /// The relation indexes, in the owned form the trainer consumes.
    pub indexes: &'fit RelationIndexes,
    /// The supplied verdicts, resolved into the corpus row domain.
    pub resolution: &'fit VerdictResolution,
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
    /// The staged projector checkpoint; present exactly for a trained placement.
    pub checkpoint: Option<RepositoryFile>,
    /// Which placement ran.
    pub placement: Placement,
    /// The training and ladder measurements of a trained placement.
    pub evidence: Option<ProjectorEvidence>,
}

impl Context<'_> {
    /// Stages the canonical coordinates under the configured placement.
    pub(super) fn stage_placement(
        &self,
        inputs: &PlacementInputs<'_>,
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
        self.stage_projector(options, inputs)
    }

    /// Trains the projector and publishes the canonical rung's aligned field.
    ///
    /// The checkpoint stages beside it.
    fn stage_projector(
        &self,
        options: &ProjectorOptions,
        inputs: &PlacementInputs<'_>,
    ) -> Result<PlacementArtifacts, StageError> {
        let configured = options.architecture.representation_dimensions.get();
        if configured != PROJECTOR_DIMENSIONS {
            return Err(PlacementError::RepresentationWidth { configured }.into());
        }
        let affinity =
            AffinityEnergy::new(self.config.curve, options.affinity_offset).ok_or_else(|| {
                StageError::from(PlacementError::ObjectiveCurve {
                    exponent: self.config.curve.b(),
                    offset: options.affinity_offset,
                })
            })?;

        // Every corpus row is a knowledge entity: the dataset streams
        // entities, and no other role projects yet.
        let roles = vec![NodeRole::KnowledgeEntity; inputs.rows.len()];
        let landmarks = landmark_anchors(inputs.skeleton, options);

        let columns = NodeColumns {
            representations: inputs.rows,
            roles: &roles,
        };
        // Mass normalization: the configured coefficients are
        // corpus-free bases. The semantic and ordinary bases divide by
        // the total semantic edge weight, the hard-negative base by
        // the corpus row count, and the support bases by their pool
        // sizes, so each base weighs the same objective share on
        // every corpus; the relation base is already mass-free. A
        // weightless graph passes the bases through - the trainer
        // rejects it as evidence-free immediately after.
        let coefficients = normalized_coefficients(
            options.coefficients,
            semantic_weight(&inputs.semantic.view()),
            inputs.rows.len(),
            landmarks.len(),
        );
        // A vacuous placement withholds the relation evidence: the
        // trainer sees no force at all, so no radius freezes and no
        // reviewed verdicts are demanded, while the published relation
        // artifacts stay real for serving.
        let vacuous = AttractionIndex::vacuous();
        let attraction = if options.vacuous {
            tracing::info!("the placement is vacuous: the relation term stays absent");
            &vacuous
        } else {
            &inputs.indexes.attraction
        };
        let trainer_inputs = TrainerInputs {
            semantic: inputs.semantic.view(),
            protection: inputs.indexes.protection.view(),
            protection_config: options.protection,
            attraction,
            knn: inputs.knn.view(),
            columns,
            landmarks: &landmarks,
            // No stage supplies temporal anchors; the pool is empty.
            anchors: &[],
            verdicts: &inputs.resolution.resolved,
        };
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

        let fitted = self.train(options, &trainer_inputs, &train_options)?;
        let checkpoint = self.stage_checkpoint(&fitted.model)?;

        // Inference runs on the inner backend. The lens is trained
        // exactly when the boundary froze a radius; without one the
        // condition column received zero gradient at every step, every
        // rung provably projects the identical field, and the baseline
        // publishes directly with no ladder to measure.
        let device = device();
        let model = fitted.model.valid();
        let energy = fitted
            .evidence
            .boundary
            .as_ref()
            .and_then(|boundary| compose_energy(options, boundary.radius));

        let (ladder, digest) = if let Some(energy) = energy {
            let _span = tracing::info_span!("ladder").entered();
            let (evidence, digest) =
                self.measure_conditions(options, &model, columns, inputs, energy)?;
            (Some(evidence), digest)
        } else {
            let frame = refresh::forward(&model, columns, 0.0, options.forward_rows, &device)?;
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
                boundary: fitted
                    .evidence
                    .boundary
                    .as_ref()
                    .map(|boundary| FrozenRadiusEvidence::from(boundary.radius)),
                unresolved_verdicts: inputs.resolution.unresolved,
                ladder,
            }),
        })
    }

    /// Runs the training loop under its own span.
    fn train(
        &self,
        options: &ProjectorOptions,
        inputs: &TrainerInputs<'_>,
        train_options: &TrainOptions,
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
        )?;
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
    /// Every rung projects into the scratch directory and maps back; the canonical rung's field,
    /// aligned into the baseline frame, stages as the coordinate column, and the relation loss
    /// re-measures over the persisted bytes.
    fn measure_conditions(
        &self,
        options: &ProjectorOptions,
        model: &Projector<TrainerInner>,
        columns: NodeColumns<'_>,
        inputs: &PlacementInputs<'_>,
        energy: RelationEnergy,
    ) -> Result<(LadderEvidence, Sha256Digest), StageError> {
        let device = device();
        let ladder = self.scratch.directory("ladder")?;
        let conditions = options.ladder.conditions.values();

        let mut losses = Vec::with_capacity(conditions.len());
        for (index, &eta) in conditions.iter().enumerate() {
            let frame = refresh::forward(model, columns, eta, options.forward_rows, &device)?;
            let scales = refresh::scales(&frame, &inputs.knn.view(), eta)?;
            losses.push(relation_loss(
                &frame,
                &scales,
                &inputs.indexes.attraction,
                energy,
            ));
            write_frame(rung_path(&ladder, index), &frame)?;
        }

        // Logged before the alignment fits and the canonical selection:
        // the raw series survives their failures.
        tracing::info!(
            radius = energy.proximal().radius(),
            conditions = ?conditions,
            losses = ?losses,
            "measured the rung relation losses"
        );
        for (index, pair) in losses.windows(2).enumerate() {
            let (previous, current) = (pair[0], pair[1]);
            let delta = current - previous;
            if delta > 0.0 {
                // The relative delta is omitted over a zero
                // predecessor rather than manufactured as inf/NaN.
                if previous > 0.0 {
                    tracing::warn!(
                        condition = conditions[index + 1],
                        previous_condition = conditions[index],
                        delta,
                        relative = delta / previous,
                        "a rung's relation loss exceeds its predecessor's"
                    );
                } else {
                    tracing::warn!(
                        condition = conditions[index + 1],
                        previous_condition = conditions[index],
                        delta,
                        "a rung's relation loss exceeds its predecessor's"
                    );
                }
            }
        }

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
            .zip(&losses)
            .map(|(file, &relation_loss)| Field {
                coordinates: file
                    .points()
                    .expect("the rung frame was written as f32 pairs"),
                relation_loss,
            })
            .collect();

        let measurements = measure_ladder(&options.ladder.conditions, &fields)?;
        let selection = select_canonical(&measurements, options.ladder.canonical)?;
        let alignment = selection.measurement.alignment;
        tracing::info!(
            canonical = selection.measurement.condition,
            index = selection.index,
            "selected the canonical rung"
        );

        let canonical = fields[selection.index].coordinates;
        let digest = self.stage_coordinate_column(
            canonical.len() as u64,
            canonical.iter().map(|&point| alignment.apply(point)),
        )?;

        // Re-measured over the persisted bytes: the narrowing to `f32`
        // and the alignment application are inside the measurement.
        let persisted_relation_loss = {
            let file = ArrayFile::open(self.staging.path_of(&Role::Coordinates.file_name()))
                .map_err(StageError::MapCoordinates)?;
            let frame = file
                .points()
                .expect("the coordinate column was sealed as f32 pairs");
            let scales =
                refresh::scales(frame, &inputs.knn.view(), selection.measurement.condition)?;
            relation_loss(frame, &scales, &inputs.indexes.attraction, energy)
        };

        // The schedule's first rung is bit-exactly `0.0` by
        // construction, so `losses[0]` is the zero-condition raw loss.
        let baseline_loss = losses[0];
        if persisted_relation_loss >= baseline_loss {
            let delta = persisted_relation_loss - baseline_loss;
            // The relative delta is omitted over a zero baseline
            // rather than manufactured as inf/NaN.
            if baseline_loss > 0.0 {
                tracing::warn!(
                    canonical = selection.measurement.condition,
                    persisted = persisted_relation_loss,
                    baseline = baseline_loss,
                    delta,
                    relative = delta / baseline_loss,
                    "the persisted canonical loss is not below the zero-condition raw loss"
                );
            } else {
                tracing::warn!(
                    canonical = selection.measurement.condition,
                    persisted = persisted_relation_loss,
                    baseline = baseline_loss,
                    delta,
                    "the persisted canonical loss is not below the zero-condition raw loss"
                );
            }
        }

        Ok((
            LadderEvidence {
                rungs: measurements.iter().map(RungEvidence::from).collect(),
                canonical: selection.measurement.condition,
                canonical_index: selection.index,
                persisted_relation_loss,
            },
            digest,
        ))
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
        O: ByteStable + OntologyIdentity + Eq + core::hash::Hash,
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
/// ([`OntologyIdentity`]); verdicts whose identity derives no id there record as unresolved. A
/// column file keyed by any other id type fails the open.
pub(in crate::salt::fit) fn resolve_supplied<O>(
    path: &Utf8Path,
    supplied: &SuppliedVerdicts,
) -> Result<VerdictResolution, StageError>
where
    O: ByteStable + OntologyIdentity + Eq + core::hash::Hash,
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
        FrozenRadius::Measured { radius } | FrozenRadius::Asserted { radius } => radius,
        FrozenRadius::Vacuous => return None,
    };
    let proximal = ProximalEnergy::new(radius, options.lens.temperature().get())
        .expect("the trainer froze a finite, non-negative radius");
    Some(
        RelationEnergy::new(
            options.lens.coincident(),
            proximal,
            options.lens.epsilon().get(),
        )
        .expect("the trainer composed this energy at the boundary"),
    )
}

/// Anchors every skeleton landmark at its laid-out coordinate.
///
/// With the skeleton's own local ruler as its radius.
///
/// The radius is the median layout distance to the landmark's nearest skeleton neighbours - the
/// same local-scale convention the relation loss normalizes by - so a landmark in a dense skeleton
/// region holds its row tighter than one in a sparse region. A one-landmark skeleton has no ruler
/// and anchors at radius zero; the support term's ε guards the division.
fn landmark_anchors(
    skeleton: &LandmarkSkeletonArchive,
    options: &ProjectorOptions,
) -> Vec<SupportAnchor> {
    let coordinates = skeleton.coordinates();

    skeleton
        .selected_rows()
        .iter()
        .zip(coordinates)
        .enumerate()
        .map(|(ordinal, (&row, &target))| SupportAnchor {
            row,
            target,
            radius: skeleton_scale(coordinates, ordinal),
            weight: options.landmark_support.weight(),
        })
        .collect()
}

/// Computes one landmark's median layout distance to its nearest skeleton neighbours.
///
/// The neighbour count and median convention are the corpus local-scale kernel's
/// ([`insert_nearest`] and [`sorted_median`]); the skeleton is capacity-bounded, so the nearest set
/// comes from a plain pass over the layout.
// PERF: called once per landmark, this is an all-nearest-neighbours
// scan - O(S^2) distance evaluations over the capacity-bounded
// skeleton, tens of milliseconds once per fit. If skeleton capacity
// ever rises enough to matter, the fix is algorithmic before it is
// SIMD: build one kd-tree over the layout (kiddo, already in-tree
// for serving) and take the fifteen nearest per landmark in
// O(S log S) total. The median consumes distances only, so tied
// neighbour choices cannot change the result - an exact index
// reproduces the brute-force output bit for bit. Measure at a
// raised capacity before acting.
fn skeleton_scale(coordinates: &[Vec2], ordinal: usize) -> f32 {
    let mut nearest = [f32::INFINITY; LOCAL_SCALE_NEIGHBOURS];
    let mut count = 0_usize;
    for (other, &coordinate) in coordinates.iter().enumerate() {
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
fn semantic_weight(view: &SemanticGraphView<'_>) -> f64 {
    let mut total = 0.0_f64;
    for row in 0..view.rows() {
        for edge in view.row(row) {
            total += f64::from(edge.weight);
        }
    }
    total
}

/// Normalizes the configured coefficient bases by their objective masses.
///
/// Semantic and ordinary by the total semantic edge weight, hard by the corpus row count, landmark
/// by the anchor pool size.
///
/// The relation base passes through, and a pool of zero keeps its base inert rather than dividing
/// by nothing - the current pipeline supplies no temporal anchors, so that pool is empty. A
/// weightless graph passes every base through unchanged.
#[expect(
    clippy::cast_precision_loss,
    reason = "corpus and pool counts remain exactly representable in f64 far beyond any corpus"
)]
fn normalized_coefficients(
    bases: Coefficients,
    weight: f64,
    rows: usize,
    landmark_pool: usize,
) -> Coefficients {
    if weight <= 0.0 {
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
            .expect("a finite non-negative base over a positive mass stays in domain")
    };

    Coefficients::new(
        Positive::new(scaled(bases.semantic().into(), weight).get())
            .expect("a positive base over a positive finite weight stays positive"),
        scaled(bases.ordinary(), weight),
        scaled(bases.hard(), rows as f64),
        bases.relation(),
        scaled(bases.anchor(), 0.0),
        scaled(bases.landmark(), landmark_pool as f64),
    )
}

/// Returns one rung's scratch frame path.
fn rung_path(ladder: &Utf8Path, index: usize) -> Utf8PathBuf {
    ladder.join(format!("rung-{index}.arr"))
}

/// Writes one rung's frame as a scratch array file.
fn write_frame(path: impl AsRef<Utf8Path>, frame: &[Vec2]) -> Result<(), StageError> {
    let mut writer = BufWriter::new(File::create(path.as_ref().as_std_path())?);
    let mut array = ArrayWriter::new(&mut writer, ArrayVariant::F32, &[Dim::new(2)])?;
    for point in frame {
        array.write_row(point.as_bytes())?;
    }
    array.finish()?;
    writer.flush()?;
    Ok(())
}

/// Measures the corpus-total relation loss of one frame.
///
/// Every attraction instance's weighted class-mixture energy at its locally normalized distance,
/// accumulated in double precision.
///
/// The per-instance formula is the batch relation term's with the estimator scale at one; the twin
/// lives at [`relation_term`](crate::salt::projector::loss::relation_term).
fn relation_loss(
    frame: &[Vec2],
    scales: &LocalScales,
    index: &AttractionIndex,
    energy: RelationEnergy,
) -> f64 {
    let epsilon = energy.epsilon();

    let mut total = 0.0_f64;
    for group in index.groups() {
        let weights = group.weights();
        for edge in group.edges() {
            let source = row_index(edge.source);
            let target = row_index(edge.target);
            let difference = frame[source] - frame[target];
            let distance = difference.length();
            let normalization = scales.normalization(source, target, epsilon);
            let (value, _) = energy.mixture(
                distance / normalization,
                weights.coincident,
                weights.proximal,
            );
            let factor = edge.confidence.value() * edge.normalization * weights.strength;

            total = f64::from(factor).mul_add(f64::from(value), total);
        }
    }
    total
}

/// Narrows a node row to a slice position.
fn row_index(row: NodeRowId) -> usize {
    usize::try_from(row.as_u64()).expect("rows fit the address space")
}

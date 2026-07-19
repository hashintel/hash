//! The SALT generation metadata document.
//!
//! The schema is version 0 and **mutable**: change it freely to fit what
//! the pipeline needs and increment the repository version when you do;
//! no migration or compatibility machinery exists on purpose until it
//! stabilizes.

use core::num::NonZero;

use crate::{
    dataset::TemporalAxes,
    file::{generation::GenerationId, morton::Fenceposts},
    math::{Bounds2, Similarity},
    morton::Depth,
    salt::{
        BuildEvidence, CardEmbeddingStats, EmbedderFingerprint, FitConfig, FitConfigDef,
        LodEvidence, NormSpotCheck, QuadEvidence, RankingConfig, RecallSpotCheck,
        ladder::RungMeasurement, projector::train::FrozenRadius,
    },
};

/// Metadata describing one published SALT generation: the input snapshot,
/// the declared inputs it ran under, and the evidence its files were
/// admitted under.
///
/// Each section's types live with the stage that produces its values;
/// this document assembles them.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SaltMetadata {
    pub snapshot: Snapshot,
    pub reproducibility: Reproducibility,
    pub placement: Placement,
    pub ranking: RankingOrigin,
    pub evidence: Evidence,
}

/// How the generation's canonical coordinates were produced.
///
/// The identity keeps a baseline generation distinguishable from a
/// trained one wherever the coordinates are consumed.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum Placement {
    /// Every row takes its assigned landmark's layout coordinate: the
    /// 1-NN placement the landmark assignment already encodes.
    LandmarkBaseline,
    /// The trained conditioned projector placed every row; the
    /// published coordinates are the canonical rung's aligned field,
    /// and the checkpoint publishes as the `projector` role.
    Projector,
}

/// Where the generation's rank inputs came from.
///
/// The identity keeps the signals distinguishable wherever the ranking
/// is consumed; it mirrors the configured [`RankingConfig`], recording
/// what actually ran.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum RankingOrigin {
    /// Constant importance and priority columns: the delivery order
    /// reduces to the seeded identity tiebreak.
    ConstantColumns,
    /// Incident-degree importance over the adjacency artifact: hub
    /// entities deliver first, the priority column stays constant.
    IncidentDegree,
}

impl From<RankingConfig> for RankingOrigin {
    fn from(config: RankingConfig) -> Self {
        match config {
            RankingConfig::ConstantColumns => Self::ConstantColumns,
            RankingConfig::IncidentDegree => Self::IncidentDegree,
        }
    }
}

/// The frozen view of the graph one fit ran over.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct Snapshot {
    /// The bitemporal point the dataset observed. Absent for sources
    /// without temporal axes, such as synthetic fixtures.
    pub axes: Option<TemporalAxes>,
    /// Nodes the dataset streamed: the row count of every node-aligned
    /// artifact.
    pub nodes: u64,
    /// Edges the dataset streamed.
    pub edges: u64,
    /// Ontology types the dataset streamed: the row count of the
    /// card-embedding artifacts.
    pub ontology_types: u64,
}

/// The declared inputs one fit ran under.
///
/// The record identifies the run; replaying it re-derives
/// deterministic stages bit-for-bit, and the pipeline as a whole best
/// effort.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct Reproducibility {
    /// Every setting the fit ran under, the seed included: a replay
    /// takes its configuration from this echo, not from the defaults
    /// compiled into the replaying binary. Validated fields
    /// deserialize through their validating constructors, so a
    /// tampered echo refuses to parse.
    #[serde(with = "FitConfigDef")]
    pub config: FitConfig,
    /// The embedding contract the card embeddings were produced under.
    pub embedder: EmbedderFingerprint,
    /// The generation whose artifacts seeded reuse - card embeddings
    /// and landmark retention - when one was offered.
    pub prior: Option<GenerationId>,
}

/// The admission evidence of one published generation.
///
/// Every check recorded here passed: a failing check aborts the fit, and
/// an aborted fit publishes nothing.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct Evidence {
    /// How the card-embedding rows were obtained: reused from the prior
    /// generation or freshly embedded.
    pub cards: CardEmbeddingStats,
    /// The representation-contract spot check over the written node
    /// matrix.
    pub norm: NormSpotCheck,
    /// The exact-recall spot check over the neighbour backend.
    pub recall: RecallSpotCheck,
    /// The landmark stage's scale record.
    pub landmarks: LandmarkEvidence,
    /// The policy stage's scale record.
    pub policy: PolicyEvidence,
    /// The relation build's dropped-instance and pruned-mass account.
    #[serde(with = "BuildEvidenceDef")]
    pub relations: BuildEvidence,
    /// The level-of-detail stage's publish measurements.
    #[serde(with = "LodEvidenceDef")]
    pub lod: LodEvidence,
    /// The quadtree build's publish measurements.
    #[serde(with = "QuadEvidenceDef")]
    pub quad: QuadEvidence,
    /// The projector training and ladder measurements; present exactly
    /// when the placement is [`Placement::Projector`].
    pub projector: Option<ProjectorEvidence>,
}

/// The training and ladder measurements of one trained placement.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ProjectorEvidence {
    /// The optimization steps the run took.
    pub steps: usize,
    /// The phase boundary's frozen-radius record; absent when the
    /// schedule ended before the boundary step.
    pub boundary: Option<FrozenRadiusEvidence>,
    /// Supplied verdicts that resolved to no ontology row of this
    /// snapshot; evidence, not an error, because snapshots legitimately
    /// move on.
    pub unresolved_verdicts: usize,
    /// The measured condition ladder. Absent when the corpus carries no
    /// relation force: the lens receives zero gradient there, every
    /// rung projects the identical field, and the baseline publishes
    /// directly.
    pub ladder: Option<LadderEvidence>,
}

/// How the Proximal radius was frozen at the trainer's phase boundary.
///
/// The identity mirrors the trainer's frozen-radius outcome, recording
/// what actually ran.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case", tag = "provenance")]
pub(crate) enum FrozenRadiusEvidence {
    /// Measured from the reviewed-Proximal pairs.
    Measured { radius: f32 },
    /// Asserted by configuration, superseding the measurement.
    Asserted { radius: f32 },
    /// Nothing to freeze: the attraction index carries no force.
    Vacuous,
}

impl From<FrozenRadius> for FrozenRadiusEvidence {
    fn from(radius: FrozenRadius) -> Self {
        match radius {
            FrozenRadius::Measured { radius } => Self::Measured { radius },
            FrozenRadius::Asserted { radius } => Self::Asserted { radius },
            FrozenRadius::Vacuous => Self::Vacuous,
        }
    }
}

/// The measured condition ladder and its published canonical rung.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct LadderEvidence {
    /// One record per rung, in schedule order.
    pub rungs: Vec<RungEvidence>,
    /// The published rung's condition.
    pub canonical: f32,
    /// The published rung's schedule index.
    pub canonical_index: usize,
    /// The relation loss re-measured over the persisted aligned column,
    /// guarding the alignment application and the narrowing to `f32`.
    pub persisted_relation_loss: f64,
}

/// One rung's cross-condition evidence.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct RungEvidence {
    /// The rung's condition value.
    pub condition: f32,
    /// The field's frozen relation loss at projection time.
    pub relation_loss: f64,
    /// The similarity aligning the rung's field onto the baseline
    /// field; the identity for the baseline itself.
    #[serde(with = "similarity")]
    pub alignment: Similarity,
    /// RMS movement against the baseline field after alignment.
    pub baseline_movement: f64,
    /// RMS movement against the preceding field after alignment.
    pub adjacent_movement: f64,
    /// Whether the relation loss stayed within tolerance of the
    /// preceding rung's.
    pub monotonic: bool,
    /// Whether the adjacent movement reached the floor.
    pub distinguishable: bool,
}

impl From<&RungMeasurement> for RungEvidence {
    fn from(measurement: &RungMeasurement) -> Self {
        Self {
            condition: measurement.condition,
            relation_loss: measurement.relation_loss,
            alignment: measurement.alignment,
            baseline_movement: measurement.baseline_movement,
            adjacent_movement: measurement.adjacent_movement,
            monotonic: measurement.monotonic,
            distinguishable: measurement.distinguishable,
        }
    }
}

/// Serializes a [`Similarity`] as its decomposed coefficients,
/// validating through [`Similarity::new`] on deserialize.
mod similarity {
    use serde::{Deserialize as _, Serialize as _, de::Error as _};

    use crate::math::{Rotation, Similarity, Vec2};

    /// The alignment's wire form; the rotation is its unit vector.
    #[derive(serde::Serialize, serde::Deserialize)]
    struct Record {
        scale: f32,
        rotation: [f32; 2],
        translation: [f32; 2],
    }

    pub(super) fn serialize<S>(alignment: &Similarity, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        Record {
            scale: alignment.scale(),
            rotation: [alignment.rotation().cos(), alignment.rotation().sin()],
            translation: [alignment.translation().x(), alignment.translation().y()],
        }
        .serialize(serializer)
    }

    pub(super) fn deserialize<'de, D>(deserializer: D) -> Result<Similarity, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let Record {
            scale,
            rotation: [cos, sin],
            translation: [x, y],
        } = Record::deserialize(deserializer)?;

        // The rotation's unit-circle contract admits the rounding a
        // fitted alignment carries and nothing more.
        let unit_defect = f64::from(cos).mul_add(f64::from(cos), f64::from(sin) * f64::from(sin));
        if !((unit_defect - 1.0).abs() <= 1.0e-6 && x.is_finite() && y.is_finite()) {
            return Err(D::Error::custom(format_args!(
                "the rotation ({cos}, {sin}) does not lie on the unit circle or the translation \
                 ({x}, {y}) is not finite"
            )));
        }

        Similarity::new(scale, Rotation::from_cos_sin(cos, sin), Vec2::new(x, y)).ok_or_else(|| {
            D::Error::custom(format_args!(
                "the scale {scale} is not a finite, strictly positive, normal number"
            ))
        })
    }
}

/// Serializes a [`Bounds2`] as its corner coordinates, validating
/// through [`Bounds2::new`] on deserialize.
mod bounds2 {
    use serde::{Deserialize as _, Serialize as _, de::Error as _};

    use crate::math::{Bounds2, Vec2};

    /// The frame's wire form.
    #[derive(serde::Serialize, serde::Deserialize)]
    struct Record {
        min: [f32; 2],
        max: [f32; 2],
    }

    pub(super) fn serialize<S>(bounds: &Bounds2, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        Record {
            min: [bounds.min().x(), bounds.min().y()],
            max: [bounds.max().x(), bounds.max().y()],
        }
        .serialize(serializer)
    }

    pub(super) fn deserialize<'de, D>(deserializer: D) -> Result<Bounds2, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let Record { min, max } = Record::deserialize(deserializer)?;
        Bounds2::new(Vec2::new(min[0], min[1]), Vec2::new(max[0], max[1])).ok_or_else(|| {
            D::Error::custom(
                "the corners do not form a frame; both must be finite with min <= max per axis",
            )
        })
    }
}

/// Serializes the bucket histogram as a plain sequence, validating the
/// segment count on deserialize.
mod bucket_histogram {
    use serde::{Deserialize as _, Serialize as _, de::Error as _};

    use crate::file::morton::Fenceposts;

    pub(super) fn serialize<S>(
        histogram: &[u64; Fenceposts::SEGMENTS],
        serializer: S,
    ) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        histogram.as_slice().serialize(serializer)
    }

    pub(super) fn deserialize<'de, D>(
        deserializer: D,
    ) -> Result<[u64; Fenceposts::SEGMENTS], D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let lengths = Vec::<u64>::deserialize(deserializer)?;
        let count = lengths.len();
        lengths.try_into().map_err(|_lengths| {
            D::Error::custom(format_args!(
                "the histogram holds {count} buckets where the schedule has {}",
                Fenceposts::SEGMENTS,
            ))
        })
    }
}

/// serde shadow of [`LodEvidence`].
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "LodEvidence")]
struct LodEvidenceDef {
    #[serde(with = "bounds2")]
    world: Bounds2,
    #[serde(with = "bucket_histogram")]
    bucket_histogram: [u64; Fenceposts::SEGMENTS],
    catch_all_population: u64,
    co_location_excess: u64,
    max_tile_delta: u64,
}

/// serde shadow of [`BuildEvidence`].
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "BuildEvidence")]
struct BuildEvidenceDef {
    pruning_threshold: f32,
    retained_edges: usize,
    pruned_edges: usize,
    retained_mass: f64,
    pruned_mass: f64,
    self_references: usize,
}

/// Serializes a [`Depth`] as its subdivision count, validating through
/// [`Depth::new`] on deserialize.
mod depth {
    use serde::{Deserialize as _, de::Error as _};

    use crate::morton::Depth;

    #[expect(
        clippy::trivially_copy_pass_by_ref,
        reason = "serde's `with` contract passes the field by reference"
    )]
    pub(super) fn serialize<S>(depth: &Depth, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_u8(depth.get())
    }

    pub(super) fn deserialize<'de, D>(deserializer: D) -> Result<Depth, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = u8::deserialize(deserializer)?;
        Depth::new(value).ok_or_else(|| {
            D::Error::custom(format_args!(
                "the depth {value} exceeds the {} subdivisions a 64-bit Morton key resolves",
                Depth::MAX.get(),
            ))
        })
    }
}

/// serde shadow of [`QuadEvidence`].
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(remote = "QuadEvidence")]
struct QuadEvidenceDef {
    nodes: u64,
    leaves: u64,
    #[serde(with = "depth")]
    depth: Depth,
    type_entries: u64,
}

/// Scale record of the landmark stage.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct LandmarkEvidence {
    /// Landmarks selected: the `M` of the published skeleton.
    pub selected: u32,
    /// Selected landmarks that were landmarks of the prior generation.
    pub retained: u32,
    /// Layout optimization epochs run over the quotient graph.
    pub layout_epochs: NonZero<u32>,
}

/// Scale record of the policy stage.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct PolicyEvidence {
    /// Relation types resolved into the published policy table: the
    /// distinct ontology rows the edge stream carried.
    pub relations: u64,
    /// Resolved relations whose policy came from an override record
    /// instead of the classifier.
    pub overridden: u64,
}

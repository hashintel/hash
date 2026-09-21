//! The fit pipeline, which turns one dataset into one published generation.
//!
//! [`fit`] runs every stage of one SALT fit over a [`Dataset`]. It writes each artifact into a
//! staging directory as that stage completes and seals the result into an atomically published
//! generation. This module owns exactly the dataset-to-artifact plumbing. The stages themselves are
//! libraries under [`crate::salt`], consumed here.
//!
//! # Thread discipline
//!
//! The last dataset touch splits the pipeline. [`ingest`] runs on the async runtime and drains the
//! dataset's streams and the embedding provider into staged files. [`compute`] runs on the rayon
//! pool behind [`offload`], and the CPU-heavy stages never occupy a tokio runtime thread. A stage
//! panic surfaces as [`compute::ComputeError::Offload`] instead of poisoning the executor.
//!
//! # Memory discipline
//!
//! Ingest streams the corpus-scale inputs into staged files, and the compute stages map those
//! files in where they consume them. The corpus matrix and the identity table open at the compute
//! boundary, and the card, endpoint and ontology identity columns open inside the stages that
//! read them. The mapped pages are freshly written and evictable under pressure. Every compute
//! stage returns its own product as an owned value beside the staged file's binding
//! ([`compute::Staged`]), and the run retains each value until it returns. The representation
//! quotient's row maps, the adjacency, the trainer's relation indexes, the admitted neighbour
//! table, the semantic graph and the skeleton are all resident while the placement runs, and the
//! adjacency and the ingest's resident type columns feed the level-of-detail stage after it. Peak
//! residency is the retained products plus the running stage's own working storage, not one
//! stage's working set alone. Corpus-scale intermediates a stage writes and maps rather than
//! retains live in the scratch directory: the quotient's distinct matrix and the placement's
//! ladder frames. Config-bounded `M`-scale values (the landmark selection and its quotient graph)
//! stay resident within the run.
//!
//! # Seeds
//!
//! One seed enters through [`FitConfig`], and each randomized stage draws its generator from a
//! named derivation of it. Naming makes the derivation insertion-stable. Adding or removing a stage
//! never shifts another stage's randomness, which a shared drawn-in-order stream cannot promise.
//!
//! # Failure
//!
//! Publication is the seal's rename of the staging directory into the generation root. Any stage
//! error, failed admission check, or write failure before that rename aborts the run with nothing
//! published. The seal syncs the staged files and the staging directory before the rename and the
//! root after it, and an error after the rename (the root failing to open or to sync) returns a
//! [`FitError`] while the generation directory is already visible. Likewise, when a supplied
//! progress observer panics on the seal's completion report, the published run returns
//! [`compute::ComputeError::Offload`]. Success proves publication, while an error proves only
//! that the run did not complete. The staging and scratch directories attempt to remove
//! themselves when dropped, on the error return as on a compute-side unwind, and a removal failure
//! is logged rather than returned.

use core::{error::Error, fmt, num::NonZero, panic::UnwindSafe};
use std::io::{self, Write as _};

use camino::Utf8Path;
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

pub(crate) use self::{
    annotations::SuppliedAnnotations, error::FitError, verdicts::SuppliedVerdicts,
};
use self::{compute::ComputeError, prepare::norm};
use super::projector::train::fit::TrainingScheduleOptions;
use crate::{
    dataset::Dataset,
    device::PhysicalDevice,
    file::{
        classifier::read::{ClassifierFile, OpenClassifierError},
        generation::{Generation, GenerationRoot, PublishedGeneration},
        salt::artifact,
    },
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{
        AffinityCurve, NonNegative, Positive, non_negative, nz, positive, positive_unit_fraction,
        unit_fraction,
    },
    offload,
    progress::{self, Progress},
    salt::{
        embedding::CardEmbedder,
        importance::RankingConfig,
        knn::{self, descent::NnDescentOptions, hannoy::HannoyIndexOptions, recall},
        ladder::LadderOptions,
        landmark::{layout::LayoutOptions, quotient::QuotientOptions, select::SelectionOptions},
        lod::stage::LodConfig,
        policy::{
            CoincidentAdmission, PolicyOverride,
            annotation::assembly::{AssemblyConfig, assemble},
            classifier::{
                Classifier, FitConfig as ClassifierFitConfig, artifact::InvalidClassifierFile,
            },
        },
        projector::{
            budget::Budget,
            loss::{CoincidentEnergy, SupportOptions},
            miner::MinerOptions,
            model::Architecture,
            train::{BatchPlan, Coefficients, RelationLens, TrainingSchedule},
        },
        relation::{attraction::AttractionOptions, protection::ProtectionConfig},
        semantic::SmoothingOptions,
    },
};

pub(crate) mod annotations;
mod compute;
mod error;
mod ingest;
pub(crate) mod prepare;
pub(crate) mod verdicts;

#[cfg(test)]
mod tests;

/// Policy resolution inputs of one fit.
///
/// The overrides supersede classifier predictions by precedence and must name relation types the
/// edge stream carries: an override for a relation without edges contradicts the corpus and aborts
/// the fit at resolution.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct PolicyOptions {
    /// Higher-precedence policy records superseding classifier predictions.
    pub overrides: Vec<PolicyOverride> = Vec::new(),
    /// The generation's Coincident admission criteria.
    pub admission: CoincidentAdmission = CoincidentAdmission::default(),
    /// Training-set assembly over a supplied annotation corpus.
    pub assembly: AssemblyConfig = AssemblyConfig { .. },
    /// The classifier fit over the assembled training set.
    pub classifier_fit: ClassifierFitConfig = ClassifierFitConfig::default(),
}

const impl Default for PolicyOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// The landmark support anchors' shared weight.
///
/// Every skeleton landmark anchors its node at the laid-out coordinate with this weight. The fit
/// measures the anchor's radius rather than reading it from configuration. That radius is the
/// skeleton's own local ruler, the median layout distance to its nearest skeleton neighbours, and
/// the relation loss uses the same convention for its local scales. The unit weight is the neutral
/// value because no evidence distinguishes landmark reliability yet. The per-anchor slot exists for
/// the day it does.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct LandmarkSupport {
    pub weight: Positive = Positive::ONE,
}

const impl Default for LandmarkSupport {
    fn default() -> Self {
        Self { .. }
    }
}

/// Every setting of the projector placement.
///
/// The model, its training run, and the condition ladder that publishes the canonical field.
///
/// Each field is a validated value. The struct is plain wiring. [`live`](Self::live) is the
/// stamped live configuration and the placement default.
///
/// The semantic affinity energy composes at stage entry from the fit's low-dimensional kernel and
/// [`affinity_offset`]. The projector objective and the landmark layout share one curve by design.
/// The composition rejects a curve whose exponent lies below the energy's gradient-boundedness
/// bound, aborting the fit before training.
///
/// [`affinity_offset`]: Self::affinity_offset
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ProjectorOptions {
    /// The model shape.
    pub architecture: Architecture,
    /// The step schedule.
    pub schedule: TrainingSchedule,
    /// The per-step sampling plan.
    pub plan: BatchPlan,
    /// The logarithm offset of the semantic affinity energy.
    ///
    /// It bounds the near-coincidence repulsion derivative: it is a force ceiling rather than a
    /// numerical guard alone.
    pub affinity_offset: Positive,
    /// The support-term constants shared by anchors and landmarks.
    pub support: SupportOptions,
    /// The per-node relation-gradient diagnostics' baseline convention.
    ///
    /// The floor is the baseline of nodes whose semantic pairs are not co-drawn, which in a
    /// sampled batch is most of them. The floor therefore matches the typical per-draw semantic
    /// gradient rather than ε. The budget observes and never steers. Relation gradients apply
    /// whole.
    pub budget: Budget,
    /// The objective coefficients' mass bases.
    ///
    /// The placement stage normalizes them at assembly. The semantic and ordinary bases divide by
    /// the corpus's total semantic edge weight, the hard-negative base by the row count, and the
    /// support bases by their pool sizes, and a configured base weighs the same objective share on
    /// every corpus. The relation base passes through unchanged, because its estimator is already
    /// mass-free.
    pub coefficients: Coefficients,
    /// The hard-negative mining schedule.
    pub miner: MinerOptions,
    /// The relation-lens constants.
    pub lens: RelationLens,
    /// The trainer's protection-channel thresholds.
    pub protection: ProtectionConfig,
    /// The landmark support anchors' shared weight.
    pub landmark_support: LandmarkSupport,
    /// Rows per corpus-forward slice, bounding the peak device memory of a whole-corpus pass.
    pub forward_rows: NonZero<usize>,
    /// The condition ladder and its canonical step.
    pub ladder: LadderOptions,
    /// Withhold the relation evidence from the trainer.
    ///
    /// The run is vacuous by construction. The trainer freezes no radius and demands no reviewed
    /// verdicts, while every other objective term trains and the published relation artifacts stay
    /// real. For corpora without reviewed-Proximal coverage that still want the full trained
    /// placement.
    pub vacuous: bool,
}

impl ProjectorOptions {
    /// Returns the live configuration.
    ///
    /// Every value stamped for production training, schedule included.
    ///
    /// - 20k steps with the boundary at 5k and refresh every 250
    /// - 2048-pair semantic and ordinary draws, 12 relation types capped at 256 edges, 512 hard
    ///   queries and 512 landmark anchors per step
    /// - mass bases `(1, 5, 1, 1, 0, 1)` normalized at assembly
    /// - budget floor `2e-4`, the typical per-draw semantic gradient under the normalization
    /// - affinity offset and lens/support guards at `1e-3` in units of the local rulers
    /// - Coincident radius `0.05`, well below any plausible measured Proximal radius
    /// - mining margin 3
    /// - 65536-row forward slices, the measured GPU sweet spot (on the CPU backend it means fewer,
    ///   larger slices)
    #[must_use]
    pub(crate) const fn live() -> Self {
        const LIVE: ProjectorOptions = ProjectorOptions {
            architecture: Architecture { .. },
            schedule: TrainingSchedule::new(TrainingScheduleOptions {
                steps: nz!(20_000),
                boundary: 5_000,
                refresh_interval: nz!(250),
                initial_learning_rate: positive_unit_fraction!(1.0e-3),
                minimum_learning_rate: unit_fraction!(1.0e-5),
            })
            .ok()
            .unwrap(),
            plan: BatchPlan {
                semantic_pairs: nz!(2048),
                ordinary_pairs: 2048,
                relation_types: 12,
                relation_cap: nz!(256),
                hard_queries: 512,
                landmark_anchors: 512,
                temporal_anchors: 0,
            },
            affinity_offset: positive!(1.0e-3),
            support: SupportOptions {
                threshold: positive!(3.0),
                epsilon: positive!(1.0e-3),
            },
            budget: Budget {
                floor: positive!(2.0e-4),
            },
            coefficients: Coefficients {
                semantic: Positive::ONE,
                ordinary: non_negative!(5.0),
                hard: NonNegative::ONE,
                relation: NonNegative::ONE,
                anchor: NonNegative::ZERO,
                landmark: NonNegative::ONE,
            },
            miner: MinerOptions {
                neighbours: nz!(8),
                search_margin: nz!(3),
                maximum_weight: Positive::ONE,
                rank_exponent: Positive::ONE,
            },
            lens: RelationLens {
                coincident: CoincidentEnergy {
                    radius: non_negative!(0.05),
                    threshold: positive!(1.0),
                },
                temperature: positive!(0.25),
                epsilon: positive!(1.0e-3),
            },
            protection: ProtectionConfig::default(),
            landmark_support: LandmarkSupport { .. },
            forward_rows: nz!(1 << 16),
            ladder: LadderOptions { .. },
            vacuous: false,
        };

        LIVE
    }
}

/// How one fit produces its canonical coordinates.
///
/// The published metadata's [`Placement`](crate::file::salt::metadata::Placement) mirrors this
/// configuration, recording what actually ran.
/// The default is the trained projector under the reference options. The conditioned model is the
/// pipeline's architecture, and the landmark baseline is the configured fallback placer for fits
/// that skip training by design.
#[expect(
    clippy::large_enum_variant,
    reason = "the projector default must be a const expression, which a boxed variant cannot \
              produce; the asymmetry costs one embedded options struct per configuration value"
)]
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum PlacementOptions {
    /// Every row takes its assigned landmark's layout coordinate.
    ///
    /// The 1-NN placement the landmark assignment already encodes.
    LandmarkBaseline,
    /// The trained conditioned projector places every row.
    ///
    /// The ladder measures the schedule and the canonical step's aligned field publishes.
    Projector(ProjectorOptions),
}

/// How one fit constructs its k-NN lists.
///
/// The search-backend wrapper is the default. NN-Descent derives the lists directly, with no
/// search structure. Either construction answers to the same recall spot check, and neither
/// outlives the fit: the wrapper's index lives in the fit's scratch directory, which removes
/// itself when the run ends.
#[derive(Debug, Copy, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub(crate) enum KnnConstructionChoice {
    /// Construct through the HNSW backend pinned by [`FitConfig::index`].
    #[default]
    Index,
    /// Construct by NN-Descent local joins.
    Descent(NnDescentOptions),
}

/// Every setting of one fit, valid by construction.
///
/// Stage options keep their own documented defaults. The fields without defaults are the choices no
/// fit can imply, which are the seed, the landmark capacity, and the low-dimensional kernel.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct FitConfig {
    /// The fit's seed.
    ///
    /// Every stage generator derives from it by name.
    pub seed: u64,
    /// Landmark capacity and retention.
    pub selection: SelectionOptions,
    /// The fitted low-dimensional affinity kernel ([`AffinityCurve::fit`]).
    pub curve: AffinityCurve,
    /// The representation-contract spot check.
    pub norm_check: norm::SpotCheckOptions = norm::SpotCheckOptions::default(),
    /// Stored neighbours per row of the k-NN table.
    pub neighbours: NonZero<usize> = knn::DEFAULT_NEIGHBOURS,
    /// The k-NN list constructor.
    pub construction: KnnConstructionChoice = KnnConstructionChoice::Index,
    /// The HNSW backend serving the assignment search.
    ///
    /// It serves the k-NN construction too, when [`construction`](Self::construction) routes
    /// through it.
    pub index: HannoyIndexOptions = HannoyIndexOptions::default(),
    /// The exact-recall spot check admitting the backend.
    pub recall_check: recall::SpotCheckOptions = recall::SpotCheckOptions::default(),
    /// Membership smoothing of the semantic graph.
    pub smoothing: SmoothingOptions = SmoothingOptions::default(),
    /// Quotient-graph contraction bounds.
    pub quotient: QuotientOptions = QuotientOptions::default(),
    /// The landmark layout schedule.
    pub layout: LayoutOptions = LayoutOptions::default(),
    /// Policy overrides and admission criteria.
    pub policy: PolicyOptions = PolicyOptions::default(),
    /// Shared attraction weighting and force pruning.
    pub attraction: AttractionOptions = AttractionOptions::default(),
    /// How the fit produces the canonical coordinates.
    pub placement: PlacementOptions = PlacementOptions::Projector(ProjectorOptions::live()),
    /// The importance signal behind the delivery ranking.
    pub ranking: RankingConfig = RankingConfig::default(),
    /// The level-of-detail schedule.
    pub lod: LodConfig = LodConfig::default(),
}

/// The randomized stages, each naming its seed derivation.
///
/// The name string is the derivation preimage and therefore pinned. Renaming a variant never moves
/// a stage's randomness, and only editing its pinned string does.
///
/// Crate-visible so measurement harnesses can replay one stage's exact stream. A sweep that
/// reproduces a live fit's draws isolates the knob it varies from the run's randomness.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Stage {
    NormCheck,
    KnnLink,
    RecallCheck,
    LandmarkSelection,
    LandmarkAssignment,
    LandmarkLayout,
    ProjectorInit,
    ProjectorDraws,
}

impl Stage {
    /// Returns the pinned derivation name.
    const fn name(self) -> &'static str {
        match self {
            Self::NormCheck => "norm-check",
            Self::KnnLink => "knn-link",
            Self::RecallCheck => "recall-check",
            Self::LandmarkSelection => "landmark-selection",
            Self::LandmarkAssignment => "landmark-assignment",
            Self::LandmarkLayout => "landmark-layout",
            Self::ProjectorInit => "projector-init",
            Self::ProjectorDraws => "projector-draws",
        }
    }
}

/// Derives one stage's generator from the fit seed and the stage's pinned name.
///
/// The full 32-byte digest seeds the generator, and a derived stream keeps the derivation's whole
/// entropy.
pub(crate) fn stage_rng(seed: u64, stage: Stage) -> Xoshiro256PlusPlus {
    let mut hasher = Sha256::new();
    #[expect(
        clippy::little_endian_bytes,
        reason = "the derivation preimage pins the canonical little-endian bytes"
    )]
    hasher.update(&seed.to_le_bytes());
    hasher.update(stage.name().as_bytes());

    Xoshiro256PlusPlus::from_seed(hasher.finalize().to_bytes())
}

/// The supplied classifier artifact fails admission.
#[derive(Debug)]
pub enum ClassifierSupplyError {
    /// Reading the file failed.
    Io(io::Error),
    /// The file is not a classifier artifact.
    Open(OpenClassifierError),
    /// The artifact violates the classifier's domain invariants.
    Invalid(InvalidClassifierFile),
}

impl fmt::Display for ClassifierSupplyError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(_) => fmt.write_str("the supplied classifier file could not be read"),
            Self::Open(_) => fmt.write_str("the supplied file is not a classifier artifact"),
            Self::Invalid(_) => {
                fmt.write_str("the supplied artifact violates the classifier's domain invariants")
            }
        }
    }
}

impl Error for ClassifierSupplyError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Open(error) => Some(error),
            Self::Invalid(error) => Some(error),
        }
    }
}

/// The relation-policy classifier input of one fit.
///
/// The fit consumes a fitted model either way. A supplied artifact passes through, and the run
/// assembles and fits a supplied annotation corpus. The staging records the corpus document, the
/// embedding table, and the holdout evaluation beside the model.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum ClassifierInput {
    /// A fitted model supplied as an artifact.
    Supplied {
        /// The deployable model.
        classifier: Classifier,
        /// The SHA-256 of the artifact file's bytes.
        ///
        /// The supplied file's identity, as the generation manifest records it.
        source: Sha256Digest,
    },
    /// A validated annotation corpus to fit the model from.
    Annotations(SuppliedAnnotations),
}

impl ClassifierInput {
    /// Reads, validates, and adopts a fitted classifier artifact.
    ///
    /// The recorded source identity is the SHA-256 of the file's bytes.
    ///
    /// # Errors
    ///
    /// Returns a [`ClassifierSupplyError`] when reading the file fails or the file does not hold a
    /// valid classifier.
    pub(crate) fn open_artifact(path: impl AsRef<Utf8Path>) -> Result<Self, ClassifierSupplyError> {
        let path = path.as_ref();
        let source = crate::file::digest_file(path).map_err(ClassifierSupplyError::Io)?;
        let file = ClassifierFile::open(path).map_err(ClassifierSupplyError::Open)?;
        let classifier =
            Classifier::from_artifact(&file).map_err(ClassifierSupplyError::Invalid)?;

        Ok(Self::Supplied { classifier, source })
    }
}

/// The supplied inputs of one fit run.
///
/// The classifier input is mandatory. The reviewed verdicts and the prior generation are optional
/// supplies whose absence the published metadata records.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Supplies<'fit> {
    /// The relation classifier's input, either a fitted model or the corpus to fit one from.
    pub classifier: &'fit ClassifierInput,
    /// The reviewed-verdicts document staged for the trainer's phase boundary.
    pub verdicts: Option<&'fit SuppliedVerdicts> = None,
    /// The generation seeding reuse.
    pub prior: Option<&'fit Generation> = None,
}

/// Runs one fit over the dataset and publishes the generation.
///
/// The stages run in the dataset's documented ingest order (nodes, edges, ontology) with every
/// artifact staged in place. The returned generation is therefore complete, durable, and
/// verifiable against its metadata document. Activation stays with the caller. Publishing a
/// generation and serving it are separate decisions.
///
/// The `classifier` input resolves to a fitted model either way ([`ClassifierInput`]). A supplied
/// artifact passes through unchanged. The run instead stages an annotation corpus verbatim,
/// assembles it into the classifier's training set and fits the model from that set. The staging
/// records the embedding table and the holdout evaluation beside the model. The model classifies
/// every relation type's card. The resolved policy table publishes beside it.
///
/// The `verdicts` are a supplied input in the policy-override category. A validated
/// reviewed-verdicts document ([`SuppliedVerdicts`]) stages verbatim as the generation's
/// `reviewed_verdicts` role. The fit derives nothing from it before the placement stage, where it
/// resolves the verdicts against the staged ontology identity column into the corpus row domain
/// and hands the resolution to the trainer's phase boundary. The staged bytes stay the supplied
/// file's. A fit run without one publishes with the role absent. The manifest records the absence.
///
/// A `prior` generation seeds reuse. Card texts whose hash its card table lists keep their
/// embeddings without touching the provider (under a matching embedder fingerprint). Its landmarks
/// compete for the retained share of the new selection, translated across snapshots through the
/// identity artifacts. The metadata records which generation seeded the run.
///
/// # Errors
///
/// Returns an error when the dataset or embedding provider fails ([`FitError::Dataset`],
/// [`FitError::Cards`], [`FitError::Embedding`]) or a supplied annotation corpus fails to assemble
/// into the classifier's training set ([`FitError::Assembly`]). A streamed ingest write can also
/// fail ([`FitError::Io`]), and any compute stage rejecting its input, failing an admission check,
/// or unable to write, map, or publish answers [`FitError::Compute`]. Every error before the
/// seal's rename leaves nothing published. A seal error after the rename, or a progress observer
/// panicking after the seal, returns an error although the generation directory is already
/// visible.
#[expect(
    clippy::significant_drop_tightening,
    reason = "the staging and scratch directories move into the compute closure whole and are \
              dropped inside it"
)]
pub(crate) async fn fit<D, E, P>(
    dataset: &D,
    embedder: &E,
    config: &FitConfig,
    Supplies {
        classifier,
        verdicts,
        prior,
    }: Supplies<'_>,
    root: &GenerationRoot,
    device: PhysicalDevice,
    progress: &P,
) -> Result<PublishedGeneration, FitError<D::Error, E::Error>>
where
    D: Dataset,
    E: CardEmbedder + Sync,
    P: Progress<Detached: UnwindSafe> + Sync,
{
    let staging = root.stage()?;
    let scratch = root.scratch()?;

    // The supplied verdicts stage before any derivation. Construction
    // already validated the document, and nothing after this write can
    // therefore reject it. The staged bytes are the supplied file verbatim.
    let reviewed_verdicts = match verdicts {
        Some(supplied) => {
            let file = staging.stage_with(artifact::ReviewedVerdicts, |writer| {
                writer.write_all(supplied.bytes())?;
                Ok(supplied.hash())
            })?;
            tracing::info!(
                type_verdicts = supplied.document().type_verdicts().len(),
                pair_verdicts = supplied.document().pair_verdicts().len(),
                "staged the supplied reviewed verdicts"
            );
            Some(file)
        }
        None => None,
    };

    // The classifier supply resolves before ingest: a supplied model
    // passes through, and a supplied corpus stages verbatim and
    // assembles into the training set the compute-side fit consumes.
    let classifier = match classifier {
        ClassifierInput::Supplied { classifier, source } => compute::ClassifierPlan::Use {
            classifier: classifier.clone(),
            source: *source,
        },
        ClassifierInput::Annotations(supplied) => {
            let file = staging.stage_with(artifact::AnnotationCorpus, |writer| {
                writer.write_all(supplied.bytes())?;
                Ok(supplied.hash())
            })?;
            let corpus = assemble(
                supplied.document(),
                embedder,
                config.policy.assembly,
                progress,
            )
            .await
            .map_err(FitError::Assembly)?;
            tracing::info!(
                supplied = corpus.evidence().supplied,
                trained = corpus.evidence().trained,
                holdouts = corpus.holdouts().len(),
                "staged and assembled the supplied annotation corpus"
            );
            compute::ClassifierPlan::Fit {
                corpus: Box::new(corpus),
                source: supplied.hash(),
                staged: file,
            }
        }
    };

    let ingested = ingest::Ingest {
        dataset,
        staging: &staging,
        scratch: &scratch,
    }
    .run(embedder, config, prior, progress)
    .await?;
    progress.stage_completed(progress::Stage::Ingest);

    // Everything after the last dataset touch is CPU-and-file work:
    // it crosses onto the rayon pool as one owned unit.
    let compute = compute::Compute {
        context: compute::Context {
            staging,
            scratch,
            config: config.clone(),
            device,
        },
        classifier,
        reviewed_verdicts,
        verdicts: verdicts.cloned(),
        prior: prior.cloned(),
        ingested,
    };

    // The compute half leaves this stack for the rayon pool, and it takes the observer's detached
    // half rather than a borrow the spawn cannot hold.
    let detached = progress.detach();
    let published =
        offload::run(move || compute.run::<D::NodeId, D::OntologyId, P::Detached>(&detached))
            .await
            .map_err(ComputeError::from)??;

    Ok(published)
}

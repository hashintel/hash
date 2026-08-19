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
//! pool behind [`offload`], so the CPU-heavy stages never occupy a tokio runtime thread. A stage
//! panic surfaces as [`compute::ComputeError::Panicked`] instead of poisoning the executor.
//!
//! # Memory discipline
//!
//! Every corpus-scale stage output goes to its staged file and maps back before the next stage
//! reads it. Owned `N`-scale values are construction-transient and drop at stage exit, so the
//! pipeline's peak residency is one stage's working set rather than the sum. The mapped views stay
//! cheap because their pages are freshly written and evictable under pressure. Config-bounded
//! `M`-scale values (the landmark selection, the quotient graph) stay resident within the run.
//!
//! # Seeds
//!
//! One seed enters through [`FitConfig`], and each randomized stage draws its generator from a
//! named derivation of it. Naming makes the derivation insertion-stable. Adding or removing a stage
//! never shifts another stage's randomness, which a shared drawn-in-order stream cannot promise.
//!
//! # Failure
//!
//! Any stage error, failed admission check, or write failure aborts the run and publishes nothing.
//! The staging and scratch directories remove themselves, and a compute-side panic unwinds through
//! the worker that owns them, removing them the same way. A generation therefore exists exactly
//! when every stage and every check of one run passed.

use core::{error::Error, fmt, num::NonZero};
use std::io::{self, Write as _};

use burn::backend::libtorch::LibTorchDevice;
use camino::Utf8Path;
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use self::prepare::norm;
pub(crate) use self::{
    annotations::SuppliedAnnotations, echo::FitConfigDef, error::FitError,
    verdicts::SuppliedVerdicts,
};
use crate::{
    dataset::Dataset,
    file::{
        classifier::read::{ClassifierFile, OpenClassifierError},
        generation::{Generation, GenerationRoot, PublishedGeneration},
    },
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{AffinityCurve, NonNegative, Positive, non_negative, nz, positive, unit_fraction},
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
mod echo;
mod error;
mod ingest;
pub(crate) mod prepare;
mod role;
pub(crate) mod verdicts;

#[cfg(test)]
mod tests;

/// Policy resolution inputs of one fit.
///
/// The overrides supersede classifier predictions by precedence and must name relation types the
/// edge stream carries: an override for a relation without edges contradicts the corpus and aborts
/// the fit at resolution.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct PolicyOptions {
    /// Higher-precedence policy records superseding classifier predictions.
    pub overrides: Vec<PolicyOverride> = Vec::new(),
    /// The generation's Coincident admission criteria.
    pub admission: CoincidentAdmission = CoincidentAdmission::default(),
    /// Training-set assembly over a supplied annotation corpus.
    pub assembly: AssemblyConfig = AssemblyConfig { .. },
    /// The classifier fit over the assembled training set.
    pub classifier_fit: ClassifierFitConfig = ClassifierFitConfig { .. },
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
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LandmarkSupport {
    weight: f32 = 1.0,
}

const impl Default for LandmarkSupport {
    fn default() -> Self {
        Self { .. }
    }
}

impl LandmarkSupport {
    /// Validates a landmark support weight.
    ///
    /// Returns [`None`] unless the weight is finite and strictly positive.
    #[must_use]
    pub(crate) const fn new(weight: f32) -> Option<Self> {
        if !(weight.is_finite() && weight > 0.0) {
            return None;
        }
        Some(Self { weight })
    }

    /// Returns each anchor's mass in the support sum.
    #[inline]
    #[must_use]
    pub(crate) const fn weight(self) -> f32 {
        self.weight
    }
}

const _: () = assert!(LandmarkSupport::new(LandmarkSupport::default().weight()).is_some());

/// Every setting of the projector placement.
///
/// The model, its training run, and the condition ladder that publishes the canonical field.
///
/// Each field is a validated value. The struct is plain wiring. [`ratified`](Self::ratified) is the
/// stamped live configuration and the placement default.
///
/// The semantic affinity energy composes at stage entry from the fit's low-dimensional kernel and
/// [`affinity_offset`]. The projector objective and the landmark layout share one curve by design.
/// The composition rejects a curve whose exponent lies below the energy's gradient-boundedness
/// bound, aborting the fit before training.
///
/// [`affinity_offset`]: Self::affinity_offset
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ProjectorOptions {
    /// The model shape.
    pub architecture: Architecture,
    /// The step schedule.
    pub schedule: TrainingSchedule,
    /// The per-step sampling plan.
    pub plan: BatchPlan,
    /// The logarithm offset of the semantic affinity energy.
    ///
    /// It bounds the near-coincidence repulsion derivative, so it is a force ceiling, not a
    /// numerical crumb.
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
    /// support bases by their pool sizes, so a configured base weighs the same objective share on
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
    /// The condition ladder and its canonical rung.
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
    /// Returns the ratified live configuration.
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
    pub(crate) const fn ratified() -> Self {
        Self {
            architecture: Architecture { .. },
            schedule: TrainingSchedule::new(
                nz!(20_000),
                5_000,
                nz!(250),
                unit_fraction!(1.0e-3),
                unit_fraction!(1.0e-5),
            )
            .expect("the ratified schedule is valid"),
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
            support: SupportOptions::new(positive!(3.0), positive!(1.0e-3)),
            budget: Budget {
                floor: positive!(2.0e-4),
            },
            coefficients: Coefficients::new(
                Positive::ONE,
                non_negative!(5.0),
                NonNegative::ONE,
                NonNegative::ONE,
                NonNegative::ZERO,
                NonNegative::ONE,
            ),
            miner: MinerOptions::new(
                NonZero::new(8).expect("the ratified quota is nonzero"),
                NonZero::new(3).expect("the ratified margin is nonzero"),
                Positive::ONE,
                Positive::ONE,
            ),
            lens: RelationLens::new(
                CoincidentEnergy::new(non_negative!(0.05), positive!(1.0)),
                positive!(0.25),
                positive!(1.0e-3),
            ),
            protection: ProtectionConfig::default(),
            landmark_support: LandmarkSupport { .. },
            forward_rows: NonZero::new(1 << 16).expect("the ratified slice is nonzero"),
            ladder: LadderOptions { .. },
            vacuous: false,
        }
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
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum PlacementOptions {
    /// Every row takes its assigned landmark's layout coordinate.
    ///
    /// The 1-NN placement the landmark assignment already encodes.
    LandmarkBaseline,
    /// The trained conditioned projector places every row.
    ///
    /// The ladder measures the schedule and the canonical rung's aligned field publishes.
    Projector(ProjectorOptions),
}

/// How one fit constructs its k-NN lists.
///
/// The search-backend wrapper is the default; NN-Descent derives the lists directly, with no
/// search structure. Either construction answers to the same recall spot check, and neither
/// outlives the fit: the wrapper's index lives in the fit's scratch directory, which removes
/// itself when the run ends.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
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
#[derive(Debug, Clone, PartialEq)]
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
    pub placement: PlacementOptions = PlacementOptions::Projector(ProjectorOptions::ratified()),
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
/// The full 32-byte digest seeds the generator, so a derived stream keeps the derivation's whole
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
        let source = role::digest_file(path).map_err(ClassifierSupplyError::Io)?;
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
/// artifact staged in place, so the returned generation is complete, durable, and verifiable
/// against its metadata document. Activation stays with the caller. Publishing a generation and
/// serving it are separate decisions.
///
/// The `classifier` input resolves to a fitted model either way ([`ClassifierInput`]). A supplied
/// artifact passes through unchanged. The run instead stages an annotation corpus verbatim,
/// assembles it into the classifier's training set and fits the model from that set. The staging
/// records the embedding table and the holdout evaluation beside the model. The model classifies
/// every relation type's card. The resolved policy table publishes beside it.
///
/// The `verdicts` are a supplied input in the policy-override category. A validated
/// reviewed-verdicts document ([`SuppliedVerdicts`]) stages verbatim as the generation's
/// `reviewed_verdicts` role for the trainer's phase boundary to consume. The fit itself never acts
/// on it. A fit run without one publishes with the role absent. The manifest records the absence.
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
/// or unable to write, map, or publish answers [`FitError::Stage`]. The run publishes nothing on
/// any error.
#[expect(
    clippy::significant_drop_tightening,
    reason = "the staging and scratch directories move into the compute closure whole; nothing \
              here can drop them earlier"
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
    device: LibTorchDevice,
    progress: &P,
) -> Result<PublishedGeneration, FitError<D::Error, E::Error>>
where
    D: Dataset,
    E: CardEmbedder + Sync,
    P: Progress + Sync,
{
    let staging = root.stage()?;
    let scratch = root.scratch()?;

    // The supplied verdicts stage before any derivation: construction
    // already validated the document, so nothing after this write can
    // reject it, and the staged bytes are the supplied file verbatim.
    let reviewed_verdicts = match verdicts {
        Some(supplied) => {
            let file = staging.stage_with(role::Role::ReviewedVerdicts.file_name(), |writer| {
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
            let file = staging.stage_with(role::Role::AnnotationCorpus.file_name(), |writer| {
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

    let ingested = ingest::run(
        dataset, embedder, config, &staging, &scratch, prior, progress,
    )
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

    // The compute half leaves this stack for the rayon pool, so it takes the observer's detached
    // half rather than a borrow the spawn cannot hold.
    let detached = progress.detach();
    let published =
        offload(move || compute.run::<D::NodeId, D::OntologyId, P::Detached>(&detached)).await?;

    Ok(published)
}

/// Runs compute-side work on the rayon pool, keeping the tokio runtime thread free.
///
/// The caller's span carries across, so stage spans keep their parent. A panic in the work unwinds
/// the worker and surfaces as [`compute::ComputeError::Panicked`]. The unwind drops the staging and
/// scratch directories the worker owns, and they remove themselves. The async executor never
/// observes the unwind.
async fn offload<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, compute::ComputeError> + Send + 'static,
) -> Result<T, compute::ComputeError> {
    let span = tracing::Span::current();
    let (sender, receiver) = tokio::sync::oneshot::channel();

    rayon::spawn(move || {
        let _entered = span.entered();
        // The work owns everything it touches, and the unwind drops every capture, so no shared
        // state survives to observe a broken invariant.
        let result = std::panic::catch_unwind(core::panic::AssertUnwindSafe(work)).unwrap_or_else(
            |payload| {
                Err(compute::ComputeError::Panicked {
                    message: panic_message(payload.as_ref()),
                })
            },
        );
        // A send failure means the fit future dropped its receiver, so the result has no recipient.
        let _: Result<(), _> = sender.send(result);
    });

    receiver
        .await
        .expect("the worker owns the sender and always sends")
}

/// Extracts the conventional string payloads of a panic.
fn panic_message(payload: &(dyn core::any::Any + Send)) -> Option<String> {
    if let Some(message) = payload.downcast_ref::<&'static str>() {
        return Some((*message).to_owned());
    }

    payload.downcast_ref::<String>().cloned()
}

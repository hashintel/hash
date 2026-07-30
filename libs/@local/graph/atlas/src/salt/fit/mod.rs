//! The fit pipeline: one dataset in, one published generation out.
//!
//! [`fit`] runs every stage of one SALT fit over a [`Dataset`], writes each artifact into a staging
//! directory as its stage completes, and seals the result into an atomically published generation.
//! This module owns exactly the dataset-to-artifact plumbing; the stages themselves are libraries
//! under [`crate::salt`], consumed here.
//!
//! # Thread discipline
//!
//! The pipeline is split at the last dataset touch. [`ingest`] runs on the async runtime: it drains
//! the dataset's streams and the embedding provider into staged files. [`compute`] runs on the
//! rayon pool behind [`offload`], so the CPU-heavy stages never occupy a tokio runtime thread; a
//! stage panic surfaces as [`StageError::Panicked`] instead of poisoning the executor.
//!
//! # Memory discipline
//!
//! Every corpus-scale stage output is written to its staged file and mapped back before the next
//! stage reads it: owned `N`-scale values are construction-transient, dropped at stage exit, and
//! the pipeline's peak residency is one stage's working set, not the sum. The mapped views stay
//! cheap because their pages are freshly written and, under pressure, evictable. Config-bounded
//! `M`-scale values (the landmark selection, the quotient graph) stay resident within the run.
//!
//! # Seeds
//!
//! One seed enters through [`FitConfig`]; each randomized stage draws its generator from a named
//! derivation of it. Naming makes the derivation insertion-stable: adding or removing a stage never
//! shifts another stage's randomness, which a shared drawn-in-order stream cannot promise.
//!
//! # Failure
//!
//! Any stage error, failed admission check, or write failure aborts the run and publishes nothing;
//! the staging and scratch directories remove themselves - a compute-side panic unwinds through the
//! worker that owns them, removing them the same way. A generation therefore exists exactly when
//! every stage and every check of one run passed.

use core::{error::Error, fmt, num::NonZero};
use std::io::{self, Write as _};

use camino::Utf8Path;
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use self::prepare::norm;
pub(crate) use self::{
    annotations::SuppliedAnnotations,
    echo::FitConfigDef,
    error::{FitError, StageError},
    verdicts::SuppliedVerdicts,
};
use crate::{
    dataset::Dataset,
    file::{
        classifier::read::{ClassifierFile, OpenClassifierError},
        generation::{Generation, GenerationRoot, PublishedGeneration},
    },
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{AffinityCurve, NonNegative, Positive, UnitFraction},
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
        postings::build::PostingsConfig,
        projector::{
            budget::{Budget, BudgetOptions},
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
/// Every skeleton landmark anchors its node at the laid-out coordinate with this weight; the
/// anchor's radius is measured, not configured - the skeleton's own local ruler, the median layout
/// distance to its nearest skeleton neighbours, the same convention as the relation loss's local
/// scales. The unit weight is the neutral value: no evidence distinguishes landmark reliability
/// yet, and the per-anchor slot exists for the day it does.
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
/// Each field is a validated value; the struct is plain wiring. [`ratified`](Self::ratified) is the
/// stamped live configuration and the placement default.
///
/// The semantic affinity energy composes at stage entry from the fit's low-dimensional kernel and
/// [`affinity_offset`]: the projector objective and the landmark layout deliberately share one
/// curve. The composition rejects a curve whose exponent lies below the energy's
/// gradient-boundedness bound, aborting the fit before training.
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
    /// The logarithm offset of the semantic affinity energy, finite and strictly positive.
    ///
    /// It bounds the near-coincidence repulsion derivative, so it is a force ceiling, not a
    /// numerical crumb.
    pub affinity_offset: f32,
    /// The support-term constants shared by anchors and landmarks.
    pub support: SupportOptions,
    /// The per-node relation-gradient budget, enforced as a clamp or observed as diagnostics.
    ///
    /// The floor doubles as the relation budget of nodes whose semantic pairs are not co-drawn -
    /// in a sampled batch that is most of them - so it is sized to the typical per-draw semantic
    /// gradient, not to ε. An observed budget applies no clamp and keeps the floor as the
    /// diagnostics' baseline convention.
    pub budget: Budget,
    /// The objective coefficients' mass bases.
    ///
    /// The placement stage normalizes them at assembly: the semantic and ordinary bases divide by
    /// the corpus's total semantic edge weight, the hard-negative base by the row count, and the
    /// support bases by their pool sizes - so a configured base weighs the same objective share on
    /// every corpus. The relation base passes through: its estimator is already mass-free.
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
    /// The run is vacuous by construction - no radius to freeze, no reviewed verdicts demanded -
    /// while every other objective term trains and the published relation artifacts stay real. For
    /// corpora without reviewed-Proximal coverage that still want the full trained placement.
    pub vacuous: bool,
}

impl ProjectorOptions {
    /// Returns the ratified live configuration.
    ///
    /// Every value stamped for production training, schedule included.
    ///
    /// The value set, in brief: 20k steps with the boundary at 5k and refresh every 250; 2048-pair
    /// semantic and ordinary draws, 12 relation types capped at 256 edges, 512 hard queries and 512
    /// landmark anchors per step; mass bases `(1, 5, 1, 1, 0, 1)` normalized at assembly; budget
    /// floor `2e-4`, the typical per-draw semantic gradient under the normalization; affinity
    /// offset and lens/support guards at `1e-3` in units of the local rulers; Coincident radius
    /// `0.05`, safely below any plausible measured Proximal radius; mining margin 3; 65536-row
    /// forward slices, the measured GPU sweet spot (on the CPU backend it just means fewer, larger
    /// slices).
    #[must_use]
    pub(crate) const fn ratified() -> Self {
        Self {
            architecture: Architecture { .. },
            schedule: TrainingSchedule::new(
                NonZero::new(20_000).expect("the ratified step count is nonzero"),
                5_000,
                NonZero::new(250).expect("the ratified cadence is nonzero"),
                const {
                    UnitFraction::new(1.0e-3).expect("the ratified initial rate is a unit fraction")
                },
                const {
                    UnitFraction::new(1.0e-5).expect("the ratified minimum rate is a unit fraction")
                },
            )
            .expect("the ratified schedule is valid"),
            plan: BatchPlan {
                semantic_pairs: NonZero::new(2048).expect("the ratified draw is nonzero"),
                ordinary_pairs: 2048,
                relation_types: 12,
                relation_cap: NonZero::new(256).expect("the ratified cap is nonzero"),
                hard_queries: 512,
                landmark_anchors: 512,
                temporal_anchors: 0,
            },
            affinity_offset: 1.0e-3,
            support: SupportOptions::new(3.0, 1.0e-3)
                .expect("the ratified support constants are valid"),
            budget: Budget::Enforced(
                BudgetOptions::new(0.10, 0.10, 2.0e-4, 1.0e-12)
                    .expect("the ratified budget is valid"),
            ),
            coefficients: Coefficients::new(
                Positive::ONE,
                const { NonNegative::new(5.0).expect("the ratified repulsion is non-negative") },
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
                CoincidentEnergy::new(0.05, 1.0).expect("the ratified energy is valid"),
                const { Positive::new(0.25).expect("the ratified temperature is positive") },
                const { Positive::new(1.0e-3).expect("the ratified scale guard is positive") },
                None,
            )
            .expect("the ratified lens is valid"),
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
/// The default is the trained projector under the reference options: the conditioned model is the
/// pipeline's architecture, and the landmark baseline is the configured fallback - a placer for
/// fits that deliberately skip training.
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
/// Stage options keep their own documented defaults; the fields without defaults are the choices no
/// fit can imply: the seed, the landmark capacity, and the low-dimensional kernel.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct FitConfig {
    /// The fit's seed; every stage generator derives from it by name.
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
    /// How the canonical coordinates are produced.
    pub placement: PlacementOptions = PlacementOptions::Projector(ProjectorOptions::ratified()),
    /// The importance signal behind the delivery ranking.
    pub ranking: RankingConfig = RankingConfig::default(),
    /// The level-of-detail schedule.
    pub lod: LodConfig = LodConfig::default(),
    /// The postings representation split.
    pub postings: PostingsConfig = PostingsConfig::default(),
}

/// The randomized stages, each naming its seed derivation.
///
/// The name string is the derivation preimage and therefore pinned: renaming a variant never moves
/// a stage's randomness, only editing its pinned string does.
///
/// Crate-visible so measurement harnesses can replay one stage's exact stream: a sweep that
/// reproduces a live fit's draws measures the knob it varies, not a different random universe.
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

/// The supplied classifier artifact could not be admitted.
#[derive(Debug)]
pub enum ClassifierSupplyError {
    /// The file could not be read.
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
/// The fit consumes a fitted model either way: a supplied artifact passes through, and a supplied
/// annotation corpus is assembled and fitted inside the run, with the corpus document, the
/// embedding table, and the holdout evaluation staged and recorded beside the model.
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
    /// Returns a [`ClassifierSupplyError`] when the file cannot be read or does not hold a valid
    /// classifier.
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
/// The classifier input is required; the reviewed verdicts and the prior generation are optional
/// supplies whose absence the published metadata records.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Supplies<'fit> {
    /// The relation classifier's input: a fitted model, or the corpus to fit one from.
    pub classifier: &'fit ClassifierInput,
    /// The reviewed-verdicts document staged for the trainer's phase boundary.
    pub verdicts: Option<&'fit SuppliedVerdicts> = None,
    /// The generation seeding reuse.
    pub prior: Option<&'fit Generation> = None,
}

/// Runs one fit over the dataset and publishes the generation.
///
/// The stages run in the dataset's documented ingest order - nodes, edges, ontology - with every
/// artifact staged in place, so the returned generation is complete, durable, and verifiable
/// against its metadata document. Activation stays with the caller: publishing a generation and
/// serving it are separate decisions.
///
/// The `classifier` input resolves to a fitted model either way ([`ClassifierInput`]): a supplied
/// artifact passes through, and a supplied annotation corpus stages verbatim, assembles into the
/// classifier's training set, and fits inside the run, with the embedding table and the holdout
/// evaluation staged and recorded beside the model. The model classifies every relation type's
/// card, and the resolved policy table publishes beside it.
///
/// The `verdicts` are a supplied input in the policy-override category: a validated
/// reviewed-verdicts document ([`SuppliedVerdicts`]) staged verbatim as the generation's
/// `reviewed_verdicts` role for the trainer's phase boundary to consume. The fit itself never acts
/// on it; a fit run without one publishes with the role absent, and the manifest records the
/// absence.
///
/// A `prior` generation seeds reuse: card texts whose hash appears in its card table keep their
/// embeddings without touching the provider (under a matching embedder fingerprint), and its
/// landmarks compete for the retained share of the new selection, translated across snapshots
/// through the identity artifacts. The metadata records which generation seeded the run.
///
/// # Errors
///
/// Returns an error when the dataset or embedding provider fails ([`FitError::Dataset`],
/// [`FitError::Cards`], [`FitError::Embedding`]), an ingest write fails, or any compute stage
/// rejects its input, fails an admission check, or fails to write, map, or publish
/// ([`FitError::Stage`]). Nothing is published on any error.
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
            let file = role::write_staged(&staging, role::Role::ReviewedVerdicts, |writer| {
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
            let file = role::write_staged(&staging, role::Role::AnnotationCorpus, |writer| {
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
    let inputs = compute::Inputs {
        config: config.clone(),
        classifier,
        reviewed_verdicts,
        verdicts: verdicts.cloned(),
        prior: prior.cloned(),
    };

    // The compute half leaves this stack for the rayon pool, so it takes the observer's detached
    // half rather than a borrow the spawn cannot hold.
    let detached = progress.detach();
    let published = offload(move || {
        compute::run::<D::NodeId, D::OntologyId, P::Detached>(
            staging, &scratch, &inputs, ingested, &detached,
        )
    })
    .await?;

    Ok(published)
}

/// Runs compute-side work on the rayon pool, keeping the tokio runtime thread free.
///
/// The caller's span carries across, so stage spans keep their parent. A panic in the work unwinds
/// the worker - dropping the staging and scratch directories it owns, which remove themselves - and
/// surfaces as [`StageError::Panicked`]; the async executor never observes the unwind.
async fn offload<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, StageError> + Send + 'static,
) -> Result<T, StageError> {
    let span = tracing::Span::current();
    let (sender, receiver) = tokio::sync::oneshot::channel();

    rayon::spawn(move || {
        let _entered = span.entered();
        // The work owns everything it touches, and on unwind every
        // capture is dropped: no shared state survives to observe a
        // broken invariant.
        let result = std::panic::catch_unwind(core::panic::AssertUnwindSafe(work)).unwrap_or_else(
            |payload| {
                Err(StageError::Panicked {
                    message: panic_message(payload.as_ref()),
                })
            },
        );
        // Failing to send means the fit future was dropped; the result
        // has no recipient then.
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

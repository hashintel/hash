//! The fit pipeline: one dataset in, one published generation out.
//!
//! [`fit`] runs every stage of one SALT fit over a [`Dataset`], writes
//! each artifact into a staging directory as its stage completes, and
//! seals the result into an atomically published generation. This module
//! owns exactly the dataset-to-artifact plumbing; the stages themselves
//! are libraries under [`crate::salt`], consumed here.
//!
//! # Thread discipline
//!
//! The pipeline is split at the last dataset touch. [`ingest`] runs on
//! the async runtime: it drains the dataset's streams and the embedding
//! provider into staged files. [`compute`] runs on the rayon pool
//! behind [`offload`], so the CPU-heavy stages never occupy a tokio
//! runtime thread; a stage panic surfaces as
//! [`StageError::Panicked`] instead of poisoning the executor.
//!
//! # Memory discipline
//!
//! Every corpus-scale stage output is written to its staged file and
//! mapped back before the next stage reads it: owned `N`-scale values
//! are construction-transient, dropped at stage exit, and the pipeline's
//! peak residency is one stage's working set, not the sum. The mapped
//! views stay cheap because their pages are freshly written and, under
//! pressure, evictable. Config-bounded `M`-scale values (the landmark
//! selection, the quotient graph) stay resident within the run.
//!
//! # Seeds
//!
//! One seed enters through [`FitConfig`]; each randomized stage draws
//! its generator from a named derivation of it. Naming makes the
//! derivation insertion-stable: adding or removing a stage never shifts
//! another stage's randomness, which a shared drawn-in-order stream
//! cannot promise.
//!
//! # Failure
//!
//! Any stage error, failed admission check, or write failure aborts the
//! run and publishes nothing; the staging and scratch directories remove
//! themselves - a compute-side panic unwinds through the worker that
//! owns them, removing them the same way. A generation therefore exists
//! exactly when every stage and every check of one run passed.

use core::num::NonZero;
use std::io::Write as _;

use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use self::prepare::norm;
pub(crate) use self::{
    echo::FitConfigDef,
    error::{FitError, StageError},
    verdicts::SuppliedVerdicts,
};
use crate::{
    dataset::Dataset,
    file::generation::{Generation, GenerationRoot, PublishedGeneration},
    integrity::{Sha256, Update as _},
    math::AffinityCurve,
    salt::{
        embedding::CardEmbedder,
        importance::RankingConfig,
        knn::{self, hannoy::HannoyIndexOptions, recall},
        ladder::LadderOptions,
        landmark::{layout::LayoutOptions, quotient::QuotientOptions, select::SelectionOptions},
        lod::stage::LodConfig,
        policy::{CoincidentAdmission, PolicyOverride, classifier::Classifier},
        projector::{
            budget::BudgetOptions,
            loss::{CoincidentEnergy, SupportOptions},
            miner::MinerOptions,
            model::Architecture,
            train::{BatchPlan, Coefficients, RelationLens, TrainingSchedule},
        },
        relation::{attraction::AttractionOptions, protection::ProtectionConfig},
        semantic::SmoothingOptions,
    },
};

#[cfg(feature = "bench")]
pub mod bench;
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
/// The overrides supersede classifier predictions by precedence and
/// must name relation types the edge stream carries: an override for a
/// relation without edges contradicts the corpus and aborts the fit at
/// resolution.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct PolicyOptions {
    /// Higher-precedence policy records superseding classifier
    /// predictions.
    pub overrides: Vec<PolicyOverride> = Vec::new(),
    /// The generation's Coincident admission criteria.
    pub admission: CoincidentAdmission = CoincidentAdmission::default(),
}

const impl Default for PolicyOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// The landmark support anchors' shared constants.
///
/// Every skeleton landmark anchors its node at the laid-out coordinate
/// with this radius and weight; both are finite and strictly positive
/// by construction. The defaults are the reference pipeline's unit
/// radius and weight.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LandmarkSupport {
    radius: f32 = 1.0,
    weight: f32 = 1.0,
}

const impl Default for LandmarkSupport {
    fn default() -> Self {
        Self { .. }
    }
}

impl LandmarkSupport {
    /// Validates landmark support constants.
    ///
    /// Returns [`None`] unless both are finite and strictly positive.
    #[must_use]
    pub(crate) const fn new(radius: f32, weight: f32) -> Option<Self> {
        if !(radius.is_finite() && radius > 0.0) {
            return None;
        }
        if !(weight.is_finite() && weight > 0.0) {
            return None;
        }
        Some(Self { radius, weight })
    }

    /// Returns the anchor radius the residual is normalized by.
    #[inline]
    #[must_use]
    pub(crate) const fn radius(self) -> f32 {
        self.radius
    }

    /// Returns each anchor's mass in the support sum.
    #[inline]
    #[must_use]
    pub(crate) const fn weight(self) -> f32 {
        self.weight
    }
}

/// Every setting of the projector placement: the model, its training
/// run, and the condition ladder that publishes the canonical field.
///
/// Each field is a validated value; the struct is plain wiring. The
/// schedule is the one choice no fit can imply - how long to train -
/// so [`reference`](Self::reference) takes it and fills everything
/// else with the reference values.
///
/// The semantic affinity energy composes at stage entry from the
/// fit's low-dimensional kernel and [`affinity_offset`]: the projector
/// objective and the landmark layout deliberately share one curve. The
/// composition rejects a curve whose exponent lies below the energy's
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
    /// The logarithm offset of the semantic affinity energy, finite
    /// and strictly positive.
    pub affinity_offset: f32,
    /// The support-term constants shared by anchors and landmarks.
    pub support: SupportOptions,
    /// The per-node relation-gradient budget.
    pub budget: BudgetOptions,
    /// The objective coefficients.
    pub coefficients: Coefficients,
    /// The hard-negative mining schedule.
    pub miner: MinerOptions,
    /// The relation-lens constants.
    pub lens: RelationLens,
    /// The trainer's protection-channel thresholds.
    pub protection: ProtectionConfig,
    /// The landmark support anchors' constants.
    pub landmark_support: LandmarkSupport,
    /// Rows per corpus-forward slice, bounding the peak device memory
    /// of a whole-corpus pass.
    pub forward_rows: NonZero<usize>,
    /// The condition ladder and its canonical rung.
    pub ladder: LadderOptions,
}

impl ProjectorOptions {
    /// Returns the reference options under `schedule`.
    ///
    /// The values are the reference pipeline's, carried as unvalidated
    /// starting points, with three exceptions: the gradient budget uses
    /// the specification's `0.10` default candidate with
    /// `beta_+ = beta_R`; the relation draw is a fixed 32-type,
    /// 128-edge-cap split of the reference's 4096-edge budget (the
    /// reference divided it across the corpus's whole type universe,
    /// which no corpus-independent configuration can express); and
    /// hard-negative mining draws zero queries, as the reference
    /// shipped.
    #[must_use]
    pub(crate) const fn reference(schedule: TrainingSchedule) -> Self {
        Self {
            architecture: Architecture { .. },
            schedule,
            plan: BatchPlan {
                semantic_pairs: NonZero::new(4096).expect("the reference draw is nonzero"),
                ordinary_pairs: 4096,
                relation_types: 32,
                relation_cap: NonZero::new(128).expect("the reference cap is nonzero"),
                hard_queries: 0,
                landmark_anchors: 4096,
                temporal_anchors: 0,
            },
            affinity_offset: 1.0e-8,
            support: SupportOptions::new(1.0, 1.0e-8)
                .expect("the reference support constants are valid"),
            budget: BudgetOptions::new(0.10, 0.10, 1.0e-6, 1.0e-12)
                .expect("the reference budget is valid"),
            coefficients: Coefficients::new(1.0, 1.0, 1.0, 1.0, 0.0, 1.0)
                .expect("the reference coefficients are valid"),
            miner: MinerOptions::new(
                NonZero::new(8).expect("the reference quota is nonzero"),
                NonZero::new(32).expect("the reference margin is nonzero"),
                1.0,
                1.0,
            )
            .expect("the reference miner options are valid"),
            lens: RelationLens::new(
                CoincidentEnergy::new(0.5, 0.5).expect("the reference energy is valid"),
                0.25,
                1.0e-8,
                None,
            )
            .expect("the reference lens is valid"),
            protection: ProtectionConfig::default(),
            landmark_support: LandmarkSupport { .. },
            forward_rows: NonZero::new(4096).expect("the reference slice is nonzero"),
            ladder: LadderOptions { .. },
        }
    }
}

/// The reference step schedule: the legacy pipeline's 2000 steps and
/// learning-rate envelope, with the phase boundary at the midpoint
/// splitting the opening segment and the rung ladder evenly.
const REFERENCE_SCHEDULE: TrainingSchedule = TrainingSchedule::new(
    NonZero::new(2000).expect("the reference step count is nonzero"),
    1000,
    NonZero::new(100).expect("the reference cadence is nonzero"),
    1.0e-3,
    1.0e-5,
)
.expect("the reference schedule is valid");

/// How one fit produces its canonical coordinates.
///
/// The published metadata's `Placement` mirrors this configuration,
/// recording what actually ran. The default is the trained projector
/// under the reference options: the conditioned model is the
/// pipeline's architecture, and the landmark baseline is the
/// configured fallback - a placer for fits that deliberately skip
/// training.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum PlacementOptions {
    /// Every row takes its assigned landmark's layout coordinate: the
    /// 1-NN placement the landmark assignment already encodes.
    LandmarkBaseline,
    /// The trained conditioned projector places every row; the ladder
    /// measures the schedule and the canonical rung's aligned field
    /// publishes.
    Projector(ProjectorOptions),
}

/// Every setting of one fit, valid by construction.
///
/// Stage options keep their own documented defaults; the fields without
/// defaults are the choices no fit can imply: the seed, the landmark
/// capacity, and the low-dimensional kernel.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct FitConfig {
    /// The fit's seed; every stage generator derives from it by name.
    pub seed: u64,
    /// Landmark capacity and retention.
    pub selection: SelectionOptions,
    /// The fitted low-dimensional affinity kernel
    /// ([`AffinityCurve::fit`]).
    pub curve: AffinityCurve,
    /// The representation-contract spot check.
    pub norm_check: norm::SpotCheckOptions = norm::SpotCheckOptions::default(),
    /// Stored neighbours per row of the k-NN table.
    pub neighbours: NonZero<usize> = knn::DEFAULT_NEIGHBOURS,
    /// The HNSW backend serving the k-NN and assignment searches.
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
    pub placement: PlacementOptions =
        PlacementOptions::Projector(ProjectorOptions::reference(REFERENCE_SCHEDULE)),
    /// The importance signal behind the delivery ranking.
    pub ranking: RankingConfig = RankingConfig::default(),
    /// The level-of-detail schedule.
    pub lod: LodConfig = LodConfig::default(),
}

/// The randomized stages, each naming its seed derivation.
///
/// The name string is the derivation preimage and therefore pinned:
/// renaming a variant never moves a stage's randomness, only editing
/// its pinned string does.
///
/// Crate-visible so measurement harnesses can replay one stage's
/// exact stream: a sweep that reproduces a live fit's draws measures
/// the knob it varies, not a different random universe.
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

/// Derives one stage's generator from the fit seed and the stage's
/// pinned name.
///
/// The full 32-byte digest seeds the generator, so a derived stream
/// keeps the derivation's whole entropy.
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

/// Runs one fit over the dataset and publishes the generation.
///
/// The stages run in the dataset's documented ingest order - nodes,
/// edges, ontology - with every artifact staged in place, so the
/// returned generation is complete, durable, and verifiable against its
/// metadata document. Activation stays with the caller: publishing a
/// generation and serving it are separate decisions.
///
/// The `classifier` is a supplied input: a freshly fitted model or a
/// prior generation's artifact read back
/// ([`Classifier::from_artifact`]). It classifies every relation
/// type's card, and the resolved policy table publishes beside it.
///
/// The `verdicts` are a supplied input in the policy-override
/// category: a validated reviewed-verdicts document
/// ([`SuppliedVerdicts`]) staged verbatim as the generation's
/// `reviewed_verdicts` role for the trainer's phase boundary to
/// consume. The fit itself never acts on it; a fit run without one
/// publishes with the role absent, and the manifest records the
/// absence.
///
/// A `prior` generation seeds reuse: card texts whose hash appears in
/// its card table keep their embeddings without touching the provider
/// (under a matching embedder fingerprint), and its landmarks compete
/// for the retained share of the new selection, translated across
/// snapshots through the identity artifacts. The metadata records
/// which generation seeded the run.
///
/// # Errors
///
/// Returns an error when the dataset or embedding provider fails
/// ([`FitError::Dataset`], [`FitError::Cards`],
/// [`FitError::Embedding`]), an ingest write fails, or any compute
/// stage rejects its input, fails an admission check, or fails to
/// write, map, or publish ([`FitError::Stage`]). Nothing is published
/// on any error.
#[expect(
    clippy::future_not_send,
    reason = "the `Dataset` trait does not promise `Send` streams; the future's sendability \
              follows the dataset's"
)]
#[expect(
    clippy::significant_drop_tightening,
    reason = "the staging and scratch directories move into the compute closure whole; nothing \
              here can drop them earlier"
)]
pub(crate) async fn fit<D, E>(
    dataset: &D,
    embedder: &E,
    config: &FitConfig,
    classifier: &Classifier,
    verdicts: Option<&SuppliedVerdicts>,
    prior: Option<&Generation>,
    root: &GenerationRoot,
) -> Result<PublishedGeneration, FitError<D::Error, E::Error>>
where
    D: Dataset,
    E: CardEmbedder + Sync,
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

    let ingested = ingest::run(dataset, embedder, config, &staging, &scratch, prior).await?;

    // Everything after the last dataset touch is CPU-and-file work:
    // it crosses onto the rayon pool as one owned unit.
    let inputs = compute::Inputs {
        config: config.clone(),
        classifier: classifier.clone(),
        reviewed_verdicts,
        verdicts: verdicts.cloned(),
        prior: prior.cloned(),
    };
    let published =
        offload(move || compute::run::<D::NodeId>(staging, &scratch, &inputs, ingested)).await?;

    Ok(published)
}

/// Runs compute-side work on the rayon pool, keeping the tokio runtime
/// thread free.
///
/// The caller's span carries across, so stage spans keep their parent.
/// A panic in the work unwinds the worker - dropping the staging and
/// scratch directories it owns, which remove themselves - and surfaces
/// as [`StageError::Panicked`]; the async executor never observes the
/// unwind.
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

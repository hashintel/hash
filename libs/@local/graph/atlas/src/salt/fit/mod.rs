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
        landmark::{layout::LayoutOptions, quotient::QuotientOptions, select::SelectionOptions},
        lod::stage::LodConfig,
        policy::{CoincidentAdmission, PolicyOverride, classifier::Classifier},
        relation::attraction::AttractionOptions,
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
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
enum Stage {
    NormCheck,
    KnnLink,
    RecallCheck,
    LandmarkSelection,
    LandmarkAssignment,
    LandmarkLayout,
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
        }
    }
}

/// Derives one stage's generator from the fit seed and the stage's
/// pinned name.
///
/// The full 32-byte digest seeds the generator, so a derived stream
/// keeps the derivation's whole entropy.
fn stage_rng(seed: u64, stage: Stage) -> Xoshiro256PlusPlus {
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

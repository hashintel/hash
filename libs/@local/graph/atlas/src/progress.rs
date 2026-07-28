//! Observation of a running fit: the seam operator surfaces render from.
//!
//! [`Progress`] carries the pipeline's observations - stage boundaries, batch counters,
//! convergence readouts, quality probes - to whatever the operator is watching:
//! nothing, a log stream, or a live dashboard. The trait observes and never steers: every value
//! flows outward, and a run behaves identically under any observer. Each method has an empty
//! default body, so an observer implements exactly the observations it renders and the rest
//! monomorphize to no-ops that cost nothing.
//!
//! Observations travel as the pipeline's own types wherever one exists - [`CardEmbeddingStats`],
//! [`RecallSpotCheck`], [`LossBreakdown`], re-exported here - and as this module's observation
//! vocabulary ([`Stage`], [`Batch`], [`DescentIteration`], [`QualityMetric`]) where the pipeline
//! reports something no artifact records.
//!
//! An observer crosses the run's thread seams - the async ingest half and the rayon compute half -
//! so implementations are cloneable and shareable by construction; a renderer typically holds the
//! sending half of a channel and does its drawing elsewhere. Hot loops report at batch cadence,
//! never per row.
//!
//! [`NoProgress`] is the silent observer, for runs nothing watches.

use crate::math::Vec2;
pub use crate::salt::{CardEmbeddingStats, LossBreakdown, RecallSpotCheck};

/// One pipeline stage of a run, in the order the runner drives them.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(u8)]
pub enum Stage {
    /// Streaming the dataset and staging the ingest artifacts.
    Ingest,
    /// Acquiring the relation classifier: the supplied model, or the in-run fit.
    Classifier,
    /// Classifying every relation type's card and staging the policy table.
    Policy,
    /// Staging the adjacency artifact.
    Adjacency,
    /// Staging the relation attraction and protection artifacts.
    Relations,
    /// Constructing the neighbour table and measuring its recall.
    Knn,
    /// Staging the semantic graph.
    Semantic,
    /// Selecting and laying out the landmark skeleton.
    Landmarks,
    /// Training the placement (or placing at the landmark baseline).
    Projector,
    /// Staging the level-of-detail artifacts.
    Lod,
    /// Sealing the staged generation into its published form.
    Seal,
    /// Probing the published generation for the activation decision.
    Admission,
}

impl Stage {
    /// Every stage, in the order the runner drives them.
    ///
    /// A renderer showing the run's remaining work needs the order before the run reaches it, so
    /// the sequence is stated once here rather than inferred from arrival.
    pub const ALL: [Self; core::mem::variant_count::<Self>()] =
        core::array::from_fn(const |index| unsafe { core::mem::transmute(index as u8) });
}

/// One batched loop's position: `done` of `total` units covered.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct Batch {
    /// Units covered so far.
    pub done: usize,
    /// Units the loop will cover.
    pub total: usize,
}

/// One NN-Descent iteration's convergence reading.
///
/// The construction stops when `accepted_fraction` falls to `threshold`.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct DescentIteration {
    /// One-based index of the completed iteration.
    pub iteration: usize,
    /// Fraction of attempted neighbour updates the iteration accepted.
    pub accepted_fraction: f64,
    /// The convergence threshold the fraction is falling toward.
    pub threshold: f64,
}

/// One quality metric of the admission probe's six-threshold set.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum QualityMetric {
    /// The neighbour backend's measured recall.
    Recall,
    /// Neighbourhood trustworthiness.
    Trustworthiness,
    /// Neighbourhood continuity.
    Continuity,
    /// The intrusion rate.
    IntrusionRate,
    /// The density spread.
    DensitySpread,
    /// Triplet agreement.
    TripletAgreement,
}

/// The observer of one run's progress.
///
/// Every method is an observation the pipeline reports as it happens; none returns anything the
/// run acts on, with one deliberate exception:
/// [`projector_sample_size`](Self::projector_sample_size) is a capability probe whose value is the
/// observer's own appetite, not a lever over the run's result. The placement the run publishes is
/// identical under every observer.
#[expect(
    unused_variables,
    reason = "the default bodies observe nothing; the parameter names document each observation \
              for implementors"
)]
pub trait Progress {
    /// The card-embedding stage resolved its reuse split: `stats.reused` unique texts serve from
    /// the prior generation, `stats.embedded` go to the provider.
    fn embedding_started(&self, stats: &CardEmbeddingStats) {}

    /// The provider finished another embedding chunk.
    fn embedding_batch(&self, batch: Batch) {}

    /// The neighbour-table construction entered a named backend phase.
    ///
    /// The names are the backend's own open vocabulary (the HNSW backend reports its build
    /// steps), passed through verbatim.
    fn knn_build_phase(&self, phase: &str) {}

    /// The neighbour-table construction inserted another batch of rows.
    fn knn_insert(&self, batch: Batch) {}

    /// An NN-Descent iteration completed with its convergence reading.
    fn descent_iteration(&self, iteration: DescentIteration) {}

    /// The neighbour-table readback covered another batch of rows.
    fn knn_readback(&self, batch: Batch) {}

    /// The construction's measured recall against the exact reference sample.
    fn knn_recall(&self, check: &RecallSpotCheck) {}

    /// The projector finished training step `step` of `steps` at the reported loss.
    fn projector_step(&self, step: usize, steps: usize, loss: &LossBreakdown) {}

    /// How many placement rows the observer wants sampled into
    /// [`projector_snapshot`](Self::projector_snapshot) calls.
    ///
    /// The capability probe: `0` - the default - means the run never gathers a snapshot. The rows
    /// are chosen once at stage start - the landmark skeleton first, then an even stride over the
    /// corpus - and every snapshot reports those same rows moving. The choice draws no randomness,
    /// so an observer's appetite cannot move what the run publishes.
    fn projector_sample_size(&self) -> usize {
        0
    }

    /// The sampled placement positions at a training refresh; `positions[..landmarks]` are the
    /// landmark rows.
    fn projector_snapshot(&self, positions: &[Vec2], landmarks: usize) {}

    /// The classifier fit started over `folds` cross-validation folds.
    fn classifier_started(&self, folds: usize) {}

    /// One classifier cross-validation fold completed.
    fn classifier_fold_completed(&self, fold: usize) {}

    /// The admission probe measured one quality metric.
    fn quality_probe(&self, metric: QualityMetric, value: f64) {}

    /// A pipeline stage completed.
    fn stage_completed(&self, stage: Stage) {}
}

/// The silent observer: every observation is a no-op.
#[derive(Debug, Copy, Clone, Default, PartialEq, Eq)]
pub struct NoProgress;

impl Progress for NoProgress {}

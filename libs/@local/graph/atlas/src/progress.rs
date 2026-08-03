//! Observation of a running fit.
//!
//! [`Progress`] is the seam operator surfaces render from. It carries the pipeline's observations
//! to whatever the operator is watching, whether that is nothing, a log stream, or a live
//! dashboard. The observations are stage boundaries, batch counters, convergence readouts, and
//! quality probes. The trait observes and never steers. Every value flows outward, and a run
//! behaves identically under any observer. Each method has an empty default body, so an observer
//! implements exactly the observations it renders and the rest monomorphize to no-ops that cost
//! nothing.
//!
//! Observations travel as the pipeline's own types wherever one exists - [`CardEmbeddingStats`],
//! [`RecallSpotCheck`], [`LossBreakdown`], [`QualityMetric`], re-exported here - and as this
//! module's observation vocabulary ([`Stage`], [`Batch`], [`DescentIteration`]) where the pipeline
//! reports something no artifact records.
//!
//! An observer crosses the run's thread seams - the async ingest half and the rayon compute half -
//! so implementations are cloneable and shareable by construction; a renderer typically holds the
//! sending half of a channel and does its drawing elsewhere. Hot loops report at batch cadence,
//! never per row.
//!
//! [`NoProgress`] is the silent observer, for runs nothing watches.

use crate::{
    math::Vec2,
    salt::{
        embedding::CardEmbeddingStats, knn::recall::RecallSpotCheck,
        projector::train::LossBreakdown, quality::QualityMetric,
    },
};

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
    /// this constant states the sequence once instead of leaving a renderer to infer it from
    /// arrival.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the index runs over the variant count, an order of magnitude inside u8"
    )]
    pub const ALL: [Self; core::mem::variant_count::<Self>()] =
        // SAFETY: every variant is a unit variant of a `repr(u8)` enum. The discriminants are
        // therefore exactly `0..variant_count`, and `from_fn` calls the closure once per index of
        // that range.
        core::array::from_fn(const |index| unsafe { core::mem::transmute(index as u8) });

    /// The stage's name, in the vocabulary a run reports it under.
    ///
    /// One lowercase word per stage, so a log line, a rail row, and a report name the same stage
    /// the same way.
    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Ingest => "ingest",
            Self::Classifier => "classifier",
            Self::Policy => "policy",
            Self::Adjacency => "adjacency",
            Self::Relations => "relations",
            Self::Knn => "knn",
            Self::Semantic => "semantic",
            Self::Landmarks => "landmarks",
            Self::Projector => "projector",
            Self::Lod => "lod",
            Self::Seal => "seal",
            Self::Admission => "admission",
        }
    }
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
/// The construction stops when `accepted_per_entry` falls to `threshold`.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct DescentIteration {
    /// One-based index of the completed iteration.
    pub iteration: usize,
    /// Neighbour updates the iteration accepted, per stored list entry.
    ///
    /// Not a share of anything: a local join offers a pair to both sides and one iteration can
    /// displace the same entry more than once, so an early reading stands above `1`. The reading
    /// measures convergence. It falls as the lists stop changing.
    pub accepted_per_entry: f64,
    /// The convergence threshold the reading is falling toward.
    pub threshold: f64,
}

/// The observer of one run's progress.
///
/// Every method is an observation the pipeline reports as it happens; none returns anything the run
/// acts on, with one deliberate exception: [`projector_sample_size`](Self::projector_sample_size)
/// is a capability probe whose value is the observer's own appetite, not a lever over the run's
/// result. The placement the run publishes is identical under every observer.
#[expect(
    unused_variables,
    reason = "the default bodies observe nothing; the parameter names document each observation \
              for implementors"
)]
pub trait Progress {
    /// The observer a stage hands to machinery that owns its reporter.
    ///
    /// A backend that reports through a foreign builder cannot lend this observer. The builder
    /// takes its reporter by value and keeps it for the call. Each observer answers with whatever
    /// it can give away: [`NoProgress`] when nothing crosses, or a handle onto its own sink. What
    /// crosses observes exactly what that answer observes.
    type Detached: Progress + Send + Sync + 'static;

    /// Hands out this observer's detached half.
    fn detach(&self) -> Self::Detached;

    /// The card-embedding stage resolved its reuse split: `stats.reused` unique texts serve from
    /// the prior generation, `stats.embedded` go to the provider.
    fn embedding_started(&self, stats: &CardEmbeddingStats) {}

    /// The provider finished another embedding chunk.
    fn embedding_batch(&self, batch: Batch) {}

    /// The corpus assembly derived its near-duplicate boundary.
    fn assembly_boundary_derived(&self, epsilon: f64) {}

    /// The neighbour-table construction entered a named backend phase.
    ///
    /// The names are the backend's own open vocabulary (the HNSW backend reports its build steps),
    /// passed through verbatim.
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
    /// The capability probe: `0`, the default, means the run never gathers a snapshot. The run
    /// chooses the rows once at stage start, taking the landmark skeleton first and then an even
    /// stride over the corpus, and every snapshot reports those same rows moving. The choice draws
    /// no randomness, so an observer's appetite cannot move what the run publishes.
    fn projector_sample_size(&self) -> usize {
        0
    }

    /// The sampled placement positions at a training refresh.
    ///
    /// The landmark rows are `positions[..landmarks]`.
    fn projector_snapshot(&self, positions: &[Vec2], landmarks: usize) {}

    /// The classifier fit started over `folds` cross-validation folds.
    fn classifier_started(&self, folds: usize) {}

    /// One classifier cross-validation fold completed.
    fn classifier_fold_completed(&self, fold: usize) {}

    /// The classifier fit selected its regularization strength.
    fn classifier_regularization_selected(&self, regularization: f64) {}

    /// The admission probe measured one quality metric.
    fn quality_probe(&self, metric: QualityMetric, value: f64) {}

    /// A pipeline stage completed.
    fn stage_completed(&self, stage: Stage) {}
}

impl<T> Progress for &T
where
    T: Progress,
{
    type Detached = T::Detached;

    fn detach(&self) -> Self::Detached {
        T::detach(self)
    }

    fn embedding_started(&self, stats: &CardEmbeddingStats) {
        T::embedding_started(self, stats);
    }

    fn embedding_batch(&self, batch: Batch) {
        T::embedding_batch(self, batch);
    }

    fn assembly_boundary_derived(&self, epsilon: f64) {
        T::assembly_boundary_derived(self, epsilon);
    }

    fn knn_build_phase(&self, phase: &str) {
        T::knn_build_phase(self, phase);
    }

    fn knn_insert(&self, batch: Batch) {
        T::knn_insert(self, batch);
    }

    fn descent_iteration(&self, iteration: DescentIteration) {
        T::descent_iteration(self, iteration);
    }

    fn knn_readback(&self, batch: Batch) {
        T::knn_readback(self, batch);
    }

    fn knn_recall(&self, check: &RecallSpotCheck) {
        T::knn_recall(self, check);
    }

    fn projector_step(&self, step: usize, steps: usize, loss: &LossBreakdown) {
        T::projector_step(self, step, steps, loss);
    }

    fn projector_sample_size(&self) -> usize {
        T::projector_sample_size(self)
    }

    fn projector_snapshot(&self, positions: &[Vec2], landmarks: usize) {
        T::projector_snapshot(self, positions, landmarks);
    }

    fn classifier_started(&self, folds: usize) {
        T::classifier_started(self, folds);
    }

    fn classifier_fold_completed(&self, fold: usize) {
        T::classifier_fold_completed(self, fold);
    }

    fn classifier_regularization_selected(&self, regularization: f64) {
        T::classifier_regularization_selected(self, regularization);
    }

    fn quality_probe(&self, metric: QualityMetric, value: f64) {
        T::quality_probe(self, metric, value);
    }

    fn stage_completed(&self, stage: Stage) {
        T::stage_completed(self, stage);
    }
}

/// The silent observer, whose observations are all no-ops.
#[derive(Debug, Copy, Clone, Default, PartialEq, Eq)]
pub struct NoProgress;

impl Progress for NoProgress {
    type Detached = Self;

    fn detach(&self) -> Self {
        Self
    }
}

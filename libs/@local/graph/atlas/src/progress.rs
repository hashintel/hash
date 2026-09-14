//! Progress reports for fitting and generation admission.
//!
//! [`Progress`] receives observations during a run: [`Stage`] completion, [`Batch`] counters,
//! neighbour-list update rates and fit or quality measurements. Implement callbacks for the
//! observations your log or display needs, or use [`NoProgress`] to ignore them.
//!
//! Callbacks execute in the task reporting the observation. A display can enqueue observations for
//! another task to render, keeping its I/O off the fitting path. [`Progress::Detached`] provides an
//! owned observer for reporting work that cannot borrow the original observer.

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
    /// Every stage, in pipeline order.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the index runs over the variant count, an order of magnitude inside u8"
    )]
    pub const ALL: [Self; core::mem::variant_count::<Self>()] =
        // SAFETY: A fieldless `repr(u8)` enum has u8 layout and admits its declared discriminants.
        // These variants use consecutive implicit discriminants starting at zero, and `from_fn`
        // supplies exactly those indices. Therefore every converted index is a valid `Stage`
        // value.
        core::array::from_fn(const |index| unsafe { core::mem::transmute(index as u8) });

    /// Returns the lowercase name used in progress output.
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

/// One NN-Descent iteration's update-rate observation.
///
/// The constructor rounds the configured rate's count threshold up before comparing accepted
/// updates. It can also stop at its iteration limit. The reported `threshold` is the configured
/// rate before count rounding.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct DescentIteration {
    /// One-based index of the completed iteration.
    pub iteration: usize,
    /// Neighbour updates the iteration accepted, per stored list entry.
    ///
    /// A local join offers a pair to both neighbour lists, and an entry can change more than once
    /// in an iteration. The rate can exceed `1` and need not decrease between iterations.
    pub accepted_per_entry: f64,
    /// The configured update rate for the stopping criterion.
    pub threshold: f64,
}

/// An observer of stage completion and fit measurements.
///
/// Observation callbacks have no-op defaults. Override the callbacks your output needs and
/// implement [`detach`](Self::detach) to supply an owned observer. Callbacks return no fitting
/// decisions. [`projector_sample_size`](Self::projector_sample_size) controls snapshot gathering.
///
/// Reporting is synchronous. A callback's blocking work delays the reporting task, and a panic can
/// interrupt it. Some operations report from parallel workers, requiring a shared observer to
/// support concurrent callbacks.
#[expect(
    unused_variables,
    reason = "the default bodies observe nothing; the parameter names document each observation \
              for implementors"
)]
pub trait Progress {
    /// An owned observer for work that cannot borrow this observer.
    ///
    /// Use [`NoProgress`] when detached work needs no reporting. A reporting implementation can
    /// return an owned handle to the original observation destination.
    type Detached: Progress + Send + Sync + 'static;

    /// Returns an owned observer for independently reported work.
    fn detach(&self) -> Self::Detached;

    /// Reports the split between reusable and new card embeddings.
    ///
    /// `stats.reused` counts unique texts copied from the prior generation, and `stats.embedded`
    /// counts unique texts requiring the provider. This precedes provider work, including when no
    /// text needs embedding.
    fn embedding_started(&self, stats: &CardEmbeddingStats) {}

    /// Reports progress after an embedding chunk completes.
    fn embedding_batch(&self, batch: Batch) {}

    /// Reports the near-duplicate boundary derived during corpus assembly.
    fn assembly_boundary_derived(&self, epsilon: f64) {}

    /// Reports the start of a neighbour-index backend phase.
    ///
    /// Phase names use the backend's vocabulary without translation.
    fn knn_build_phase(&self, phase: &str) {}

    /// Reports progress through the index's input rows.
    ///
    /// The count tracks rows requested by the backend, not a committed transaction.
    fn knn_insert(&self, batch: Batch) {}

    /// Reports the update rate after an NN-Descent iteration.
    fn descent_iteration(&self, iteration: DescentIteration) {}

    /// Reports completed rows of the neighbour-table readback.
    ///
    /// Parallel workers can invoke this callback out of count order. `batch.done` counts completed
    /// rows rather than identifying a row.
    fn knn_readback(&self, batch: Batch) {}

    /// Reports measured neighbour recall against an exact reference sample.
    fn knn_recall(&self, check: &RecallSpotCheck) {}

    /// Reports the loss before a training step's optimizer update.
    ///
    /// `step` is zero-based within the full schedule, including during a resumed segment. `steps`
    /// is the schedule's total step count.
    fn projector_step(&self, step: usize, steps: usize, loss: &LossBreakdown) {}

    /// Requests the maximum number of placement rows in a snapshot.
    ///
    /// Returns `0` by default, disabling [`projector_snapshot`](Self::projector_snapshot) calls. A
    /// positive budget selects at most that many rows at the start of each training segment.
    /// Snapshots within that segment report positions for the same rows, with sampled landmarks
    /// first and non-landmark rows after them.
    ///
    /// Selection uses an even spread within each group and consumes no training randomness. The
    /// budget controls snapshot allocation and copying, not the rows used for training. Training
    /// still performs its refresh computations when the budget is zero.
    fn projector_sample_size(&self) -> usize {
        0
    }

    /// Reports sampled placement coordinates at a training refresh.
    ///
    /// `positions[..landmarks]` contains the sampled landmark positions. The remaining positions
    /// belong to non-landmark rows.
    fn projector_snapshot(&self, positions: &[Vec2], landmarks: usize) {}

    /// Reports progress through the sampled arrivals of a retrospective replay.
    fn replay_projection(&self, batch: Batch) {}

    /// Reports the start of classifier fitting over `folds` cross-validation folds.
    fn classifier_started(&self, folds: usize) {}

    /// Reports completion of the candidate fits for one cross-validation fold.
    ///
    /// `fold` is a zero-based index. Folds can complete out of index order.
    fn classifier_fold_completed(&self, fold: usize) {}

    /// Reports the regularization strength selected by classifier fitting.
    fn classifier_regularization_selected(&self, regularization: f64) {}

    /// Reports an admission metric's aggregate reading across the probe steps.
    fn quality_probe(&self, metric: QualityMetric, value: f64) {}

    /// Reports completion of a pipeline stage.
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

    fn replay_projection(&self, batch: Batch) {
        T::replay_projection(self, batch);
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

/// An observer that ignores progress and requests no snapshots.
#[derive(Debug, Copy, Clone, Default, PartialEq, Eq)]
pub struct NoProgress;

impl Progress for NoProgress {
    type Detached = Self;

    fn detach(&self) -> Self {
        Self
    }
}

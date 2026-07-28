//! Observation of a running fit: the seam operator surfaces render from.
//!
//! [`Progress`] carries the pipeline's observations - stage boundaries, batch counters,
//! convergence readouts, solver receipts, quality probes - to whatever the operator is watching:
//! nothing, a log stream, or a live dashboard. The trait observes and never steers: every value
//! flows outward, and a run behaves identically under any observer. Each method has an empty
//! default body, so an observer implements exactly the observations it renders and the rest
//! monomorphize to no-ops that cost nothing.
//!
//! An observer crosses the run's thread seams - the async ingest half and the rayon compute half -
//! so implementations are cloneable and shareable by construction; a renderer typically holds the
//! sending half of a channel and does its drawing elsewhere. Hot loops report at batch cadence,
//! never per row.
//!
//! [`NoProgress`] is the default observer, the silent one; [`crate::run::Options`] defaults to it.
//!
//! The solver observations travel as the solver's own receipt vocabulary, re-exported here:
//! [`OuterReceipt`] and the types its fields carry.

use core::fmt;

pub use crate::salt::{
    CandidateOutcome, CgTag, CurvatureDiagnostic, OuterOutcome, OuterReceipt, WorkCounters,
};

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
pub trait Progress: fmt::Debug + Clone + Send + Sync + 'static {
    /// The card-embedding stage started: `cards` unique texts, `misses` of them going to the
    /// provider, `reused` served from the prior generation.
    fn embedding_started(&self, cards: usize, misses: usize, reused: usize) {}

    /// The provider finished another embedding chunk: `done` of `total` texts are embedded.
    fn embedding_batch(&self, done: usize, total: usize) {}

    /// The neighbour-table construction entered a named backend phase.
    fn knn_build_phase(&self, phase: &'static str) {}

    /// The neighbour-table construction inserted another batch: `done` of `total` rows.
    fn knn_insert(&self, done: usize, total: usize) {}

    /// An NN-Descent iteration completed with its acceptance fraction against the convergence
    /// threshold.
    fn descent_iteration(&self, iteration: usize, accepted_fraction: f64, threshold: f64) {}

    /// The neighbour-table readback covered another batch: `done` of `rows` rows.
    fn knn_readback(&self, done: usize, rows: usize) {}

    /// The construction's measured recall against the exact reference sample.
    fn knn_recall(&self, recall: f64) {}

    /// The projector finished a training step at the reported objective value.
    fn projector_step(&self, step: usize, steps: usize, objective: f64) {}

    /// How many placement rows the observer wants sampled into
    /// [`projector_snapshot`](Self::projector_snapshot) calls.
    ///
    /// The capability probe: `0` - the default - means the run never gathers a snapshot. The
    /// sample is chosen once at stage start from the run's seed, so every snapshot reports the
    /// same rows moving.
    fn projector_sample_size(&self) -> usize {
        0
    }

    /// The sampled placement positions at a training refresh; `positions[..landmarks]` are the
    /// landmark rows.
    fn projector_snapshot(&self, positions: &[(f32, f32)], landmarks: usize) {}

    /// The classifier fit started over `folds` cross-validation folds.
    fn classifier_started(&self, folds: usize) {}

    /// The solver finished an outer iteration of one fold; the receipt is the solver's own
    /// digest-only record.
    fn solver_outer(&self, fold: usize, receipt: &OuterReceipt) {}

    /// One classifier cross-validation fold completed.
    fn classifier_fold_completed(&self, fold: usize) {}

    /// The admission probe measured a named quality metric.
    fn quality_probe(&self, probe: &'static str, value: f64) {}

    /// A pipeline stage completed, named by its stage span.
    fn stage_completed(&self, stage: &'static str) {}
}

/// The silent observer: every observation is a no-op.
#[derive(Debug, Copy, Clone, Default, PartialEq, Eq)]
pub struct NoProgress;

impl Progress for NoProgress {}

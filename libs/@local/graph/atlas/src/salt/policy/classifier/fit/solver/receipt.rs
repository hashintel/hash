//! Digest-only diagnostic receipts of solver work.
//!
//! Routine receipts carry scalar summaries, tags, counters, norms, dots, reductions, ratios,
//! and SHA-256 digests of the solver's vectors - never the vectors themselves. One
//! [`OuterReceipt`] is emitted for every started outer iteration at the moment its start is
//! counted, and its [`OuterOutcome`] fields populate at reached outer-stage boundaries: an
//! iteration that dies inside a stage keeps that stage's fields [`None`], while the work
//! counters and the run terminal preserve the failed stage's work. Digests commit to the exact
//! accepted bytes under the exposed [`ReceiptCoordinates`] identity: a replay in the same
//! environment reproduces them bit-for-bit, and any drift names the first iteration that
//! diverged.

use zerocopy::IntoBytes as _;

use super::{SOLVER_DIMENSIONS, cg::CgTag, work::WorkCounters};
use crate::{
    integrity::{Sha256, Sha256Digest, Update as _},
    math::AlignedDVecN,
};

/// The start-state receipt of one started outer iteration and its completion facts.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) struct OuterReceipt {
    /// One-based index of the started outer iteration.
    pub outer_iteration: u64,
    /// Trust radius entering the iteration.
    pub radius: f64,
    /// Accepted objective entering the iteration.
    pub objective: f64,
    /// Accepted scaled-gradient norm entering the iteration.
    pub gradient_norm: f64,
    /// Digest of the accepted point `ζ`.
    pub zeta_digest: Sha256Digest,
    /// Digest of the accepted scaled gradient.
    pub gradient_digest: Sha256Digest,
    /// Counter snapshot at emission.
    pub counters: WorkCounters,
    /// Completion facts populated at reached outer-stage boundaries.
    pub outcome: OuterOutcome,
}

/// The candidate classification of one outer iteration.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) enum CandidateOutcome {
    /// The trial objective was not finite; the candidate was rejected.
    RejectedNonFinite,
    /// The acceptance ratio fell below its threshold; the candidate was rejected.
    RejectedByRatio,
    /// The candidate was accepted and committed.
    Accepted,
    /// The ratio accepted the candidate, but its fresh gradient was not finite.
    AcceptedGradientNonFinite,
}

/// The accepted-step curvature diagnostic; a failure is a recorded reason, never a terminal.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) enum CurvatureDiagnostic {
    /// The accepted-step curvature: the dot `p·y` and its normalization `(p·y) / (p·p)`.
    Value {
        /// The dot `p·y` with `y = g_trial − g`.
        along: f64,
        /// The normalized curvature `(p·y) / (p·p)`.
        normalized: f64,
    },
    /// The gradient difference `y` had a non-finite component.
    NonFiniteDifference,
    /// A curvature dot did not stay finite.
    NonFiniteDot,
    /// The normalization did not stay finite.
    NonFiniteNormalization,
}

/// Completion facts of one outer iteration, populated at reached outer-stage boundaries.
///
/// Inner-step fields populate once the inner solve returns, candidate fields once the trial is
/// priced, and the curvature diagnostic on acceptance; every field of a stage the iteration
/// never completed stays [`None`]. Work performed inside a failed stage is preserved by the
/// counters and the run terminal, not here. A recorded scalar that failed its own finiteness is
/// also [`None`]; the terminal outcome of the run names the failure.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(super) struct OuterOutcome {
    /// The inner CG outcome tag.
    pub tag: Option<CgTag>,
    /// Norm of the returned step `‖p‖`.
    pub step_norm: Option<f64>,
    /// Norm of the returned product `‖Hp‖`.
    pub hessian_step_norm: Option<f64>,
    /// The dot `g·p` of the accepted gradient with the step.
    pub gradient_step: Option<f64>,
    /// The dot `p·Hp` of the step with its product.
    pub step_curvature: Option<f64>,
    /// The predicted model reduction `−g·p − ½·p·Hp`.
    pub predicted_reduction: Option<f64>,
    /// The actual reduction `F̄ − F̄_trial`.
    pub actual_reduction: Option<f64>,
    /// The acceptance ratio `ρ`.
    pub ratio: Option<f64>,
    /// The candidate classification.
    pub candidate: Option<CandidateOutcome>,
    /// The accepted-step curvature diagnostic.
    pub curvature: Option<CurvatureDiagnostic>,
}

/// The exposed coordinate/version identity of one run's receipts and digests.
///
/// Archived digest bytes are not self-describing; this value names the digest version and the
/// coordinate system that generated them. The domain tag and declared dimension are
/// byte-identical to the prefix of every digest preimage; the coordinate system is separately
/// exposed by this identity and does not enter the preimage.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct ReceiptCoordinates {
    /// The digest preimage domain tag, naming the receipt/digest version.
    pub domain_tag: &'static str,
    /// The coordinate system of every digested vector.
    pub coordinate_system: &'static str,
    /// The declared flat dimension of every digested vector.
    pub dimensions: u64,
}

impl ReceiptCoordinates {
    /// The identity of receipts and digests produced by this solver.
    pub(super) const CURRENT: Self = Self {
        domain_tag: "salt-policy-classifier-solver-flat-v1",
        coordinate_system: "scaled-helmert-v1-contrast-major",
        dimensions: SOLVER_DIMENSIONS as u64,
    };
}

/// The digest of a flat solver vector: the domain tag, the declared dimension, then every
/// component's bits in vector order.
#[expect(
    clippy::little_endian_bytes,
    reason = "the digest preimage is pinned to canonical little-endian bytes on every platform"
)]
pub(super) fn vector_digest(vector: &AlignedDVecN<SOLVER_DIMENSIONS>) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(ReceiptCoordinates::CURRENT.domain_tag.as_bytes());
    hasher.update(&ReceiptCoordinates::CURRENT.dimensions.to_le_bytes());
    hasher.update(vector.as_bytes());
    hasher.finalize()
}

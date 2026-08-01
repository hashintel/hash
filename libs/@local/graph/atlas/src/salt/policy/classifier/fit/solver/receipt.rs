//! Diagnostic receipts of solver work, stored only for an explicit debugging consumer.
//!
//! A routine fit stores no receipts. Its solve returns the outcome, control state, counters, and
//! certificate alone ([`ReceiptDetail::None`]), and skips the diagnostic-only arithmetic behind
//! receipt fields. Under a debugging request ([`ReceiptDetail::Digests`]) the solve stores one
//! [`OuterReceipt`] for every started outer iteration at the moment it counts that start, and the
//! receipt's [`OuterOutcome`] fields populate at reached outer-stage boundaries. An iteration that
//! dies inside a stage keeps that stage's fields [`None`], while the work counters and the run
//! terminal preserve the failed stage's work.
//!
//! Receipts carry scalar summaries - tags, counters, norms, dots, reductions, ratios - and SHA-256
//! digests of the solver's vectors, never the vectors themselves. Digests commit to the exact
//! accepted bytes under the exposed [`ReceiptCoordinates`] identity: a replay in the same
//! environment reproduces them bit-for-bit, and any drift names the first iteration that diverged.

use zerocopy::IntoBytes as _;

use super::{SOLVER_DIMENSIONS, newton::NewtonTag, work::WorkCounters};
use crate::{
    integrity::{Sha256, Sha256Digest, Update as _},
    math::AlignedDVecN,
};

/// Whether a solve stores diagnostic receipts.
///
/// Receipts serve an explicit debugging consumer; the routine fit stores none and returns the
/// outcome, control state, counters, and certificate alone.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ReceiptDetail {
    /// No stored receipts: the routine posture.
    None,
    /// One receipt per started outer iteration, start-state digests included: a debugging
    /// consumer's request.
    Digests,
}

/// SHA-256 digests of one outer iteration's accepted start state.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct StartDigests {
    /// Digest of the accepted point `ζ`.
    pub zeta: Sha256Digest,
    /// Digest of the accepted scaled gradient.
    pub gradient: Sha256Digest,
}

/// The start-state receipt of one started outer iteration and its completion facts.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct OuterReceipt {
    /// One-based index of the started outer iteration.
    pub outer_iteration: u64,
    /// Trust radius entering the iteration.
    pub radius: f64,
    /// Accepted objective entering the iteration.
    pub objective: f64,
    /// Accepted scaled-gradient norm entering the iteration.
    pub gradient_norm: f64,
    /// SHA-256 digests of the accepted start state.
    pub digests: StartDigests,
    /// Counter snapshot at emission.
    pub counters: WorkCounters,
    /// Completion facts populated at reached outer-stage boundaries.
    pub outcome: OuterOutcome,
}

/// The candidate classification of one outer iteration.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum CandidateOutcome {
    /// The iteration rejected the candidate because the trial objective was not finite.
    RejectedNonFinite,
    /// The iteration rejected the candidate because the acceptance ratio fell below its threshold.
    RejectedByRatio,
    /// The iteration accepted the candidate and committed it.
    Accepted,
    /// The ratio accepted the candidate, but its fresh gradient was not finite.
    AcceptedGradientNonFinite,
}

/// The accepted-step curvature diagnostic; a failure is a recorded reason, never a terminal.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum CurvatureDiagnostic {
    /// The accepted-step curvature, given as the dot `p·y` and its normalization `(p·y) / (p·p)`.
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
/// Inner-step fields populate once the inner solve returns, candidate fields once the solve prices
/// the trial, and the curvature diagnostic on acceptance. Every field of a stage the iteration
/// never completed stays [`None`]. The counters and the run terminal record the work performed
/// inside a failed stage. A recorded scalar that failed its own finiteness is also [`None`], and
/// the terminal outcome of the run names the failure.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct OuterOutcome {
    /// The inner Newton outcome tag.
    pub tag: Option<NewtonTag>,
    /// The relative Newton residual `‖Hζ·p_N + gζ‖/‖gζ‖` of the priced Newton point: the per-outer
    /// certificate of the factorization against the oracle.
    pub newton_residual: Option<f64>,
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
/// Archived digest bytes are not self-describing, so this value names the digest version and the
/// coordinate system that generated them. The domain tag and declared dimension are byte-identical
/// to the prefix of every digest preimage. This identity exposes the coordinate system on its own,
/// and the coordinate system does not enter the preimage.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ReceiptCoordinates {
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
        domain_tag: "salt-policy-classifier-solver-flat-v2",
        coordinate_system: "scaled-helmert-v1-contrast-major",
        dimensions: SOLVER_DIMENSIONS as u64,
    };
}

/// The digest of a flat solver vector: the domain tag's UTF-8 bytes, the declared dimension, then
/// every component in vector order, both as native in-memory bytes.
///
/// Digest identity is environment-scoped. A replay in the same environment reproduces the bytes
/// bit-for-bit, and byte identity does not extend across builds or architectures.
pub(super) fn vector_digest(vector: &AlignedDVecN<SOLVER_DIMENSIONS>) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(ReceiptCoordinates::CURRENT.domain_tag.as_bytes());
    hasher.update(ReceiptCoordinates::CURRENT.dimensions.as_bytes());
    hasher.update(vector.as_bytes());
    hasher.finalize()
}

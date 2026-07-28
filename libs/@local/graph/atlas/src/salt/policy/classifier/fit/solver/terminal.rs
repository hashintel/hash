//! Typed terminal failures of the bounded solve.
//!
//! Every way a solve ends short of a certified minimizer is a named [`SolverFailure`]: an
//! exhausted resource budget, a reduction indistinguishable from rounding noise, or arithmetic
//! that left the finite domain. Failures carry enough structure to be matched on - a non-finite
//! CG value names its [`CgStage`] - and none of them publishes a model. Validation failures
//! before the solve live with their owners, [`SolverConfigError`](super::config::SolverConfigError)
//! and [`PreparationError`](super::prepare::PreparationError).

/// The stage of the CG recurrence where a value left the finite domain.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum CgStage {
    /// A component of the Hessian-vector product `Hζ[d]`.
    HvpVector,
    /// A residual, direction, product, or step norm.
    Norm,
    /// A residual square `r·r`.
    Dot,
    /// The curvature `d·h` or its guard scale.
    Curvature,
    /// The step length `α = r·r / κ`.
    Alpha,
    /// A component of the residual update `r − α·h`.
    Residual,
    /// The conjugacy coefficient `β = r'·r' / r·r`.
    Beta,
    /// A component of the direction update `r' + β·d`.
    Direction,
    /// A component of the step updates `p + α·d` or `Hp + α·h`.
    Update,
}

/// A typed non-publishing terminal of one solve.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum SolverFailure {
    /// Starting another outer iteration would exceed its budget.
    OuterIterationBudget,
    /// Starting another CG iteration would exceed its per-outer budget.
    CgIterationBudget,
    /// Another Hessian-vector product would exceed its budget.
    HvpBudget,
    /// Another objective request would exceed its budget net of the final reserve.
    ObjectiveRequestBudget,
    /// Another gradient request would exceed its budget net of the final reserve.
    GradientRequestBudget,
    /// Another row traversal would exceed its budget net of the final reserve.
    RowPassBudget,
    /// Consecutive rejected candidates reached their budget.
    RejectedStepBudget,
    /// The predicted reduction is within the accepted objective's resolution.
    ResolutionStall,
    /// The accepted objective admits no valid resolution.
    ResolutionScaleOverflow,
    /// A candidate was rejected at the minimum trust radius.
    RadiusUnderflow,
    /// The accepted scaled-gradient norm is not finite.
    NonFiniteAcceptedGradientNorm,
    /// A CG value left the finite domain at the named stage.
    NonFiniteCg {
        /// The recurrence stage that produced the non-finite value.
        stage: CgStage,
    },
    /// No finite positive boundary crossing could be constructed.
    NoFiniteBoundaryStep,
    /// A ratio-accepted candidate's fresh gradient is not finite.
    NonFiniteAcceptedCandidateGradient,
    /// The reserved final evaluation produced a non-finite objective, gradient, or norm.
    FinalCertificationNonFinite,
    /// The reserved final evaluation no longer satisfies the gradient certificate.
    FinalCertificateMismatch,
    /// The gradient-certificate threshold could not be derived.
    GradientThresholdOverflow,
    /// The predicted reduction is non-finite or not positive.
    InvalidPredictedReduction,
    /// The actual reduction or acceptance ratio is not finite.
    InvalidAcceptanceRatio,
}

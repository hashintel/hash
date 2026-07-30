//! Typed terminal failures of the bounded solve.
//!
//! Every way a solve ends short of a certified minimizer is a named [`SolverFailure`]: an
//! exhausted resource budget, a reduction indistinguishable from rounding noise, or arithmetic
//! that left the finite domain. Failures carry enough structure to be matched on - a non-finite
//! Newton value names its [`NewtonStage`] - and none of them publishes a model. Validation
//! failures before the solve live with their owners,
//! [`SolverConfigError`](super::config::SolverConfigError)
//! and [`PreparationError`](super::prepare::PreparationError).

/// The stage of the exact Newton solve where a value left the finite domain.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum NewtonStage {
    /// A per-row curvature block, its weighted factor, or the physical gradient.
    Weights,
    /// A capacitance entry `I + ŨᵀŨ`.
    Capacitance,
    /// The capacitance Cholesky factor.
    Factor,
    /// A capacitance solve output.
    Solve,
    /// The intercept Schur system or its solution.
    InterceptSchur,
    /// The assembled Newton point, its scaled image, or its priced Hessian product.
    NewtonPoint,
    /// The dogleg fallback's Cauchy curvature, guard, or steepest-descent arithmetic.
    Dogleg,
}

/// A typed non-publishing terminal of one solve.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum SolverFailure {
    /// Starting another outer iteration would exceed its budget.
    OuterIterationBudget,
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
    /// A Newton value left the finite domain at the named stage.
    NonFiniteNewton {
        /// The solve stage that produced the non-finite value.
        stage: NewtonStage,
    },
    /// The intercept Schur system is not positive-definite: no row carries interior
    /// probabilities, so the corpus offers the intercepts no curvature.
    SingularInterceptCurvature,
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

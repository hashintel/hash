//! Typed terminal failures of the bounded solve.
//!
//! Every way a solve ends short of a certified minimizer is a named [`SolverFailure`]. The named
//! ways are an exhausted iteration budget, a reduction indistinguishable from rounding noise, and
//! arithmetic that left the finite domain. Each failure carries the structure a match arm needs,
//! and a non-finite Newton value names its [`NewtonStage`]. None of them publishes a model.
//! Validation failures before the solve live with their owners,
//! [`SolverConfigError`](super::config::SolverConfigError) and
//! [`PreparationError`](super::prepare::PreparationError).

/// The stage of the exact Newton solve where a value left the finite domain.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum NewtonStage {
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
pub(crate) enum SolverFailure {
    /// Starting another outer iteration would exceed its budget.
    OuterIterationBudget,
    /// The predicted reduction is within the accepted objective's resolution.
    ResolutionStall,
    /// The accepted objective admits no valid resolution.
    ResolutionScaleOverflow,
    /// The iteration rejected a candidate at the minimum trust radius.
    RadiusUnderflow,
    /// The accepted scaled-gradient norm is not finite.
    NonFiniteAcceptedGradientNorm,
    /// A Newton value left the finite domain at the named stage.
    NonFiniteNewton {
        /// The solve stage that produced the non-finite value.
        stage: NewtonStage,
    },
    /// The intercept Schur system is not positive-definite: no row carries interior probabilities,
    /// so the corpus offers the intercepts no curvature.
    SingularInterceptCurvature,
    /// The boundary search found no finite positive crossing.
    NoFiniteBoundaryStep,
    /// A ratio-accepted candidate's fresh gradient is not finite.
    NonFiniteAcceptedCandidateGradient,
    /// The final certificate evaluation produced a non-finite objective, gradient, or norm.
    FinalCertificationNonFinite,
    /// The final certificate evaluation no longer satisfies the gradient certificate.
    FinalCertificateMismatch,
    /// The predicted reduction is non-finite or not positive.
    InvalidPredictedReduction,
    /// The actual reduction or acceptance ratio is not finite.
    InvalidAcceptanceRatio,
}

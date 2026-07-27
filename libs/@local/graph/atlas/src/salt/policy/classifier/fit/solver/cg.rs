//! The bounded Steihaug conjugate-gradient inner solve.
//!
//! One inner solve minimizes the local quadratic model over the trust region: starting from
//! `p₀ = 0`, `Hp₀ = 0`, `r₀ = −gζ`, `d₀ = r₀`, it iterates the CG recurrence in scaled
//! coordinates until the residual meets `‖r‖ ≤ tol·‖r₀‖`, the iterate reaches the trust
//! boundary, or the curvature `d·h` falls to its ulp guard - the latter two advancing to a
//! validated [`BoundaryStep`] without division. Successful outcomes return the step together
//! with its Hessian product, so the outer machine never charges a fresh Hessian-vector product
//! to price a returned step.
//!
//! Work is bounded before it happens: each iteration tests, in order, the per-solve CG budget,
//! the Hessian-vector-product budget, and the unreserved row-traversal budget, and every
//! arithmetic escape is a typed [`SolverFailure`] naming its [`CgStage`].

use core::num::NonZeroU32;

use super::{
    ContrastVector, SOLVER_DIMENSIONS,
    boundary::{BoundaryStep, boundary_step},
    flat,
    problem::ScaledProblem,
    solve::SolverControl,
    stable::{ordered_dot, stable_l2},
    terminal::{CgStage, SolverFailure},
};
use crate::math::{AlignedDVecN, BoxedDVecN};

/// The terminating tag of a successful inner solve.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) enum CgTag {
    /// The residual met its relative tolerance strictly inside the trust region.
    ResidualConverged,
    /// The iterate reached the trust boundary.
    TrustBoundary,
    /// The curvature fell to its guard.
    CurvatureGuardBoundary,
}

/// A successful inner outcome: the step, its Hessian product, and the terminating tag.
#[derive(Debug)]
pub(super) enum CgOutcome {
    /// The residual met its relative tolerance strictly inside the trust region.
    ResidualConverged {
        /// The interior step `p`.
        step: BoxedDVecN<SOLVER_DIMENSIONS>,
        /// The matching product `Hp`.
        hessian_step: BoxedDVecN<SOLVER_DIMENSIONS>,
    },
    /// The iterate reached the trust boundary; the payload is the validated crossing.
    TrustBoundary(BoundaryStep),
    /// The curvature fell to its guard; the payload is the validated crossing.
    CurvatureGuardBoundary(BoundaryStep),
}

impl CgOutcome {
    /// The returned step `p` in scaled coordinates.
    pub(super) const fn step(&self) -> &BoxedDVecN<SOLVER_DIMENSIONS> {
        match self {
            Self::ResidualConverged { step, .. } => step,
            Self::TrustBoundary(boundary) | Self::CurvatureGuardBoundary(boundary) => {
                &boundary.step
            }
        }
    }

    /// The matching product `Hp` returned with the step.
    pub(super) const fn hessian_step(&self) -> &BoxedDVecN<SOLVER_DIMENSIONS> {
        match self {
            Self::ResidualConverged { hessian_step, .. } => hessian_step,
            Self::TrustBoundary(boundary) | Self::CurvatureGuardBoundary(boundary) => {
                &boundary.hessian_step
            }
        }
    }

    /// Whether the outcome carries a validated boundary crossing.
    pub(super) const fn is_boundary(&self) -> bool {
        matches!(
            self,
            Self::TrustBoundary(_) | Self::CurvatureGuardBoundary(_)
        )
    }

    /// The terminating tag of the outcome.
    pub(super) const fn tag(&self) -> CgTag {
        match self {
            Self::ResidualConverged { .. } => CgTag::ResidualConverged,
            Self::TrustBoundary(_) => CgTag::TrustBoundary,
            Self::CurvatureGuardBoundary(_) => CgTag::CurvatureGuardBoundary,
        }
    }
}

/// The typed non-finite failure of one CG stage.
const fn non_finite(stage: CgStage) -> SolverFailure {
    SolverFailure::NonFiniteCg { stage }
}

/// Advances the interior iterate to the boundary or fails with the typed outcome.
pub(super) fn crossing(
    step: &AlignedDVecN<SOLVER_DIMENSIONS>,
    direction: &AlignedDVecN<SOLVER_DIMENSIONS>,
    hessian_step: &AlignedDVecN<SOLVER_DIMENSIONS>,
    hessian_direction: &AlignedDVecN<SOLVER_DIMENSIONS>,
    radius: f64,
    boundary_residual_ulps: NonZeroU32,
) -> Result<BoundaryStep, SolverFailure> {
    boundary_step(
        step,
        direction,
        hessian_step,
        hessian_direction,
        radius,
        boundary_residual_ulps,
    )
    .ok_or(SolverFailure::NoFiniteBoundaryStep)
}

/// Runs one bounded Steihaug CG solve at the accepted point.
///
/// `point` is the physical image `θ(ζ)` of the accepted iterate and `gradient` its scaled
/// gradient. The residual test runs first each iteration and equality returns; the budgets are
/// tested in declared order before the Hessian-vector product is charged; boundary contact has
/// precedence over residual convergence.
///
/// # Errors
///
/// Returns [`SolverFailure::CgIterationBudget`], [`SolverFailure::HvpBudget`], or
/// [`SolverFailure::RowPassBudget`] when another iteration would exceed its budget,
/// [`SolverFailure::NonFiniteCg`] naming the stage where a value left the finite domain, and
/// [`SolverFailure::NoFiniteBoundaryStep`] when a boundary crossing could not be validated.
pub(super) fn bounded_steihaug_cg(
    problem: &ScaledProblem<'_>,
    point: &ContrastVector,
    gradient: &AlignedDVecN<SOLVER_DIMENSIONS>,
    control: &mut SolverControl,
) -> Result<CgOutcome, SolverFailure> {
    let config = &problem.config;

    let mut step = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    let mut hessian_step = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    let mut residual = flat::negated(gradient);
    let mut direction = residual.clone();

    let residual_base = stable_l2(residual.as_array()).ok_or(non_finite(CgStage::Norm))?;
    // The tolerance is fixed against the initial residual; both factors are finite.
    let tolerance = config.relative_cg_residual_tolerance * residual_base;

    let mut started: u64 = 0;
    loop {
        // The residual test runs first; equality returns.
        let residual_norm = stable_l2(residual.as_array()).ok_or(non_finite(CgStage::Norm))?;
        if residual_norm <= tolerance {
            return Ok(CgOutcome::ResidualConverged { step, hessian_step });
        }

        // Budgets in declared order: CG starts, HVP requests, unreserved row traversals. Every
        // maximum is inclusive - a request fails only when it would exceed it.
        if started == config.maximum_cg_iterations {
            return Err(SolverFailure::CgIterationBudget);
        }
        if control.counters.hvp_requests == config.maximum_hvp_requests {
            return Err(SolverFailure::HvpBudget);
        }
        if control.free_row_traversals(config) < 1 {
            return Err(SolverFailure::RowPassBudget);
        }
        started += 1;

        let hessian_direction = problem.hessian_vector(point, &direction, &mut control.counters);
        if !flat::all_finite(&hessian_direction) {
            return Err(non_finite(CgStage::HvpVector));
        }

        let curvature = ordered_dot(direction.as_array(), hessian_direction.as_array())
            .ok_or(non_finite(CgStage::Curvature))?;
        let direction_norm = stable_l2(direction.as_array()).ok_or(non_finite(CgStage::Norm))?;
        let product_norm =
            stable_l2(hessian_direction.as_array()).ok_or(non_finite(CgStage::Norm))?;
        let guard = f64::from(config.curvature_guard_ulps.get())
            * f64::EPSILON
            * direction_norm
            * product_norm;
        if !guard.is_finite() {
            return Err(non_finite(CgStage::Curvature));
        }

        // Non-positive curvature within the guard: advance to the boundary without division.
        if curvature <= guard {
            let crossed = crossing(
                &step,
                &direction,
                &hessian_step,
                &hessian_direction,
                control.radius,
                config.boundary_residual_ulps,
            )?;
            return Ok(CgOutcome::CurvatureGuardBoundary(crossed));
        }

        let residual_square = ordered_dot(residual.as_array(), residual.as_array())
            .ok_or(non_finite(CgStage::Dot))?;
        let alpha = residual_square / curvature;
        if !alpha.is_finite() {
            return Err(non_finite(CgStage::Alpha));
        }

        let next_step = flat::advance(&step, alpha, &direction);
        let next_hessian_step = flat::advance(&hessian_step, alpha, &hessian_direction);
        if !flat::all_finite(&next_step) || !flat::all_finite(&next_hessian_step) {
            return Err(non_finite(CgStage::Update));
        }

        // Boundary contact has precedence over residual convergence.
        let step_norm = stable_l2(next_step.as_array()).ok_or(non_finite(CgStage::Norm))?;
        if step_norm >= control.radius {
            let crossed = crossing(
                &step,
                &direction,
                &hessian_step,
                &hessian_direction,
                control.radius,
                config.boundary_residual_ulps,
            )?;
            return Ok(CgOutcome::TrustBoundary(crossed));
        }

        let next_residual = flat::advance(&residual, -alpha, &hessian_direction);
        if !flat::all_finite(&next_residual) {
            return Err(non_finite(CgStage::Residual));
        }
        let next_residual_norm =
            stable_l2(next_residual.as_array()).ok_or(non_finite(CgStage::Norm))?;
        if next_residual_norm <= tolerance {
            return Ok(CgOutcome::ResidualConverged {
                step: next_step,
                hessian_step: next_hessian_step,
            });
        }

        let next_residual_square = ordered_dot(next_residual.as_array(), next_residual.as_array())
            .ok_or(non_finite(CgStage::Dot))?;
        let beta = next_residual_square / residual_square;
        if !beta.is_finite() {
            return Err(non_finite(CgStage::Beta));
        }
        let next_direction = flat::advance(&next_residual, beta, &direction);
        if !flat::all_finite(&next_direction) {
            return Err(non_finite(CgStage::Direction));
        }

        step = next_step;
        hessian_step = next_hessian_step;
        residual = next_residual;
        direction = next_direction;
    }
}

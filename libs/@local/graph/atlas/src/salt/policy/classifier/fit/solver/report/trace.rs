//! The instrumented conjugate-gradient replay and its Ritz spectrum extraction.
//!
//! [`traced_cg`] re-runs the inner CG recurrence of one outer iteration with the production
//! arithmetic - the same fused componentwise advances over the same operands in the same order -
//! but without budget or boundary exits, so the quadratic can be explored past the production
//! allowance. Beside the recurrence it computes, per iteration, the true residual
//! `−g − H·p` from one fresh Hessian-vector product over the accumulated step: the gap between
//! the recursive residual and the true residual separates a conditioning stall (the two track
//! each other while converging slowly) from rounding drift (the recursion reports a residual the
//! iterate no longer has). The fresh product reads the iterate and never feeds the recurrence,
//! so the recursive iterates are bit-identical to a production solve's over the shared prefix.
//!
//! [`ritz_values`] reads the recurrence coefficients back as the Lanczos tridiagonal and
//! extracts its full eigenvalue set by Sturm bisection: the Ritz values approximate the scaled
//! Hessian's spectrum as sampled by the Krylov space, and their distribution names the
//! conditioning - a smeared continuum of small curvatures against a clustered spectrum.

use super::super::{
    ContrastVector, SOLVER_DIMENSIONS, flat,
    problem::ScaledProblem,
    stable::{checked_dot, checked_norm_squared, stable_l2},
    work::WorkCounters,
};
use crate::math::{AlignedDVecN, BoxedDVecN};

/// One traced CG iteration: the recurrence coefficients and both residual readings.
#[derive(Debug, Copy, Clone)]
pub(super) struct TraceIteration {
    /// One-based iteration index.
    pub iteration: u64,
    /// The step length `α = ‖r‖² / (d·Hd)`.
    pub alpha: f64,
    /// The direction coefficient `β = ‖r₊‖² / ‖r‖²`; absent when the iteration terminated the
    /// recurrence before computing one.
    pub beta: Option<f64>,
    /// Norm of the accumulated step after the update.
    pub step_norm: f64,
    /// Norm of the recursively updated residual after the update.
    pub recursive_residual_norm: f64,
    /// Norm of the true residual `−g − H·p` at the updated step, from a fresh Hessian-vector
    /// product; NaN when the fresh product left the finite domain.
    pub true_residual_norm: f64,
    /// Norm of the gap between the recursive and the true residual; NaN with the true residual.
    pub residual_gap: f64,
}

/// Why the traced recurrence stopped.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) enum TraceTermination {
    /// The recursive residual met the production tolerance.
    Converged {
        /// The meeting iteration.
        iteration: u64,
    },
    /// The trace depth ran out before the residual met the tolerance.
    DepthExhausted,
    /// The curvature `d·Hd` fell to the production guard; the recurrence has no next step.
    CurvatureGuard {
        /// The failing iteration.
        iteration: u64,
        /// The guarded curvature value.
        curvature: f64,
    },
    /// A recurrence value left the finite domain.
    NonFinite {
        /// The failing iteration.
        iteration: u64,
    },
}

/// The instrumented replay of one inner CG solve.
#[derive(Debug)]
pub(super) struct CgTrace {
    /// The initial residual norm `‖r₀‖ = ‖g‖`.
    pub residual_base: f64,
    /// The production convergence target `tol·‖r₀‖`.
    pub tolerance: f64,
    /// One record per completed iteration.
    pub iterations: Vec<TraceIteration>,
    /// Why the recurrence stopped.
    pub termination: TraceTermination,
    /// First iteration whose accumulated step reached the trust radius, where a production
    /// solve would have crossed to the boundary; the trace continues through it.
    pub boundary_contact: Option<u64>,
}

impl CgTrace {
    /// The Lanczos coefficient prefix `(α₁ … α_m, β₁ … β_{m−1})` of the recorded recurrence.
    pub(super) fn krylov_coefficients(&self) -> (Vec<f64>, Vec<f64>) {
        let alphas: Vec<f64> = self.iterations.iter().map(|entry| entry.alpha).collect();
        let betas: Vec<f64> = self
            .iterations
            .iter()
            .take(alphas.len().saturating_sub(1))
            .map(|entry| {
                entry
                    .beta
                    .expect("every non-final traced iteration computed its direction coefficient")
            })
            .collect();
        (alphas, betas)
    }
}

/// Replays the inner CG recurrence at one accepted outer state, tracing every iteration.
///
/// `point` is the physical image of the accepted iterate, `gradient` its scaled gradient, and
/// `radius` the outer iteration's trust radius - the boundary is recorded, never enforced. The
/// recurrence runs until the production tolerance, the curvature guard, a non-finite value, or
/// `depth` iterations. The fresh per-iteration Hessian-vector product behind the true residual
/// charges `counters` like any other; the recurrence itself matches the production inner solve
/// byte-for-byte over the shared prefix.
#[expect(
    clippy::too_many_lines,
    reason = "the traced recurrence mirrors the production inner loop stage for stage, and \
              splitting it would divorce the mirror from its original"
)]
pub(super) fn traced_cg(
    problem: &ScaledProblem<'_>,
    point: &ContrastVector,
    gradient: &AlignedDVecN<SOLVER_DIMENSIONS>,
    radius: f64,
    depth: u64,
    counters: &mut WorkCounters,
) -> CgTrace {
    let config = &problem.config;

    let mut step = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    let mut hessian_step = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    let negated_gradient = flat::negated(gradient);
    let mut residual = negated_gradient.clone();
    let mut direction = residual.clone();

    let residual_base =
        stable_l2(&residual).expect("the traced outer state carries a finite gradient");
    let tolerance = config.relative_cg_residual_tolerance.get() * residual_base;

    let mut iterations = Vec::new();
    let mut boundary_contact = None;
    let mut termination = TraceTermination::DepthExhausted;

    for iteration in 1..=depth {
        let Some(residual_norm) = stable_l2(&residual) else {
            termination = TraceTermination::NonFinite { iteration };
            break;
        };
        if residual_norm <= tolerance {
            termination = TraceTermination::Converged {
                iteration: iteration - 1,
            };
            break;
        }

        let Some(hessian_direction) = problem
            .hessian_vector(point, &direction, counters)
            .filter(|product| product.is_finite())
        else {
            termination = TraceTermination::NonFinite { iteration };
            break;
        };

        let (Some(curvature), Some(direction_norm), Some(product_norm)) = (
            checked_dot(&direction, &hessian_direction),
            stable_l2(&direction),
            stable_l2(&hessian_direction),
        ) else {
            termination = TraceTermination::NonFinite { iteration };
            break;
        };
        let guard = f64::from(config.curvature_guard_ulps.get())
            * f64::EPSILON
            * direction_norm
            * product_norm;
        if !guard.is_finite() {
            termination = TraceTermination::NonFinite { iteration };
            break;
        }
        if curvature <= guard {
            termination = TraceTermination::CurvatureGuard {
                iteration,
                curvature,
            };
            break;
        }

        let Some(residual_square) = checked_norm_squared(&residual) else {
            termination = TraceTermination::NonFinite { iteration };
            break;
        };
        let alpha = residual_square / curvature;
        if !alpha.is_finite() {
            termination = TraceTermination::NonFinite { iteration };
            break;
        }

        let next_step = flat::advance(&step, alpha, &direction);
        let next_hessian_step = flat::advance(&hessian_step, alpha, &hessian_direction);
        if !next_step.is_finite() || !next_hessian_step.is_finite() {
            termination = TraceTermination::NonFinite { iteration };
            break;
        }

        let Some(step_norm) = stable_l2(&next_step) else {
            termination = TraceTermination::NonFinite { iteration };
            break;
        };
        let next_residual = flat::advance(&residual, -alpha, &hessian_direction);
        if !next_residual.is_finite() {
            termination = TraceTermination::NonFinite { iteration };
            break;
        }
        if boundary_contact.is_none() && step_norm >= radius {
            boundary_contact = Some(iteration);
        }

        // The true residual reads the iterate through one fresh product; a failure darkens the
        // diagnostic columns without touching the recurrence.
        let (true_residual_norm, residual_gap) = problem
            .hessian_vector(point, &next_step, counters)
            .filter(|product| product.is_finite())
            .map_or((f64::NAN, f64::NAN), |fresh_product| {
                let true_residual = flat::advance(&negated_gradient, -1.0, &fresh_product);
                let gap = flat::advance(&next_residual, -1.0, &true_residual);
                (
                    stable_l2(&true_residual).unwrap_or(f64::NAN),
                    stable_l2(&gap).unwrap_or(f64::NAN),
                )
            });

        let Some(next_residual_norm) = stable_l2(&next_residual) else {
            termination = TraceTermination::NonFinite { iteration };
            break;
        };

        let converged = next_residual_norm <= tolerance;
        let beta = if converged {
            None
        } else {
            let Some(next_residual_square) = checked_norm_squared(&next_residual) else {
                termination = TraceTermination::NonFinite { iteration };
                break;
            };
            let beta = next_residual_square / residual_square;
            if !beta.is_finite() {
                termination = TraceTermination::NonFinite { iteration };
                break;
            }
            Some(beta)
        };

        iterations.push(TraceIteration {
            iteration,
            alpha,
            beta,
            step_norm,
            recursive_residual_norm: next_residual_norm,
            true_residual_norm,
            residual_gap,
        });

        if converged {
            termination = TraceTermination::Converged { iteration };
            break;
        }

        let Some(beta) = beta else {
            unreachable!("a non-converged iteration computed its direction coefficient")
        };
        let next_direction = flat::advance(&next_residual, beta, &direction);
        if !next_direction.is_finite() {
            termination = TraceTermination::NonFinite { iteration };
            break;
        }

        step = next_step;
        hessian_step = next_hessian_step;
        residual = next_residual;
        direction = next_direction;
    }

    CgTrace {
        residual_base,
        tolerance,
        iterations,
        termination,
        boundary_contact,
    }
}

/// Extracts the Ritz values from the CG coefficients by Sturm bisection, ascending.
///
/// The Lanczos tridiagonal of the recurrence has diagonal `1/α_j + β_{j−1}/α_{j−1}` (first
/// entry `1/α_1`) and off-diagonal `√β_j / α_j`; its eigenvalues are the Ritz approximations of
/// the operator's spectrum over the Krylov space, one value per completed iteration. Returns
/// [`None`] for an empty recurrence.
///
/// # Panics
///
/// Panics when the coefficient counts disagree with one recurrence (`betas` must be one
/// shorter than `alphas`) or a coefficient is not finite and positive for `alphas` /
/// non-negative for `betas`.
pub(super) fn ritz_values(alphas: &[f64], betas: &[f64]) -> Option<Vec<f64>> {
    if alphas.is_empty() {
        return None;
    }
    assert_eq!(
        betas.len() + 1,
        alphas.len(),
        "one recurrence carries one fewer direction coefficient than step lengths",
    );
    assert!(
        alphas.iter().all(|alpha| alpha.is_finite() && *alpha > 0.0)
            && betas.iter().all(|beta| beta.is_finite() && *beta >= 0.0),
        "the recurrence coefficients are in the positive-curvature domain",
    );

    let order = alphas.len();
    let mut diagonal = vec![0.0_f64; order];
    let mut offdiagonal = vec![0.0_f64; order.saturating_sub(1)];
    diagonal[0] = alphas[0].recip();
    for j in 1..order {
        diagonal[j] = alphas[j].recip() + betas[j - 1] / alphas[j - 1];
        offdiagonal[j - 1] = betas[j - 1].sqrt() / alphas[j - 1];
    }

    // Gershgorin bounds enclose every eigenvalue.
    let mut lower = f64::INFINITY;
    let mut upper = f64::NEG_INFINITY;
    for j in 0..order {
        let left = if j == 0 {
            0.0
        } else {
            offdiagonal[j - 1].abs()
        };
        let right = offdiagonal.get(j).map_or(0.0, |edge| edge.abs());
        lower = lower.min(diagonal[j] - left - right);
        upper = upper.max(diagonal[j] + left + right);
    }

    Some(
        (0..order)
            .map(|index| bisect_eigenvalue(&diagonal, &offdiagonal, index, lower, upper))
            .collect(),
    )
}

/// Bisects for the `index`-th smallest eigenvalue inside the enclosing interval.
fn bisect_eigenvalue(
    diagonal: &[f64],
    offdiagonal: &[f64],
    index: usize,
    mut lower: f64,
    mut upper: f64,
) -> f64 {
    // Bisection to floating-point resolution: the interval stops splitting once its midpoint
    // reproduces an endpoint.
    loop {
        let midpoint = f64::midpoint(lower, upper);
        if midpoint <= lower || midpoint >= upper {
            return midpoint;
        }
        if count_below(diagonal, offdiagonal, midpoint) <= index {
            lower = midpoint;
        } else {
            upper = midpoint;
        }
    }
}

/// Counts the eigenvalues strictly below `x` through the Sturm pivot recurrence.
fn count_below(diagonal: &[f64], offdiagonal: &[f64], x: f64) -> usize {
    let mut count = 0;
    let mut pivot = 1.0_f64;
    for (j, &entry) in diagonal.iter().enumerate() {
        let edge_square = if j == 0 {
            0.0
        } else {
            offdiagonal[j - 1] * offdiagonal[j - 1]
        };
        pivot = entry - x - edge_square / pivot;
        // A vanished pivot means `x` is an exact leading-submatrix eigenvalue; nudging it
        // positive keeps the count consistent and bisection resolves the boundary.
        if pivot == 0.0 {
            pivot = f64::MIN_POSITIVE;
        }
        if pivot < 0.0 {
            count += 1;
        }
    }
    count
}

//! Validated steps onto the numerical trust-region boundary.
//!
//! When the inner CG solve leaves the trust region or meets non-positive curvature, its step is
//! the interior iterate advanced to the boundary: the positive `τ` with `‖(p + τd)/Δ‖ = 1`. The
//! crossing is found in radius-normalized coordinates `u = p/Δ`, `v = d/Δ` through the
//! cancellation-free quadratic root `q = −½·(b + copysign(√(b² − 4ac), b))`, and the construction
//! is validated rather than trusted: the normalized step must land within
//! `boundary_residual_ulps · ulp(1)` of unit norm both as built and as returned after the radius
//! rescaling. The matching Hessian product extends along the same `τ`, so a boundary step never
//! charges a fresh Hessian-vector product.
//!
//! Every arithmetic escape - a non-finite normalization, coefficient, discriminant, root, or
//! product - returns [`None`]; the caller maps [`None`] onto its typed no-finite-boundary-step
//! failure.

use core::num::NonZeroU32;

use super::{
    SOLVER_DIMENSIONS, flat,
    stable::{ordered_dot, stable_l2},
};
use crate::math::{AlignedDVecN, BoxedDVecN};

/// A validated step onto the numerical trust-region boundary.
///
/// The step's radius-normalized norm lies within `boundary_residual_ulps · ulp(1)` of one, and
/// the product rides the same crossing, so later logic trusts the tag carrying this payload
/// instead of re-deriving boundary contact from a fresh norm.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct BoundaryStep {
    /// The boundary step `p + τ·d` in scaled coordinates.
    pub step: BoxedDVecN<SOLVER_DIMENSIONS>,
    /// The matching Hessian product `H·p + τ·H·d`.
    pub hessian_step: BoxedDVecN<SOLVER_DIMENSIONS>,
}

/// Advances an interior iterate to the numerical trust-region boundary.
///
/// Normalizes `u = p/Δ` and `v = d/Δ`, solves `‖u + τv‖² = 1` as `aτ² + bτ + c = 0` with
/// `a = v·v`, `b = 2·u·v`, `c = u·u − 1` (the interior iterate keeps `c < 0`, so exactly one
/// root is positive), and picks the finite positive `τ` from the paired roots `q/a` and `c/q`.
/// The built `u + τv` and the returned `(Δ·(u + τv))/Δ` must both lie within
/// `boundary_residual_ulps · ulp(1)` of unit norm.
///
/// Returns [`None`] when any normalization, coefficient, discriminant, root, boundary norm, or
/// extended Hessian product falls outside its domain; the caller maps [`None`] onto its typed
/// failure.
pub(super) fn boundary_step(
    interior: &AlignedDVecN<SOLVER_DIMENSIONS>,
    direction: &AlignedDVecN<SOLVER_DIMENSIONS>,
    hessian_interior: &AlignedDVecN<SOLVER_DIMENSIONS>,
    hessian_direction: &AlignedDVecN<SOLVER_DIMENSIONS>,
    radius: f64,
    boundary_residual_ulps: NonZeroU32,
) -> Option<BoundaryStep> {
    // u = p/Δ and v = d/Δ, rejected on any non-finite quotient.
    let normalized_interior = normalize(interior, radius)?;
    let normalized_direction = normalize(direction, radius)?;

    let quadratic = ordered_dot(
        normalized_direction.as_array(),
        normalized_direction.as_array(),
    )?;
    let linear = 2.0
        * ordered_dot(
            normalized_interior.as_array(),
            normalized_direction.as_array(),
        )?;
    let constant = ordered_dot(
        normalized_interior.as_array(),
        normalized_interior.as_array(),
    )? - 1.0;
    if !linear.is_finite() || quadratic <= 0.0 || constant >= 0.0 {
        return None;
    }

    let discriminant = linear.mul_add(linear, -4.0 * quadratic * constant);
    if !discriminant.is_finite() || discriminant < 0.0 {
        return None;
    }

    let root = -0.5 * (linear + discriminant.sqrt().copysign(linear));
    if !root.is_finite() || root == 0.0 {
        return None;
    }

    // With c < 0 the roots q/a and c/q carry opposite signs; the selection order is fixed so a
    // degenerate pair still resolves deterministically.
    let crossing = [root / quadratic, constant / root]
        .into_iter()
        .find(|tau| tau.is_finite() && *tau > 0.0)?;

    // ulp(1) is exactly f64::EPSILON; a u32 count times 2⁻⁵² stays far inside the finite range.
    let tolerance = f64::from(boundary_residual_ulps.get()) * f64::EPSILON;

    let boundary = flat::advance(&normalized_interior, crossing, &normalized_direction);
    let norm = stable_l2(boundary.as_array())?;
    if (norm - 1.0).abs() > tolerance {
        return None;
    }

    let mut step = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    for (out, &component) in step.as_array_mut().iter_mut().zip(boundary.as_array()) {
        *out = radius * component;
    }

    // Revalidate the step exactly as a consumer would read it back: divided by the radius, the
    // rounding of the rescaling roundtrip must still sit inside the boundary tolerance.
    let returned = normalize(&step, radius)?;
    let returned_norm = stable_l2(returned.as_array())?;
    if (returned_norm - 1.0).abs() > tolerance {
        return None;
    }

    let hessian_step = flat::advance(hessian_interior, crossing, hessian_direction);
    flat::all_finite(&hessian_step).then_some(BoundaryStep { step, hessian_step })
}

/// Divides every component by the radius, rejecting a non-finite quotient.
fn normalize(
    vector: &AlignedDVecN<SOLVER_DIMENSIONS>,
    radius: f64,
) -> Option<BoxedDVecN<SOLVER_DIMENSIONS>> {
    let mut normalized = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    for (out, &component) in normalized.as_array_mut().iter_mut().zip(vector.as_array()) {
        let quotient = component / radius;
        if !quotient.is_finite() {
            return None;
        }
        *out = quotient;
    }
    Some(normalized)
}

//! Validated steps onto the numerical trust-region boundary.
//!
//! When the inner solve's step leaves the trust region, the returned step is an interior
//! iterate advanced to the boundary: the positive `τ` with `‖(p + τd)/Δ‖ = 1`. The
//! construction finds the crossing in radius-normalized coordinates `u = p/Δ`, `v = d/Δ` through
//! the cancellation-free quadratic root `q = −½·(b + copysign(√(b² − 4ac), b))`, and it then checks
//! its own result, requiring the normalized step to lie within the gross-defect guard of unit norm
//! both as built and as returned after the radius rescaling. The matching Hessian product extends
//! along the same `τ`, so a boundary step never charges a fresh Hessian-vector product.
//!
//! Every arithmetic escape - a non-finite normalization, coefficient, discriminant, root, or
//! product - returns [`None`]; the caller maps [`None`] onto its typed no-finite-boundary-step
//! failure.

use super::{SOLVER_DIMENSIONS, flat};
use crate::math::{AlignedDVecN, BoxedDVecN, DPositive, DVecN};

/// Unit-norm residual guard of the boundary construction: `2⁻⁴⁰` of unit norm.
///
/// The guard names one bug class: gross non-root τ defects (mis-built coefficients or signs,
/// collapsed discriminants, catastrophic cancellation) whose residuals sit at the
/// square-root-of-epsilon scale or far above. Exact root-sign selection belongs to the
/// finite-positive-τ rule instead, because either mathematical root lies on the unit boundary.
/// Honest striped-fold rounding stays orders of magnitude below the guard, and the margin is
/// asymmetric by intent. A false abort costs a production fit, while the final gradient certificate
/// still gates any drift the guard admits. The exact value is an implementation choice that no
/// configuration exposes, no file persists, and no cross-target identity depends on.
pub(super) const GROSS_DEFECT_GUARD: f64 = 4096.0 * f64::EPSILON;

/// A validated step onto the numerical trust-region boundary.
///
/// The step's radius-normalized norm lies within the gross-defect guard of one, and the product
/// rides the same crossing, so later logic trusts the tag carrying this payload instead of
/// re-deriving boundary contact from a fresh norm.
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
/// [`GROSS_DEFECT_GUARD`] of unit norm.
///
/// Returns [`None`] when any normalization, coefficient, discriminant, root, boundary norm, or
/// extended Hessian product falls outside its domain. The caller maps [`None`] onto its typed
/// failure.
pub(super) fn boundary_step(
    interior: &AlignedDVecN<SOLVER_DIMENSIONS>,
    direction: &AlignedDVecN<SOLVER_DIMENSIONS>,
    hessian_interior: &AlignedDVecN<SOLVER_DIMENSIONS>,
    hessian_direction: &AlignedDVecN<SOLVER_DIMENSIONS>,
    radius: DPositive,
) -> Option<BoundaryStep> {
    // u = p/Δ and v = d/Δ, rejected on any non-finite quotient.
    let normalized_interior = normalize(interior, radius)?;
    let normalized_direction = normalize(direction, radius)?;

    let quadratic = normalized_direction.checked_norm_squared()?.positive()?;
    let linear = 2.0 * normalized_interior.checked_dot(&normalized_direction)?;
    let constant = normalized_interior.checked_norm_squared()? - 1.0;
    if !linear.is_finite() || constant >= 0.0 {
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

    // With c < 0 the roots q/a and c/q carry opposite signs. The selection order never varies, so a
    // degenerate pair still resolves deterministically.
    let crossing = [root / quadratic, constant / root]
        .into_iter()
        .find_map(DPositive::new)?;

    let boundary = flat::advance(&normalized_interior, crossing.into(), &normalized_direction);
    let norm = boundary.checked_stable_l2()?;
    if (norm - 1.0).abs() > GROSS_DEFECT_GUARD {
        return None;
    }

    let mut step = boundary;
    *step *= radius;

    // Revalidate the step exactly as a consumer would read it back: divided by the radius, the
    // rounding of the rescaling roundtrip must still sit inside the gross-defect guard.
    let returned = normalize(&step, radius)?;
    let returned_norm = returned.checked_stable_l2()?;
    if (returned_norm - 1.0).abs() > GROSS_DEFECT_GUARD {
        return None;
    }

    let hessian_step = flat::advance(hessian_interior, crossing.into(), hessian_direction);
    hessian_step
        .is_finite()
        .then_some(BoundaryStep { step, hessian_step })
}

/// Divides every component by the radius, rejecting a non-finite quotient.
fn normalize(
    vector: &AlignedDVecN<SOLVER_DIMENSIONS>,
    radius: DPositive,
) -> Option<BoxedDVecN<SOLVER_DIMENSIONS>> {
    let mut normalized = BoxedDVecN::new(DVecN::from_ref(vector.as_array()));

    *normalized /= radius;
    normalized.is_finite().then_some(normalized)
}

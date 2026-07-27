//! Objective resolution: the smallest decrease distinguishable from rounding noise.
//!
//! A predicted reduction no larger than the objective's own representational spacing cannot be
//! observed by comparing objective values, so the solver treats it as a stall rather than
//! progress. [`objective_resolution`] returns that threshold, `R(F̄) = ulps · ulp(|F̄|)`, where
//! `ulp` is the spacing of the f64 grid at the objective's magnitude with three exceptional
//! cases pinned: below the maximum finite value it is the next-up spacing, at the maximum it is
//! the predecessor spacing (the next-up spacing would be infinite), and at zero or subnormal
//! magnitudes it is the minimum positive subnormal - the grid's smallest step. A finite negative
//! objective remains valid evidence and contributes only its magnitude to the spacing.

use core::num::NonZeroU32;

/// The resolution `R(F̄) = ulps · ulp(|F̄|)` of a finite objective value.
///
/// The multiplication is checked: the result must be finite and positive. Returns [`None`] for a
/// non-finite objective or an invalid resolution; the caller maps [`None`] onto its typed
/// resolution-failure outcome.
pub(super) fn objective_resolution(objective: f64, ulps: NonZeroU32) -> Option<f64> {
    if !objective.is_finite() {
        return None;
    }

    let resolution = f64::from(ulps.get()) * ulp(objective.abs());
    (resolution.is_finite() && resolution > 0.0).then_some(resolution)
}

/// The f64 grid spacing at a finite non-negative magnitude.
#[expect(
    clippy::float_cmp,
    reason = "the exceptional spacing case sits at exactly the maximum finite value"
)]
fn ulp(magnitude: f64) -> f64 {
    if magnitude == 0.0 || magnitude.is_subnormal() {
        // The smallest positive subnormal: the spacing of the grid around zero.
        return f64::from_bits(1);
    }

    if magnitude == f64::MAX {
        // The next-up spacing is infinite at the top of the grid; the predecessor spacing is
        // the honest step size there.
        return f64::MAX - f64::MAX.next_down();
    }

    magnitude.next_up() - magnitude
}

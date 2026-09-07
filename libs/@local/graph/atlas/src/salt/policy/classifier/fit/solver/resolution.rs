//! Objective resolution: the smallest decrease distinguishable from rounding noise.
//!
//! Comparing objective values cannot resolve a predicted reduction no larger than the objective's
//! own representational spacing, so the solver treats such a reduction as a stall rather than
//! progress. [`objective_resolution`] returns that threshold, `R(F̄) = ulps · ulp(|F̄|)`, where `ulp`
//! is the spacing of the f64 grid at the objective's magnitude. Below the maximum finite value that
//! spacing is the next-up spacing. At the maximum it becomes the predecessor spacing, because the
//! next-up spacing would be infinite. Zero and subnormal magnitudes take the minimum positive
//! subnormal, the grid's smallest step. A finite negative objective remains valid evidence and
//! contributes only its magnitude to the spacing.

use core::num::NonZero;

use crate::math::{DFinite, DNonNegative, DPositive};

/// The f64 grid spacing at a finite non-negative magnitude.
fn ulp(magnitude: DNonNegative) -> f64 {
    if magnitude.is_zero() || magnitude.is_subnormal() {
        // The smallest positive subnormal is the spacing of the grid around zero.
        return f64::from_bits(1);
    }

    if magnitude == f64::MAX {
        // The next-up spacing is infinite at the top of the grid; the predecessor spacing is
        // the honest step size there.
        return f64::MAX - f64::MAX.next_down();
    }

    magnitude.get().next_up() - magnitude.get()
}

/// The resolution `R(F̄) = ulps · ulp(|F̄|)` of a finite objective value.
///
/// This checks the multiplication and accepts only a finite, positive result. Returns [`None`] for
/// a non-finite objective or an invalid resolution, and the caller maps [`None`] onto its typed
/// resolution-failure outcome.
pub(super) fn objective_resolution(objective: f64, ulps: NonZero<u32>) -> Option<DPositive> {
    let objective = DFinite::new(objective)?;

    let resolution = DPositive::from_u32(ulps) * ulp(objective.abs());
    DPositive::new(resolution)
}

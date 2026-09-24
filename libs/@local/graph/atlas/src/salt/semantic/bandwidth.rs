//! Per-row smooth-kNN bandwidth calibration.
//!
//! Each node row receives a local connectivity radius `ρ` and a bandwidth `σ` to normalize its
//! distance scale into fuzzy memberships. For `k` neighbours with finite distances `d_j ≥ 0`, `ρ`
//! is the smallest positive distance, or zero when every distance is zero. With finite `σ > 0`, the
//! mathematical model is
//!
//! ```text
//! p_j = exp(-max(d_j - ρ, 0) / σ),
//! Σ_j p_j = target,   target = log₂(k).
//! ```
//!
//! The nearest positive-distance neighbour and every zero-distance neighbour hold full membership.
//! Matching the same sum across rows makes dense and sparse regions comparable through their local
//! distance scales.
//!
//! Calibration starts at `σ = 1`, expanding the upper bound by doubling as needed and bisecting
//! once it has a bracket. The number of neighbours at `d_j ≤ ρ` bounds the achievable sum from
//! below. When that count exceeds `target`, the equation has no solution. A row of exact duplicates
//! is the extreme case: its sum is `k` for every positive `σ`. On such rows the search lowers `σ`
//! while the residual is at least the tolerance, subject to the iteration limit. For a finite
//! positive final bandwidth, the sum remains at least as large as the tie count. Other neighbours
//! can still contribute above it.
//!
//! The bandwidth floor is a multiple of the row's mean distance, using the corpus mean when every
//! distance is zero. Applying the floor after bisection can raise the sum above the target. A zero
//! scale supplies no positive floor. The default iteration limit keeps the trial bandwidth positive
//! even in that case.
//!
//! Adjusted distances, bandwidths and exponential evaluations use `f32`. Membership sums accumulate
//! in `f64`, reducing summation error without removing the kernel's approximation error or
//! guaranteeing an arbitrary tolerance. Stored memberships additionally clamp to
//! [`f32::MIN_POSITIVE`] to retain every directed edge, whereas the bisection sum uses unclamped
//! kernel results.

use core::simd::{f32x8, f64x8, num::SimdFloat as _};
use std::simd::Simd;

use super::SmoothingOptions;
use crate::math::{MatrixN, NonNegative, kernel::exp_f32x8};

/// Distances per SIMD kernel evaluation.
const LANES: usize = 8;

/// One row's calibrated local distance scale.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) struct Bandwidth {
    /// Smallest positive neighbour distance, or zero if every distance is zero.
    pub rho: f32,
    /// Trial bandwidth after applying the configured distance-based floor.
    pub sigma: f32,
}

/// Reusable calibration state for rows of one fixed neighbour count.
///
/// Construction sizes the scratch once, and [`Self::calibrate`] refills it per row. Padding lanes
/// hold positive infinity. At finite positive bandwidths their kernel inputs are negative infinity,
/// which contributes exactly zero to the bisection sum. Output copies only the real lanes.
pub(super) struct RowSolver {
    adjusted: MatrixN<8>,
}

impl RowSolver {
    /// Creates a solver for rows of `neighbours` distances.
    pub(super) fn new(neighbours: usize) -> Self {
        Self {
            adjusted: MatrixN::zeroed(neighbours.div_ceil(LANES)),
        }
    }

    /// Calibrates one row's bandwidth against its neighbour distances.
    ///
    /// `distances` must have the neighbour count supplied to [`Self::new`]. `target` is the finite
    /// membership sum to approach, normally `log₂(k)`. `fallback_scale` must be finite and
    /// nonnegative. It replaces the row's mean distance in the `σ` floor when every distance is
    /// zero. [`SmoothingOptions`] describes the convergence limits.
    ///
    /// The returned bandwidth can leave a residual larger than the tolerance, including when the
    /// tie count makes the target unattainable.
    pub(super) fn calibrate(
        &mut self,
        distances: &[NonNegative],
        target: f64,
        fallback_scale: f32,
        options: &SmoothingOptions,
    ) -> Bandwidth {
        const INF: Simd<f32, 8> = Simd::splat(f32::INFINITY);
        const ZERO: Simd<f32, 8> = Simd::splat(0.0);

        // `NonNegative` has the same representation as `f32`.
        let distances: &[f32] = zerocopy::transmute_ref!(distances);

        let rho = distances
            .iter()
            .copied()
            .filter(|&distance| distance > 0.0)
            .fold(f32::INFINITY, f32::min);
        let rho = if rho.is_finite() { rho } else { 0.0 };
        let rho_x8 = Simd::splat(rho);

        // subtracting the local radius makes every neighbour at or below it a full member.
        // infinity padding contributes zero to the sum at finite positive bandwidths.
        let rows = self.adjusted.lanes_mut();
        for (row, distance) in rows.iter_mut().zip(distances.chunks(LANES)) {
            *row = (Simd::load_or(distance, INF) - rho_x8).simd_max(ZERO);
        }

        let mut low = 0.0_f32;
        let mut high = None;
        let mut sigma = 1.0_f32;

        for _ in 0..options.bisection_iterations {
            let sum = self.membership_sum(sigma);
            if (sum - target).abs() < options.tolerance {
                break;
            }

            if sum > target {
                high = Some(sigma);
                sigma = f32::midpoint(low, sigma);
            } else {
                low = sigma;
                sigma = high.map_or(sigma * 2.0, |high| f32::midpoint(low, high));
            }
        }

        let scale = if rho > 0.0 {
            mean(distances)
        } else {
            fallback_scale
        };

        Bandwidth {
            rho,
            sigma: sigma.max(options.bandwidth_floor * scale),
        }
    }

    /// Writes the row's memberships under `bandwidth` into `out`.
    ///
    /// `bandwidth` must describe the last row passed to [`Self::calibrate`], and `out` must have
    /// that row's length. Only `bandwidth.sigma` participates here: calibration already subtracted
    /// the radius from the stored distances. Every output membership clamps to at least
    /// [`f32::MIN_POSITIVE`], and a stored edge never carries an exact zero.
    pub(super) fn memberships(&self, bandwidth: Bandwidth, out: &mut [f32]) {
        let sigma = f32x8::splat(bandwidth.sigma);
        let floor = f32x8::splat(f32::MIN_POSITIVE);

        for (lane, slots) in self.adjusted.lanes().iter().zip(out.chunks_mut(LANES)) {
            let memberships = exp_f32x8(-(lane / sigma)).simd_max(floor);
            slots.copy_from_slice(&memberships.to_array()[..slots.len()]);
        }
    }

    /// Sums the last row's unclamped kernel memberships in double precision.
    ///
    /// `sigma` must be finite and positive for padding to contribute exactly zero.
    fn membership_sum(&self, sigma: f32) -> f64 {
        let sigma = f32x8::splat(sigma);
        let mut sum = f64x8::splat(0.0);

        for lane in self.adjusted.lanes() {
            sum += exp_f32x8(-(lane / sigma)).cast::<f64>();
        }

        sum.reduce_sum()
    }
}

/// Computes the arithmetic mean in single precision.
///
/// `values` must be nonempty for a defined mean. Both the sum and the length conversion can round.
#[expect(
    clippy::cast_precision_loss,
    reason = "the row scale uses f32 arithmetic, including the rounded neighbour count"
)]
fn mean(values: &[f32]) -> f32 {
    values.iter().sum::<f32>() / values.len() as f32
}

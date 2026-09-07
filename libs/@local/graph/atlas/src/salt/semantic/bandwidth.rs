//! Per-row smooth-kNN bandwidth calibration.
//!
//! Each node row receives a local connectivity radius `ρ` and a bandwidth `σ` turning its neighbour
//! distances `d_j` into fuzzy memberships
//!
//! ```text
//! p_j = exp(-max(d_j - ρ, 0) / σ).
//! ```
//!
//! `ρ` is the smallest positive distance in the row, so the nearest distinct neighbour always holds
//! full membership. `σ` solves
//!
//! ```text
//! Σ_j p_j = target
//! ```
//!
//! by bisection, `target` being `log2(k)` for a `k`-neighbour table, which is what makes dense and
//! sparse regions comparable. Neighbours at `d_j ≤ ρ` hold full membership at every `σ`, so their
//! count bounds the achievable sum from below. A row where more than `target` distances tie at or
//! below `ρ` has no solution (a row of exact duplicates, whose sum is `k` for every `σ`, is the
//! extreme case). On such rows the bisection drives `σ` toward zero, the floor takes over, and the
//! sum settles at the tie count above the target. Membership sums accumulate in double precision,
//! so accumulation noise stays well below the bisection tolerance. The floor is proportional to the
//! row's mean distance (the corpus mean when every distance ties at zero) and keeps `σ` positive
//! everywhere.

use core::simd::{f32x8, f64x8, num::SimdFloat as _};
use std::simd::Simd;

use super::SmoothingOptions;
use crate::math::{MatrixN, NonNegative, kernel::exp_f32x8};

const LANES: usize = 8;

/// One row's calibrated radius and bandwidth.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) struct Bandwidth {
    pub rho: f32,
    pub sigma: f32,
}

/// Reusable per-row state: adjusted distances, padded for the kernel.
///
/// One solver serves many rows; construction sizes the scratch once and
/// [`calibrate`](Self::calibrate) refills it per row. Padding lanes hold positive infinity, which
/// the membership kernel maps to an exact zero, so partial trailing lanes need no masking.
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
    /// `target` is the membership sum to solve for and `fallback_scale` replaces the row's mean
    /// distance in the `σ` floor when the row has no positive distance to measure a scale from.
    pub(super) fn calibrate(
        &mut self,
        distances: &[NonNegative],
        target: f64,
        fallback_scale: f32,
        options: &SmoothingOptions,
    ) -> Bandwidth {
        const INF: Simd<f32, 8> = Simd::splat(f32::INFINITY);
        const ZERO: Simd<f32, 8> = Simd::splat(0.0);

        // `NonNegative` is `repr(transparent)` over `f32`
        let distances: &[f32] = zerocopy::transmute_ref!(distances);

        let rho = distances
            .iter()
            .copied()
            .filter(|&distance| distance > 0.0)
            .fold(f32::INFINITY, f32::min);
        let rho = if rho.is_finite() { rho } else { 0.0 };
        let rho_x8 = Simd::splat(rho);

        // Adjusted distances: max(d - ρ, 0) per lane, padding from the load's infinity fill.
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
    /// This clamps every membership to at least [`f32::MIN_POSITIVE`], so a stored edge never
    /// carries an exact zero.
    pub(super) fn memberships(&self, bandwidth: Bandwidth, out: &mut [f32]) {
        let sigma = f32x8::splat(bandwidth.sigma);
        let floor = f32x8::splat(f32::MIN_POSITIVE);

        for (lane, slots) in self.adjusted.lanes().iter().zip(out.chunks_mut(LANES)) {
            let memberships = exp_f32x8(-(lane / sigma)).simd_max(floor);
            slots.copy_from_slice(&memberships.to_array()[..slots.len()]);
        }
    }

    /// Sums the row's memberships under a candidate `sigma`, accumulated in double precision.
    fn membership_sum(&self, sigma: f32) -> f64 {
        let sigma = f32x8::splat(sigma);
        let mut sum = f64x8::splat(0.0);

        for lane in self.adjusted.lanes() {
            sum += exp_f32x8(-(lane / sigma)).cast::<f64>();
        }

        sum.reduce_sum()
    }
}

/// Returns the arithmetic mean of `values`.
#[expect(
    clippy::cast_precision_loss,
    reason = "neighbour counts stay far below exact f32 integer precision"
)]
fn mean(values: &[f32]) -> f32 {
    values.iter().sum::<f32>() / values.len() as f32
}

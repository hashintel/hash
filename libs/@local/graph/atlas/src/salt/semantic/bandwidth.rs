//! Per-row smooth-kNN bandwidth calibration.
//!
//! Each node row receives a local connectivity radius `rho` and a
//! bandwidth `sigma` turning its neighbour distances `d_j` into fuzzy
//! memberships
//!
//! ```text
//! p_j = exp(-max(d_j - rho, 0) / sigma).
//! ```
//!
//! `rho` is the smallest positive distance in the row, so the nearest
//! distinct neighbour always holds full membership. `sigma` solves
//!
//! ```text
//! sum_j p_j = target
//! ```
//!
//! by bisection, `target` being `log2(k)` for a `k`-neighbour table;
//! the row's memberships then sum to the same effective neighbour
//! count everywhere, which is what makes dense and sparse regions
//! comparable. Membership sums accumulate in double precision, so the
//! bisection tolerance is measured against accumulation noise well
//! below it. A floor proportional to the row's mean distance (the
//! corpus mean when every distance ties at zero) keeps `sigma` positive
//! for rows the bisection drives degenerate, such as a row of exact
//! duplicates whose membership sum is `k` for every `sigma`.

use core::simd::{f32x8, f64x8, num::SimdFloat as _};

use super::SmoothingOptions;
use crate::math::kernel::exp_f32x8;

const LANES: usize = 8;

/// One row's calibrated radius and bandwidth.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) struct Bandwidth {
    pub rho: f32,
    pub sigma: f32,
}

/// Reusable per-row state: adjusted distances, padded for the kernel.
///
/// One solver serves many rows; construction sizes the scratch once
/// and [`calibrate`](Self::calibrate) refills it per row. Padding
/// lanes hold positive infinity, which the membership kernel maps to
/// an exact zero, so partial trailing lanes need no masking.
pub(super) struct RowSolver {
    adjusted: Vec<f32>,
}

impl RowSolver {
    /// Creates a solver for rows of `neighbours` distances.
    pub(super) fn new(neighbours: usize) -> Self {
        Self {
            adjusted: vec![f32::INFINITY; neighbours.next_multiple_of(LANES)],
        }
    }

    /// Calibrates one row's bandwidth against its neighbour distances.
    ///
    /// `target` is the membership sum to solve for and `fallback_scale`
    /// replaces the row's mean distance in the `sigma` floor when the
    /// row has no positive distance to measure a scale from.
    pub(super) fn calibrate(
        &mut self,
        distances: &[f32],
        target: f64,
        fallback_scale: f32,
        options: &SmoothingOptions,
    ) -> Bandwidth {
        let rho = distances
            .iter()
            .copied()
            .filter(|&distance| distance > 0.0)
            .fold(f32::INFINITY, f32::min);
        let rho = if rho.is_finite() { rho } else { 0.0 };

        for (slot, &distance) in self.adjusted.iter_mut().zip(distances) {
            *slot = (distance - rho).max(0.0);
        }
        self.adjusted[distances.len()..].fill(f32::INFINITY);

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
    /// Memberships are clamped to at least [`f32::MIN_POSITIVE`], so a
    /// stored edge never carries an exact zero.
    pub(super) fn memberships(&self, bandwidth: Bandwidth, out: &mut [f32]) {
        let sigma = f32x8::splat(bandwidth.sigma);
        let floor = f32x8::splat(f32::MIN_POSITIVE);
        let (lanes, _) = self.adjusted.as_chunks::<LANES>();
        for (lanes, slots) in lanes.iter().zip(out.chunks_mut(LANES)) {
            let memberships = exp_f32x8(-(f32x8::from_array(*lanes) / sigma)).simd_max(floor);
            slots.copy_from_slice(&memberships.to_array()[..slots.len()]);
        }
    }

    /// Sums the row's memberships under a candidate `sigma`,
    /// accumulated in double precision.
    fn membership_sum(&self, sigma: f32) -> f64 {
        let sigma = f32x8::splat(sigma);
        let mut sum = f64x8::splat(0.0);
        let (lanes, _) = self.adjusted.as_chunks::<LANES>();

        for &lanes in lanes {
            sum += exp_f32x8(-(f32x8::from_array(lanes) / sigma)).cast::<f64>();
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

//! Measurement seam for the vendored transcendental kernels.
//!
//! The `math_kernels` benchmark target measures each production wrapper exactly as production
//! calls it, so a rewrite of the vendored kernels shows up as an instruction-count or cycle change
//! against the saved per-event baselines. Nothing here is API for consumers of the crate.

use core::simd::{f32x4, f32x8, f64x4};

/// Base-e exponential of each `f64` lane.
///
/// As the production wrapper computes it.
#[expect(
    clippy::inline_always,
    reason = "the seam must measure the wrapper as production calls it: transparently inlined, \
              with only the vendored kernel's call remaining"
)]
#[inline(always)]
#[must_use]
pub fn exp_f64x4(values: f64x4) -> f64x4 {
    super::exp_f64x4(values)
}

/// Base-e exponential of each `f32` lane.
///
/// As the production wrapper computes it.
#[expect(
    clippy::inline_always,
    reason = "the seam must measure the wrapper as production calls it: transparently inlined, \
              with only the vendored kernel's call remaining"
)]
#[inline(always)]
#[must_use]
pub fn exp_f32x8(values: f32x8) -> f32x8 {
    super::exp_f32x8(values)
}

/// Base-e exponential of each `f32` lane, table-based alternative in its portable gather form.
///
/// Not a production wrapper: this entry keeps the 16-entry hi/lo-table candidate measured
/// against [`exp_f32x8`].
#[expect(
    clippy::inline_always,
    reason = "the seam must measure the candidate as a production wrapper would call it: \
              transparently inlined, with only the kernel's call remaining"
)]
#[inline(always)]
#[must_use]
pub fn exp_f32x8_table_gather(values: f32x8) -> f32x8 {
    super::exp_table::exp_f32(values)
}

/// Base-e exponential of each `f32` lane, table-based alternative through paired `TBL4` lookups.
///
/// Not a production wrapper: this entry keeps the aarch64 lookup form of the table candidate
/// measured against [`exp_f32x8`].
#[cfg(all(target_arch = "aarch64", target_endian = "little"))]
#[expect(
    clippy::inline_always,
    reason = "the seam must measure the candidate as a production wrapper would call it: \
              transparently inlined, with only the kernel's call remaining"
)]
#[inline(always)]
#[must_use]
pub fn exp_f32x8_table_tbl4(values: f32x8) -> f32x8 {
    super::exp_table::exp_f32x8(values)
}

/// Lanewise power for strictly positive bases.
///
/// As the production wrapper computes it.
#[expect(
    clippy::inline_always,
    reason = "the seam must measure the wrapper as production calls it: transparently inlined, \
              with only the vendored kernels' calls remaining"
)]
#[inline(always)]
#[must_use]
pub fn pow_f32x4(base: f32x4, exponent: f32x4) -> f32x4 {
    super::pow_f32x4(base, exponent)
}

//! Benchmark entry points for production and candidate transcendental kernels.
//!
//! The exponential and power functions expose the production wrappers. The table functions expose
//! alternative exponential implementations for comparison on the same inputs. Inlining these entry
//! points permits the benchmark caller to optimize the surrounding expression.

use core::simd::{f32x4, f32x8, f64x4};

/// Approximates each lane's exponential through [`super::exp_f64x4`].
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

/// Approximates each lane's exponential through [`super::exp_f32x8`].
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

/// Approximates each lane's exponential with portable table gathers.
///
/// This exposes the 16-entry split-table candidate for comparison with [`exp_f32x8`].
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

/// Approximates each lane's exponential with target-selected table lookups.
///
/// On little-endian aarch64, the candidate uses paired `TBL4` lookups when NEON is enabled and
/// portable gathers otherwise. Compare with [`exp_f32x8`].
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

/// Approximates lanewise powers through [`super::pow_f32x4`].
///
/// Bases must be strictly positive and finite. The production wrapper's range and precision limits
/// apply.
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

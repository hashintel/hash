//! Measurement seam for the vendored transcendental kernels.
//!
//! The `math_kernels` benchmark target pairs each production wrapper with the upstream `sleef`
//! crate call it replaced. Wrapper and upstream stay bit-identical by construction (the
//! `math::kernel::sleef` tests prove it over the full input bit range), so any measured delta
//! between the pair is codegen: the pairs exist to show a rewrite of the vendored kernels as an
//! instruction-count or cycle change against a fixed reference. Nothing here is API for consumers
//! of the crate.

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

/// Fused-ladder probe of [`exp_f64x4`]; prices the FMA epoch.
#[inline]
#[must_use]
pub fn exp_f64x4_fma_probe(values: f64x4) -> f64x4 {
    super::sleef::fma_probe::exp_f64(values)
}

/// Fused-ladder probe of [`exp_f32x8`]; prices the FMA epoch.
#[inline]
#[must_use]
pub fn exp_f32x8_fma_probe(values: f32x8) -> f32x8 {
    super::sleef::fma_probe::exp_f32(values)
}

/// Fused-ladder probe of [`pow_f32x4`]; prices the FMA epoch.
#[inline]
#[must_use]
pub fn pow_f32x4_fma_probe(base: f32x4, exponent: f32x4) -> f32x4 {
    super::sleef::fma_probe::exp2_f32(exponent * super::sleef::fma_probe::log2_f32(base))
}

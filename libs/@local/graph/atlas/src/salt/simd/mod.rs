//! Shared portable-SIMD operations.

use core::simd::f64x8;

/// Fused multiply-add when the target provides native FMA instructions.
#[inline(always)]
#[cfg(any(target_arch = "aarch64", target_feature = "fma"))]
pub(crate) fn mul_add_f64x8(lhs: f64x8, rhs: f64x8, accumulator: f64x8) -> f64x8 {
    use std::simd::StdFloat as _;

    lhs.mul_add(rhs, accumulator)
}

/// Separate multiplication and addition when native FMA is unavailable.
#[inline(always)]
#[cfg(not(any(target_arch = "aarch64", target_feature = "fma")))]
pub(crate) fn mul_add_f64x8(lhs: f64x8, rhs: f64x8, accumulator: f64x8) -> f64x8 {
    lhs * rhs + accumulator
}

//! Shared portable-SIMD operations.

use core::simd::{f32x4, f32x8};

/// Fused multiply-add when the target provides native FMA instructions.
#[inline(always)]
#[cfg(any(target_arch = "aarch64", target_feature = "fma"))]
pub(crate) fn mul_add_f32x4(lhs: f32x4, rhs: f32x4, accumulator: f32x4) -> f32x4 {
    use std::simd::StdFloat as _;

    lhs.mul_add(rhs, accumulator)
}

/// Separate multiplication and addition when native FMA is unavailable.
#[inline(always)]
#[cfg(not(any(target_arch = "aarch64", target_feature = "fma")))]
pub(crate) fn mul_add_f32x4(lhs: f32x4, rhs: f32x4, accumulator: f32x4) -> f32x4 {
    lhs * rhs + accumulator
}

/// Fused multiply-add when the target provides native FMA instructions.
#[inline(always)]
#[cfg(any(target_arch = "aarch64", target_feature = "fma"))]
pub(crate) fn mul_add_f32x8(lhs: f32x8, rhs: f32x8, accumulator: f32x8) -> f32x8 {
    use std::simd::StdFloat as _;

    lhs.mul_add(rhs, accumulator)
}

/// Separate multiplication and addition when native FMA is unavailable.
#[inline(always)]
#[cfg(not(any(target_arch = "aarch64", target_feature = "fma")))]
pub(crate) fn mul_add_f32x8(lhs: f32x8, rhs: f32x8, accumulator: f32x8) -> f32x8 {
    lhs * rhs + accumulator
}

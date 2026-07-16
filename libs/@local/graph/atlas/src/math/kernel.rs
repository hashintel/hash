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

#[cfg(test)]
mod tests {
    use core::simd::Simd;

    use super::mul_add_f32x4;

    #[test]
    fn mul_add_matches_scalar() {
        let lhs = Simd::from_array([1.0, -2.0, 0.5, 8.0]);
        let rhs = Simd::from_array([3.0, 0.25, -4.0, 0.0]);
        let accumulator = Simd::from_array([0.5, 0.5, 0.5, 0.5]);

        let result = mul_add_f32x4(lhs, rhs, accumulator).to_array();

        for lane in 0..4 {
            let expected = f32::mul_add(lhs[lane], rhs[lane], accumulator[lane]);
            assert!(
                (result[lane] - expected).abs() < 1e-6,
                "lane {lane}: expected {expected}, got {}",
                result[lane]
            );
        }
    }
}

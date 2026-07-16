//! Shared portable-SIMD operations.
//!
//! The fused multiply-add dispatchers select between native FMA and
//! separate multiply-add per target. The transcendentals are vectorized
//! through [`sleef`], a dependency-free pure-Rust port of the SLEEF
//! vector math library; its `u10` variants are accurate to 1.0 unit in
//! the last place, the same bound a quality system libm provides, so
//! results may differ from scalar libm calls by up to one ulp in either
//! direction. The wrappers are the crate's single seam onto the library:
//! every consumer routes through here, and the `math::kernel` tests bound
//! the error against scalar libm.
// `StdFloat` also exposes vector `exp`/`ln`, but the compiler lowers them
// to one libm call per lane on every current target (verified against the
// emitted assembly), which is why the bodies below call sleef instead.

use core::simd::{f32x4, f32x8, f64x4, f64x8};

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

/// Exponential of each lane, accurate to 1.0 unit in the last place.
#[expect(
    clippy::inline_always,
    reason = "SIMD values cross non-inlined call boundaries through memory; the wrapper must be \
              transparent so only sleef's own call remains"
)]
#[inline(always)]
pub(crate) fn exp_f64x4(values: f64x4) -> f64x4 {
    sleef::f64x::exp_u10(values)
}

/// Raises each lane of `base` to the matching lane of `exponent`,
/// accurate to 1.0 unit in the last place.
#[expect(
    clippy::inline_always,
    reason = "SIMD values cross non-inlined call boundaries through memory; the wrapper must be \
              transparent so only sleef's own call remains"
)]
#[inline(always)]
pub(crate) fn pow_f32x4(base: f32x4, exponent: f32x4) -> f32x4 {
    sleef::f32x::pow_u10(base, exponent)
}

#[cfg(test)]
#[expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: sleef guarantees exact values at special points \
              such as exp(0) and pow(x, 0)"
)]
mod tests {
    use core::simd::Simd;

    use super::{exp_f64x4, mul_add_f32x4, pow_f32x4};

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

    #[test]
    fn exp_stays_within_one_ulp_of_libm() {
        let values = [-700.0, -12.5, -1.0, 0.0, 1e-9, 0.5, 1.0, 44.3, 709.0];

        for chunk in values.chunks(4) {
            let mut lanes = [0.0; 4];
            lanes[..chunk.len()].copy_from_slice(chunk);

            let vectorized = exp_f64x4(Simd::from_array(lanes)).to_array();
            for (lane, &value) in chunk.iter().enumerate() {
                let reference = value.exp();
                let ulp = ulp_f64(reference);
                assert!(
                    (vectorized[lane] - reference).abs() <= ulp,
                    "exp({value}): sleef {} vs libm {reference}",
                    vectorized[lane],
                );
            }
        }

        // Exact special points.
        assert_eq!(exp_f64x4(Simd::splat(0.0)).to_array(), [1.0; 4]);
        assert_eq!(
            exp_f64x4(Simd::splat(f64::NEG_INFINITY)).to_array(),
            [0.0; 4],
        );
    }

    #[test]
    fn pow_stays_within_one_ulp_of_libm() {
        let bases = [1e-6_f32, 0.25, 1.0, 2.5, 117.0, 3.4e37];
        let exponents = [-2.0_f32, -0.895, -0.105, 0.0, 0.895, 2.0];

        for &base in &bases {
            for &exponent in &exponents {
                let vectorized = pow_f32x4(Simd::splat(base), Simd::splat(exponent)).to_array()[0];
                let reference = base.powf(exponent);

                // Overflowing cases must agree exactly on the infinity; the
                // ulp distance is only meaningful between finite values.
                if !reference.is_finite() {
                    assert_eq!(
                        vectorized, reference,
                        "pow({base}, {exponent}): sleef {vectorized} vs libm {reference}",
                    );
                    continue;
                }

                let ulp = ulp_f32(reference);
                assert!(
                    (vectorized - reference).abs() <= ulp,
                    "pow({base}, {exponent}): sleef {vectorized} vs libm {reference}",
                );
            }
        }

        // Exact special points.
        assert_eq!(
            pow_f32x4(Simd::splat(7.5), Simd::splat(0.0)).to_array(),
            [1.0; 4]
        );
        assert_eq!(
            pow_f32x4(Simd::splat(7.5), Simd::splat(1.0)).to_array(),
            [7.5; 4]
        );
    }

    /// The distance to the next representable `f64` above `value`.
    fn ulp_f64(value: f64) -> f64 {
        let bits = value.abs().to_bits();
        f64::from_bits(bits + 1) - f64::from_bits(bits)
    }

    /// The distance to the next representable `f32` above `value`.
    fn ulp_f32(value: f32) -> f32 {
        let bits = value.abs().to_bits();
        f32::from_bits(bits + 1) - f32::from_bits(bits)
    }
}

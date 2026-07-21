//! Shared portable-SIMD operations.
//!
//! The fused multiply-add dispatchers select between native FMA and separate multiply-add per
//! target. The transcendentals are vectorized through the SLEEF kernels vendored in
//! [`self::sleef`]. Each wrapper documents its own accuracy bound: the variant is chosen per kernel
//! by measuring the consumers' requirements against instruction counts, from the 1.0-ulp `u10` tier
//! down to compositions of the cheaper 3.5-ulp `u35` tier. The wrappers are the crate's single seam
//! onto the vendored kernels: every consumer routes through here, and the `math::kernel` tests
//! bound each wrapper's error against scalar libm.
// `StdFloat` also exposes vector `exp`/`ln`, but the compiler lowers them
// to one libm call per lane on every current target (verified against the
// emitted assembly), which is why the bodies below call the vendored
// kernels instead.

use core::simd::{f32x4, f32x8, f64x4, f64x8};

#[cfg(feature = "bench")]
pub mod bench;
mod sleef;

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

/// Fused multiply-add, correctly rounded on every target.
///
/// The fusion is semantic: targets without native FMA take a software path with the same single
/// rounding, so every lane matches scalar [`f64::mul_add`] bit for bit on every platform. This is
/// the variant for consumers whose contract includes byte-reproducibility across targets;
/// [`mul_add_f64x4`] trades that guarantee for speed where FMA hardware is absent.
#[inline(always)]
pub(crate) fn fused_mul_add_f64x4(lhs: f64x4, rhs: f64x4, accumulator: f64x4) -> f64x4 {
    use std::simd::StdFloat as _;

    lhs.mul_add(rhs, accumulator)
}

/// Fused multiply-add when the target provides native FMA instructions.
#[inline(always)]
#[cfg(any(target_arch = "aarch64", target_feature = "fma"))]
pub(crate) fn mul_add_f64x4(lhs: f64x4, rhs: f64x4, accumulator: f64x4) -> f64x4 {
    use std::simd::StdFloat as _;

    lhs.mul_add(rhs, accumulator)
}

/// Separate multiplication and addition when native FMA is unavailable.
#[inline(always)]
#[cfg(not(any(target_arch = "aarch64", target_feature = "fma")))]
pub(crate) fn mul_add_f64x4(lhs: f64x4, rhs: f64x4, accumulator: f64x4) -> f64x4 {
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
              transparent so only the vendored kernel's call remains"
)]
#[inline(always)]
pub(crate) fn exp_f64x4(values: f64x4) -> f64x4 {
    sleef::exp_f64(values)
}

/// Exponential of each lane, accurate to 1.0 unit in the last place.
///
/// Exact at the special points consumers lean on: a zero lane yields exactly one and a
/// negative-infinity lane yields exactly zero.
#[expect(
    clippy::inline_always,
    reason = "SIMD values cross non-inlined call boundaries through memory; the wrapper must be \
              transparent so only the vendored kernel's call remains"
)]
#[inline(always)]
pub(crate) fn exp_f32x8(values: f32x8) -> f32x8 {
    sleef::exp_f32(values)
}

/// Raises each lane of `base` to the matching lane of `exponent`, for strictly positive bases.
///
/// The power is evaluated as `exp2(exponent * log2(base))` from the vendored SLEEF 3.5-ulp stages.
/// The relative error grows with the magnitude of the result's binary exponent: a few units in the
/// last place for results near one, on the order of `1e-4` at the edges of the normal range.
/// Gradient kernels tolerate far more; callers needing 1-ulp powers should take the scalar
/// [`f32::powf`] per lane instead.
///
/// A `base` of zero yields zero for positive exponents, infinity for negative exponents, and NaN
/// when the exponent is also zero; negative bases yield NaN.
// Measured on an M5 Max (per 4-lane call, criterion via darwin-kperf,
// house kernels): this composition 70 instructions / 21
// cycles, four scalar libm `powf` calls 311 / 36, sleef's 1.0-ulp
// `pow_u10` 473 / 123. The scalar near-tie in standalone cycles
// vanishes under load: embedded in the attraction-coefficient
// arithmetic the upstream form of the composition holds 30 cycles
// (the extra work rides its idle issue slots) while the scalar option
// grows to 38; the house form differs from upstream only by cheaper
// nearest-integer rounding. The tie also does not generalize across machines: it
// needs an out-of-order engine wide and deep enough to overlap four
// independent libm bodies (IPC ~8.6 here) and Apple's branch-free
// `powf`; production Linux targets have neither, and glibc's `powf` is
// a different, branchier function with different rounding. The composition's cost travels with
// the binary - same sleef code, same 87 instructions, bit-identical
// results on every platform - which also keeps content-hashed fits
// reproducible across dev and prod. Inside the fused gradient kernels
// the instruction count is additionally the shared resource: the
// composition leaves three quarters of the issue slots to the
// surrounding batch arithmetic and stays in vector registers.
// `StdFloat` offers no vector `pow`, and its `exp2`/`log2` scalarize to
// one libm call per lane.
#[expect(
    clippy::inline_always,
    reason = "SIMD values cross non-inlined call boundaries through memory; the wrapper must be \
              transparent so only the vendored kernels' calls remain"
)]
#[inline(always)]
pub(crate) fn pow_f32x4(base: f32x4, exponent: f32x4) -> f32x4 {
    sleef::exp2_f32(exponent * sleef::log2_f32(base))
}

#[cfg(test)]
#[expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: sleef guarantees exact values at special points \
              such as exp(0) and pow(x, 0)"
)]
mod tests {
    use core::simd::Simd;

    use super::{exp_f32x8, exp_f64x4, mul_add_f32x4, pow_f32x4};

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
    fn pow_stays_within_the_documented_relative_bound() {
        let bases = [1e-6_f32, 0.25, 1.0, 2.5, 117.0, 3.4e37];
        let exponents = [-2.0_f32, -0.895, -0.105, 0.0, 0.895, 2.0];

        for &base in &bases {
            for &exponent in &exponents {
                let vectorized = pow_f32x4(Simd::splat(base), Simd::splat(exponent)).to_array()[0];
                let reference = base.powf(exponent);

                // Overflowing cases must agree exactly on the infinity; a
                // relative distance is only meaningful between finite
                // values.
                if !reference.is_finite() {
                    assert_eq!(
                        vectorized, reference,
                        "pow({base}, {exponent}): sleef {vectorized} vs libm {reference}",
                    );
                    continue;
                }

                // The composed error scales with the result's binary
                // exponent; 2e-4 relative covers the extreme corner of the
                // sample grid (3.4e37 squared) with margin, and results
                // near one land far inside it.
                assert!(
                    (vectorized - reference).abs() <= reference.abs() * 2e-4,
                    "pow({base}, {exponent}): sleef {vectorized} vs libm {reference}",
                );
            }
        }

        // A zero exponent is exact for any positive base: the exponent
        // product is zero and exp2(0) is one.
        assert_eq!(
            pow_f32x4(Simd::splat(7.5), Simd::splat(0.0)).to_array(),
            [1.0; 4]
        );
    }

    #[test]
    fn exp_f32_stays_within_one_ulp_of_libm() {
        let values = [
            -87.0_f32, -12.5, -1.0, -1e-9, 0.0, 1e-9, 0.5, 1.0, 44.3, 88.0,
        ];

        for chunk in values.chunks(8) {
            let mut lanes = [0.0_f32; 8];
            lanes[..chunk.len()].copy_from_slice(chunk);

            let vectorized = exp_f32x8(Simd::from_array(lanes)).to_array();
            for (lane, &value) in chunk.iter().enumerate() {
                let reference = value.exp();
                let ulp = ulp_f32(reference);
                assert!(
                    (vectorized[lane] - reference).abs() <= ulp,
                    "exp({value}): sleef {} vs libm {reference}",
                    vectorized[lane],
                );
            }
        }

        // Exact special points: the smooth-kNN kernel encodes "at or
        // below rho" as an adjusted distance of zero and padding lanes
        // as negative infinity, so these must not merely be close.
        assert_eq!(exp_f32x8(Simd::splat(0.0)).to_array(), [1.0; 8]);
        assert_eq!(
            exp_f32x8(Simd::splat(f32::NEG_INFINITY)).to_array(),
            [0.0; 8],
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

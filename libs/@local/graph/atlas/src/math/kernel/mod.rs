//! Shared fused arithmetic and approximate transcendental functions for SIMD lanes.
//!
//! The multiply-add wrappers round each product-plus-sum once. The vendored kernels in
//! [`self::sleef`] evaluate lane arithmetic with fixed coefficients and evaluation order, avoiding
//! a scalar transcendental call per lane. These choices specify arithmetic operations rather than
//! instruction counts or cross-platform NaN payloads.
//!
//! SLEEF's accuracy tiers distinguish 1.0-ULP (`u10`) and 3.5-ULP (`u35`) approximations. A
//! composition such as [`pow_f32x4`] does not inherit either bound. The tests compare samples
//! against scalar libm, with the reference precision and coverage described in [`self::sleef`].

use core::simd::{f32x4, f32x8, f64x4, f64x8};

#[cfg(feature = "bench")]
pub mod bench;
#[cfg(any(test, feature = "bench"))]
mod exp_table;
mod sleef;
#[cfg(test)]
mod ulp_sweep;

/// Checks selected CPU feature bits required by the crate's x86-64 build.
///
/// Reads AVX, AVX2, FMA, BMI2 and OSXSAVE directly from CPUID. Call it before other work in `main`
/// to report missing features early. The function performs no check on other architectures.
///
/// # Panics
///
/// On x86-64, this panics for `target_env = "sgx"` before reading CPUID. It also panics when the
/// CPU reports no AVX, AVX2, FMA or BMI2 support, or no operating-system XSAVE support. Whether the
/// operating system has enabled YMM register state is outside the check.
#[cfg_attr(
    not(target_arch = "x86_64"),
    expect(
        clippy::missing_const_for_fn,
        reason = "const only where the x86-64 arm compiles out; the runtime feature detection is \
                  the function's purpose"
    )
)]
pub(crate) fn verify_cpu_baseline() {
    #[cfg(target_arch = "x86_64")]
    {
        use core::arch::x86_64::__cpuid_count;

        // cpuid rather than `is_x86_feature_detected!`: the macro folds to `true` for every feature
        // the build already assumes, and x86-64 builds of this workspace assume the whole baseline.
        let max_basic_leaf = __cpuid_count(0, 0).eax;
        let processor_info = __cpuid_count(1, 0);
        let extended_features = __cpuid_count(7, 0);
        // Some Skylake parts that lack AVX falsely report BMI1/BMI2 support (SKL052). Checking AVX
        // alongside BMI2 rejects that combination. AVX2 also requires operating-system support for
        // extended state.
        let avx = processor_info.ecx & (1 << 28) != 0;
        let osxsave = processor_info.ecx & (1 << 27) != 0;
        let fma = processor_info.ecx & (1 << 12) != 0;
        let avx2 = max_basic_leaf >= 7 && extended_features.ebx & (1 << 5) != 0;
        let bmi2 = max_basic_leaf >= 7 && extended_features.ebx & (1 << 8) != 0;
        assert!(
            avx && osxsave && avx2 && fma && bmi2,
            "this binary is compiled for the x86-64-v3 baseline (AVX2, FMA, BMI2), and the \
             current CPU reports avx={avx} osxsave={osxsave} avx2={avx2} fma={fma} bmi2={bmi2}"
        );
    }
}

/// Computes a fused multiply-add in each lane.
///
/// Each lane rounds the exact product-plus-sum once, as [`f32::mul_add`] does. This is an
/// arithmetic guarantee, including when the target implements fusion in software. NaN payloads
/// are not part of the guarantee.
#[inline(always)]
pub(crate) fn mul_add_f32x4(lhs: f32x4, rhs: f32x4, accumulator: f32x4) -> f32x4 {
    use std::simd::StdFloat as _;

    lhs.mul_add(rhs, accumulator)
}

/// Computes a fused multiply-add in each double-precision lane.
///
/// The four-lane counterpart of [`mul_add_f32x4`], with the same rounding contract.
#[inline(always)]
pub(crate) fn mul_add_f64x4(lhs: f64x4, rhs: f64x4, accumulator: f64x4) -> f64x4 {
    use std::simd::StdFloat as _;

    lhs.mul_add(rhs, accumulator)
}

/// Computes a fused multiply-add in each double-precision lane.
///
/// The eight-lane counterpart of [`mul_add_f32x4`], with the same rounding contract.
#[inline(always)]
pub(crate) fn mul_add_f64x8(lhs: f64x8, rhs: f64x8, accumulator: f64x8) -> f64x8 {
    use std::simd::StdFloat as _;

    lhs.mul_add(rhs, accumulator)
}

/// Approximates the base-e exponential of each double-precision lane.
///
/// Uses [`sleef::exp_f64`]. Its sampled agreement with scalar libm does not establish a
/// worst-case ULP bound over every input.
#[expect(
    clippy::inline_always,
    reason = "SIMD values cross non-inlined call boundaries through memory; the wrapper must be \
              transparent so only the vendored kernel's call remains"
)]
#[inline(always)]
pub(crate) fn exp_f64x4(values: f64x4) -> f64x4 {
    sleef::exp_f64(values)
}

/// Approximates the base-e exponential of each single-precision lane.
///
/// Uses the `u10`-tier [`sleef::exp_f32`]. A zero lane yields exactly one, and a negative-infinity
/// lane yields exactly zero.
#[expect(
    clippy::inline_always,
    reason = "SIMD values cross non-inlined call boundaries through memory; the wrapper must be \
              transparent so only the vendored kernel's call remains"
)]
#[inline(always)]
pub(crate) fn exp_f32x8(values: f32x8) -> f32x8 {
    sleef::exp_f32(values)
}

/// Approximates each lane's power for strictly positive finite bases.
///
/// Evaluates exp₂(p · log₂ b) for base b and exponent p through `u35`-tier stages. If the logarithm
/// has absolute error δₗ and multiplication contributes δₘ, the exponential's argument error is Δz
/// = pδₗ + δₘ. For a finite positive normal result, an exp₂ relative error δₑ gives composed
/// relative error 2^Δz · (1 + δₑ) − 1. For small errors this is approximately ln(2) · Δz + δₑ. The
/// exponent can amplify logarithm error before exp₂ is evaluated.
///
/// This composition has no fixed ULP bound inherited from its stages. The tests allow relative
/// error `2e-4` on their finite sample grid. Scalar [`f32::powf`] is an alternative with
/// platform-dependent accuracy.
///
/// A `base` of zero yields zero for positive finite exponents, infinity for negative finite
/// exponents, and NaN when the exponent is also zero. Negative bases yield NaN. Infinite bases or
/// exponents follow the intermediate logarithm and product, including NaN for an infinite base
/// raised to zero.
// measured on an M5 Max per four-lane call with Criterion and darwin-kperf: this composition used
// 68 instructions / 18 cycles, versus 311 / 36 for four scalar libm powf calls. The isolated
// comparison does not measure the complete gradient or predict another CPU's cost.
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
mod tests {
    use core::simd::Simd;

    use super::{exp_f32x8, exp_f64x4, mul_add_f32x4, mul_add_f64x4, mul_add_f64x8, pow_f32x4};

    /// Distinguishes fused cancellation from separately rounded multiplication.
    ///
    /// For a = b = 1 + 2⁻¹² and c = −(1 + 2⁻¹¹), the exact product contains a 2⁻²⁴ term, half the
    /// binary32 ULP at this magnitude. Ties-to-even rounds a · b to 1 + 2⁻¹¹ before a separate
    /// addition. Therefore the separate result is zero while the fused result is 2⁻²⁴. Lane 1
    /// negates the product and addend, giving the corresponding negative residual.
    #[test]
    fn mul_add_f32x4_rounds_once_per_lane() {
        let factor = 1.0_f32 + (-12.0_f32).exp2();
        let offset = -(1.0_f32 + (-11.0_f32).exp2());

        let lhs = Simd::from_array([factor, -factor, 0.1_f32, 1.1_f32]);
        let rhs = Simd::from_array([factor, factor, 0.3_f32, 2.2_f32]);
        let accumulator = Simd::from_array([offset, -offset, 0.7_f32, 3.3_f32]);

        let result = mul_add_f32x4(lhs, rhs, accumulator).to_array();

        for lane in 0..4 {
            let expected = f32::mul_add(lhs[lane], rhs[lane], accumulator[lane]);
            assert_eq!(
                result[lane].to_bits(),
                expected.to_bits(),
                "lane {lane}: expected {expected}, got {}",
                result[lane]
            );
        }
    }

    /// Distinguishes fused cancellation in double precision.
    ///
    /// For a = b = 1 + 2⁻²⁷ and c = −(1 + 2⁻²⁶), the exact product's 2⁻⁵⁴ term is one quarter of a
    /// binary64 ULP and rounds away before a separate addition. Therefore the separate result is
    /// zero while the fused result is 2⁻⁵⁴. Lane 1 gives the sign-negated residual.
    #[test]
    fn mul_add_f64x4_rounds_once_per_lane() {
        let factor = 1.0_f64 + (-27.0_f64).exp2();
        let offset = -(1.0_f64 + (-26.0_f64).exp2());

        let lhs = Simd::from_array([factor, -factor, 0.1_f64, 1.1_f64]);
        let rhs = Simd::from_array([factor, factor, 0.3_f64, 2.2_f64]);
        let accumulator = Simd::from_array([offset, -offset, 0.7_f64, 3.3_f64]);

        let result = mul_add_f64x4(lhs, rhs, accumulator).to_array();

        for lane in 0..4 {
            let expected = f64::mul_add(lhs[lane], rhs[lane], accumulator[lane]);
            assert_eq!(
                result[lane].to_bits(),
                expected.to_bits(),
                "lane {lane}: expected {expected}, got {}",
                result[lane]
            );
        }
    }

    /// Extends the double-precision cancellation fixture to eight lanes.
    ///
    /// Lanes 0 and 1 use the ±2⁻⁵⁴ residuals derived in [`mul_add_f64x4_rounds_once_per_lane`].
    #[test]
    fn mul_add_f64x8_rounds_once_per_lane() {
        let factor = 1.0_f64 + (-27.0_f64).exp2();
        let offset = -(1.0_f64 + (-26.0_f64).exp2());

        let lhs = Simd::from_array([
            factor, -factor, 0.1_f64, 1.1_f64, -0.15_f64, 9.9_f64, 0.01_f64, -1.234_f64,
        ]);
        let rhs = Simd::from_array([
            factor, factor, 0.3_f64, 2.2_f64, 0.85_f64, -4.4_f64, 0.02_f64, 5.678_f64,
        ]);
        let accumulator = Simd::from_array([
            offset, -offset, 0.7_f64, 3.3_f64, 6.02_f64, 1.7_f64, 0.03_f64, -9.101_f64,
        ]);

        let result = mul_add_f64x8(lhs, rhs, accumulator).to_array();

        for lane in 0..8 {
            let expected = f64::mul_add(lhs[lane], rhs[lane], accumulator[lane]);
            assert_eq!(
                result[lane].to_bits(),
                expected.to_bits(),
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

                // Overflowing cases must agree exactly on the infinity. A relative distance applies
                // only between finite values.
                if !reference.is_finite() {
                    assert_eq!(
                        vectorized, reference,
                        "pow({base}, {exponent}): sleef {vectorized} vs libm {reference}",
                    );
                    continue;
                }

                // the tolerance applies to this finite sample grid. Overflowing powers,
                // including 3.4e37 squared, took the classification branch above.
                assert!(
                    (vectorized - reference).abs() <= reference.abs() * 2e-4,
                    "pow({base}, {exponent}): sleef {vectorized} vs libm {reference}",
                );
            }
        }

        // A finite logarithm multiplied by zero gives zero, and exp2(0) is exactly one.
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

        assert_eq!(exp_f32x8(Simd::splat(0.0)).to_array(), [1.0; 8]);
        assert_eq!(
            exp_f32x8(Simd::splat(f32::NEG_INFINITY)).to_array(),
            [0.0; 8],
        );
    }

    /// Returns the spacing above the finite magnitude of `value`.
    fn ulp_f64(value: f64) -> f64 {
        let bits = value.abs().to_bits();
        f64::from_bits(bits + 1) - f64::from_bits(bits)
    }

    /// Returns the spacing above the finite magnitude of `value`.
    fn ulp_f32(value: f32) -> f32 {
        let bits = value.abs().to_bits();
        f32::from_bits(bits + 1) - f32::from_bits(bits)
    }
}

//! Shared portable-SIMD operations.
//!
//! The multiply-add wrappers keep the fusion semantic, rounding once per lane to the result IEEE
//! 754 defines on every target, so content-hashed artifacts reproduce across platforms by
//! construction. The vendored SLEEF kernels in [`self::sleef`] vectorize the transcendentals. Each
//! wrapper documents its own accuracy bound, picked per kernel by measuring the consumers'
//! requirements against instruction counts, from the 1.0-ulp `u10` tier down to compositions of the
//! cheaper 3.5-ulp `u35` tier. These wrappers are the crate's single seam onto the vendored
//! kernels. Every consumer routes through here, and the `math::kernel` tests bound each wrapper's
//! error against scalar libm.
// `StdFloat` also exposes vector `exp`/`ln`, but the compiler lowers them
// to one libm call per lane on every current target (verified against the
// emitted assembly), which is why the bodies below call the vendored
// kernels instead.

use core::simd::{f32x4, f32x8, f64x4, f64x8};

#[cfg(feature = "bench")]
pub mod bench;
#[cfg(any(test, feature = "bench"))]
mod exp_table;
mod sleef;
#[cfg(test)]
mod ulp_sweep;

/// Refuses to run on a CPU below the x86-64-v3 baseline the crate is compiled for.
///
/// The check reads the processor's own feature bits, so it stays live in a build that already
/// assumes the baseline, and a mismatched machine reports what it lacks instead of faulting on its
/// first vector instruction. Call it before anything else in `main`, ahead of argument parsing. On
/// targets whose baseline needs no runtime support (aarch64) it compiles to nothing.
///
/// # Panics
///
/// This panics when the CPU reports no AVX, AVX2, FMA or BMI2 support, or no operating-system XSAVE
/// support. Whether the operating system has enabled YMM register state is outside the check.
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
        use std::arch::x86_64::__cpuid_count;

        // cpuid rather than `is_x86_feature_detected!`: the macro folds to `true` for every feature
        // the build already assumes, and x86-64 builds of this workspace assume the whole baseline.
        let max_basic_leaf = __cpuid_count(0, 0).eax;
        let processor_info = __cpuid_count(1, 0);
        let extended_features = __cpuid_count(7, 0);
        // The AVX and OSXSAVE bits guard the AVX2 reading: SKL052 leaves BMI bits set on Skylake
        // parts with AVX disabled in firmware, and AVX2 is meaningless without OS-enabled extended
        // state.
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

/// Fused multiply-add, correctly rounded on every target.
///
/// The fusion is semantic. Each lane rounds once, so every lane matches scalar [`f32::mul_add`] bit
/// for bit. Both baselines the crate builds for lower it in hardware (aarch64 FMLA, x86-64 the
/// workspace's x86-64-v3 FMA), and lowering changes speed, never bits.
#[inline(always)]
pub(crate) fn mul_add_f32x4(lhs: f32x4, rhs: f32x4, accumulator: f32x4) -> f32x4 {
    use std::simd::StdFloat as _;

    lhs.mul_add(rhs, accumulator)
}

/// Fused multiply-add, correctly rounded on every target.
///
/// The `f64x4` counterpart of [`mul_add_f32x4`].
#[inline(always)]
pub(crate) fn mul_add_f64x4(lhs: f64x4, rhs: f64x4, accumulator: f64x4) -> f64x4 {
    use std::simd::StdFloat as _;

    lhs.mul_add(rhs, accumulator)
}

/// Fused multiply-add, correctly rounded on every target.
///
/// The `f64x8` counterpart of [`mul_add_f32x4`].
#[inline(always)]
pub(crate) fn mul_add_f64x8(lhs: f64x8, rhs: f64x8, accumulator: f64x8) -> f64x8 {
    use std::simd::StdFloat as _;

    lhs.mul_add(rhs, accumulator)
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
/// A zero lane yields exactly one, and a negative-infinity lane yields exactly zero.
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
/// This evaluates the power as `exp2(exponent · log2(base))` through the vendored SLEEF 3.5-ulp
/// stages. The relative error grows with the magnitude of the result's binary exponent, from a few
/// units in the last place for results near one to the order of `1e-4` at the edges of the normal
/// range. Gradient kernels tolerate far more. For 1-ulp powers, take the scalar [`f32::powf`] per
/// lane instead.
///
/// A `base` of zero yields zero for positive exponents, infinity for negative exponents, and NaN
/// when the exponent is also zero. Negative bases yield NaN.
// Measured on an M5 Max (per 4-lane call, criterion via darwin-kperf, fused ladders): this
// composition 68 instructions / 18 cycles, four scalar libm `powf` calls 311 / 36. The scalar
// near-tie in standalone cycles vanishes under load. Embedded in the attraction-coefficient
// arithmetic, the composition occupies idle issue slots while the scalar bodies compete for them.
// The tie also does not generalize across machines. It needs an out-of-order engine wide and deep
// enough to overlap four independent libm bodies (IPC ≈8.6 here) and Apple's branch-free `powf`.
// Production Linux targets have neither, and glibc's `powf` is a different, branchier function with
// different rounding. The composition's cost is the same wherever the binary runs, because the same
// vendored code produces bit-identical results on every platform, and that also keeps
// content-hashed fits reproducible across dev and prod. Inside the fused gradient kernels the
// instruction count also becomes the shared resource, and the composition leaves three quarters of
// the issue slots to the surrounding batch arithmetic while staying in vector registers. `StdFloat`
// offers no vector `pow`, and its `exp2`/`log2` scalarize to one libm call per lane.
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

    use super::{exp_f32x8, exp_f64x4, mul_add_f32x4, mul_add_f64x4, mul_add_f64x8, pow_f32x4};

    /// `mul_add_f32x4` rounds once per lane, against scalar [`f32::mul_add`] as the reference.
    ///
    /// Lane 0 discriminates the fusion, so an unfused `lhs * rhs + accumulator` body fails here: `a
    /// = b = 1 + 2⁻¹²` and `c = -(1 + 2⁻¹¹)` make `a·b` round to `1 + 2⁻¹¹` under tie-to-even
    /// before the add (the exact product carries a `2⁻²⁴` term, exactly half the `f32` ulp at this
    /// magnitude), so `a * b + c` gives `0.0` where the fused result is `2⁻²⁴`. Lane 1 is its
    /// sign-negated twin, mirroring the same tie around zero. Lanes 2 and 3 are ordinary non-dyadic
    /// values.
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

    /// `mul_add_f64x4` rounds once per lane, against scalar [`f64::mul_add`] as the reference.
    ///
    /// Lane 0 discriminates the fusion, so an unfused `lhs * rhs + accumulator` body fails here: `a
    /// = b = 1 + 2⁻²⁷` and `c = -(1 + 2⁻²⁶)` make the exact product's `2⁻⁵⁴` term round away (a
    /// quarter of the `f64` ulp at this magnitude) before the add, so `a * b + c` gives `0.0` where
    /// the fused result is `2⁻⁵⁴`. Lane 1 is its sign-negated twin. Lanes 2 and 3 are ordinary
    /// non-dyadic values.
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

    /// `mul_add_f64x8` rounds once per lane, against scalar [`f64::mul_add`] as the reference.
    ///
    /// Lanes 0 and 1 repeat the `f64x4` fusion-discriminating pair and its sign-negated twin; the
    /// remaining six lanes are ordinary non-dyadic values.
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

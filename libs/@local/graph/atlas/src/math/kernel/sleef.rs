//! Vectorized transcendental kernels for the SIMD wrappers in [`math::kernel`](super).
//!
//! [`exp_f32`], [`exp2_f32`], [`log2_f32`], and [`exp_f64`] evaluate their function on every lane
//! of a portable-SIMD vector without a libm call, in three steps each: range reduction splits the
//! input into an integer power of two and a small residual, a short minimax polynomial approximates
//! the function on the residual, and reconstruction applies the power of two through direct
//! exponent-field arithmetic. Each function documents its own error bound; the bounds are inherited
//! from the SLEEF accuracy tiers the kernels derive from (`u10` is within 1.0 ULP, `u35` within
//! 3.5).
//!
//! # Reproducibility contract
//!
//! Fit artifacts are content-hashed, so these kernels must produce bit-identical results on every
//! target the crate builds for. Two properties carry that guarantee:
//!
//! - Every multiply-accumulate is a fused [`mul_add`](std::simd::StdFloat::mul_add). A fused
//!   multiply-add has exactly one correctly rounded result, defined by IEEE 754 independently of
//!   how a target lowers it: hardware FMA where present (aarch64 always; x86-64 from the v3
//!   baseline the workspace pins), a software path with the same single rounding elsewhere. Targets
//!   differ in speed, never in bits.
//! - Every step is plain `f32`/`f64` lane arithmetic, bit shifts, and lane selects, with one
//!   rounding per operation as IEEE 754 requires; no step depends on a target-specific instruction.
//!
//! # Provenance and divergences
//!
//! The algorithms, evaluation order, polynomial coefficients, and range-reduction constants are
//! from the `sleef` crate, version 0.3.3 (MIT OR Apache-2.0), a pure-Rust port of the SLEEF
//! vector math library (Naoki Shibata and contributors, Boost Software License 1.0):
//! <https://github.com/burrbull/sleef-rs>. The entry points correspond to upstream's
//! `f32x::exp_u10`, `f32x::exp2_u35`, `f32x::log2_u35`, and `f64x::exp_u10`. This module diverges
//! from upstream in form, never in result bits:
//!
//! - Multiply-accumulates are fused unconditionally. Upstream selects fusion per target under
//!   `cfg!(target_feature = "fma")`, an x86-only cfg string, and rounds twice per step where it is
//!   false; this module's ladders round once everywhere and their result bits are their own
//!   contract, verified against libm by the tests below.
//! - `exp_f64` keeps the coefficient set of upstream's non-FMA branch, evaluated fused. Upstream's
//!   FMA branch carries a different degree-10 set, so the fused ladder here matches neither
//!   upstream branch bit-for-bit; one coefficient set on every architecture is what keeps content
//!   hashes reproducible.
//! - Nearest-integer rounding uses [`round_ties_even`](std::simd::StdFloat::round_ties_even)
//!   directly. Upstream computes the same round-half-to-even through an add-subtract trick against
//!   `2^23` (`2^52` for `f64`) plus sign restoration, predating the portable-SIMD API; the
//!   intrinsic returns the identical value in every rounding regime, including the pass-through
//!   above `2^23` where the trick's guard bit runs out.
//! - Lane suppression uses mask selects against zero where upstream masks the raw bits through a
//!   sign-extended integer AND; names, the `Poly`/`Sign` trait helpers (flattened to explicit
//!   Estrin steps and plain functions), and constant spellings (shortest round-trip literals,
//!   `core` constants where the value is exactly a named one) follow this crate's conventions.
//!
//! # Verification
//!
//! The tests at the bottom of this file sweep strided samples of the full input bit range — every
//! exponent, both signs, zeros, infinities, subnormals, and NaN payloads — and bound each kernel's
//! distance from a scalar libm reference evaluated in wider precision. The bounds are each
//! kernel's accuracy tier plus the reference's own rounding step; the special points consumers
//! lean on are asserted exactly in [`math::kernel`](super)'s tests.

use core::{f32, f64, f128, simd::prelude::*};
use std::simd::StdFloat as _;

// ln 2 split into a coarse part whose low mantissa bits are zero and
// the correctly rounded remainder against the next-wider constant.
// Multiplying the coarse part by `nearest` is exact through the
// masked width (2^9 for f32, 2^12 for f64, beyond both exp kernels'
// reduction ranges), so the range reduction `x - nearest * ln2`
// loses no bits to the subtraction; the remainder repays the split's
// truncation.
const F32_MASK: u32 = 0x1FF;
const LN2_HI_F32: f32 = f32::from_bits(f32::consts::LN_2.to_bits() & !F32_MASK);
#[expect(
    clippy::cast_possible_truncation,
    reason = "the cast is the derivation's rounding step: the remainder is correctly rounded into \
              the narrower type"
)]
const LN2_LO_F32: f32 = (f64::consts::LN_2 - (LN2_HI_F32 as f64)) as f32;

const F64_MASK: u64 = 0xFFF;
const LN2_HI_F64: f64 = f64::from_bits(f64::consts::LN_2.to_bits() & !F64_MASK);
const LN2_LO_F64: f64 = (f128::consts::LN_2 - (LN2_HI_F64 as f128)) as f64;

/// Two raised to each lane of `exponent`, built directly in the result's exponent field.
///
/// Exact for exponents where the result is a normal `f32`; the callers keep exponents in that range
/// by splitting (see [`scale_by_pow2_f32`]).
#[inline]
fn pow2_f32<const N: usize>(exponent: Simd<i32, N>) -> Simd<f32, N> {
    // 0x7F is the f32 exponent bias; 23 the mantissa width.
    Simd::from_bits(((exponent + Simd::splat(0x7F)) << Simd::splat(23)).cast())
}

/// Two raised to each lane of `exponent`, as `f64`.
///
/// The `f64` counterpart of [`pow2_f32`]; exact for exponents where the result is a normal `f64`.
#[inline]
fn pow2_f64<const N: usize>(exponent: Simd<i32, N>) -> Simd<f64, N> {
    // 0x3FF is the f64 exponent bias; the field starts 20 bits into
    // the upper half of the word, so the biased value is widened to
    // the upper 32 bits first and shifted into place there.
    let biased = Simd::splat(0x3FF) + exponent;
    let upper = biased.cast::<i64>() << Simd::splat(32);
    Simd::from_bits((upper << Simd::splat(20)).cast())
}

/// Scales each lane by two raised to `exponent`, in two half-steps.
///
/// Applying `2^(exponent/2)` twice keeps each factor a normal number for the exponent range the
/// reconstruction step produces, where a single factor could overflow or flush to zero before the
/// scaled value lands back in range. Both multiplies are by powers of two with normal
/// intermediate results, so the scaling is exact except for the single rounding when the final
/// value lands in the subnormal range.
#[inline]
pub(super) fn scale_by_pow2_f32<const N: usize>(
    values: Simd<f32, N>,
    exponent: Simd<i32, N>,
) -> Simd<f32, N> {
    let half = exponent >> Simd::splat(1);
    values * pow2_f32(half) * pow2_f32(exponent - half)
}

/// Scales each lane by two raised to `exponent`, as `f64`.
///
/// The `f64` counterpart of [`scale_by_pow2_f32`].
#[inline]
fn scale_by_pow2_f64<const N: usize>(values: Simd<f64, N>, exponent: Simd<i32, N>) -> Simd<f64, N> {
    let half = exponent >> Simd::splat(1);
    values * pow2_f64(half) * pow2_f64(exponent - half)
}

/// Scales each lane by two raised to `exponent`, by adding to the exponent field in place.
///
/// One integer add instead of two multiplies, valid only while input and result are both normal
/// numbers; the caller guarantees the range.
#[inline]
fn scale_by_pow2_direct_f32<const N: usize>(
    values: Simd<f32, N>,
    exponent: Simd<i32, N>,
) -> Simd<f32, N> {
    Simd::from_bits((values.to_bits().cast() + (exponent << Simd::splat(23))).cast())
}

/// The unbiased binary exponent of each lane, read from the exponent field.
///
/// For a normal lane this is `floor(log2(|lane|))`; subnormal lanes are scaled into the normal
/// range by the caller first.
#[inline]
fn binary_exponent_f32<const N: usize>(values: Simd<f32, N>) -> Simd<i32, N> {
    let field = (values.to_bits().cast::<i32>() >> Simd::splat(23)) & Simd::splat(0xFF);
    field - Simd::splat(0x7F)
}

/// Base-e exponential of each lane, accurate to the u10 tier (1.0 ULP).
///
/// Measured faithfully rounded: 0.988 ULP maximum over an exhaustive sweep of the non-trivial
/// domain (2.24e9 inputs, `|x| <= 110`), zero misclassified specials, monotone across the
/// reduction boundaries.
#[inline]
pub(crate) fn exp_f32<const N: usize>(values: Simd<f32, N>) -> Simd<f32, N> {
    // Range reduction: with n = round(x / ln 2), exp(x) = 2^n * exp(r)
    // for r = x - n * ln 2, accumulated in two exact steps against the
    // split constants.
    let nearest = (values * Simd::splat(core::f32::consts::LOG2_E)).round_ties_even();
    let exponent = nearest.cast::<i32>();
    // `nearest` is integral, and every lane the backstops leave alive
    // holds it within +/-152, where it equals `exponent` exactly; the
    // reduction uses it directly instead of round-tripping the integer
    // back to float.
    let reduced = nearest.mul_add(-Simd::splat(LN2_HI_F32), values);
    let reduced = nearest.mul_add(-Simd::splat(LN2_LO_F32), reduced);

    // Degree-7 minimax polynomial for exp on the reduced interval, in
    // Horner form: the coefficients sit next to the Taylor series'
    // 1/k! (1/7! = 1.984e-4 down to 1/2! = 0.5), with the low-order
    // digits nudged to spread the truncation error over the interval.
    let tail = Simd::splat(0.000_198_527_62)
        .mul_add(reduced, Simd::splat(0.001_393_043_6))
        .mul_add(reduced, Simd::splat(0.008_333_361))
        .mul_add(reduced, Simd::splat(0.041_666_485))
        .mul_add(reduced, Simd::splat(0.166_666_67))
        .mul_add(reduced, Simd::splat(0.5));
    let poly = Simd::splat(1.) + (reduced * reduced).mul_add(tail, reduced);

    let result = scale_by_pow2_f32(poly, exponent);

    // Backstops only: the natural path rounds correctly through the
    // overflow boundary (ln(f32::MAX) ~ 88.72) and the underflow-to-
    // zero boundary (~ -103.97); the clamps guard the region beyond,
    // where the saturating cast and the exponent-field scaling break
    // down.
    let result = values
        .simd_lt(Simd::splat(-104.))
        .select(Simd::splat(0.), result);
    Simd::splat(100.)
        .simd_lt(values)
        .select(Simd::splat(f32::INFINITY), result)
}

/// Base-2 exponential of each lane, accurate to the u35 tier (3.5 ULP).
///
/// Measured far inside the tier, faithfully rounded: 0.885 ULP maximum over an exhaustive sweep
/// of the non-trivial domain (2.25e9 inputs, `|x| <= 160`). The reduction `x - round(x)` is
/// exact, so the polynomial fit dominates the error budget.
#[inline]
pub(crate) fn exp2_f32<const N: usize>(values: Simd<f32, N>) -> Simd<f32, N> {
    // Range reduction is exact: 2^x = 2^n * 2^f for n = round(x) and
    // f = x - n, |f| <= 1/2.
    let nearest = values.round_ties_even();
    let exponent = nearest.cast::<i32>();
    let fraction = values - nearest;

    // Degree-6 minimax polynomial for 2^f, in Horner form: the Taylor
    // coefficients are ln(2)^k / k! (ln(2)^6/6! = 1.536e-4 down to
    // ln(2)^2/2! = 0.240), minimax-nudged in the low digits; the last
    // two steps add the exact k = 1 and k = 0 terms, ln(2) * f and 1.
    let poly = Simd::splat(0.000_153_592_09)
        .mul_add(fraction, Simd::splat(0.001_339_262_7))
        .mul_add(fraction, Simd::splat(0.009_618_385))
        .mul_add(fraction, Simd::splat(0.055_503_473))
        .mul_add(fraction, Simd::splat(0.240_226_45))
        .mul_add(fraction, Simd::splat(core::f32::consts::LN_2))
        .mul_add(fraction, Simd::splat(1.));

    let result = scale_by_pow2_f32(poly, exponent);

    let result = values
        .simd_ge(Simd::splat(128.))
        .select(Simd::splat(f32::INFINITY), result);
    values
        .simd_lt(Simd::splat(-150.))
        .select(Simd::splat(0.), result)
}

/// Base-2 logarithm of each lane, accurate to the u35 tier (3.5 ULP).
///
/// Measured 3.07 ULP maximum over an exhaustive sweep of all finite positive inputs, with every
/// case above 2 ULP inside `[0.5, 1.5)`, where the result cancels toward zero; outside that band
/// the maximum is 1.6 ULP. The dominant error terms are the roundings of `m + 1` and of the
/// division, amplified when `|result|` is small; sub-ULP accuracy would need a double-float
/// ratio, not a better polynomial.
#[inline]
pub(crate) fn log2_f32<const N: usize>(values: Simd<f32, N>) -> Simd<f32, N> {
    // Subnormal lanes are scaled into the normal range (by 2^64) so
    // the exponent-field read is exact; the factor is repaid on the
    // exponent afterwards. Zero, negative, and NaN lanes compute
    // whatever the arithmetic yields and are overwritten by the
    // selects at the end.
    let is_subnormal = values.is_subnormal();
    let scaled = is_subnormal.select(values * Simd::splat(1.844_674_4e19), values);

    // The 1/0.75 bias centers the mantissa split on [0.75, 1.5), so
    // the ratio below stays small and symmetric around zero.
    let exponent = binary_exponent_f32(scaled * Simd::splat(1. / 0.75));
    let mantissa = scale_by_pow2_direct_f32(scaled, -exponent);
    let exponent = is_subnormal.select(exponent - Simd::splat(64), exponent);

    // The atanh identity: with r = (m-1)/(m+1), ln(m) = 2 atanh(r) =
    // 2 (r + r^3/3 + r^5/5 + ...), so log2(m) is a series in odd
    // powers of r.
    let ratio = (mantissa - Simd::splat(1.)) / (mantissa + Simd::splat(1.));
    let ratio_squared = ratio * ratio;

    // The r^3, r^5, and r^7 coefficients, minimax-nudged from the
    // series' 2/(k ln 2); the final mul_add below adds the exact
    // leading term 2/ln(2) * r and the integer exponent.
    let poly = Simd::splat(0.437_408_83)
        .mul_add(ratio_squared, Simd::splat(0.576_484_4))
        .mul_add(ratio_squared, Simd::splat(0.961_802_4));

    let result = (ratio_squared * ratio).mul_add(
        poly,
        ratio.mul_add(Simd::splat(2. * core::f32::consts::LOG2_E), exponent.cast()),
    );

    let result = values
        .is_infinite()
        .select(Simd::splat(f32::INFINITY), result);

    let result =
        (values.simd_lt(Simd::splat(0.)) | values.is_nan()).select(Simd::splat(f32::NAN), result);
    values
        .simd_eq(Simd::splat(0.))
        .select(Simd::splat(f32::NEG_INFINITY), result)
}

/// Base-e exponential of each lane, accurate to the u10 tier (1.0 ULP).
///
/// Measured faithfully rounded (1.0 ULP maximum) over 242e6 samples including every double
/// adjacent to a reduction boundary `k * ln(2) / 2`, the overflow window around `ln(f64::MAX)`,
/// and the subnormal-output region, where the two-step power-of-two scaling keeps the error at
/// one rounding.
#[inline]
pub(crate) fn exp_f64<const N: usize>(values: Simd<f64, N>) -> Simd<f64, N> {
    // Range reduction: with n = round(x / ln 2), exp(x) = 2^n * exp(r)
    // for r = x - n * ln 2, accumulated in two exact steps against the
    // split constants.
    let nearest = (values * Simd::splat(core::f64::consts::LOG2_E)).round_ties_even();
    let exponent = nearest.cast::<i32>();
    let reduced = nearest.mul_add(-Simd::splat(LN2_HI_F64), values);
    let reduced = nearest.mul_add(-Simd::splat(LN2_LO_F64), reduced);

    // Degree-12 minimax polynomial for exp on the reduced interval,
    // coefficients near the Taylor 1/k! through 1/12!, evaluated in
    // Estrin form: coefficient pairs first, then quads folded over the
    // squared and quartic powers, then the top pair over the octic
    // power. Estrin shortens the dependency chain a Horner ladder
    // would serialize.
    let reduced_2 = reduced * reduced;
    let reduced_4 = reduced_2 * reduced_2;
    let reduced_8 = reduced_4 * reduced_4;

    let pair_01 = reduced.mul_add(
        Simd::splat(0.041_666_666_666_666_505),
        Simd::splat(0.166_666_666_666_666_85),
    );
    let pair_23 = reduced.mul_add(
        Simd::splat(0.001_388_888_888_897_745),
        Simd::splat(0.008_333_333_333_316_527),
    );
    let pair_45 = reduced.mul_add(
        Simd::splat(2.480_158_715_923_547_3e-5),
        Simd::splat(0.000_198_412_698_960_509_2),
    );
    let pair_67 = reduced.mul_add(
        Simd::splat(2.755_739_112_349_004_7e-7),
        Simd::splat(2.755_723_629_119_288_3e-6),
    );
    let pair_89 = reduced.mul_add(
        Simd::splat(2.088_606_211_072_837e-9),
        Simd::splat(2.511_129_308_928_765_2e-8),
    );

    let quad_03 = reduced_2.mul_add(pair_23, pair_01);
    let quad_47 = reduced_2.mul_add(pair_67, pair_45);
    let oct_07 = reduced_4.mul_add(quad_47, quad_03);
    let tail = reduced_8
        .mul_add(pair_89, oct_07)
        .mul_add(reduced, Simd::splat(0.5));

    let poly = Simd::splat(1.) + (reduced * reduced).mul_add(tail, reduced);

    let result = scale_by_pow2_f64(poly, exponent);

    // Backstops only: the natural path rounds correctly through the
    // overflow boundary (ln(f64::MAX) ~ 709.7827) and far past the
    // underflow-to-zero boundary (~ -745.13); the clamps guard the
    // region beyond, where the saturating cast and the exponent-field
    // scaling break down (near |x| = 1421 the biased half-exponent
    // leaves the normal range). Any upper constant in [710, 1421) is
    // correct; one at or below ln(f64::MAX) misclassifies the finite
    // doubles just under the boundary as infinite.
    let result = values
        .simd_gt(Simd::splat(710.))
        .select(Simd::splat(f64::INFINITY), result);

    values
        .simd_lt(Simd::splat(-1000.))
        .select(Simd::splat(0.), result)
}

#[cfg(test)]
#[expect(
    clippy::cast_possible_truncation,
    reason = "narrowing the wider-precision libm result is how each sweep builds its reference"
)]
mod tests {
    use core::simd::prelude::*;

    use super::{exp_f32, exp_f64, exp2_f32, log2_f32};

    // The strides are odd so consecutive samples land in different
    // exponent/mantissa phases; full-bit-range iteration covers
    // negative inputs, subnormals, both zeros, both infinities, and
    // NaN payloads without listing them.
    const F32_STRIDE: usize = 641;
    const F64_STRIDE: usize = 0x0400_0000_000D;

    // Each bound is the kernel's accuracy tier rounded up to whole
    // representation steps plus one step for the reference's own
    // narrowing. A result past the bound is a behavior change, not
    // measurement noise: a wrong constant or a swapped coefficient
    // moves results by orders of magnitude.
    const U10_F32_TOLERANCE: u64 = 2;
    const U35_F32_TOLERANCE: u64 = 4;
    const U10_F64_TOLERANCE: u128 = 2;

    /// Position of a value in the ordered sequence of representable `f32`s.
    ///
    /// Adjacent representable values differ by one across the whole line, including zeros,
    /// subnormals, and infinities, so one distance bound holds without per-class cases.
    fn ordered_f32(value: f32) -> i64 {
        let bits = value.to_bits();
        if bits & 0x8000_0000 == 0 {
            i64::from(bits)
        } else {
            -i64::from(bits & 0x7FFF_FFFF)
        }
    }

    /// Position of a value in the ordered sequence of representable `f64`s.
    fn ordered_f64(value: f64) -> i128 {
        let bits = value.to_bits();
        if bits & 0x8000_0000_0000_0000 == 0 {
            i128::from(bits)
        } else {
            -i128::from(bits & 0x7FFF_FFFF_FFFF_FFFF)
        }
    }

    /// Checks one `f32` lane against its reference.
    ///
    /// NaN must map to NaN; every other pair must sit within `tolerance` representation steps.
    fn assert_lane_f32(name: &str, at: f32, kernel: f32, reference: f32, tolerance: u64) {
        if reference.is_nan() {
            assert!(
                kernel.is_nan(),
                "{name}({at}): kernel {kernel} vs NaN reference"
            );
            return;
        }
        let distance = ordered_f32(kernel).abs_diff(ordered_f32(reference));
        assert!(
            distance <= tolerance,
            "{name}({at}): kernel {kernel} vs libm {reference}, {distance} steps apart"
        );
    }

    #[test]
    fn exp_f32_tracks_libm_across_the_full_bit_range() {
        let mut lanes = [0.0_f32; 8];
        let mut filled = 0;
        for bits in (0..=u32::MAX).step_by(F32_STRIDE) {
            lanes[filled] = f32::from_bits(bits);
            filled += 1;
            if filled == lanes.len() {
                filled = 0;
                let input = Simd::from_array(lanes);
                let output = exp_f32(input);
                for lane in 0..lanes.len() {
                    let reference = f64::from(lanes[lane]).exp() as f32;
                    assert_lane_f32(
                        "exp_f32",
                        lanes[lane],
                        output[lane],
                        reference,
                        U10_F32_TOLERANCE,
                    );
                }
            }
        }
    }

    #[test]
    fn exp2_f32_tracks_libm_across_the_full_bit_range() {
        let mut lanes = [0.0_f32; 8];
        let mut filled = 0;
        for bits in (0..=u32::MAX).step_by(F32_STRIDE) {
            lanes[filled] = f32::from_bits(bits);
            filled += 1;
            if filled == lanes.len() {
                filled = 0;
                let input = Simd::from_array(lanes);
                let output = exp2_f32(input);
                for lane in 0..lanes.len() {
                    let reference = f64::from(lanes[lane]).exp2() as f32;
                    assert_lane_f32(
                        "exp2_f32",
                        lanes[lane],
                        output[lane],
                        reference,
                        U35_F32_TOLERANCE,
                    );
                }
            }
        }
    }

    #[test]
    fn log2_f32_tracks_libm_across_the_full_bit_range() {
        let mut lanes = [0.0_f32; 8];
        let mut filled = 0;
        for bits in (0..=u32::MAX).step_by(F32_STRIDE) {
            lanes[filled] = f32::from_bits(bits);
            filled += 1;
            if filled == lanes.len() {
                filled = 0;
                let input = Simd::from_array(lanes);
                let output = log2_f32(input);
                for lane in 0..lanes.len() {
                    let reference = f64::from(lanes[lane]).log2() as f32;
                    assert_lane_f32(
                        "log2_f32",
                        lanes[lane],
                        output[lane],
                        reference,
                        U35_F32_TOLERANCE,
                    );
                }
            }
        }
    }

    /// Overflow classification at the `f32` boundary matches libm exactly.
    ///
    /// The ordered-step tolerance forgives an infinity one step from `MAX`, so the sweeps above
    /// cannot see a misclassified overflow boundary; this scan pins the class over every
    /// representable input around `ln(f32::MAX)`.
    #[test]
    fn exp_f32_overflow_boundary_is_class_exact() {
        let mut bits = 88.5_f32.to_bits();
        let end = 89.0_f32.to_bits();
        while bits <= end {
            let mut lanes = [0.0_f32; 8];
            for lane in &mut lanes {
                *lane = f32::from_bits(bits);
                bits += 1;
            }
            let output = exp_f32(Simd::from_array(lanes));
            for lane in 0..lanes.len() {
                let reference = f64::from(lanes[lane]).exp() as f32;
                assert_eq!(
                    output[lane].is_infinite(),
                    reference.is_infinite(),
                    "exp_f32({}) overflow class: kernel {} vs libm {reference}",
                    lanes[lane],
                    output[lane]
                );
            }
        }
    }

    /// Overflow classification at the `f64` boundary matches libm exactly.
    ///
    /// This window is doubly invisible to the strided sweep: the stride jumps over it, and the
    /// ordered-step tolerance would forgive an infinity one step from `MAX` anyway. The scan
    /// covers every double from below the retired conservative threshold through `ln(f64::MAX)`
    /// and asserts both the class and the u10 distance.
    #[test]
    fn exp_f64_overflow_boundary_is_class_exact() {
        let mut bits = 709.782_711_f64.to_bits();
        let end = 709.782_713_f64.to_bits();
        while bits <= end {
            let mut lanes = [0.0_f64; 4];
            for lane in &mut lanes {
                *lane = f64::from_bits(bits);
                bits += 1;
            }
            let output = exp_f64(Simd::from_array(lanes));
            for lane in 0..lanes.len() {
                let at = lanes[lane];
                let reference = at.exp();
                assert_eq!(
                    output[lane].is_infinite(),
                    reference.is_infinite(),
                    "exp_f64({at}) overflow class: kernel {} vs libm {reference}",
                    output[lane]
                );
                let distance = ordered_f64(output[lane]).abs_diff(ordered_f64(reference));
                assert!(
                    distance <= U10_F64_TOLERANCE,
                    "exp_f64({at}): kernel {} vs libm {reference}, {distance} steps apart",
                    output[lane]
                );
            }
        }
    }

    #[test]
    fn exp_f64_tracks_libm_across_the_full_bit_range() {
        let mut lanes = [0.0_f64; 4];
        let mut filled = 0;
        for bits in (0..=u64::MAX).step_by(F64_STRIDE) {
            lanes[filled] = f64::from_bits(bits);
            filled += 1;
            if filled == lanes.len() {
                filled = 0;
                let input = Simd::from_array(lanes);
                let output = exp_f64(input);
                for lane in 0..lanes.len() {
                    let at = lanes[lane];
                    let reference = at.exp();
                    if reference.is_nan() {
                        assert!(
                            output[lane].is_nan(),
                            "exp_f64({at}): kernel {} vs NaN reference",
                            output[lane]
                        );
                        continue;
                    }
                    let distance = ordered_f64(output[lane]).abs_diff(ordered_f64(reference));
                    assert!(
                        distance <= U10_F64_TOLERANCE,
                        "exp_f64({at}): kernel {} vs libm {reference}, {distance} steps apart",
                        output[lane]
                    );
                }
            }
        }
    }
}

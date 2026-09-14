//! Vectorized transcendental kernels for the SIMD wrappers in [`math::kernel`](super).
//!
//! [`exp_f32`], [`exp2_f32`], [`log2_f32`], and [`exp_f64`] evaluate their function on every lane
//! of a portable-SIMD vector without a libm call. Range reduction splits the input into an integer
//! power of two and a small residual. A short minimax polynomial approximates the function on the
//! residual. Reconstruction then applies the power of two through direct exponent-field arithmetic.
//! The f32 entry points document SLEEF accuracy tiers (`u10` is within 1.0 ULP, `u35` within 3.5).
//!
//! # Arithmetic
//!
//! Every multiply-accumulate uses fused [`mul_add`](std::simd::StdFloat::mul_add) to round once
//! instead of rounding the product separately. Portable-SIMD arithmetic does not guarantee
//! identical NaN payloads across targets.
//!
//! # Provenance and divergences
//!
//! The algorithms, evaluation order, polynomial coefficients, and range-reduction constants are
//! from the `sleef` crate, version 0.3.3 (MIT OR Apache-2.0), a pure-Rust port of the SLEEF
//! vector math library (Naoki Shibata and contributors, Boost Software License 1.0):
//! <https://github.com/burrbull/sleef-rs>. The entry points correspond to upstream's
//! `f32x::exp_u10`, `f32x::exp2_u35`, `f32x::log2_u35`, and `f64x::exp_u10`. The evaluation differs
//! in these respects:
//!
//! - This module fuses every multiply-accumulate unconditionally. Upstream selects fusion per
//!   target under `cfg!(target_feature = "fma")`, an x86-only cfg string, and rounds twice per step
//!   where it is false. Fused evaluation avoids that extra product rounding.
//! - `exp_f64` keeps the coefficient set of upstream's non-FMA branch, evaluated fused. Upstream's
//!   FMA branch uses a different degree-10 set. Combining fused evaluation with the non-FMA
//!   coefficients matches neither upstream branch bit-for-bit. The coefficient set is the same on
//!   every architecture.
//! - Nearest-integer rounding uses [`round_ties_even`](std::simd::StdFloat::round_ties_even)
//!   directly. Upstream predates the portable-SIMD API and computes the same round-half-to-even
//!   through an add-subtract trick against 2²³ (2⁵² for `f64`) plus sign restoration. The intrinsic
//!   specifies ties-to-even directly, including for inputs already integral at their precision.
//! - Lane suppression selects zero with masks. Polynomial evaluation uses explicit Horner or Estrin
//!   steps, and constant spellings preserve the source values.
//!
//! # Verification
//!
//! The tests compare strided samples of input bit patterns against scalar libm. The f32 reference
//! uses f64 precision before narrowing. The f64 reference uses f64 precision, and the sampling
//! tests do not establish a worst-case error bound over all f64 inputs. [`math::kernel`](super)'s
//! tests assert special points separately.

use core::{
    f32, f64, f128,
    simd::{
        Select as _, Simd,
        cmp::{SimdPartialEq as _, SimdPartialOrd as _},
        num::{SimdFloat as _, SimdInt as _, SimdUint as _},
    },
};
use std::simd::StdFloat as _;

// A product is exact when its significand fits the destination precision and its exponent is in
// range. Clearing nine low bits leaves at most 15 significand bits in the f32 coarse part, and
// clearing twelve leaves at most 41 in f64. The reduction integers need at most nine and twelve
// bits respectively. Therefore their coarse products are exact. The low part corrects the
// truncation, but its stored value and the residual FMA still carry rounding error.
/// The low `f32` mantissa bits zeroed in the coarse part of `ln 2`: nine bits.
const F32_MASK: u32 = 0x1FF;
/// The coarse part of `ln 2` in `f32`, exact under multiplication by integers below `2⁹`.
const LN2_HI_F32: f32 = f32::from_bits(f32::consts::LN_2.to_bits() & !F32_MASK);
/// The correctly rounded `f32` remainder `ln 2 - LN2_HI_F32`, computed in `f64`.
#[expect(
    clippy::cast_possible_truncation,
    reason = "the cast is the derivation's rounding step: the remainder is correctly rounded into \
              the narrower type"
)]
const LN2_LO_F32: f32 = (f64::consts::LN_2 - (LN2_HI_F32 as f64)) as f32;

/// The low `f64` mantissa bits zeroed in the coarse part of `ln 2`: twelve bits.
const F64_MASK: u64 = 0xFFF;
/// The coarse part of `ln 2` in `f64`, exact under multiplication by integers below `2¹²`.
const LN2_HI_F64: f64 = f64::from_bits(f64::consts::LN_2.to_bits() & !F64_MASK);
/// The correctly rounded `f64` remainder `ln 2 - LN2_HI_F64`, computed in `f128`.
const LN2_LO_F64: f64 = (f128::consts::LN_2 - (LN2_HI_F64 as f128)) as f64;

/// Constructs single-precision power-of-two exponent fields.
///
/// For integer n in [−126, 127], the result is exactly 2ⁿ. Other exponents need not encode that
/// power. Use [`scale_by_pow2_f32`] for split scaling.
#[inline]
fn pow2_f32<const N: usize>(exponent: Simd<i32, N>) -> Simd<f32, N> {
    // 0x7F is the f32 exponent bias, and 23 the mantissa width.
    Simd::from_bits(((exponent + Simd::splat(0x7F)) << Simd::splat(23)).cast())
}

/// Constructs double-precision power-of-two exponent fields.
///
/// For integer n in [−1022, 1023], the result is exactly 2ⁿ. Other exponents need not encode that
/// power.
#[inline]
fn pow2_f64<const N: usize>(exponent: Simd<i32, N>) -> Simd<f64, N> {
    // 0x3FF is the f64 exponent bias, and the field starts at bit 52, twenty bits into the upper
    // 32-bit half. The shifts split that offset as 32 + 20, with widening to i64 before either
    // shift.
    let biased = Simd::splat(0x3FF) + exponent;
    let upper = biased.cast::<i64>() << Simd::splat(32);
    Simd::from_bits((upper << Simd::splat(20)).cast())
}

/// Scales each lane by an integer power of two in two steps.
///
/// The split exponents are ⌊n/2⌋ and n − ⌊n/2⌋ for exponent n. When both constructed powers and the
/// first scaled value are normal, the first multiplication is exact. The second multiplication
/// supplies the final rounding if the result is subnormal or overflows. Splitting permits
/// reconstruction even when a single scale factor would already be zero or infinite.
///
/// Outside those conditions, this helper has no general power-of-two scaling guarantee. The
/// transcendental entry points also evaluate non-finite and out-of-range lanes here. Their final
/// masks and NaN arithmetic determine the results for those lanes.
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

/// Adds each lane's scale exponent to its stored exponent field.
///
/// This represents exact multiplication by 2ⁿ when the input and mathematical result are both
/// normal. The logarithm's finite positive lanes satisfy that range. Exceptional lanes are
/// evaluated here too, then replaced by the logarithm's final masks.
#[inline]
fn scale_by_pow2_direct_f32<const N: usize>(
    values: Simd<f32, N>,
    exponent: Simd<i32, N>,
) -> Simd<f32, N> {
    Simd::from_bits((values.to_bits().cast() + (exponent << Simd::splat(23))).cast())
}

/// Extracts each exponent field and subtracts the single-precision bias.
///
/// For a normal lane x, this equals ⌊log₂|x|⌋. A zero exponent field yields −127, and an all-ones
/// field yields 128. The helper does not validate normality.
#[inline]
fn binary_exponent_f32<const N: usize>(values: Simd<f32, N>) -> Simd<i32, N> {
    let field = (values.to_bits().cast::<i32>() >> Simd::splat(23)) & Simd::splat(0xFF);
    field - Simd::splat(0x7F)
}

/// Approximates the base-e exponential with the u10 accuracy target.
///
/// The recorded exhaustive sweep of `|x| ≤ 110` (2.24e9 inputs) measured a maximum error of 0.988
/// ULP against `f64` libm. This measurement uses a wider reference whose exactness it does not
/// establish.
#[inline]
pub(crate) fn exp_f32<const N: usize>(values: Simd<f32, N>) -> Simd<f32, N> {
    // choose n near x / ln 2 and approximate r = x − n · ln 2. The identity
    // exp(x) = 2ⁿ · exp(r) separates reconstruction from the small-residual approximation.
    // The two FMAs subtract the split constant without separately rounding their products.
    let nearest = (values * Simd::splat(core::f32::consts::LOG2_E)).round_ties_even();
    let exponent = nearest.cast::<i32>();
    // for finite lanes in [−104, 100], nearest is integral within [−150, 144] and equals exponent
    // exactly. Use it directly rather than converting the integer back to float.
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

    // reconstruction handles the neighbourhoods of overflow (x ≈ 88.72) and rounding to zero (x ≈
    // −103.97). These masks enforce the more distant results and discard out-of-range
    // exponent-field calculations. Within [−104, 100], both split power-of-two factors remain
    // normal.
    let result = values
        .simd_lt(Simd::splat(-104.))
        .select(Simd::splat(0.), result);
    Simd::splat(100.)
        .simd_lt(values)
        .select(Simd::splat(f32::INFINITY), result)
}

/// Approximates the base-2 exponential with the u35 accuracy target.
///
/// The recorded exhaustive sweep of `|x| ≤ 160` (2.25e9 inputs) measured a maximum error of
/// 0.885 ULP against `f64` libm. In this range the reduction `x - round(x)` is exact. Polynomial
/// evaluation and reconstruction still round.
#[inline]
pub(crate) fn exp2_f32<const N: usize>(values: Simd<f32, N>) -> Simd<f32, N> {
    // for finite lanes in [−150, 128), n = round(x) and f = x − n give an exact subtraction with
    // |f| ≤ 1/2. The identity is 2ˣ = 2ⁿ · 2ᶠ.
    let nearest = values.round_ties_even();
    let exponent = nearest.cast::<i32>();
    let fraction = values - nearest;

    // degree-6 minimax polynomial for 2ᶠ in Horner form. Its coefficients approximate ln(2)ᵏ/k!,
    // from ln(2)⁶/6! ≈ 1.540e−4 to ln(2)²/2! ≈ 0.240, adjusted in the low digits. The final steps
    // add the linear term using rounded ln(2), then the constant 1.
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

/// Approximates the base-2 logarithm with the u35 accuracy target.
///
/// The recorded exhaustive sweep of finite positive inputs measured 3.07 ULP maximum against
/// `f64` libm. Every measured case above 2 ULP was inside `[0.5, 1.5)`, where the logarithm
/// approaches zero. Outside that interval the measured maximum was 1.6 ULP. Rounding in the
/// reduced ratio contributes error before polynomial evaluation begins.
///
/// Either zero yields negative infinity. Negative inputs and NaN yield NaN, and positive infinity
/// yields positive infinity.
#[inline]
pub(crate) fn log2_f32<const N: usize>(values: Simd<f32, N>) -> Simd<f32, N> {
    // multiplication by 2⁶⁴ brings finite subnormal lanes into the normal range exactly.
    // Subtracting 64 from the recovered exponent compensates for that scale. Final masks supply the
    // zero, negative, infinite and NaN results.
    let is_subnormal = values.is_subnormal();
    let scaled = is_subnormal.select(values * Simd::splat(1.844_674_4e19), values);

    // the 1/0.75 bias targets a mantissa near [0.75, 1.5), keeping the ratio below near zero. For
    // sufficiently large finite inputs the biased product overflows. Its all-ones exponent field
    // yields 128, the exponent needed to scale those inputs into this interval.
    let exponent = binary_exponent_f32(scaled * Simd::splat(1. / 0.75));
    let mantissa = scale_by_pow2_direct_f32(scaled, -exponent);
    let exponent = is_subnormal.select(exponent - Simd::splat(64), exponent);

    // with r = (m − 1)/(m + 1), the identity ln(m) = 2 atanh(r) = 2(r + r³/3 + r⁵/5 + ...)
    // expresses log₂(m) as a series in odd powers of r.
    let ratio = (mantissa - Simd::splat(1.)) / (mantissa + Simd::splat(1.));
    let ratio_squared = ratio * ratio;

    // the r³, r⁵ and r⁷ coefficients approximate the series terms 2/(k · ln 2).
    // The final FMA combines the polynomial correction with the leading term, whose
    // coefficient 2/ln(2) is rounded to f32, and the integer exponent.
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

/// Approximates the base-e exponential in each lane.
///
/// Reconstruction applies its power-of-two scale in two steps to avoid overflowing or underflowing
/// the scale factor before multiplication.
#[inline]
pub(crate) fn exp_f64<const N: usize>(values: Simd<f64, N>) -> Simd<f64, N> {
    // use exp(x) = 2ⁿ · exp(r), with n near x / ln 2 and r ≈ x − n · ln 2.
    // The coarse product is exact in the unclamped range. The low-part FMA corrects the
    // split's truncation and rounds the residual once.
    let nearest = (values * Simd::splat(core::f64::consts::LOG2_E)).round_ties_even();
    let exponent = nearest.cast::<i32>();
    let reduced = nearest.mul_add(-Simd::splat(LN2_HI_F64), values);
    let reduced = nearest.mul_add(-Simd::splat(LN2_LO_F64), reduced);

    // Degree-12 minimax polynomial for exp on the reduced interval, coefficients near the Taylor
    // 1/k! through 1/12!, evaluated in Estrin form. The ladder folds coefficient pairs first, then
    // quads over the squared and quartic powers, then the top pair over the octic power. Estrin
    // shortens the dependency chain a Horner ladder would serialize.
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

    // reconstruction handles the neighbourhoods of overflow (x ≈ 709.7827) and rounding to zero (x
    // ≈ −745.13). The masks enforce more distant results. Finite lanes retained in [−1000, 710]
    // have reduction integers in [−1443, 1024], whose two half-exponents remain in the normal
    // power-of-two range. The upper mask leaves finite results near the overflow boundary to
    // reconstruction.
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
    use core::simd::Simd;

    use super::{exp_f32, exp_f64, exp2_f32, log2_f32};

    // odd strides sample different exponent and significand bit patterns across both signs.
    // They do not visit every special encoding. Separate tests supply selected boundary cases.
    /// The sampling stride through the `u32` bit space.
    const F32_STRIDE: usize = 641;
    /// Odd stride through the `u64` bit space with the same coverage for `f64` inputs.
    const F64_STRIDE: usize = 0x0400_0000_000D;

    /// Representation-step budget for the `u10` single-precision sample test.
    ///
    /// The budget is ⌈1.0 + 0.5⌉ = 2, adding a nominal half-step narrowing allowance to the tier.
    /// The wider libm reference is itself approximate. This comparison budget is not a certified
    /// error bound against the exact function.
    const U10_F32_TOLERANCE: u64 = 2;
    /// Representation-step budget for the `u35` single-precision sample tests.
    ///
    /// The budget is ⌈3.5 + 0.5⌉ = 4, using the same reference model as [`U10_F32_TOLERANCE`].
    const U35_F32_TOLERANCE: u64 = 4;
    /// Allowed representation-step distance from the scalar f64 libm reference.
    const U10_F64_TOLERANCE: u128 = 2;

    /// Maps a single-precision encoding to a signed representation-step index.
    ///
    /// Adjacent distinct non-NaN values differ by one, including the subnormal and infinity
    /// boundaries. Both zeros map to zero. NaN encodings have indices beyond the corresponding
    /// infinity, without numerical-distance semantics.
    fn ordered_f32(value: f32) -> i64 {
        let bits = value.to_bits();
        if bits & 0x8000_0000 == 0 {
            i64::from(bits)
        } else {
            -i64::from(bits & 0x7FFF_FFFF)
        }
    }

    /// Maps a double-precision encoding to a signed representation-step index.
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
    /// A NaN reference requires a NaN output. Every other pair is compared by encoding distance,
    /// including across the finite/infinite and infinite/NaN boundaries.
    ///
    /// # Panics
    ///
    /// Panics if a NaN reference has a non-NaN output or the encoding distance exceeds `tolerance`.
    #[track_caller]
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
    fn exp_f32_libm_samples() {
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
    fn exp2_f32_libm_samples() {
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
    fn log2_f32_libm_samples() {
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
    /// The ordered-step tolerance cannot distinguish infinity from an adjacent `MAX`. This scan
    /// compares the class over every representable input around `ln(f32::MAX)`, independently of
    /// that distance tolerance.
    #[test]
    fn exp_f32_overflow_class() {
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
    /// The strided sweep can skip the overflow transition, and its representation-step tolerance
    /// permits infinity beside `MAX`. This scan checks classification and distance at every
    /// representable input in `[709.782711, 709.782713]`, which straddles that transition.
    #[test]
    fn exp_f64_overflow_class() {
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
    fn exp_f64_libm_samples() {
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

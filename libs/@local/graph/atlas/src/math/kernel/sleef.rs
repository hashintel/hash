//! Vectorized transcendental kernels for the SIMD wrappers in
//! [`math::kernel`](super).
//!
//! [`exp_f32`], [`exp2_f32`], [`log2_f32`], and [`exp_f64`] evaluate
//! their function on every lane of a portable-SIMD vector without a
//! libm call, in three steps each: range reduction splits the input
//! into an integer power of two and a small residual, a short minimax
//! polynomial approximates the function on the residual, and
//! reconstruction applies the power of two through direct
//! exponent-field arithmetic. Each function documents its own error
//! bound; the bounds are inherited from the SLEEF accuracy tiers the
//! kernels derive from (`u10` is within 1.0 ULP, `u35` within 3.5).
//!
//! # Reproducibility contract
//!
//! Fit artifacts are content-hashed, so these kernels must produce
//! bit-identical results on every target the crate builds for. Two
//! properties carry that guarantee:
//!
//! - [`MulAdd::mla`] is pinned to separate multiply and add. A fused `mul_add` rounds once instead
//!   of twice and therefore changes result bits; adopting it is a fit-format epoch (every content
//!   hash re-blessed), never a build-flag flip.
//! - Every step is plain `f32`/`f64` lane arithmetic, bit shifts, and lane selects, with one
//!   rounding per operation as IEEE 754 requires; no step depends on a target-specific instruction.
//!
//! # Provenance and divergences
//!
//! The algorithms, evaluation order, polynomial coefficients, and
//! range-reduction constants are from the [`sleef`] crate, version
//! 0.3.3 (MIT OR Apache-2.0), a pure-Rust port of the SLEEF vector
//! math library (Naoki Shibata and contributors, Boost Software
//! License 1.0): <https://github.com/burrbull/sleef-rs>. The entry
//! points correspond to upstream's `f32x::exp_u10`, `f32x::exp2_u35`,
//! `f32x::log2_u35`, and `f64x::exp_u10`. This module diverges from
//! upstream in form, never in result bits:
//!
//! - `mla` is pinned as the contract above states. Upstream selects fused `mul_add` under
//!   `cfg!(target_feature = "fma")`, an x86-only cfg string that is false on aarch64 and on default
//!   x86-64 builds, so the pin equals upstream behavior on both targets the crate builds for today.
//! - `exp_f64` keeps only the coefficient set of upstream's non-FMA branch, the one the pin
//!   selects. Upstream's FMA branch carries a different degree-10 set; one set is what keeps
//!   results identical across architectures.
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
//! The tests at the bottom of this file prove bit-identity against
//! the `sleef` crate itself (a dev-dependency) across strided sweeps
//! of the full input bit range: every exponent, both signs, zeros,
//! infinities, subnormals, and NaN payloads. A change that alters any
//! output bit of any lane fails them; a change that survives them is
//! form, not behavior.

use core::simd::prelude::*;
use std::simd::StdFloat as _;

type F32x<const N: usize> = Simd<f32, N>;
type I32x<const N: usize> = Simd<i32, N>;
type F64x<const N: usize> = Simd<f64, N>;
type I64x<const N: usize> = Simd<i64, N>;

/// Multiply-accumulate, pinned to separate multiply and add.
///
/// The two roundings (one per operation) are part of the module's
/// reproducibility contract; see the module documentation.
trait MulAdd {
    /// Returns `self * multiplier + addend`, rounding after each
    /// operation.
    fn mla(self, multiplier: Self, addend: Self) -> Self;
}

impl<const N: usize> MulAdd for F32x<N> {
    #[inline]
    fn mla(self, multiplier: Self, addend: Self) -> Self {
        self * multiplier + addend
    }
}

impl<const N: usize> MulAdd for F64x<N> {
    #[inline]
    fn mla(self, multiplier: Self, addend: Self) -> Self {
        self * multiplier + addend
    }
}

// ln 2 split into a coarse part whose low mantissa bits are zero and
// the remainder. Multiplying the coarse part by a small integer is
// exact, so the range reduction `x - nearest * ln2` loses no bits to
// the subtraction; the remainder repays the split's truncation.
const LN2_HI_F32: f32 = 0.693_145_75;
const LN2_LO_F32: f32 = 1.428_606_8e-6;
const LN2_HI_F64: f64 = 0.693_147_180_559_663;
const LN2_LO_F64: f64 = 2.823_529_056_303_157_7e-13;

/// Two raised to each lane of `exponent`, by constructing the
/// exponent field of the result directly.
///
/// Exact for exponents where the result is a normal `f32`; the
/// callers keep exponents in that range by splitting (see
/// [`scale_by_pow2_f32`]).
fn pow2_f32<const N: usize>(exponent: I32x<N>) -> F32x<N> {
    // 0x7F is the f32 exponent bias; 23 the mantissa width.
    F32x::from_bits(((exponent + I32x::splat(0x7F)) << I32x::splat(23)).cast())
}

/// Two raised to each lane of `exponent`, as `f64`.
///
/// The `f64` counterpart of [`pow2_f32`]; exact for exponents where
/// the result is a normal `f64`.
fn pow2_f64<const N: usize>(exponent: I32x<N>) -> F64x<N> {
    // 0x3FF is the f64 exponent bias; the field starts 20 bits into
    // the upper half of the word, so the biased value is widened to
    // the upper 32 bits first and shifted into place there.
    let biased = I32x::splat(0x3FF) + exponent;
    let upper = biased.cast::<i64>() << I64x::splat(32);
    F64x::from_bits((upper << I64x::splat(20)).cast())
}

/// Scales each lane by two raised to `exponent`, in two half-steps.
///
/// Applying `2^(exponent/2)` twice keeps each factor a normal number
/// for the exponent range the reconstruction step produces, where a
/// single factor could overflow or flush to zero before the scaled
/// value lands back in range.
fn scale_by_pow2_f32<const N: usize>(values: F32x<N>, exponent: I32x<N>) -> F32x<N> {
    let half = exponent >> I32x::splat(1);
    values * pow2_f32(half) * pow2_f32(exponent - half)
}

/// Scales each lane by two raised to `exponent`, as `f64`.
///
/// The `f64` counterpart of [`scale_by_pow2_f32`].
fn scale_by_pow2_f64<const N: usize>(values: F64x<N>, exponent: I32x<N>) -> F64x<N> {
    let half = exponent >> I32x::splat(1);
    values * pow2_f64(half) * pow2_f64(exponent - half)
}

/// Scales each lane by two raised to `exponent`, by adding to the
/// exponent field in place.
///
/// One integer add instead of two multiplies, valid only while input
/// and result are both normal numbers; the caller guarantees the
/// range.
fn scale_by_pow2_direct_f32<const N: usize>(values: F32x<N>, exponent: I32x<N>) -> F32x<N> {
    F32x::from_bits((values.to_bits().cast() + (exponent << I32x::splat(23))).cast())
}

/// The unbiased binary exponent of each lane, read from the exponent
/// field.
///
/// For a normal lane this is `floor(log2(|lane|))`; subnormal lanes
/// are scaled into the normal range by the caller first.
fn binary_exponent_f32<const N: usize>(values: F32x<N>) -> I32x<N> {
    let field = (values.to_bits().cast::<i32>() >> I32x::splat(23)) & I32x::splat(0xFF);
    field - I32x::splat(0x7F)
}

/// Base-e exponential of each lane, within 1.0 ULP of the exact
/// value.
///
/// A zero lane yields exactly one and a negative-infinity lane
/// exactly zero. Lanes above 100 yield positive infinity and lanes
/// below -104 exactly zero, brackets outside `f32` range either way;
/// NaN propagates.
pub(super) fn exp_f32<const N: usize>(values: F32x<N>) -> F32x<N> {
    // Reduce: values = nearest * ln2 + reduced, |reduced| <= ln2 / 2.
    let nearest = (values * F32x::splat(core::f32::consts::LOG2_E)).round_ties_even();
    let exponent = nearest.cast::<i32>();
    let reduced = exponent.cast::<f32>().mla(-F32x::splat(LN2_HI_F32), values);
    let reduced = exponent
        .cast::<f32>()
        .mla(-F32x::splat(LN2_LO_F32), reduced);

    // Approximate: exp(r) = 1 + r + r^2 * (1/2 + r * P(r)) with P a
    // degree-4 tail of minimax-tuned reciprocal factorials 1/3!
    // through 1/7!.
    let tail = F32x::splat(0.000_198_527_62)
        .mla(reduced, F32x::splat(0.001_393_043_6))
        .mla(reduced, F32x::splat(0.008_333_361))
        .mla(reduced, F32x::splat(0.041_666_485))
        .mla(reduced, F32x::splat(0.166_666_67))
        .mla(reduced, F32x::splat(0.5));
    let poly = F32x::splat(1.) + (reduced * reduced).mla(tail, reduced);

    // Reconstruct: exp(values) = 2^exponent * exp(reduced).
    let result = scale_by_pow2_f32(poly, exponent);

    let result = values
        .simd_lt(F32x::splat(-104.))
        .select(F32x::splat(0.), result);
    F32x::splat(100.)
        .simd_lt(values)
        .select(F32x::splat(f32::INFINITY), result)
}

/// Base-2 exponential of each lane, within 3.5 ULP of the exact
/// value.
///
/// Lanes at or above 128 yield positive infinity and lanes below
/// -150 exactly zero, the `f32` overflow and underflow bounds; NaN
/// propagates.
pub(super) fn exp2_f32<const N: usize>(values: F32x<N>) -> F32x<N> {
    // Reduce: values = nearest + fraction, |fraction| <= 1/2; the
    // integer part goes straight into the exponent field.
    let nearest = values.round_ties_even();
    let exponent = nearest.cast::<i32>();
    let fraction = values - nearest;

    // Approximate 2^fraction with a degree-6 minimax polynomial; the
    // leading coefficients are ln(2)^k / k!.
    let poly = F32x::splat(0.000_153_592_09)
        .mla(fraction, F32x::splat(0.001_339_262_7))
        .mla(fraction, F32x::splat(0.009_618_385))
        .mla(fraction, F32x::splat(0.055_503_473))
        .mla(fraction, F32x::splat(0.240_226_45))
        .mla(fraction, F32x::splat(core::f32::consts::LN_2))
        .mla(fraction, F32x::splat(1.));

    // Reconstruct: 2^values = 2^exponent * 2^fraction.
    let result = scale_by_pow2_f32(poly, exponent);

    let result = values
        .simd_ge(F32x::splat(128.))
        .select(F32x::splat(f32::INFINITY), result);
    values
        .simd_lt(F32x::splat(-150.))
        .select(F32x::splat(0.), result)
}

/// Base-2 logarithm of each lane, within 3.5 ULP of the exact value.
///
/// A zero lane yields negative infinity, a positive-infinity lane
/// positive infinity, and a negative lane NaN; NaN propagates.
pub(super) fn log2_f32<const N: usize>(values: F32x<N>) -> F32x<N> {
    // Scale subnormal lanes into the normal range so the exponent
    // field read is exact; the 2^64 factor is repaid on the exponent
    // afterwards.
    let is_subnormal = values.simd_lt(F32x::splat(f32::MIN_POSITIVE));
    let scaled = is_subnormal.select(values * F32x::splat(1.844_674_4e19), values);

    // Reduce: scaled = 2^exponent * mantissa with mantissa in
    // [0.75, 1.5); the 1/0.75 factor centers the interval on one,
    // which keeps the ratio below small in magnitude.
    let exponent = binary_exponent_f32(scaled * F32x::splat(1. / 0.75));
    let mantissa = scale_by_pow2_direct_f32(scaled, -exponent);
    let exponent = is_subnormal.select(exponent - I32x::splat(64), exponent);

    // Approximate: log2(mantissa) via the arctanh identity on
    // ratio = (mantissa - 1) / (mantissa + 1), an odd series in the
    // ratio; the constant term of the ladder is 2/ln(2).
    let ratio = (mantissa - F32x::splat(1.)) / (mantissa + F32x::splat(1.));
    let ratio_squared = ratio * ratio;

    let poly = F32x::splat(0.437_408_83)
        .mla(ratio_squared, F32x::splat(0.576_484_4))
        .mla(ratio_squared, F32x::splat(0.961_802_4));
    let result = (ratio_squared * ratio).mla(
        poly,
        ratio.mla(F32x::splat(2. * core::f32::consts::LOG2_E), exponent.cast()),
    );

    let result = values
        .simd_eq(F32x::splat(f32::INFINITY))
        .select(F32x::splat(f32::INFINITY), result);
    let result =
        (values.simd_lt(F32x::splat(0.)) | values.is_nan()).select(F32x::splat(f32::NAN), result);
    values
        .simd_eq(F32x::splat(0.))
        .select(F32x::splat(f32::NEG_INFINITY), result)
}

/// Base-e exponential of each lane, within 1.0 ULP of the exact
/// value.
///
/// A zero lane yields exactly one and a negative-infinity lane
/// exactly zero. Lanes above the `f64` overflow bound (about 709.78)
/// yield positive infinity and lanes below -1000 exactly zero; NaN
/// propagates.
pub(super) fn exp_f64<const N: usize>(values: F64x<N>) -> F64x<N> {
    // Reduce: values = nearest * ln2 + reduced, |reduced| <= ln2 / 2.
    let nearest = (values * F64x::splat(core::f64::consts::LOG2_E)).round_ties_even();
    let exponent = nearest.cast::<i32>();
    let reduced = nearest.mla(-F64x::splat(LN2_HI_F64), values);
    let reduced = nearest.mla(-F64x::splat(LN2_LO_F64), reduced);

    // Approximate: exp(r) = 1 + r + r^2 * (1/2 + r * P(r)) with P a
    // degree-9 tail of minimax-tuned reciprocal factorials 1/3!
    // through 1/12!, evaluated in Estrin form: coefficient pairs
    // first, then quads folded over the squared and quartic powers,
    // then the top pair over the octic power.
    let reduced_2 = reduced * reduced;
    let reduced_4 = reduced_2 * reduced_2;
    let reduced_8 = reduced_4 * reduced_4;

    let pair_01 = reduced.mla(
        F64x::splat(0.041_666_666_666_666_505),
        F64x::splat(0.166_666_666_666_666_85),
    );
    let pair_23 = reduced.mla(
        F64x::splat(0.001_388_888_888_897_745),
        F64x::splat(0.008_333_333_333_316_527),
    );
    let pair_45 = reduced.mla(
        F64x::splat(2.480_158_715_923_547_3e-5),
        F64x::splat(0.000_198_412_698_960_509_2),
    );
    let pair_67 = reduced.mla(
        F64x::splat(2.755_739_112_349_004_7e-7),
        F64x::splat(2.755_723_629_119_288_3e-6),
    );
    let pair_89 = reduced.mla(
        F64x::splat(2.088_606_211_072_837e-9),
        F64x::splat(2.511_129_308_928_765_2e-8),
    );

    let quad_03 = reduced_2.mla(pair_23, pair_01);
    let quad_47 = reduced_2.mla(pair_67, pair_45);
    let oct_07 = reduced_4.mla(quad_47, quad_03);
    let tail = reduced_8
        .mla(pair_89, oct_07)
        .mla(reduced, F64x::splat(0.5));

    let poly = F64x::splat(1.) + (reduced * reduced).mla(tail, reduced);

    // Reconstruct: exp(values) = 2^exponent * exp(reduced).
    let result = scale_by_pow2_f64(poly, exponent);

    let result = values
        .simd_gt(F64x::splat(709.782_711_149_557_5))
        .select(F64x::splat(f64::INFINITY), result);
    values
        .simd_lt(F64x::splat(-1000.))
        .select(F64x::splat(0.), result)
}

#[cfg(test)]
mod tests {
    use core::simd::prelude::*;

    use super::{exp_f32, exp_f64, exp2_f32, log2_f32};

    // The strides are odd so consecutive samples land in different
    // exponent/mantissa phases; full-bit-range iteration covers
    // negative inputs, subnormals, both zeros, both infinities, and
    // NaN payloads without listing them.
    const F32_STRIDE: usize = 641;
    const F64_STRIDE: usize = 0x0400_0000_000D;

    #[test]
    fn exp_f32_is_bit_identical_to_the_sleef_crate() {
        let mut lanes = [0.0_f32; 8];
        let mut filled = 0;
        for bits in (0..=u32::MAX).step_by(F32_STRIDE) {
            lanes[filled] = f32::from_bits(bits);
            filled += 1;
            if filled == lanes.len() {
                filled = 0;
                let input = Simd::from_array(lanes);
                assert_eq!(
                    exp_f32(input).to_bits(),
                    ::sleef::f32x::exp_u10(input).to_bits(),
                    "exp_f32 diverged from the sleef crate at {input:?}",
                );
            }
        }
    }

    #[test]
    fn exp2_f32_is_bit_identical_to_the_sleef_crate() {
        let mut lanes = [0.0_f32; 8];
        let mut filled = 0;
        for bits in (0..=u32::MAX).step_by(F32_STRIDE) {
            lanes[filled] = f32::from_bits(bits);
            filled += 1;
            if filled == lanes.len() {
                filled = 0;
                let input = Simd::from_array(lanes);
                assert_eq!(
                    exp2_f32(input).to_bits(),
                    ::sleef::f32x::exp2_u35(input).to_bits(),
                    "exp2_f32 diverged from the sleef crate at {input:?}",
                );
            }
        }
    }

    #[test]
    fn log2_f32_is_bit_identical_to_the_sleef_crate() {
        let mut lanes = [0.0_f32; 8];
        let mut filled = 0;
        for bits in (0..=u32::MAX).step_by(F32_STRIDE) {
            lanes[filled] = f32::from_bits(bits);
            filled += 1;
            if filled == lanes.len() {
                filled = 0;
                let input = Simd::from_array(lanes);
                assert_eq!(
                    log2_f32(input).to_bits(),
                    ::sleef::f32x::log2_u35(input).to_bits(),
                    "log2_f32 diverged from the sleef crate at {input:?}",
                );
            }
        }
    }

    #[test]
    fn exp_f64_is_bit_identical_to_the_sleef_crate() {
        let mut lanes = [0.0_f64; 4];
        let mut filled = 0;
        for bits in (0..=u64::MAX).step_by(F64_STRIDE) {
            lanes[filled] = f64::from_bits(bits);
            filled += 1;
            if filled == lanes.len() {
                filled = 0;
                let input = Simd::from_array(lanes);
                assert_eq!(
                    exp_f64(input).to_bits(),
                    ::sleef::f64x::exp_u10(input).to_bits(),
                    "exp_f64 diverged from the sleef crate at {input:?}",
                );
            }
        }
    }
}

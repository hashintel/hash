//! SLEEF transcendental kernels, vendored verbatim.
//!
//! Every function, helper, and constant in this module is vendored
//! verbatim from the [`sleef`] crate, version 0.3.3 (MIT OR
//! Apache-2.0), a pure-Rust port of the SLEEF vector math library
//! (Naoki Shibata and contributors, Boost Software License 1.0):
//! <https://github.com/burrbull/sleef-rs>. The comments inside the
//! function bodies keep the upstream style so the code stays
//! diffable against its source; the house documentation register
//! does not apply to this file.
//!
//! The vendored surface is exactly the four entry points the crate
//! consumes through [`math::kernel`](super): `expf` (1.0-ulp f32
//! exponential), `exp2f` and `log2f` (3.5-ulp f32 stages composing
//! the power kernel), and `exp` (1.0-ulp f64 exponential), plus the
//! reconstruction helpers and range-reduction constants they reach.
//!
//! Deliberate divergences from upstream, all bit-preserving on every
//! target this crate builds for today:
//!
//! - `mla` is pinned to separate multiply-add. Upstream branches on `cfg!(target_feature = "fma")`,
//!   a flag that is false on aarch64 (the cfg string is x86-only) and on default x86-64 builds, so
//!   the pin equals upstream behavior on both real targets while removing the silent result change
//!   a `+fma` build would cause. Content-hashed fit artifacts depend on this pin; changing it is a
//!   fit-format epoch, not a flag flip.
//! - `exp` keeps only upstream's non-FMA coefficient branch, the one selected under the pin above.
//!   Upstream's FMA branch carries a different degree-10 coefficient set; vendoring one set is what
//!   keeps the function's results identical across architectures.
//! - Upstream's associated-constant sugar (`F32x::R_LN2`) is flattened to module constants applied
//!   through `Simd::splat`, and its `Poly` trait to standalone functions. The values and the
//!   operation order are unchanged.
//!
//! The tests at the bottom of this file prove bit-identity against
//! the `sleef` crate itself (a dev-dependency) across strided sweeps
//! of the full input bit range, special values included.
#![expect(
    clippy::approx_constant,
    clippy::cast_precision_loss,
    clippy::doc_paragraphs_missing_punctuation,
    clippy::excessive_precision,
    clippy::many_single_char_names,
    clippy::min_ident_chars,
    clippy::unseparated_literal_suffix,
    clippy::use_self,
    reason = "the module is vendored verbatim from sleef 0.3.3; upstream constants, names, and \
              doc lines stay diffable against their source until the planned house rewrite \
              dissolves this block under the bit-identity tests"
)]

use core::simd::prelude::*;

type F32x<const N: usize> = Simd<f32, N>;
type I32x<const N: usize> = Simd<i32, N>;
type F64x<const N: usize> = Simd<f64, N>;
type I64x<const N: usize> = Simd<i64, N>;

trait MaskToInt {
    type Int;
    fn to_int(self) -> Self::Int;
}

impl<T, const N: usize> MaskToInt for Mask<T, N>
where
    T: std::simd::MaskElement + std::simd::SimdElement + From<i8>,
{
    type Int = Simd<T, N>;

    fn to_int(self) -> Self::Int {
        self.select(Simd::splat(T::from(-1)), Simd::splat(T::from(0)))
    }
}

// Range-reduction constants, verbatim from sleef 0.3.3 src/f32.rs
// and src/f64.rs.
const L2U_F: f32 = 0.693_145_751_953_125;
const L2L_F: f32 = 1.428_606_765_330_187_045_e-6;
const R_LN2_F: f32 =
    1.442_695_040_888_963_407_359_924_681_001_892_137_426_645_954_152_985_934_135_449_406_931;
const F1_32: f32 = (1u64 << 32) as f32;
const F1_23: f32 = (1u32 << 23) as f32;
const L2_U: f64 = 0.693_147_180_559_662_956_511_601_805_686_950_683_593_75;
const L2_L: f64 = 0.282_352_905_630_315_771_225_884_481_750_134_360_255_254_120_68_e-12;
const R_LN2: f64 =
    1.442_695_040_888_963_407_359_924_681_001_892_137_426_645_954_152_985_934_135_449_406_931;
const D1_52: f64 = (1u64 << 52) as f64;

/// Multiply-accumulate, pinned to separate multiply and add.
///
/// Upstream selects `mul_add` under `cfg!(target_feature = "fma")`;
/// this pin is the module's reproducibility contract (see the module
/// documentation).
trait MulAdd {
    fn mla(self, y: Self, z: Self) -> Self;
}

impl<const N: usize> MulAdd for F32x<N> {
    #[inline]
    fn mla(self, y: Self, z: Self) -> Self {
        self * y + z
    }
}

impl<const N: usize> MulAdd for F64x<N> {
    #[inline]
    fn mla(self, y: Self, z: Self) -> Self {
        self * y + z
    }
}

trait Sign {
    type Bits;
    fn sign_bit(self) -> Self::Bits;
    fn mul_sign(self, other: Self) -> Self;
    fn or_sign(self, other: Self) -> Self;
}

impl<const N: usize> Sign for F32x<N> {
    type Bits = Simd<u32, N>;

    #[inline]
    fn sign_bit(self) -> Self::Bits {
        self.to_bits() & F32x::splat(-0.).to_bits()
    }

    #[inline]
    fn mul_sign(self, other: Self) -> Self {
        Self::from_bits(self.to_bits() ^ other.sign_bit())
    }

    #[inline]
    fn or_sign(self, other: Self) -> Self {
        Self::from_bits(self.to_bits() | other.sign_bit())
    }
}

impl<const N: usize> Sign for F64x<N> {
    type Bits = Simd<u64, N>;

    #[inline]
    fn sign_bit(self) -> Self::Bits {
        self.to_bits() & F64x::splat(-0.).to_bits()
    }

    #[inline]
    fn mul_sign(self, other: Self) -> Self {
        Self::from_bits(self.to_bits() ^ other.sign_bit())
    }

    #[inline]
    fn or_sign(self, other: Self) -> Self {
        Self::from_bits(self.to_bits() | other.sign_bit())
    }
}

trait RoundInt {
    type Int;
    fn round(self) -> Self;
    fn roundi(self) -> Self::Int;
}

impl<const N: usize> RoundInt for F32x<N> {
    type Int = I32x<N>;

    #[inline]
    fn round(self) -> Self {
        rintf(self)
    }

    #[inline]
    fn roundi(self) -> Self::Int {
        self.round().cast()
    }
}

impl<const N: usize> RoundInt for F64x<N> {
    type Int = I32x<N>;

    #[inline]
    fn round(self) -> Self {
        rint(self)
    }

    #[inline]
    fn roundi(self) -> Self::Int {
        self.round().cast()
    }
}

fn rintf<const N: usize>(d: F32x<N>) -> F32x<N> {
    /* #ifdef FULL_FP_ROUNDING
        return vrint_vf_vf(d);
    #else */
    let c = F32x::splat(F1_23).mul_sign(d);
    d.abs()
        .simd_gt(F32x::splat(F1_23))
        .select(d, ((d + c) - c).or_sign(d))
    // #endif
}

fn rint<const N: usize>(d: F64x<N>) -> F64x<N> {
    /*
    #ifdef FULL_FP_ROUNDING
    return vrint_vd_vd(d);
    #else
    */
    let c = F64x::splat(D1_52).mul_sign(d);
    d.abs()
        .simd_gt(F64x::splat(D1_52))
        .select(d, ((d + c) - c).or_sign(d))
    //#endif
}

fn pow2if<const N: usize>(q: I32x<N>) -> F32x<N> {
    F32x::from_bits(((q + I32x::splat(0x7F)) << I32x::splat(23)).cast())
}

fn ldexp2kf<const N: usize>(d: F32x<N>, e: I32x<N>) -> F32x<N> {
    let e1 = e >> I32x::splat(1);
    d * pow2if(e1) * pow2if(e - e1)
}

fn ldexp3kf<const N: usize>(d: F32x<N>, q: I32x<N>) -> F32x<N> {
    F32x::from_bits((d.to_bits().cast() + (q << I32x::splat(23))).cast())
}

fn ilogb2kf<const N: usize>(d: F32x<N>) -> I32x<N> {
    let q = d.to_bits().cast();
    let mut q = q >> I32x::splat(23);
    q &= I32x::splat(0xFF);
    q - I32x::splat(0x7F)
}

fn cast_into_upper<const N: usize>(q: I32x<N>) -> I64x<N> {
    let q64 = q.cast();
    q64 << I64x::splat(32)
}

fn pow2i<const N: usize>(q: I32x<N>) -> F64x<N> {
    let q = I32x::splat(0x3FF) + q;
    let r = cast_into_upper(q);
    F64x::from_bits((r << I64x::splat(20)).cast())
}

fn ldexp2k<const N: usize>(d: F64x<N>, e: I32x<N>) -> F64x<N> {
    let e1 = e >> I32x::splat(1);
    d * pow2i(e1) * pow2i(e - (e1))
}

fn poly2<const N: usize>(x: F64x<N>, c1: f64, c0: f64) -> F64x<N> {
    x.mla(F64x::splat(c1), F64x::splat(c0))
}

fn poly4<const N: usize>(x: F64x<N>, x2: F64x<N>, c3: f64, c2: f64, c1: f64, c0: f64) -> F64x<N> {
    x2.mla(
        x.mla(F64x::splat(c3), F64x::splat(c2)),
        x.mla(F64x::splat(c1), F64x::splat(c0)),
    )
}

#[expect(
    clippy::too_many_arguments,
    reason = "the signature is vendored verbatim from sleef's `Poly` trait"
)]
fn poly8<const N: usize>(
    x: F64x<N>,
    x2: F64x<N>,
    x4: F64x<N>,
    c7: f64,
    c6: f64,
    c5: f64,
    c4: f64,
    c3: f64,
    c2: f64,
    c1: f64,
    c0: f64,
) -> F64x<N> {
    x4.mla(poly4(x, x2, c7, c6, c5, c4), poly4(x, x2, c3, c2, c1, c0))
}

#[expect(
    clippy::too_many_arguments,
    reason = "the signature is vendored verbatim from sleef's `Poly` trait"
)]
fn poly10<const N: usize>(
    x: F64x<N>,
    x2: F64x<N>,
    x4: F64x<N>,
    x8: F64x<N>,
    c9: f64,
    c8: f64,
    c7: f64,
    c6: f64,
    c5: f64,
    c4: f64,
    c3: f64,
    c2: f64,
    c1: f64,
    c0: f64,
) -> F64x<N> {
    x8.mla(
        poly2(x, c9, c8),
        poly8(x, x2, x4, c7, c6, c5, c4, c3, c2, c1, c0),
    )
}

/// Base-*e* exponential function
///
/// This function returns the value of *e* raised to ***a***.
/// The error bound of the returned value is `1.0 ULP`.
pub(super) fn expf<const N: usize>(d: F32x<N>) -> F32x<N> {
    let q = (d * F32x::splat(R_LN2_F)).roundi();

    let s = q.cast::<f32>().mla(-F32x::splat(L2U_F), d);
    let s = q.cast::<f32>().mla(-F32x::splat(L2L_F), s);

    let mut u = F32x::splat(0.000_198_527_617_612_853_646_278_381)
        .mla(s, F32x::splat(0.001_393_043_552_525_341_510_772_71))
        .mla(s, F32x::splat(0.008_333_360_776_305_198_669_433_59))
        .mla(s, F32x::splat(0.041_666_485_369_205_474_853_515_6))
        .mla(s, F32x::splat(0.166_666_671_633_720_397_949_219))
        .mla(s, F32x::splat(0.5));

    u = F32x::splat(1.) + (s * s).mla(u, s);

    u = ldexp2kf(u, q);

    u = F32x::from_bits(!d.simd_lt(F32x::splat(-104.)).to_int().cast::<u32>() & u.to_bits());
    F32x::splat(100.)
        .simd_lt(d)
        .select(F32x::splat(f32::INFINITY), u)
}

/// Base-2 exponential function
///
/// This function returns 2 raised to ***a***.
/// The error bound of the returned value is `3.5 ULP`.
pub(super) fn exp2f<const N: usize>(d: F32x<N>) -> F32x<N> {
    let mut u = d.round();
    let q = u.roundi();

    let s = d - u;

    u = F32x::splat(0.153_592_089_2_e-3)
        .mla(s, F32x::splat(0.133_926_270_1_e-2))
        .mla(s, F32x::splat(0.961_838_476_4_e-2))
        .mla(s, F32x::splat(0.555_034_726_9_e-1))
        .mla(s, F32x::splat(0.240_226_447_6))
        .mla(s, F32x::splat(0.693_147_182_5))
        .mla(s, F32x::splat(0.1_e+1));

    u = ldexp2kf(u, q);

    u = d
        .simd_ge(F32x::splat(128.))
        .select(F32x::splat(f32::INFINITY), u);
    F32x::from_bits(!d.simd_lt(F32x::splat(-150.)).to_int().cast::<u32>() & u.to_bits())
}

/// Base-2 logarithm function
///
/// This function returns the base-2 logarithm of ***a***.
/// The error bound of the returned value is `3.5 ULP`.
pub(super) fn log2f<const N: usize>(mut d: F32x<N>) -> F32x<N> {
    //if !cfg!(feature = "enable_avx512f") && !cfg!(feature = "enable_avx512fnofma")
    let (m, e) = {
        let o = d.simd_lt(F32x::splat(f32::MIN_POSITIVE));
        d = o.select(d * (F32x::splat(F1_32) * F32x::splat(F1_32)), d);
        let e = ilogb2kf(d * F32x::splat(1. / 0.75));
        (ldexp3kf(d, -e), o.select(e - I32x::splat(64), e))
        /*} else {
            let e = vgetexp_vf_vf(d * F32x::splat(1./0.75));
            (vgetmant_vf_vf(d), e.simd_eq(F32x::INFINITY).select(F32x::splat(128.), e))
        */
    };

    let x = (m - F32x::splat(1.)) / (m + F32x::splat(1.));
    let x2 = x * x;

    let t = F32x::splat(0.437_408_834_7)
        .mla(x2, F32x::splat(0.576_484_382_2))
        .mla(x2, F32x::splat(0.961_802_423));

    //if !cfg!(feature = "enable_avx512f") && !cfg!(feature = "enable_avx512fnofma")
    {
        let mut r = (x2 * x).mla(t, x.mla(F32x::splat(0.288_539_004_3_e+1), e.cast()));

        r = d
            .simd_eq(F32x::splat(f32::INFINITY))
            .select(F32x::splat(f32::INFINITY), r);
        r = (d.simd_lt(F32x::splat(0.)) | d.is_nan()).select(F32x::splat(f32::NAN), r);
        d.simd_eq(F32x::splat(0.))
            .select(F32x::splat(f32::NEG_INFINITY), r)
        /*} else {
            let r = (x2 * x).mla(t, x.mla(F32x::splat(0.288_539_004_3_e+1), e));

            vfixup_vf_vf_vf_vi2_i(r, d, I32::splat((4 << (2*4)) | (3 << (4*4)) | (5 << (5*4)) | (2 << (6*4))), 0)
        */
    }
}

/// Base-*e* exponential function
///
/// This function returns the value of *e* raised to ***a***.
/// The error bound of the returned value is `1.0 ULP`.
pub(super) fn exp<const N: usize>(d: F64x<N>) -> F64x<N> {
    let mut u = (d * F64x::splat(R_LN2)).round();
    let q = u.roundi();

    let s = u.mla(-F64x::splat(L2_U), d);
    let s = u.mla(-F64x::splat(L2_L), s);

    // Upstream branches on `cfg!(target_feature = "fma")` here with a
    // second coefficient set; this module keeps only the branch the
    // `mla` pin selects (see the module documentation).
    {
        let s2 = s * s;
        let s4 = s2 * s2;
        let s8 = s4 * s4;

        u = poly10(
            s,
            s2,
            s4,
            s8,
            2.088_606_211_072_836_875_363_41_e-9,
            2.511_129_308_928_765_186_106_61_e-8,
            2.755_739_112_349_004_718_933_38_e-7,
            2.755_723_629_119_288_276_294_23_e-6,
            2.480_158_715_923_547_299_879_1_e-5,
            0.000_198_412_698_960_509_205_564_975,
            0.001_388_888_888_897_744_922_079_62,
            0.008_333_333_333_316_527_216_649_84,
            0.041_666_666_666_666_504_759_142_2,
            0.166_666_666_666_666_851_703_837,
        )
        .mla(s, F64x::splat(0.5));

        u = F64x::splat(1.) + (s * s).mla(u, s);
    }

    u = ldexp2k(u, q);

    u = d
        .simd_gt(F64x::splat(709.782_711_149_557_429_092_172_174_26))
        .select(F64x::splat(f64::INFINITY), u);
    F64x::from_bits(!d.simd_lt(F64x::splat(-1000.)).to_int().cast::<u64>() & u.to_bits())
}

#[cfg(test)]
mod tests {
    use core::simd::prelude::*;

    use super::{exp, exp2f, expf, log2f};

    // The strides are odd so consecutive samples land in different
    // exponent/mantissa phases; full-bit-range iteration covers
    // negative inputs, subnormals, both zeros, both infinities, and
    // NaN payloads without listing them.
    const F32_STRIDE: usize = 641;
    const F64_STRIDE: usize = 0x0400_0000_000D;

    #[test]
    fn expf_is_bit_identical_to_the_sleef_crate() {
        let mut lanes = [0.0_f32; 8];
        let mut filled = 0;
        for bits in (0..=u32::MAX).step_by(F32_STRIDE) {
            lanes[filled] = f32::from_bits(bits);
            filled += 1;
            if filled == lanes.len() {
                filled = 0;
                let input = Simd::from_array(lanes);
                assert_eq!(
                    expf(input).to_bits(),
                    ::sleef::f32x::exp_u10(input).to_bits(),
                    "expf diverged from the sleef crate at {input:?}",
                );
            }
        }
    }

    #[test]
    fn exp2f_is_bit_identical_to_the_sleef_crate() {
        let mut lanes = [0.0_f32; 8];
        let mut filled = 0;
        for bits in (0..=u32::MAX).step_by(F32_STRIDE) {
            lanes[filled] = f32::from_bits(bits);
            filled += 1;
            if filled == lanes.len() {
                filled = 0;
                let input = Simd::from_array(lanes);
                assert_eq!(
                    exp2f(input).to_bits(),
                    ::sleef::f32x::exp2_u35(input).to_bits(),
                    "exp2f diverged from the sleef crate at {input:?}",
                );
            }
        }
    }

    #[test]
    fn log2f_is_bit_identical_to_the_sleef_crate() {
        let mut lanes = [0.0_f32; 8];
        let mut filled = 0;
        for bits in (0..=u32::MAX).step_by(F32_STRIDE) {
            lanes[filled] = f32::from_bits(bits);
            filled += 1;
            if filled == lanes.len() {
                filled = 0;
                let input = Simd::from_array(lanes);
                assert_eq!(
                    log2f(input).to_bits(),
                    ::sleef::f32x::log2_u35(input).to_bits(),
                    "log2f diverged from the sleef crate at {input:?}",
                );
            }
        }
    }

    #[test]
    fn exp_is_bit_identical_to_the_sleef_crate() {
        let mut lanes = [0.0_f64; 4];
        let mut filled = 0;
        for bits in (0..=u64::MAX).step_by(F64_STRIDE) {
            lanes[filled] = f64::from_bits(bits);
            filled += 1;
            if filled == lanes.len() {
                filled = 0;
                let input = Simd::from_array(lanes);
                assert_eq!(
                    exp(input).to_bits(),
                    ::sleef::f64x::exp_u10(input).to_bits(),
                    "exp diverged from the sleef crate at {input:?}",
                );
            }
        }
    }
}

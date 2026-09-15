//! Table-based exponential approximation for single-precision SIMD lanes.
//!
//! An alternative to the polynomial [`exp_f32`](super::sleef::exp_f32) with the same edge-case
//! contract, measured against it under the `math_kernels` benchmark target.
//!
//! # Design
//!
//! For finite x in the unclamped interval [−104, 100], choose integer n near x · 16/ln 2 and split
//! n = 16q + j with 0 ≤ j < 16. The identity eˣ = 2ᑫ · 2^(j/16) · eʳ uses residual r = x − n ·
//! ln(2)/16. Ideal nearest-integer selection bounds |r| by ln(2)/32 ≈ 0.0217. The implementation
//! rounds the selection and residual in `f32`.
//!
//! For table value T = 2^(j/16), define Tₕ = round₃₂(T) and Tₗ = round₃₂(T − Tₕ), where round₃₂
//! rounds to nearest `f32`, ties to even. A cubic polynomial approximates eʳ − 1. Reconstruction
//! approximates T · eʳ with Tₕ + fma(Tₕ, expm1(r), Tₗ), using the table's rounded high and low
//! parts.
//!
//! The low part corrects the high part's table-rounding error before the final addition.
//! The recorded design budget assigns 0.5 ULP to that addition, 0.078 ULP to the tail fit in
//! exact arithmetic, and about 0.03 ULP to the smaller rounding terms and reduction residual.
//! This budget concerns the unscaled reconstruction. Subnormal results can round again during
//! [`scale_by_pow2_f32`]. The tests measure the complete result against `f64` libm.
//!
//! # Lookup portability
//!
//! The arithmetic is target-independent. Only the 16-entry lookup is not.
//! [`Simd::gather_or_default`] is the portable form. On AVX2/AVX-512 it lowers to `vgatherdps`
//! (fine), on NEON it scalarizes (poor). The `aarch64` path below instead uses `vqtbl4q_u8` - a
//! single-instruction 64-byte table lookup, which is exactly a 16-entry f32 table for four lanes.
//! On x86 without fast gathers, the analogous trick is two `u8x32` `swizzle_dyn` calls per table
//! with the second index offset by 32 and the results OR-ed (out-of-range indices yield zero),
//! which lowers to `vpshufb` pairs on AVX2 and `vpermb` on AVX-512VBMI.

use core::simd::prelude::*;
use std::simd::StdFloat as _;

use super::sleef::scale_by_pow2_f32;

/// The rounded reduction multiplier 16/ln(2), equal to 23.083120346069336.
const INVLN2_16: f32 = f32::from_bits(0x41B8_AA3B);

/// The coarse part of `ln(2)/16`, with twelve low significand bits cleared.
// A product is exact when its significand and exponent fit the destination. This constant retains
// at most twelve bits in its significand, and the unclamped reduction integer satisfies |n| ≤ 2402,
// at most twelve bits. Therefore their product fits f32 exactly. The low-part FMA still rounds the
// residual.
const LN2_16_HI: f32 = {
    let base = core::f32::consts::LN_2 / 16.; // exact: power-of-two divide
    f32::from_bits(base.to_bits() & !0xFFF)
};
/// The rounded low part of ln(2)/16 after subtracting [`LN2_16_HI`].
#[expect(
    clippy::cast_possible_truncation,
    reason = "the cast is the derivation's rounding step: the remainder is correctly rounded into \
              the narrower type"
)]
const LN2_16_LO: f32 = (core::f64::consts::LN_2 / 16. - (LN2_16_HI as f64)) as f32;

/// The quadratic coefficient in the cubic approximation of eʳ − 1.
///
/// The tail r + r²(C₂ + C₃r) approximates eʳ − 1 on |r| ≤ ln(2)/32. The jointly rounded
/// Chebyshev-fit coefficients have a recorded intrinsic-error budget of 0.078 ULP. The module's
/// reconstruction budget accounts for separate rounding terms.
const C2: f32 = f32::from_bits(0x3F00_00A4); // 0.5000097751617432
/// Cubic coefficient of the degree-3 tail, fitted jointly with [`C2`].
const C3: f32 = f32::from_bits(0x3E2A_AB2E); // 0.1666686236858368

/// The high parts Tₕ of the table split defined in the module model.
const EXP16_HI: [f32; 16] = [
    f32::from_bits(0x3F80_0000), // 1.0
    f32::from_bits(0x3F85_AAC3), // 1.0442737340927124
    f32::from_bits(0x3F8B_95C2), // 1.0905077457427979
    f32::from_bits(0x3F91_C3D3), // 1.1387885808944702
    f32::from_bits(0x3F98_37F0), // 1.1892070770263672
    f32::from_bits(0x3F9E_F532), // 1.2418577671051025
    f32::from_bits(0x3FA5_FED7), // 1.2968395948410034
    f32::from_bits(0x3FAD_583F), // 1.3542555570602417
    f32::from_bits(0x3FB5_04F3), // 1.4142135381698608
    f32::from_bits(0x3FBD_08A4), // 1.4768261909484863
    f32::from_bits(0x3FC5_672A), // 1.5422108173370361
    f32::from_bits(0x3FCE_248C), // 1.610490322113037
    f32::from_bits(0x3FD7_44FD), // 1.6817928552627563
    f32::from_bits(0x3FE0_CCDF), // 1.7562521696090698
    f32::from_bits(0x3FEA_C0C7), // 1.8340080976486206
    f32::from_bits(0x3FF5_257D), // 1.9152065515518188
];

/// The low parts Tₗ of the table split defined in the module model.
const EXP16_LO: [f32; 16] = [
    f32::from_bits(0x0000_0000), //  0.0
    f32::from_bits(0x334F_9891), //  4.8334701574503924e-8
    f32::from_bits(0xB260_ABA1), // -1.3077539939843064e-8
    f32::from_bits(0x3367_5624), //  5.386222312608879e-8
    f32::from_bits(0x3323_1B71), //  3.797635272917432e-8
    f32::from_bits(0x3341_2342), //  4.496838101886169e-8
    f32::from_bits(0xB32C_9D5E), // -4.018999533172973e-8
    f32::from_bits(0xB22D_EAF6), // -1.0123349269974824e-8
    f32::from_bits(0x32CF_E77A), //  2.4203234971764687e-8
    f32::from_bits(0xB341_4FE8), // -4.500898853621038e-8
    f32::from_bits(0x320A_A837), //  8.070904833346049e-9
    f32::from_bits(0x3228_FC24), //  9.836217174097328e-9
    f32::from_bits(0xB2D4_A58A), // -2.4755326677450284e-8
    f32::from_bits(0xB21E_AB59), // -9.235770370707996e-9
    f32::from_bits(0xB241_16DE), // -1.1239277952768134e-8
    f32::from_bits(0x3229_2436), //  9.845328108326612e-9
];

/// Looks four lanes of a 16-entry `f32` table up in a single `TBL4`.
///
/// Lane `i` with index `j` reads bytes `4j..4j+4`. The lookup builds the byte indices in the
/// `u32` domain (`4j` replicated to all four bytes, plus `0,1,2,3`) and reinterprets them, which
/// assumes little-endian lane layout.
#[cfg(all(target_arch = "aarch64", target_endian = "little"))]
#[inline]
fn tbl4_lookup(table: &[f32; 16], index: Simd<u32, 4>) -> Simd<f32, 4> {
    use core::arch::aarch64::{
        uint32x4_t, vld1q_u8_x4, vqtbl4q_u8, vreinterpretq_f32_u8, vreinterpretq_u8_u32,
    };

    let byte_index =
        (index << Simd::splat(2)) * Simd::splat(0x0101_0101) + Simd::splat(0x0302_0100);

    // SAFETY: These intrinsics require NEON, and `vld1q_u8_x4` accepts 64 readable bytes at any
    // alignment. This function's cfg requires NEON enabled, and the shared table borrow keeps those
    // initialized bytes readable. Therefore the load and NEON operations are safe.
    unsafe {
        let entries = vld1q_u8_x4(table.as_ptr().cast());
        let indices = vreinterpretq_u8_u32(uint32x4_t::from(byte_index));
        Simd::from(vreinterpretq_f32_u8(vqtbl4q_u8(entries, indices)))
    }
}

/// Reconstructs the scaled exponential and applies the final range masks.
///
/// `reduced`, `quotient` and the table pair must come from the module's range reduction of
/// `values`. Exceptional and out-of-range lanes may produce intermediate values outside the scaling
/// helper's numerical contract. The final masks set values below −104 to zero and above 100 to
/// infinity. NaN lanes propagate through the polynomial arithmetic.
#[inline]
fn finish<const N: usize>(
    values: Simd<f32, N>,
    reduced: Simd<f32, N>,
    quotient: Simd<i32, N>,
    table_hi: Simd<f32, N>,
    table_lo: Simd<f32, N>,
) -> Simd<f32, N> {
    let tail = reduced.mul_add(Simd::splat(C3), Simd::splat(C2));
    let expm1 = (reduced * reduced).mul_add(tail, reduced);
    let combined = table_hi + table_hi.mul_add(expm1, table_lo);

    let result = scale_by_pow2_f32(combined, quotient);

    let result = values
        .simd_lt(Simd::splat(-104.))
        .select(Simd::splat(0.), result);
    Simd::splat(100.)
        .simd_lt(values)
        .select(Simd::splat(f32::INFINITY), result)
}

/// Evaluates lanes with portable gather lookups.
///
/// Use [`exp_f32x4`] or [`exp_f32x8`] for fixed lane counts to select NEON lookups where enabled.
#[inline]
pub(crate) fn exp_f32<const N: usize>(values: Simd<f32, N>) -> Simd<f32, N> {
    let nearest = (values * Simd::splat(INVLN2_16)).round_ties_even();
    let scaled_exponent = nearest.cast::<i32>();
    let reduced = nearest.mul_add(-Simd::splat(LN2_16_HI), values);
    let reduced = nearest.mul_add(-Simd::splat(LN2_16_LO), reduced);

    let quotient = scaled_exponent >> Simd::splat(4);
    let index = (scaled_exponent & Simd::splat(0xF)).cast::<usize>();
    let table_hi = Simd::gather_or_default(&EXP16_HI, index);
    let table_lo = Simd::gather_or_default(&EXP16_LO, index);

    finish(values, reduced, quotient, table_hi, table_lo)
}

/// aarch64 form: both table lookups are one `TBL4` each.
#[cfg(all(target_arch = "aarch64", target_endian = "little"))]
#[inline]
pub(crate) fn exp_f32x4(values: Simd<f32, 4>) -> Simd<f32, 4> {
    let nearest = (values * Simd::splat(INVLN2_16)).round_ties_even();
    let scaled_exponent = nearest.cast::<i32>();
    let reduced = nearest.mul_add(-Simd::splat(LN2_16_HI), values);
    let reduced = nearest.mul_add(-Simd::splat(LN2_16_LO), reduced);

    let quotient = scaled_exponent >> Simd::splat(4);
    let index = (scaled_exponent & Simd::splat(0xF)).cast::<u32>();
    let table_hi = tbl4_lookup(&EXP16_HI, index);
    let table_lo = tbl4_lookup(&EXP16_LO, index);

    finish(values, reduced, quotient, table_hi, table_lo)
}

#[cfg(not(all(target_arch = "aarch64", target_endian = "little")))]
#[inline]
pub(crate) fn exp_f32x4(values: Simd<f32, 4>) -> Simd<f32, 4> {
    exp_f32(values)
}

/// Evaluates eight lanes as two four-lane `TBL4` halves.
#[cfg(all(target_arch = "aarch64", target_endian = "little"))]
#[inline]
pub(crate) fn exp_f32x8(values: Simd<f32, 8>) -> Simd<f32, 8> {
    let low = exp_f32x4(simd_swizzle!(values, [0, 1, 2, 3]));
    let high = exp_f32x4(simd_swizzle!(values, [4, 5, 6, 7]));
    simd_swizzle!(low, high, [0, 1, 2, 3, 4, 5, 6, 7])
}

#[cfg(not(all(target_arch = "aarch64", target_endian = "little")))]
#[inline]
pub(crate) fn exp_f32x8(values: Simd<f32, 8>) -> Simd<f32, 8> {
    exp_f32(values)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The NEON lookup must agree with the portable gather for every index.
    #[cfg(all(target_arch = "aarch64", target_endian = "little"))]
    #[test]
    fn tbl4_matches_gather() {
        for base in 0..16_u32 {
            let index = Simd::from_array([base, (base + 5) & 15, (base + 10) & 15, 15 - base]);
            let via_tbl = tbl4_lookup(&EXP16_HI, index);
            let via_gather = Simd::<f32, 4>::gather_or_default(&EXP16_HI, index.cast::<usize>());
            assert_eq!(via_tbl, via_gather);
            let via_tbl = tbl4_lookup(&EXP16_LO, index);
            let via_gather = Simd::<f32, 4>::gather_or_default(&EXP16_LO, index.cast::<usize>());
            assert_eq!(via_tbl, via_gather);
        }
    }

    /// Both entry points agree bit-for-bit.
    #[cfg(all(target_arch = "aarch64", target_endian = "little"))]
    #[test]
    #[expect(
        clippy::cast_precision_loss,
        reason = "the loop counter stays far below 2^24, where the f32 conversion is exact"
    )]
    fn variants_agree() {
        for step in 0..100_000_u32 {
            let value = (step as f32).mul_add(0.001_935, -104.5); // spans the full domain
            let lanes = Simd::splat(value);
            assert_eq!(
                exp_f32::<4>(lanes).to_bits(),
                exp_f32x4(lanes).to_bits(),
                "x = {value}"
            );
        }
    }

    // the odd stride samples different exponent and significand bit patterns across both signs.
    // It omits some special encodings, which `exp_f32_specials` supplies directly.
    /// The sampling stride through the `u32` bit space.
    const F32_STRIDE: usize = 641;

    /// Allowed kernel-to-reference distance in representation steps.
    ///
    /// The budget is ⌈1.0 + 0.5⌉ = 2, adding a nominal half-step narrowing allowance to the design
    /// tier. The libm reference is itself approximate. This encoding-distance check can also accept
    /// adjacent finite/infinite or infinite/NaN encodings.
    const U10_F32_TOLERANCE: u64 = 2;

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

    /// Strided samples of the full input bit range track scalar libm inside the step tolerance.
    ///
    /// Compares the generic table kernel with a wider-precision libm reference. Entry-point
    /// agreement alone cannot check the arithmetic shared by all lookup implementations.
    #[test]
    #[expect(
        clippy::cast_possible_truncation,
        reason = "narrowing the wider-precision libm result is how the sweep builds its reference"
    )]
    fn tracks_libm_across_the_full_bit_range() {
        let mut lanes = [0.0_f32; 8];
        let mut filled = 0;
        for bits in (0..=u32::MAX).step_by(F32_STRIDE) {
            lanes[filled] = f32::from_bits(bits);
            filled += 1;
            if filled == lanes.len() {
                filled = 0;
                let output = exp_f32::<8>(Simd::from_array(lanes));
                for lane in 0..lanes.len() {
                    let at = lanes[lane];
                    let reference = f64::from(at).exp() as f32;
                    if reference.is_nan() {
                        assert!(
                            output[lane].is_nan(),
                            "exp_f32({at}): kernel {} vs NaN reference",
                            output[lane]
                        );
                        continue;
                    }
                    let distance = ordered_f32(output[lane]).abs_diff(ordered_f32(reference));
                    assert!(
                        distance <= U10_F32_TOLERANCE,
                        "exp_f32({at}): kernel {} vs libm {reference}, {distance} steps apart",
                        output[lane]
                    );
                }
            }
        }
    }

    #[test]
    fn edge_cases_are_exact() {
        let output = exp_f32::<4>(Simd::from_array([
            0.0,
            f32::NEG_INFINITY,
            f32::INFINITY,
            f32::NAN,
        ]));
        assert_eq!(output[0].to_bits(), 1.0_f32.to_bits());
        assert_eq!(output[1].to_bits(), 0.0_f32.to_bits());
        assert_eq!(output[2].to_bits(), f32::INFINITY.to_bits());
        assert!(output[3].is_nan());
    }

    /// Every named entry point agrees with the generic kernel bit for bit.
    ///
    /// Little-endian aarch64 with NEON enabled uses TBL4. Other configurations use portable gather
    /// lookups.
    #[test]
    fn entry_points_agree_with_the_generic_kernel() {
        let mut lanes = [0.0_f32; 8];
        let mut filled = 0;
        for bits in (0..=u32::MAX).step_by(F32_STRIDE) {
            lanes[filled] = f32::from_bits(bits);
            filled += 1;
            if filled == lanes.len() {
                filled = 0;
                let values = Simd::from_array(lanes);
                let generic = exp_f32::<8>(values);
                assert_eq!(exp_f32x8(values).to_bits(), generic.to_bits());
                let low = simd_swizzle!(values, [0, 1, 2, 3]);
                assert_eq!(exp_f32x4(low).to_bits(), exp_f32::<4>(low).to_bits());
            }
        }
    }
}

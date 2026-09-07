//! Table-based `exp` for `f32` lanes: 16-entry hi/lo table of `2^(j/16)`, degree-3 tail,
//! hi/lo-corrected reconstruction.
//!
//! An alternative to the polynomial [`exp_f32`](super::sleef::exp_f32) with the same edge-case
//! contract, measured against it under the `math_kernels` benchmark target.
//!
//! # Design
//!
//! Reduction: `n = round(x · 16/ln 2)`, split as `n = 16q + j`, so `e^x = 2^q · 2^(j/16) · e^r`
//! with `|r| ≤ ln(2)/32 ≈ 0.0217`. The table stores each entry `T = 2^(j/16)` as an f32 pair
//! `(T_hi, T_lo)` with `T_lo = round(T - T_hi)`, and the kernel reconstructs the product `T · e^r`
//! as
//!
//! ```text
//! T_hi + fma(T_hi, expm1(r), T_lo)
//! ```
//!
//! which keeps the table's rounding error out of the result. The only half-ulp-scale rounding
//! left is the final add. Error budget: 0.5 (final add) + 0.078 (tail fit, measured in exact
//! arithmetic) + ≈0.03 (small-scale roundings + reduction residual). The Cody-Waite split keeps
//! `n · LN2_16_HI` exact for `n < 4096` (12-bit significand times `|n| ≤ 2402`), and both
//! [`scale_by_pow2_f32`] multiplies stay exact powers of two as in `exp_f32`.
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

/// `16 / ln(2)` (= 23.083120346069336).
const INVLN2_16: f32 = f32::from_bits(0x41B8_AA3B);

/// `ln(2)/16` with the low 12 mantissa bits zeroed: a 12-bit significand, so `n · LN2_16_HI` is
/// exact for `|n| < 4096` (the reduction produces `|n| ≤ 2402`).
const LN2_16_HI: f32 = {
    let base = core::f32::consts::LN_2 / 16.; // exact: power-of-two divide
    f32::from_bits(base.to_bits() & !0xFFF)
};
#[expect(
    clippy::cast_possible_truncation,
    reason = "the cast is the derivation's rounding step: the remainder is correctly rounded into \
              the narrower type"
)]
const LN2_16_LO: f32 = (core::f64::consts::LN_2 / 16. - (LN2_16_HI as f64)) as f32;

/// Degree-3 tail of `e^r - 1 = r + r^2 (C2 + C3 r)` over `|r| ≤ ln(2)/32`; near-minimax fit
/// (Chebyshev projection, coefficients rounded jointly), 0.078 ulp intrinsic error.
const C2: f32 = f32::from_bits(0x3F00_00A4); // 0.5000097751617432
const C3: f32 = f32::from_bits(0x3E2A_AB2E); // 0.1666686236858368

/// `2^(j/16)` rounded to f32.
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

/// `round(2^(j/16) - EXP16_HI[j])`: the sub-half-ulp remainder of each entry.
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

    // SAFETY: NEON is mandatory on aarch64; the table is 64 contiguous, initialized bytes, which
    // is exactly what `vld1q_u8_x4` reads (no alignment requirement). LLVM hoists the table load
    // out of loops.
    unsafe {
        let entries = vld1q_u8_x4(table.as_ptr().cast());
        let indices = vreinterpretq_u8_u32(uint32x4_t::from(byte_index));
        Simd::from(vreinterpretq_f32_u8(vqtbl4q_u8(entries, indices)))
    }
}

/// Shared tail: polynomial, hi/lo reconstruction, scaling, clamps.
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

/// Table-based counterpart of [`exp_f32`](super::sleef::exp_f32), portable form.
///
/// Semantically identical on every target; lookup speed is target-dependent (see the module
/// docs). Prefer the `exp_f32x4_table` form on aarch64.
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

    // The stride is odd, so consecutive samples differ in exponent/mantissa phase. Full-bit-range
    // iteration covers negative inputs, subnormals, both zeros, both infinities, and NaN payloads
    // without listing them.
    const F32_STRIDE: usize = 641;

    /// Allowed kernel-to-reference distance in representation steps.
    ///
    /// The kernel's 1.0-ulp accuracy tier plus half a step for the reference's own
    /// correctly-rounded narrowing, rounded up to whole steps.
    const U10_F32_TOLERANCE: u64 = 2;

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

    /// Strided samples of the full input bit range track scalar libm inside the step tolerance.
    ///
    /// The agreement tests in this module compare entry points that share every constant and
    /// every reconstruction step, so drift in that shared arithmetic moves all of them
    /// identically and only an external reference can pin it. `ulp_sweep.rs` holds the
    /// exhaustive `#[ignore]` form of this check.
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

    /// Edge-case results are exact.
    ///
    /// The contract matches [`exp_f32`](super::super::sleef::exp_f32). Zero yields exactly one
    /// and negative infinity exactly zero. An infinity lane stays infinite and a NaN lane stays
    /// NaN. The assertions compare bit patterns, so a merely-close value fails.
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
    /// On aarch64 the entry points are the TBL4 forms, elsewhere the passthrough fallbacks, so
    /// the sweep pins the agreement on every target this module compiles for.
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

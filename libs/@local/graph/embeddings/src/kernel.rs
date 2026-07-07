#![expect(
    unsafe_code,
    clippy::indexing_slicing,
    clippy::float_arithmetic,
    clippy::min_ident_chars,
    reason = "Single-char idents (k, n, m, d, x) are standard mathematical notation for \
              clustering."
)]
#![expect(
    clippy::inline_always,
    reason = "while usually discouraged, SIMD operations need to be inlined, as otherwise we \
              spill SIMD registers, see the SIMD documentation."
)]

use core::{
    num::NonZero,
    simd::{Simd, f32x8, num::SimdFloat as _},
};

/// Fused multiply-add when the target has native FMA, separate mul+add otherwise.
///
/// On `aarch64`, FMA is part of the base NEON instruction set (`fmla`).
/// On `x86_64`, FMA requires the `fma` target feature (`vfmadd`); without it,
/// `StdFloat::mul_add` falls back to a per-lane `fmaf` libc call which
/// destroys throughput. The non-FMA path uses a plain multiply and add
/// (`vmulps` + `vaddps`) instead.
#[inline(always)]
#[cfg(not(any(target_arch = "aarch64", target_feature = "fma")))]
fn simd_mul_add(lhs: f32x8, rhs: f32x8, acc: f32x8) -> f32x8 {
    lhs * rhs + acc
}

/// See non-FMA variant above for rationale.
#[inline(always)]
#[cfg(any(target_arch = "aarch64", target_feature = "fma"))]
fn simd_mul_add(lhs: f32x8, rhs: f32x8, acc: f32x8) -> f32x8 {
    use std::simd::StdFloat as _;

    lhs.mul_add(rhs, acc)
}

/// Computes the dot product of two equal-length `f32` slices using SIMD.
///
/// Four independent accumulators are interleaved to saturate FMA throughput:
/// each accumulator feeds a separate dependency chain, hiding the 4-cycle
/// latency of `fmla`/`vfmadd` on typical micro-architectures.
///
/// # Safety
///
/// * `lhs.len() == rhs.len()`
/// * Both lengths are multiples of 8.
#[inline]
#[must_use]
pub unsafe fn dot(lhs: &[f32], rhs: &[f32]) -> f32 {
    debug_assert!(lhs.len().is_multiple_of(8) && lhs.len() == rhs.len());

    // SAFETY: the caller guarantees equal lengths and a multiple of 8.
    // These hints let the compiler elide bounds checks in `as_chunks` and
    // the subsequent indexing without raw pointer arithmetic.
    unsafe {
        core::hint::assert_unchecked(lhs.len() == rhs.len());
        core::hint::assert_unchecked(lhs.len().is_multiple_of(8));
    }

    let (lhs, _) = lhs.as_chunks::<8>();
    let (rhs, _) = rhs.as_chunks::<8>();

    // SAFETY: both original slices have the same length and that length is a
    // multiple of 8, so `as_chunks::<8>` produces equal-length chunk slices
    // with empty remainders.
    unsafe {
        core::hint::assert_unchecked(lhs.len() == rhs.len());
    }

    let mut s0 = f32x8::splat(0.0);
    let mut s1 = f32x8::splat(0.0);
    let mut s2 = f32x8::splat(0.0);
    let mut s3 = f32x8::splat(0.0);

    // Unrolled loop: process 4 chunks (32 floats) per iteration.
    let mut offset = 0;
    while offset + 4 <= lhs.len() {
        let Some([l0, l1, l2, l3]) = lhs[offset..offset + 4].as_array() else {
            unreachable!()
        };
        let Some([r0, r1, r2, r3]) = rhs[offset..offset + 4].as_array() else {
            unreachable!()
        };

        s0 = simd_mul_add(Simd::from_slice(l0), Simd::from_slice(r0), s0);
        s1 = simd_mul_add(Simd::from_slice(l1), Simd::from_slice(r1), s1);
        s2 = simd_mul_add(Simd::from_slice(l2), Simd::from_slice(r2), s2);
        s3 = simd_mul_add(Simd::from_slice(l3), Simd::from_slice(r3), s3);

        offset += 4;
    }

    // Tail: process remaining 0..3 chunks one at a time.
    #[expect(clippy::min_ident_chars)]
    while offset < lhs.len() {
        let l = &lhs[offset];
        let r = &rhs[offset];

        s0 = simd_mul_add(Simd::from_slice(l), Simd::from_slice(r), s0);
        offset += 1;
    }

    (s0 + s1 + s2 + s3).reduce_sum()
}

/// Scales `value` in-place by `factor`.
///
/// # Safety
///
/// * `value.len()` is a multiple of 8.
#[inline]
pub(crate) unsafe fn scale(value: &mut [f32], factor: f32) {
    debug_assert!(value.len().is_multiple_of(8));

    // SAFETY: the caller guarantees a multiple of 8.
    unsafe {
        core::hint::assert_unchecked(value.len().is_multiple_of(8));
    }

    let factor = f32x8::splat(factor);
    let (dst, _) = value.as_chunks_mut::<8>();

    for dst in dst {
        *dst = (f32x8::from_slice(dst) * factor).to_array();
    }
}

/// Accumulates `src * factor` element-wise into `dst` (`dst += src * factor`).
///
/// Fuses a scale and add into a single pass, using FMA where available.
/// Avoids the need for a scratch buffer when accumulating normalized vectors.
///
/// # Safety
///
/// * `dst.len() == src.len()`
/// * Both lengths are multiples of 8.
#[inline]
pub unsafe fn add_scaled_into(dst: &mut [f32], src: &[f32], factor: f32) {
    debug_assert!(dst.len().is_multiple_of(8) && dst.len() == src.len());

    // SAFETY: the caller guarantees equal lengths and a multiple of 8.
    unsafe {
        core::hint::assert_unchecked(dst.len() == src.len());
        core::hint::assert_unchecked(dst.len().is_multiple_of(8));
    }

    let factor = f32x8::splat(factor);
    let (dst, _) = dst.as_chunks_mut::<8>();
    let (src, _) = src.as_chunks::<8>();

    // SAFETY: same reasoning as the pre-chunk hints: equal input lengths
    // that are multiples of 8 produce equal chunk counts.
    unsafe { core::hint::assert_unchecked(dst.len() == src.len()) }

    for index in 0..dst.len() {
        let acc = f32x8::from_slice(&dst[index]);
        let val = f32x8::from_slice(&src[index]);
        dst[index] = simd_mul_add(val, factor, acc).to_array();
    }
}

/// Normalizes `value` to unit length in-place.
///
/// If the vector has zero norm, it is left unchanged.
///
/// # Safety
///
/// * `value.len()` is a multiple of 8.
#[inline]
pub(crate) unsafe fn normalize(value: &mut [f32]) {
    // SAFETY: `dot` requires equal lengths (trivially true, same slice)
    // and a multiple of 8 (guaranteed by the caller).
    let norm = unsafe { dot(value, value).sqrt() };

    if norm > 0.0 {
        let factor = 1.0 / norm;
        // SAFETY: same slice, same length guarantee.
        unsafe {
            scale(value, factor);
        }
    }
}

/// 4 points x 2 centroids. Eight independent accumulators give ILP 8 (enough to
/// saturate FMA throughput); each point chunk feeds 2 FMAs and each centroid
/// chunk feeds 4. Returns `dot[point][centroid]`.
///
/// Register budget: 8 `f32x8` accumulators. On AVX2 (16 ymm) this leaves room
/// for the 6 operand loads. On NEON each `f32x8` is two 128-bit regs, so the 8
/// accumulators take 16 of 32 registers; a 4x4 tile (16 accumulators) also fits
/// there if you want more centroid reuse. Either way, check the asm shows the
/// accumulators staying in registers with no stack spills, and that
/// `simd_mul_add` lowered to `vfmadd`/`fmla` and not a `fmaf` call. If the array
/// form ever spills, the manual unroll below is what keeps them in registers.
///
/// # Safety
/// * all six slices have length `d`
/// * `d` is a multiple of 8
#[inline(always)] // micro-kernel must inline nearest4 to keep accumulators in registers
#[must_use]
pub unsafe fn micro_4x2(
    p0: &[f32],
    p1: &[f32],
    p2: &[f32],
    p3: &[f32],
    c0: &[f32],
    c1: &[f32],
) -> [[f32; 2]; 4] {
    debug_assert!(p0.len().is_multiple_of(8));
    debug_assert!(
        [p1.len(), p2.len(), p3.len(), c0.len(), c1.len()]
            .iter()
            .all(|&l| l == p0.len())
    );

    let (p0, _) = p0.as_chunks::<8>();
    let (p1, _) = p1.as_chunks::<8>();
    let (p2, _) = p2.as_chunks::<8>();
    let (p3, _) = p3.as_chunks::<8>();
    let (c0, _) = c0.as_chunks::<8>();
    let (c1, _) = c1.as_chunks::<8>();

    // SAFETY: the caller guarantees all six slices have equal length `d`,
    // and `d` is a multiple of 8. The hints let the compiler prove that
    // `as_chunks` produces equal-length chunk slices.
    unsafe {
        core::hint::assert_unchecked(p0.len() == p1.len());
        core::hint::assert_unchecked(p0.len() == p2.len());
        core::hint::assert_unchecked(p0.len() == p3.len());
        core::hint::assert_unchecked(p0.len() == c0.len());
        core::hint::assert_unchecked(p0.len() == c1.len());
    }

    let mut a00 = f32x8::splat(0.0);
    let mut a01 = f32x8::splat(0.0);
    let mut a10 = f32x8::splat(0.0);
    let mut a11 = f32x8::splat(0.0);
    let mut a20 = f32x8::splat(0.0);
    let mut a21 = f32x8::splat(0.0);
    let mut a30 = f32x8::splat(0.0);
    let mut a31 = f32x8::splat(0.0);

    for t in 0..c0.len() {
        let v0 = Simd::from_array(c0[t]);
        let v1 = Simd::from_array(c1[t]);
        let x0 = Simd::from_array(p0[t]);
        let x1 = Simd::from_array(p1[t]);
        let x2 = Simd::from_array(p2[t]);
        let x3 = Simd::from_array(p3[t]);

        // super::simd_mul_add picks the FMA arm per target.
        a00 = simd_mul_add(x0, v0, a00);
        a01 = simd_mul_add(x0, v1, a01);
        a10 = simd_mul_add(x1, v0, a10);
        a11 = simd_mul_add(x1, v1, a11);
        a20 = simd_mul_add(x2, v0, a20);
        a21 = simd_mul_add(x2, v1, a21);
        a30 = simd_mul_add(x3, v0, a30);
        a31 = simd_mul_add(x3, v1, a31);
    }

    [
        [a00.reduce_sum(), a01.reduce_sum()],
        [a10.reduce_sum(), a11.reduce_sum()],
        [a20.reduce_sum(), a21.reduce_sum()],
        [a30.reduce_sum(), a31.reduce_sum()],
    ]
}

/// 4 points x 1 centroid: the odd-`k` remainder of [`nearest4`]. Four
/// independent accumulators (one per point) share each centroid load, so the
/// centroid streams through registers once instead of once per point.
///
/// # Safety
///
/// * all five slices have length `d`
/// * `d` is a multiple of 8
#[inline(always)] // micro-kernel must inline into nearest4 to keep accumulators in registers
pub(crate) unsafe fn micro_4x1(
    p0: &[f32],
    p1: &[f32],
    p2: &[f32],
    p3: &[f32],
    c: &[f32],
) -> [f32; 4] {
    debug_assert!(p0.len().is_multiple_of(8));
    debug_assert!(
        [p1.len(), p2.len(), p3.len(), c.len()]
            .iter()
            .all(|&l| l == p0.len())
    );

    let (p0, _) = p0.as_chunks::<8>();
    let (p1, _) = p1.as_chunks::<8>();
    let (p2, _) = p2.as_chunks::<8>();
    let (p3, _) = p3.as_chunks::<8>();
    let (c, _) = c.as_chunks::<8>();

    // SAFETY: the caller guarantees all five slices have equal length `d`,
    // and `d` is a multiple of 8. The hints let the compiler prove that
    // `as_chunks` produces equal-length chunk slices.
    unsafe {
        core::hint::assert_unchecked(p0.len() == p1.len());
        core::hint::assert_unchecked(p0.len() == p2.len());
        core::hint::assert_unchecked(p0.len() == p3.len());
        core::hint::assert_unchecked(p0.len() == c.len());
    }

    let mut a0 = f32x8::splat(0.0);
    let mut a1 = f32x8::splat(0.0);
    let mut a2 = f32x8::splat(0.0);
    let mut a3 = f32x8::splat(0.0);

    for t in 0..c.len() {
        let v = Simd::from_array(c[t]);

        a0 = simd_mul_add(Simd::from_array(p0[t]), v, a0);
        a1 = simd_mul_add(Simd::from_array(p1[t]), v, a1);
        a2 = simd_mul_add(Simd::from_array(p2[t]), v, a2);
        a3 = simd_mul_add(Simd::from_array(p3[t]), v, a3);
    }

    [
        a0.reduce_sum(),
        a1.reduce_sum(),
        a2.reduce_sum(),
        a3.reduce_sum(),
    ]
}

/// Finds the nearest centroid for 4 points simultaneously using the
/// [`micro_4x2`] tiled kernel.
///
/// Returns `(centroid_index, raw_dot_product)` for each of the 4 points.
/// The raw dot product is **not** a distance; and must be converted via
/// using the chord distance formula.
///
/// # Safety
///
/// * All four point slices have length `d`.
/// * `centroids.len() >= k * d`.
/// * `d` is a multiple of 8.
#[inline]
#[must_use]
pub unsafe fn nearest4(
    p0: &[f32],
    p1: &[f32],
    p2: &[f32],
    p3: &[f32],
    centroids: &[f32],
    k: NonZero<usize>,
    d: NonZero<usize>,
) -> [(u16, f32); 4] {
    let d = d.get();
    let k = k.get();

    let mut best_dot = [f32::NEG_INFINITY; 4];
    let mut best_idx = [0_u16; 4];

    // SAFETY: the caller guarantees these preconditions.
    unsafe {
        core::hint::assert_unchecked(p0.len() == d);
        core::hint::assert_unchecked(p0.len() == p1.len());
        core::hint::assert_unchecked(p0.len() == p2.len());
        core::hint::assert_unchecked(p0.len() == p3.len());
        core::hint::assert_unchecked(centroids.len() >= k * d);
        core::hint::assert_unchecked(d.is_multiple_of(8));
    }

    let mut j = 0;
    while j + 2 <= k {
        // SAFETY: `j + 2 <= k` and `centroids.len() >= k * d`, so both
        // slices `[j*d .. (j+2)*d]` are in-bounds.
        let c0 = unsafe { centroids.get_unchecked(j * d..j * d + d) };
        // SAFETY: see above.
        let c1 = unsafe { centroids.get_unchecked((j + 1) * d..(j + 1) * d + d) };

        // SAFETY: all six slices have length `d`, a multiple of 8.
        let dots = unsafe { micro_4x2(p0, p1, p2, p3, c0, c1) };

        #[expect(
            clippy::cast_possible_truncation,
            reason = "k originates from Config::k (u16), so j < k fits in u16"
        )]
        for m in 0..4 {
            if dots[m][0] > best_dot[m] {
                best_dot[m] = dots[m][0];
                best_idx[m] = j as u16;
            }
            if dots[m][1] > best_dot[m] {
                best_dot[m] = dots[m][1];
                best_idx[m] = (j + 1) as u16;
            }
        }
        j += 2;
    }

    // Handle odd k: one remaining centroid via the 4x1 tile.
    if j < k {
        let c = &centroids[j * d..j * d + d];
        // SAFETY: all five slices have length `d`, a multiple of 8.
        let dots = unsafe { micro_4x1(p0, p1, p2, p3, c) };

        #[expect(
            clippy::cast_possible_truncation,
            reason = "k originates from Config::k (u16)"
        )]
        for m in 0..4 {
            if dots[m] > best_dot[m] {
                best_dot[m] = dots[m];
                best_idx[m] = j as u16;
            }
        }
    }

    [
        (best_idx[0], best_dot[0]),
        (best_idx[1], best_dot[1]),
        (best_idx[2], best_dot[2]),
        (best_idx[3], best_dot[3]),
    ]
}

#[cfg(test)]
mod tests {
    #![expect(clippy::float_cmp, clippy::integer_division_remainder_used)]

    use super::*;

    macro_rules! nz {
        ($expr:expr) => {
            const { NonZero::new($expr).unwrap() }
        };
    }

    /// Scalar dot product for reference.
    fn ref_dot(a: &[f32], b: &[f32]) -> f32 {
        a.iter().zip(b).map(|(x, y)| x * y).sum()
    }

    /// Scalar normalize for reference.
    fn ref_normalize(v: &mut [f32]) {
        let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for x in v {
                *x /= norm;
            }
        }
    }

    /// Deterministic test vector: entry `i` gets `(i+1) * scale`.
    #[expect(clippy::cast_precision_loss)]
    fn ramp(len: usize, factor: f32) -> Vec<f32> {
        (0..len).map(|i| (i + 1) as f32 * factor).collect()
    }

    /// Asserts two f32 values are within relative tolerance, with an absolute
    /// floor for values near zero.
    fn assert_close(a: f32, b: f32, tol: f32) {
        let diff = (a - b).abs();
        let denom = a.abs().max(b.abs()).max(1e-12);
        assert!(
            diff / denom < tol,
            "values differ: {a} vs {b} (diff={diff}, rel={})",
            diff / denom
        );
    }

    #[test]
    fn dot_matches_scalar_d8() {
        let a = ramp(8, 1.0);
        let b = ramp(8, 0.5);
        let expected = ref_dot(&a, &b);
        // SAFETY: both slices have length 8, a multiple of 8.
        let got = unsafe { dot(&a, &b) };
        assert_close(got, expected, 1e-6);
    }

    #[test]
    fn dot_matches_scalar_d24() {
        // 24 = 3 chunks of 8: the 4-unrolled body runs 0 iterations,
        // all 3 chunks go through the tail path.
        let a = ramp(24, 0.1);
        let b = ramp(24, -0.2);
        let expected = ref_dot(&a, &b);
        // SAFETY: both slices have length 24, a multiple of 8.
        let got = unsafe { dot(&a, &b) };
        assert_close(got, expected, 1e-5);
    }

    #[test]
    fn dot_matches_scalar_d3072() {
        let a = ramp(3072, 0.001);
        let b = ramp(3072, -0.002);
        let expected = ref_dot(&a, &b);
        // SAFETY: both slices have length 3072, a multiple of 8.
        let got = unsafe { dot(&a, &b) };
        assert_close(got, expected, 1e-4);
    }

    #[test]
    fn dot_is_commutative() {
        let a = ramp(32, 0.3);
        let b = ramp(32, -0.7);
        // SAFETY: both slices have length 32, a multiple of 8.
        let ab = unsafe { dot(&a, &b) };
        // SAFETY: same slices, reversed.
        let ba = unsafe { dot(&b, &a) };
        assert_eq!(ab, ba);
    }

    #[test]
    fn dot_self_is_squared_norm() {
        let a = ramp(16, 0.5);
        let expected: f32 = a.iter().map(|x| x * x).sum();
        // SAFETY: both arguments are the same 16-element slice.
        let got = unsafe { dot(&a, &a) };
        assert_close(got, expected, 1e-6);
    }

    #[test]
    fn dot_orthogonal_is_zero() {
        let mut a = vec![0.0_f32; 8];
        let mut b = vec![0.0_f32; 8];
        a[0] = 1.0;
        b[1] = 1.0;
        // SAFETY: both slices have length 8.
        let got = unsafe { dot(&a, &b) };
        assert_eq!(got, 0.0);
    }

    #[test]
    fn scale_matches_scalar() {
        let mut v = ramp(16, 1.0);
        let factor = -0.5;
        let expected: Vec<f32> = v.iter().map(|x| x * factor).collect();
        // SAFETY: slice has length 16, a multiple of 8.
        unsafe { scale(&mut v, factor) }
        assert_eq!(v, expected);
    }

    #[test]
    fn add_scaled_into_matches_separate_ops() {
        let src = ramp(16, 1.0);
        let factor = 0.3;
        let mut dst = ramp(16, 0.5);
        let expected: Vec<f32> = dst.iter().zip(&src).map(|(d, s)| d + s * factor).collect();

        // SAFETY: both slices have length 16, a multiple of 8.
        unsafe { add_scaled_into(&mut dst, &src, factor) }

        for (&got, &exp) in dst.iter().zip(&expected) {
            assert_close(got, exp, 1e-6);
        }
    }

    #[test]
    fn add_scaled_into_factor_zero_is_identity() {
        let src = ramp(8, 100.0);
        let mut dst = ramp(8, 1.0);
        let original = dst.clone();
        // SAFETY: both slices have length 8, a multiple of 8.
        unsafe { add_scaled_into(&mut dst, &src, 0.0) }
        assert_eq!(dst, original);
    }

    #[test]
    fn normalize_produces_unit_norm() {
        let mut v = ramp(32, 0.7);
        // SAFETY: length 32, a multiple of 8.
        unsafe { normalize(&mut v) }
        // SAFETY: same slice, length unchanged.
        let norm = unsafe { dot(&v, &v).sqrt() };
        assert_close(norm, 1.0, 1e-6);
    }

    #[test]
    fn normalize_preserves_direction() {
        let mut v = ramp(16, 2.0);
        let mut ref_v = v.clone();
        ref_normalize(&mut ref_v);
        // SAFETY: length 16, a multiple of 8.
        unsafe { normalize(&mut v) }
        for (&a, &b) in v.iter().zip(&ref_v) {
            assert_close(a, b, 1e-6);
        }
    }

    #[test]
    fn normalize_zero_vector_unchanged() {
        let mut v = vec![0.0_f32; 8];
        // SAFETY: length 8, a multiple of 8.
        unsafe { normalize(&mut v) }
        assert!(v.iter().all(|&x| x == 0.0));
    }

    #[test]
    fn normalize_already_unit_is_stable() {
        let mut v = vec![0.0_f32; 8];
        v[0] = 1.0;
        // SAFETY: length 8, a multiple of 8.
        unsafe { normalize(&mut v) }
        assert_close(v[0], 1.0, 1e-7);
        assert!(v[1..].iter().all(|&x| x == 0.0));
    }

    #[test]
    fn micro_4x2_matches_individual_dots() {
        let d = 16;
        let p0 = ramp(d, 0.1);
        let p1 = ramp(d, -0.2);
        let p2 = ramp(d, 0.3);
        let p3 = ramp(d, -0.4);
        let c0 = ramp(d, 0.5);
        let c1 = ramp(d, -0.6);

        // SAFETY: all 6 slices have length 16, a multiple of 8.
        let got = unsafe { micro_4x2(&p0, &p1, &p2, &p3, &c0, &c1) };

        let expected = [
            [ref_dot(&p0, &c0), ref_dot(&p0, &c1)],
            [ref_dot(&p1, &c0), ref_dot(&p1, &c1)],
            [ref_dot(&p2, &c0), ref_dot(&p2, &c1)],
            [ref_dot(&p3, &c0), ref_dot(&p3, &c1)],
        ];

        for (g, e) in got.iter().zip(&expected) {
            assert_close(g[0], e[0], 1e-5);
            assert_close(g[1], e[1], 1e-5);
        }
    }

    #[test]
    fn micro_4x2_d3072() {
        let d = 3072;
        let p0 = ramp(d, 0.001);
        let p1 = ramp(d, -0.001);
        let p2 = ramp(d, 0.002);
        let p3 = ramp(d, -0.002);
        let c0 = ramp(d, 0.001);
        let c1 = ramp(d, -0.001);

        // SAFETY: all 6 slices have length 3072, a multiple of 8.
        let got = unsafe { micro_4x2(&p0, &p1, &p2, &p3, &c0, &c1) };

        let expected = [
            [ref_dot(&p0, &c0), ref_dot(&p0, &c1)],
            [ref_dot(&p1, &c0), ref_dot(&p1, &c1)],
            [ref_dot(&p2, &c0), ref_dot(&p2, &c1)],
            [ref_dot(&p3, &c0), ref_dot(&p3, &c1)],
        ];

        for (g, e) in got.iter().zip(&expected) {
            assert_close(g[0], e[0], 1e-3);
            assert_close(g[1], e[1], 1e-3);
        }
    }

    #[test]
    fn micro_4x1_matches_individual_dots() {
        let d = 16;
        let p0 = ramp(d, 0.1);
        let p1 = ramp(d, -0.2);
        let p2 = ramp(d, 0.3);
        let p3 = ramp(d, -0.4);
        let c = ramp(d, 0.5);

        // SAFETY: all 5 slices have length 16, a multiple of 8.
        let got = unsafe { micro_4x1(&p0, &p1, &p2, &p3, &c) };

        let expected = [
            ref_dot(&p0, &c),
            ref_dot(&p1, &c),
            ref_dot(&p2, &c),
            ref_dot(&p3, &c),
        ];

        for (g, e) in got.iter().zip(&expected) {
            assert_close(*g, *e, 1e-5);
        }
    }

    #[test]
    fn micro_4x1_d3072() {
        let d = 3072;
        let p0 = ramp(d, 0.001);
        let p1 = ramp(d, -0.001);
        let p2 = ramp(d, 0.002);
        let p3 = ramp(d, -0.002);
        let c = ramp(d, 0.001);

        // SAFETY: all 5 slices have length 3072, a multiple of 8.
        let got = unsafe { micro_4x1(&p0, &p1, &p2, &p3, &c) };

        let expected = [
            ref_dot(&p0, &c),
            ref_dot(&p1, &c),
            ref_dot(&p2, &c),
            ref_dot(&p3, &c),
        ];

        for (g, e) in got.iter().zip(&expected) {
            assert_close(*g, *e, 1e-3);
        }
    }

    #[test]
    fn nearest4_matches_brute_force_even_k() {
        let d = 8;
        let k = nz!(4);

        // 4 centroids: axis-aligned unit vectors.
        let mut centroids = vec![0.0_f32; k.get() * d];
        for i in 0..k.get() {
            centroids[i * d + i] = 1.0;
        }

        // 4 points, each close to a different centroid.
        let mut points: [Vec<f32>; 4] = core::array::from_fn(|_| vec![0.0_f32; d]);
        for i in 0..4 {
            points[i][i] = 10.0;
            points[i][(i + 1) % d] = 0.1;
        }

        // SAFETY: d=8 (multiple of 8), k=4 > 0, centroids has length k*d,
        // all point slices have length d.
        let got = unsafe {
            nearest4(
                &points[0],
                &points[1],
                &points[2],
                &points[3],
                &centroids,
                k,
                nz!(8),
            )
        };

        assert_eq!(got[0].0, 0);
        assert_eq!(got[1].0, 1);
        assert_eq!(got[2].0, 2);
        assert_eq!(got[3].0, 3);
    }

    #[test]
    fn nearest4_matches_brute_force_odd_k() {
        let d = 8;
        let k = nz!(3); // odd: exercises the remainder path

        let mut centroids = vec![0.0_f32; k.get() * d];
        for i in 0..k.get() {
            centroids[i * d + i] = 1.0;
        }

        let mut points: [Vec<f32>; 4] = core::array::from_fn(|_| vec![0.0_f32; d]);
        points[0][0] = 5.0;
        points[1][1] = 5.0;
        points[2][2] = 5.0;
        points[3][0] = 3.0; // closest to centroid 0

        // SAFETY: d=8 (multiple of 8), k=3 > 0, centroids has length k*d,
        // all point slices have length d.
        let got = unsafe {
            nearest4(
                &points[0],
                &points[1],
                &points[2],
                &points[3],
                &centroids,
                k,
                nz!(8),
            )
        };

        assert_eq!(got[0].0, 0);
        assert_eq!(got[1].0, 1);
        assert_eq!(got[2].0, 2);
        assert_eq!(got[3].0, 0);
    }

    #[test]
    fn nearest4_k1_all_same() {
        let d = 8;
        let centroids = ramp(d, 1.0);
        let p0 = ramp(d, 0.1);
        let p1 = ramp(d, -0.2);
        let p2 = ramp(d, 0.3);
        let p3 = ramp(d, -0.4);

        // SAFETY: d=8 (multiple of 8), k=1 > 0, centroids has length d,
        // all point slices have length d.
        let got = unsafe { nearest4(&p0, &p1, &p2, &p3, &centroids, nz!(1), nz!(8)) };

        assert_eq!(got[0].0, 0);
        assert_eq!(got[1].0, 0);
        assert_eq!(got[2].0, 0);
        assert_eq!(got[3].0, 0);
    }
}

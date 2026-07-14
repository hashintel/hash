//! Exact cosine-distance kernel for ANN audits.

use core::simd::{f32x8, f64x8, num::SimdFloat as _};

use crate::salt::{representation::PROJECTOR_DIMENSIONS, simd::mul_add_f64x8};

const SIMD_LANES: usize = 8;
const CHUNKS: usize = PROJECTOR_DIMENSIONS / SIMD_LANES;

const _: () = assert!(PROJECTOR_DIMENSIONS.is_multiple_of(SIMD_LANES * 2));

pub(super) fn cosine_distance(
    left: &[f32; PROJECTOR_DIMENSIONS],
    right: &[f32; PROJECTOR_DIMENSIONS],
) -> f64 {
    let (left, left_remainder) = left.as_chunks::<SIMD_LANES>();
    let (right, right_remainder) = right.as_chunks::<SIMD_LANES>();
    debug_assert!(left_remainder.is_empty());
    debug_assert!(right_remainder.is_empty());

    let zero = f64x8::splat(0.0);
    let mut dot = [zero; 2];
    let mut left_norm = [zero; 2];
    let mut right_norm = [zero; 2];
    let mut index = 0;
    while index + 2 <= CHUNKS {
        let left0: f64x8 = f32x8::from_array(left[index]).cast();
        let left1: f64x8 = f32x8::from_array(left[index + 1]).cast();
        let right0: f64x8 = f32x8::from_array(right[index]).cast();
        let right1: f64x8 = f32x8::from_array(right[index + 1]).cast();

        dot[0] = mul_add_f64x8(left0, right0, dot[0]);
        dot[1] = mul_add_f64x8(left1, right1, dot[1]);
        left_norm[0] = mul_add_f64x8(left0, left0, left_norm[0]);
        left_norm[1] = mul_add_f64x8(left1, left1, left_norm[1]);
        right_norm[0] = mul_add_f64x8(right0, right0, right_norm[0]);
        right_norm[1] = mul_add_f64x8(right1, right1, right_norm[1]);
        index += 2;
    }
    debug_assert_eq!(index, CHUNKS);

    let dot = (dot[0] + dot[1]).reduce_sum();
    let left_norm = (left_norm[0] + left_norm[1]).reduce_sum();
    let right_norm = (right_norm[0] + right_norm[1]).reduce_sum();
    if left_norm == 0.0 || right_norm == 0.0 {
        return if left_norm == right_norm { 0.0 } else { 1.0 };
    }

    (1.0 - dot / (left_norm * right_norm).sqrt()).clamp(0.0, 2.0)
}

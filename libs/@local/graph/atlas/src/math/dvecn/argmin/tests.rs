#![expect(
    clippy::float_cmp,
    reason = "the exact assertions cover single-rounding component-wise operations, which are \
              bit-precise contracts against a reference computing the identical expression"
)]

use argmin_math::{
    ArgminAdd as _, ArgminDot as _, ArgminL1Norm as _, ArgminL2Norm as _, ArgminMinMax,
    ArgminMul as _, ArgminScaledAdd as _, ArgminScaledSub as _, ArgminSignum as _, ArgminSub as _,
    ArgminZeroLike as _,
};

use crate::math::BoxedDVecN;

/// Deterministic, sign-varying components crossing two 8-lane chunks plus
/// a three-component remainder, so every operation exercises both its lane
/// kernel and its scalar tail.
fn scattered(offset: f64) -> BoxedDVecN<19> {
    BoxedDVecN::from(core::array::from_fn::<f64, 19, _>(|index| {
        let value = f64::from(u8::try_from(index).expect("test sizes are small"));

        (value - 9.0).mul_add(0.375, offset)
    }))
}

#[test]
fn vector_arithmetic_matches_component_wise_references() {
    let left = scattered(0.5);
    let right = scattered(-2.0);

    let sum = left.add(&right);
    let difference = left.sub(&right);
    let product = left.mul(&right);
    for index in 0..19 {
        let (lhs, rhs) = (left.as_array()[index], right.as_array()[index]);
        assert_eq!(sum.as_array()[index], lhs + rhs);
        assert_eq!(difference.as_array()[index], lhs - rhs);
        assert_eq!(product.as_array()[index], lhs * rhs);
    }
}

#[test]
fn scalar_broadcasts_match_component_wise_references() {
    let vector = scattered(1.25);

    let raised = vector.add(&0.75);
    let lowered = vector.sub(&0.75);
    let scaled = vector.mul(&-3.0);
    for index in 0..19 {
        let component = vector.as_array()[index];
        assert_eq!(raised.as_array()[index], component + 0.75);
        assert_eq!(lowered.as_array()[index], component - 0.75);
        assert_eq!(scaled.as_array()[index], component * -3.0);
    }
}

#[test]
fn scaled_updates_fuse_like_the_reference_mul_add() {
    let position = scattered(0.5);
    let direction = scattered(-1.5);

    let advanced = position.scaled_add(&0.25, &direction);
    let retreated = position.scaled_sub(&0.25, &direction);
    for index in 0..19 {
        let (base, step) = (position.as_array()[index], direction.as_array()[index]);
        assert_eq!(advanced.as_array()[index], step.mul_add(0.25, base));
        assert_eq!(retreated.as_array()[index], step.mul_add(-0.25, base));
    }
}

#[test]
fn dot_and_norms_match_plain_references() {
    #![expect(
        clippy::suboptimal_flops,
        reason = "the references deliberately use plain multiply-and-sum, independent of the FMA \
                  path under test"
    )]

    let left = scattered(0.5);
    let right = scattered(-2.0);

    let expected_dot = left
        .as_array()
        .iter()
        .zip(right.as_array())
        .map(|(&lhs, &rhs)| lhs * rhs)
        .sum::<f64>();
    let dot = left.dot(&right);
    assert!((dot - expected_dot).abs() <= expected_dot.abs() * 1e-12);

    let expected_l1 = left
        .as_array()
        .iter()
        .map(|&value| value.abs())
        .sum::<f64>();
    assert!((left.l1_norm() - expected_l1).abs() <= expected_l1 * 1e-12);

    let expected_l2 = left
        .as_array()
        .iter()
        .map(|&value| value * value)
        .sum::<f64>()
        .sqrt();
    assert!((left.l2_norm() - expected_l2).abs() <= expected_l2 * 1e-12);
}

#[test]
fn signum_follows_the_scalar_semantics() {
    let signs = BoxedDVecN::from([-3.5, 0.0, -0.0, 7.25, -0.5, 2.0, -8.0, 1.0, -1.0]).signum();

    // `f64::signum` maps +0.0 to 1.0 and -0.0 to -1.0; the lanes agree.
    assert_eq!(
        signs.as_array(),
        &[-1.0, 1.0, -1.0, 1.0, -1.0, 1.0, -1.0, 1.0, -1.0],
    );
}

#[test]
fn min_max_select_component_wise() {
    let left = scattered(0.5);
    let right = scattered(-2.0);

    let minima = ArgminMinMax::min(&left, &right);
    let maxima = ArgminMinMax::max(&left, &right);
    for index in 0..19 {
        let (lhs, rhs) = (left.as_array()[index], right.as_array()[index]);
        assert_eq!(minima.as_array()[index], lhs.min(rhs));
        assert_eq!(maxima.as_array()[index], lhs.max(rhs));
    }
}

#[test]
fn zero_like_is_the_zero_vector() {
    let zero = scattered(4.0).zero_like();

    assert_eq!(zero.as_array(), &[0.0; 19]);
}

#[test]
fn outputs_satisfy_the_alignment_invariant() {
    let left = scattered(0.5);
    let right = scattered(-2.0);

    // Every operation allocates through `BoxedDVecN`, so the result is
    // usable as SIMD input without further checks.
    let sum = left.add(&right);
    assert!(
        sum.as_array()
            .as_ptr()
            .is_aligned_to(align_of::<core::simd::f64x8>())
    );
}

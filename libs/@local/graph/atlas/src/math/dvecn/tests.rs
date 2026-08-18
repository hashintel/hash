#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are the point: single-element identities and empty-fold \
              identities are exact contracts"
)]

use core::hash::{Hash, Hasher as _};
use std::hash::DefaultHasher;

use proptest::{prop_assert, prop_assert_eq, property_test, strategy::Strategy};

use crate::math::{AlignedDVecN, BoxedDVecN, DVecN, test_alloc::CountingAllocator};

#[test]
fn max_and_sum_match_scalar_folds_across_chunk_sizes() {
    // 0, remainder-only, exact-chunk, and chunk-plus-remainder lengths.
    fn check<const N: usize>(components: [f64; N]) {
        let vec = DVecN::new(components);

        let expected_max = components.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        assert_eq!(vec.max(), expected_max, "max over {N} components");

        let expected_sum = components.iter().sum::<f64>();
        assert!(
            (vec.sum() - expected_sum).abs() < 1e-12,
            "sum over {N} components",
        );
    }

    check([]);
    check([-3.5]);
    check([0.5, -1.25, 2.0]);
    check([0.5, -1.25, 2.0, 0.0]);
    check(core::array::from_fn::<f64, 11, _>(|index| {
        f64::from(u8::try_from(index).expect("test sizes are small")).mul_add(0.75, -4.0)
    }));
}

#[test]
fn softmax_matches_naive_on_small_logits() {
    // Crosses one full SIMD chunk plus a remainder.
    let logits: [f64; 7] = [0.5, -1.25, 2.0, 0.0, 1.1, -0.7, 0.3];
    let naive_denominator = logits.iter().map(|logit| logit.exp()).sum::<f64>();
    let naive = logits.map(|logit| logit.exp() / naive_denominator);

    for (stable, expected) in DVecN::new(logits).softmax().as_array().iter().zip(naive) {
        assert!((stable - expected).abs() < 1e-15);
    }
}

#[test]
fn softmax_outputs_are_probabilities() {
    let probabilities = DVecN::new([3.0, -2.0, 0.5]).softmax();

    let total = probabilities.as_array().iter().sum::<f64>();
    assert!((total - 1.0).abs() < 1e-12);
    for &probability in probabilities.as_array() {
        assert!((0.0..=1.0).contains(&probability));
    }
}

#[test]
fn softmax_is_shift_invariant() {
    let logits = [0.1, 1.7, -0.4];
    let shifted = logits.map(|logit| logit + 123.0);

    let base = DVecN::new(logits).softmax();
    let moved = DVecN::new(shifted).softmax();
    for (base, moved) in base.as_array().iter().zip(moved.as_array()) {
        assert!((base - moved).abs() < 1e-12);
    }
}

#[test]
fn softmax_survives_large_logits() {
    // A naive `exp(1e3)` overflows to infinity and poisons every output.
    let probabilities = DVecN::new([1e3, 0.0, -1e3]).softmax();

    assert!(
        probabilities
            .as_array()
            .iter()
            .all(|probability| probability.is_finite())
    );
    let total = probabilities.as_array().iter().sum::<f64>();
    assert!((total - 1.0).abs() < 1e-12);
    // The dominant logit takes essentially all of the mass.
    assert!((probabilities.as_array()[0] - 1.0).abs() < 1e-12);
}

#[test]
fn softmax_of_empty_is_empty() {
    assert_eq!(DVecN::new([]).softmax(), DVecN::new([]));
}

#[test]
fn log_sum_exp_of_single_element_is_identity() {
    // With one element the shift cancels exactly: max + ln(exp(0)) == max.
    assert_eq!(DVecN::new([2.5]).log_sum_exp(), 2.5);
    assert_eq!(DVecN::new([-7.75]).log_sum_exp(), -7.75);
}

#[test]
fn log_sum_exp_of_equal_elements_adds_ln_count() {
    let result = DVecN::new([1.5; 4]).log_sum_exp();

    assert!((result - 4.0_f64.ln() - 1.5).abs() < 1e-12);
}

#[test]
fn log_sum_exp_matches_naive_on_small_values() {
    // Crosses one full SIMD chunk plus a remainder.
    let values: [f64; 6] = [0.3, -1.2, 2.4, 0.9, -0.1, 1.6];
    let naive = values.iter().map(|value| value.exp()).sum::<f64>().ln();

    assert!((DVecN::new(values).log_sum_exp() - naive).abs() < 1e-12);
}

#[test]
fn log_sum_exp_survives_large_values() {
    // A naive `exp(1e3)` overflows to infinity.
    let result = DVecN::new([1e3, 1e3]).log_sum_exp();

    assert!(result.is_finite());
    assert!((result - 2.0_f64.ln() - 1e3).abs() < 1e-9);
}

#[test]
fn log_sum_exp_of_empty_is_negative_infinity() {
    assert_eq!(DVecN::new([]).log_sum_exp(), f64::NEG_INFINITY);
}

#[test]
fn add_scaled_matches_scalar_reference() {
    // Crosses one full 8-lane chunk plus a remainder.
    let mut accumulator = DVecN::new(core::array::from_fn::<f64, 11, _>(|index| {
        f64::from(u8::try_from(index).expect("test sizes are small")) * 0.5
    }));
    let direction = crate::math::VecN::new(core::array::from_fn::<f32, 11, _>(|index| {
        f32::from(u8::try_from(index).expect("test sizes are small")) - 5.0
    }));
    let expected: [f64; 11] = core::array::from_fn(|index| {
        f64::from(direction.as_array()[index]).mul_add(-0.25, accumulator.as_array()[index])
    });

    accumulator.add_scaled(&direction, -0.25);

    assert_eq!(accumulator.as_array(), &expected);
}

#[test]
fn add_widened_matches_scalar_reference() {
    // Crosses one full 8-lane chunk plus a remainder.
    let mut accumulator = DVecN::new(core::array::from_fn::<f64, 11, _>(|index| {
        f64::from(u8::try_from(index).expect("test sizes are small")) * 0.25
    }));
    let rhs = crate::math::VecN::new(core::array::from_fn::<f32, 11, _>(|index| {
        f32::from(u8::try_from(index).expect("test sizes are small")) - 3.5
    }));
    let expected: [f64; 11] = core::array::from_fn(|index| {
        accumulator.as_array()[index] + f64::from(rhs.as_array()[index])
    });

    accumulator.add_widened(&rhs);

    assert_eq!(accumulator.as_array(), &expected);
}

#[test]
fn div_assign_divides_every_component() {
    // N = 11 crosses one full 8-lane group plus a remainder, so both the batched body and the
    // remainder divide; the operation is a plain IEEE division either way, so the results are
    // bit-equal.
    let components = core::array::from_fn::<f64, 11, _>(|index| {
        f64::from(u8::try_from(index).expect("test sizes are small")).mul_add(0.75, -4.0)
    });
    let mut boxed = BoxedDVecN::new(DVecN::from_ref(&components));
    let expected = components.map(|component| component / -2.5);

    *boxed /= -2.5;

    assert_eq!(boxed.as_array(), &expected);
}

#[test]
fn aligned_accumulators_delegate_to_the_widening_kernels() {
    // Exercises the `AlignedDVecN` delegate surface over aligned boxed
    // storage. Expectations are plain scalar arithmetic.
    let mut accumulator = BoxedDVecN::<11>::zero();
    let value = crate::math::VecN::new(core::array::from_fn::<f32, 11, _>(|index| {
        f32::from(u8::try_from(index).expect("test sizes are small")) - 4.5
    }));
    let mean = BoxedDVecN::new(DVecN::from_ref(&[0.5; 11]));

    accumulator.add_widened(&value);
    accumulator.add_squared_deviation(&value, &mean);

    let expected: [f64; 11] = core::array::from_fn(|index| {
        let widened = f64::from(value.as_array()[index]);
        let centred = widened - 0.5;
        centred.mul_add(centred, widened)
    });
    assert_eq!(accumulator.as_array(), &expected);
}

#[test]
fn add_squared_deviation_matches_scalar_reference() {
    // Crosses one full 8-lane chunk plus a remainder.
    let mut accumulator = DVecN::new(core::array::from_fn::<f64, 11, _>(|index| {
        f64::from(u8::try_from(index).expect("test sizes are small")) * 0.125
    }));
    let value = crate::math::VecN::new(core::array::from_fn::<f32, 11, _>(|index| {
        f32::from(u8::try_from(index).expect("test sizes are small")) - 4.5
    }));
    let mean = DVecN::new(core::array::from_fn::<f64, 11, _>(|index| {
        f64::from(u8::try_from(index).expect("test sizes are small")).mul_add(-0.5, 1.0)
    }));
    let expected: [f64; 11] = core::array::from_fn(|index| {
        let centred = f64::from(value.as_array()[index]) - mean.as_array()[index];
        centred.mul_add(centred, accumulator.as_array()[index])
    });

    accumulator.add_squared_deviation(&value, &mean);

    assert_eq!(accumulator.as_array(), &expected);
}

#[test]
fn wrapping_is_in_place() {
    let mut components = [1.0_f64; 4];

    assert_eq!(
        core::ptr::from_ref(DVecN::from_ref(&components)).addr(),
        components.as_ptr().addr(),
    );
    assert_eq!(
        core::ptr::from_mut(DVecN::from_mut(&mut components)).addr(),
        components.as_mut_ptr().addr(),
    );
}

/// Deterministic, sign-varying components crossing multiple 8-lane chunks.
#[expect(clippy::integer_division_remainder_used)]
fn scattered<const N: usize>(offset: f64) -> [f64; N] {
    core::array::from_fn(|index| {
        let value = f64::from(u8::try_from(index % 200).expect("bounded by modulus"));

        (value - 100.0).mul_add(0.125, offset)
    })
}

#[test]
fn dot_matches_a_plain_reference_across_chunk_sizes() {
    fn check<const N: usize>() {
        let left: [f64; N] = scattered(0.5);
        let right: [f64; N] = scattered(-1.25);
        let expected = left
            .iter()
            .zip(&right)
            .map(|(&lhs, &rhs)| lhs * rhs)
            .sum::<f64>();

        let actual = DVecN::new(left).dot(DVecN::from_ref(&right));
        assert!(
            (actual - expected).abs() <= expected.abs().mul_add(1e-12, 1e-12),
            "dot over {N}: {actual} vs {expected}",
        );
    }

    check::<0>();
    check::<3>();
    check::<8>();
    check::<11>();
    check::<19>();
    check::<512>();
}

#[test]
fn norm_squared_and_abs_sum_match_plain_references() {
    let components: [f64; 19] = scattered(-0.75);
    let vec = DVecN::new(components);

    let expected_norm = components.iter().map(|&value| value * value).sum::<f64>();
    assert!((vec.norm_squared() - expected_norm).abs() <= expected_norm * 1e-12);

    let expected_abs = components.iter().map(|&value| value.abs()).sum::<f64>();
    assert!((vec.abs_sum() - expected_abs).abs() <= expected_abs * 1e-12);

    // The empty folds hit their identities exactly.
    assert_eq!(DVecN::new([]).norm_squared(), 0.0);
    assert_eq!(DVecN::new([]).abs_sum(), 0.0);
}

#[test]
fn boxed_dvecn_is_aligned_deep_cloned_and_writable() {
    let source: [f64; 11] = scattered(2.5);
    let mut boxed = crate::math::BoxedDVecN::from(source);

    // The allocation satisfies the alignment invariant by construction.
    assert!(
        boxed
            .as_array()
            .as_ptr()
            .is_aligned_to(align_of::<core::simd::f64x8>())
    );
    assert_eq!(boxed.as_array(), &source);

    // Clones are deep: writes through one box never reach the other.
    let cloned = boxed.clone();
    boxed.as_array_mut()[0] = 9.0;
    assert_eq!(cloned.as_array()[0], source[0]);
    assert_eq!(boxed.as_array()[0], 9.0);

    // Writes through the lane views modify the array in place, exactly as for the f32 twin.
    let (lanes, remainder) = boxed.lanes_mut();
    for lane in lanes.iter_mut() {
        *lane = core::simd::Simd::splat(2.0);
    }
    remainder.fill(5.0);
    assert_eq!(boxed.as_array()[..8], [2.0; 8]);
    assert_eq!(boxed.as_array()[8..], [5.0; 3]);
}

#[test]
fn boxed_dvecn_zero_is_all_zeros() {
    let zero = crate::math::BoxedDVecN::<19>::zero();

    assert_eq!(zero.as_array(), &[0.0; 19]);
    assert_eq!(zero.norm_squared().into_raw(), 0.0);
}

// The fixed dimension 11 crosses the reductions' 4-lane chunk boundary
// (two full chunks plus a remainder of three) and `add_scaled`'s 8-lane
// boundary (one chunk plus three).

/// Logits bounded to `-50..50`, where `exp` is well-conditioned.
///
/// The example-based tests above pin the shifted form's stability under logits large enough to
/// overflow a naive `exp`.
fn logits_strategy() -> impl Strategy<Value = [f64; 11]> {
    proptest::array::uniform11(-50.0_f64..50.0)
}

/// Softmax outputs are probabilities: each lies in `[0, 1]` and they sum to one up to rounding.
#[property_test]
fn softmax_outputs_form_a_distribution(#[strategy = logits_strategy()] logits: [f64; 11]) {
    let probabilities = DVecN::new(logits).softmax();

    for &probability in probabilities.as_array() {
        prop_assert!((0.0..=1.0).contains(&probability));
    }
    let total: f64 = probabilities.as_array().iter().sum();
    prop_assert!((total - 1.0).abs() < 1e-12, "total {}", total);
}

/// Softmax is shift-invariant.
///
/// Adding a common constant to every logit leaves the distribution unchanged up to rounding. The
/// strategy bounds the shift to `-1e2..1e2` so the shifted logits stay well-conditioned.
#[property_test]
fn softmax_is_shift_invariant_on_arbitrary_logits(
    #[strategy = logits_strategy()] logits: [f64; 11],
    #[strategy = -1e2_f64..1e2] shift: f64,
) {
    let base = DVecN::new(logits).softmax();
    let moved = DVecN::new(logits.map(|logit| logit + shift)).softmax();

    for (base, moved) in base.as_array().iter().zip(moved.as_array()) {
        prop_assert!((base - moved).abs() < 1e-10, "{} vs {}", base, moved);
    }
}

/// Log-sum-exp lies between its algebraic bounds.
///
/// `max ≤ log_sum_exp ≤ max + ln(N)`, up to rounding.
#[property_test]
fn log_sum_exp_is_bracketed_by_max_and_max_plus_ln_n(
    #[strategy = logits_strategy()] logits: [f64; 11],
) {
    let vec = DVecN::new(logits);

    let result = vec.log_sum_exp();
    let maximum = logits.iter().copied().fold(f64::NEG_INFINITY, f64::max);

    prop_assert!(result >= maximum - 1e-9, "{} below max {}", result, maximum);
    prop_assert!(
        result <= maximum + 11.0_f64.ln() + 1e-9,
        "{} above max {} + ln(11)",
        result,
        maximum,
    );
}

/// `add_scaled` matches the scalar fused reference loop bit for bit in every component.
///
/// The SIMD path widens, multiplies, and adds with the same single rounding as scalar `mul_add`.
/// Components and the factor lie in `-1e3..1e3`.
#[property_test]
fn add_scaled_matches_a_scalar_reference_loop(
    #[strategy = proptest::array::uniform11(-1e3_f64..1e3)] accumulator: [f64; 11],
    #[strategy = proptest::array::uniform11(-1e3_f32..1e3)] direction: [f32; 11],
    #[strategy = -1e3_f64..1e3] factor: f64,
) {
    let expected: [f64; 11] = core::array::from_fn(|index| {
        f64::from(direction[index]).mul_add(factor, accumulator[index])
    });

    let mut actual = DVecN::new(accumulator);
    actual.add_scaled(&crate::math::VecN::new(direction), factor);

    prop_assert_eq!(actual.as_array(), &expected);
}

/// A small test index as an exact double, per the house cast discipline.
fn coordinate(index: usize) -> f64 {
    f64::from(u8::try_from(index).expect("test sizes are small"))
}

/// An aligned copy of the same components, for cross-type bit agreement.
fn aligned<const N: usize>(components: &[f64; N]) -> BoxedDVecN<N> {
    BoxedDVecN::new(DVecN::from_ref(components))
}

#[test]
fn max_abs_matches_the_scalar_fold_across_chunk_sizes() {
    fn check<const N: usize>(components: [f64; N]) {
        let expected = components
            .iter()
            .fold(0.0_f64, |scale, &component| scale.max(component.abs()));
        assert_eq!(
            DVecN::new(components).max_abs(),
            expected,
            "over {N} components"
        );
        assert_eq!(aligned(&components).max_abs(), expected, "aligned over {N}");
    }

    check([]);
    check([-3.5]);
    check([0.5, -1.25, 2.0]);
    check(core::array::from_fn::<f64, 8, _>(|index| {
        -coordinate(index)
    }));
    check(core::array::from_fn::<f64, 19, _>(|index| {
        coordinate(index) - 9.5
    }));
}

#[test]
fn max_abs_ignores_nan_in_favor_of_finite_magnitudes() {
    assert_eq!(DVecN::new([1.0, f64::NAN, -3.0]).max_abs(), 3.0);
    assert_eq!(DVecN::new([f64::NAN]).max_abs(), 0.0);
}

#[test]
fn stable_l2_matches_exact_norms_on_both_types() {
    fn check<const N: usize>(components: [f64; N], expected: f64) {
        assert_eq!(DVecN::new(components).stable_l2(), expected);
        assert_eq!(aligned(&components).stable_l2(), expected);
    }

    check([], 0.0);
    check([0.0, -0.0, 0.0], 0.0);
    check([-7.0], 7.0);
    // 3-4-5 triangle: every ratio and square is exact.
    check([3.0, 4.0], 5.0);
    check([4.0, 0.0, -3.0], 5.0);
}

#[test]
fn stable_l2_zero_components_contribute_exactly_nothing() {
    let dense = [0.3, -1.7, 2.9];
    let padded = [0.0, 0.3, 0.0, -1.7, 2.9, 0.0];
    assert_eq!(
        DVecN::new(dense).stable_l2(),
        DVecN::new(padded).stable_l2(),
    );
}

#[test]
fn stable_l2_survives_subnormal_components() {
    let tiny = f64::MIN_POSITIVE / 1024.0;
    // Exact: √4 doubles the magnitude, and doubling subnormals is exact.
    assert_eq!(DVecN::new([tiny; 4]).stable_l2(), 2.0 * tiny);
    assert_eq!(aligned(&[tiny; 4]).stable_l2(), 2.0 * tiny);
}

#[test]
fn stable_l2_survives_huge_components() {
    let huge = f64::MAX / 2.0;
    let expected = huge * core::f64::consts::SQRT_2;
    let norm = DVecN::new([huge, huge]).stable_l2();
    assert!(
        (norm - expected).abs() <= 4.0 * f64::EPSILON * expected,
        "{norm} vs {expected}",
    );
}

#[test]
fn stable_l2_propagates_non_finite_components() {
    assert!(DVecN::new([1.0, f64::NAN]).stable_l2().is_nan());
    assert!(!DVecN::new([f64::INFINITY, 1.0]).stable_l2().is_finite());
    // A NaN alongside only zeros hides from the maxNum scale, so the zero-scale finiteness gate
    // catches it.
    assert!(DVecN::new([0.0, f64::NAN, 0.0]).stable_l2().is_nan());
}

#[test]
fn stable_l2_agrees_between_types_across_chunk_sizes() {
    fn check<const N: usize>(components: [f64; N]) {
        assert_eq!(
            DVecN::new(components).stable_l2(),
            aligned(&components).stable_l2(),
            "over {N} components",
        );
    }

    check(core::array::from_fn::<f64, 8, _>(|index| {
        coordinate(index).mul_add(0.75, -2.0)
    }));
    check(core::array::from_fn::<f64, 19, _>(|index| {
        coordinate(index).mul_add(-0.3, 2.4)
    }));
}

#[test]
fn is_finite_detects_non_finite_components_in_lanes_and_remainder() {
    fn check<const N: usize>(components: [f64; N], expected: bool) {
        assert_eq!(DVecN::new(components).is_finite(), expected, "over {N}");
        assert_eq!(
            aligned(&components).is_finite(),
            expected,
            "aligned over {N}"
        );
    }

    check([], true);
    check([1.0, -2.0, f64::MIN_POSITIVE / 1024.0], true);
    check([f64::NAN], false);
    // 19 components: the offender sits inside the lane groups, then inside the remainder.
    let mut in_lanes = [1.0_f64; 19];
    in_lanes[2] = f64::INFINITY;
    check(in_lanes, false);
    let mut in_remainder = [1.0_f64; 19];
    in_remainder[17] = f64::NEG_INFINITY;
    check(in_remainder, false);
}

#[test]
fn mul_add_matches_the_componentwise_fused_multiply_add() {
    fn check<const N: usize>(base: [f64; N], direction: [f64; N], factor: f64) {
        let mut updated = DVecN::new(base);
        updated.mul_add(DVecN::from_ref(&direction), factor);

        let mut updated_aligned = aligned(&base);
        updated_aligned.mul_add(&aligned(&direction), factor);

        for (index, ((&result, &result_aligned), (&start, &along))) in updated
            .as_array()
            .iter()
            .zip(updated_aligned.as_array())
            .zip(base.iter().zip(&direction))
            .enumerate()
        {
            let expected = along.mul_add(factor, start);
            assert_eq!(result.to_bits(), expected.to_bits(), "component {index}");
            assert_eq!(
                result_aligned.to_bits(),
                expected.to_bits(),
                "aligned {index}"
            );
        }
    }

    check([], [], 2.0);
    check([1.0, -2.0, 0.5], [0.25, 4.0, -8.0], -1.5);
    check(
        core::array::from_fn::<f64, 19, _>(|index| coordinate(index).mul_add(0.1, -0.9)),
        core::array::from_fn::<f64, 19, _>(|index| coordinate(index).mul_add(-0.7, 6.3)),
        1.0e-16,
    );
}

#[test]
fn negate_flips_every_sign_including_zero() {
    let mut vector = DVecN::new([1.5, -2.0, 0.0, -0.0]);
    vector.negate();
    let negated = vector.as_array();
    assert_eq!(negated[0], -1.5);
    assert_eq!(negated[1], 2.0);
    assert!(negated[2].is_sign_negative());
    assert!(negated[3].is_sign_positive());

    let mut aligned_vector = aligned(&[1.5, -2.0, 0.0, -0.0]);
    aligned_vector.negate();
    assert_eq!(aligned_vector.as_array(), negated);
}

#[test]
fn divide_components_divides_each_coordinate_in_lanes_and_remainder() {
    let dividend = core::array::from_fn::<f64, 19, _>(|index| coordinate(index).mul_add(3.0, 1.0));
    let divisor = core::array::from_fn::<f64, 19, _>(|index| coordinate(index).mul_add(0.5, 2.0));

    let mut quotient = DVecN::new(dividend);
    quotient.divide_components(DVecN::from_ref(&divisor));

    let mut quotient_aligned = aligned(&dividend);
    quotient_aligned.divide_components(&aligned(&divisor));

    for (index, ((&result, &result_aligned), (&numerator, &denominator))) in quotient
        .as_array()
        .iter()
        .zip(quotient_aligned.as_array())
        .zip(dividend.iter().zip(&divisor))
        .enumerate()
    {
        let expected = numerator / denominator;
        assert_eq!(result.to_bits(), expected.to_bits(), "component {index}");
        assert_eq!(
            result_aligned.to_bits(),
            expected.to_bits(),
            "aligned {index}"
        );
    }
}

#[test]
fn multiply_components_multiplies_each_coordinate_in_lanes_and_remainder() {
    let multiplicand =
        core::array::from_fn::<f64, 19, _>(|index| coordinate(index).mul_add(3.0, 1.0));
    let factor = core::array::from_fn::<f64, 19, _>(|index| coordinate(index).mul_add(0.5, 2.0));

    let mut product = DVecN::new(multiplicand);
    product.multiply_components(DVecN::from_ref(&factor));

    let mut product_aligned = aligned(&multiplicand);
    product_aligned.multiply_components(&aligned(&factor));

    for (index, ((&result, &result_aligned), (&left, &right))) in product
        .as_array()
        .iter()
        .zip(product_aligned.as_array())
        .zip(multiplicand.iter().zip(&factor))
        .enumerate()
    {
        let expected = left * right;
        assert_eq!(result.to_bits(), expected.to_bits(), "component {index}");
        assert_eq!(
            result_aligned.to_bits(),
            expected.to_bits(),
            "aligned {index}"
        );
    }
}

#[test]
fn scalar_multiply_and_divide_assign_scale_every_component() {
    let components =
        core::array::from_fn::<f64, 19, _>(|index| coordinate(index).mul_add(1.25, -3.0));

    let mut scaled = aligned(&components);
    *scaled *= 2.0;
    for (&result, &input) in scaled.as_array().iter().zip(&components) {
        // Doubling is exact in binary floating point.
        assert_eq!(result, input * 2.0);
    }

    *scaled /= 2.0;
    for (&result, &input) in scaled.as_array().iter().zip(&components) {
        assert_eq!(result, input);
    }
}

#[test]
fn aligned_reductions_agree_with_unaligned_bits_across_chunk_sizes() {
    fn check<const N: usize>(components: [f64; N], other: [f64; N]) {
        let unaligned = DVecN::new(components);
        let unaligned_other = DVecN::new(other);
        let boxed = aligned(&components);
        let boxed_other = aligned(&other);

        assert_eq!(
            unaligned.dot(&unaligned_other),
            boxed.dot(&boxed_other).into_raw(),
            "dot over {N}",
        );
        assert_eq!(
            unaligned.norm_squared(),
            boxed.norm_squared().into_raw(),
            "norm over {N}",
        );
        assert_eq!(
            unaligned.abs_sum().to_bits(),
            boxed.abs_sum().to_bits(),
            "abs_sum over {N}",
        );
    }

    check([], []);
    check([0.3], [-1.9]);
    check(
        core::array::from_fn::<f64, 8, _>(|index| coordinate(index).mul_add(0.31, -1.1)),
        core::array::from_fn::<f64, 8, _>(|index| coordinate(index).mul_add(-0.17, 0.4)),
    );
    check(
        core::array::from_fn::<f64, 21, _>(|index| coordinate(index).mul_add(0.09, -0.8)),
        core::array::from_fn::<f64, 21, _>(|index| coordinate(index).mul_add(0.23, 1.6)),
    );
}

/// The interleaved reductions visit a third lane group and the remainder in one call.
///
/// Twenty-five components split as three 8-lane groups plus one remainder component, so the
/// two-accumulator fold revisits accumulator zero at group index two. Signed integer components
/// keep every partial sum exact.
#[test]
fn abs_sum_interleaves_three_lane_groups() {
    let components = core::array::from_fn::<f64, 25, _>(|index| {
        let magnitude = coordinate(index);
        if index.is_multiple_of(2) {
            -magnitude
        } else {
            magnitude
        }
    });

    // Σ 0..=24 = 300, a sum of exactly representable integers.
    assert_eq!(DVecN::new(components).abs_sum(), 300.0);
    assert_eq!(BoxedDVecN::from(components).abs_sum(), 300.0);
}

/// The scaled two-pass norm visits a third lane group and the remainder in one call.
///
/// The 3-4-5 triangle keeps every step exact: the scale is `4`, the ratios are `0.75` and `-1`,
/// and `4 · √1.5625 = 5`.
#[test]
fn stable_l2_interleaves_three_lane_groups() {
    let mut components = [0.0_f64; 25];
    components[0] = 3.0;
    components[24] = -4.0;

    assert_eq!(DVecN::new(components).stable_l2(), 5.0);
}

/// Negation flips the aligned lane groups of guaranteed-aligned storage.
#[test]
fn negate_flips_the_aligned_lane_groups() {
    let mut boxed = BoxedDVecN::from([1.0, -2.0, 3.0, -4.0, 5.0, -6.0, 7.0, -8.0]);

    DVecN::from_mut(boxed.as_array_mut()).negate();

    assert_eq!(
        *boxed.as_array(),
        [-1.0, 2.0, -3.0, 4.0, -5.0, 6.0, -7.0, 8.0]
    );
}

/// The checking wrapper admits aligned storage and refuses an offset view of it.
#[test]
fn aligned_from_mut_checks_alignment() {
    let mut boxed = BoxedDVecN::from([7.0_f64; 9]);
    let array: &mut [f64; 9] = boxed.as_array_mut();

    let (head, _) = array.split_at_mut(8);
    let head: &mut [f64; 8] = head.try_into().expect("eight components split off");
    assert!(AlignedDVecN::from_mut(head).is_some());

    // One component in, the view sits eight bytes past the 64-byte boundary.
    let tail: &mut [f64; 8] = (&mut array[1..])
        .try_into()
        .expect("eight components remain");
    assert!(AlignedDVecN::from_mut(tail).is_none());
}

/// The checking wrapper admits aligned storage and refuses an offset view of it, through a
/// shared reference.
#[test]
fn aligned_from_ref_checks_alignment() {
    let boxed = BoxedDVecN::from([7.0_f64; 9]);
    let array: &[f64; 9] = boxed.as_array();

    let (head, _) = array.split_at(8);
    let head: &[f64; 8] = head.try_into().expect("eight components split off");
    assert!(AlignedDVecN::from_ref(head).is_some());

    // One component in, the view sits eight bytes past the 64-byte boundary.
    let tail: &[f64; 8] = (&array[1..]).try_into().expect("eight components remain");
    assert!(AlignedDVecN::from_ref(tail).is_none());
}

/// `clone_from` reuses the target's existing allocation instead of reallocating.
#[test]
fn boxed_dvecn_clone_from_reuses_the_allocation() {
    let source = BoxedDVecN::from([9.0_f64; 8]);
    let mut target = BoxedDVecN::from([0.0_f64; 8]);
    let address = target.as_array().as_ptr().addr();

    target.clone_from(&source);

    assert_eq!(target, source);
    assert_eq!(
        target.as_array().as_ptr().addr(),
        address,
        "clone_from must reuse the existing buffer",
    );
}

/// Hashes one value with the std default hasher.
fn hash_of(value: impl Hash) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

/// `Hash` follows the components and `Debug` prints them.
#[test]
fn boxed_hash_and_debug_follow_the_components() {
    let low = BoxedDVecN::from([0.5, 1.5]);
    let high = BoxedDVecN::from([1.0, 1.5]);

    // A fixed-key DefaultHasher makes distinctness deterministic for fixed inputs.
    assert_ne!(hash_of(&low), hash_of(&high));
    assert_eq!(format!("{low:?}"), "AlignedDVecN([0.5, 1.5])");
}

/// Dropping a box returns its buffer to the allocator that provided it.
#[test]
fn boxed_drop_returns_the_buffer_to_its_allocator() {
    let alloc = CountingAllocator::new();

    let boxed = BoxedDVecN::try_new_in(DVecN::from_ref(&[1.0, 2.0, 3.0]), &alloc)
        .expect("the global allocator provides a three-component buffer");
    assert_eq!(alloc.deallocations(), 0);

    drop(boxed);
    assert_eq!(alloc.deallocations(), 1);
}

#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are the point: single-element identities and empty-fold \
              identities are exact contracts"
)]

use proptest::prelude::*;

use crate::math::DVecN;

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

// The fixed dimension 11 crosses the reductions' 4-lane chunk boundary
// (two full chunks plus a remainder of three) and `add_scaled`'s 8-lane
// boundary (one chunk plus three).

/// Logits bounded to `-50..50`, where `exp` is well-conditioned; the
/// stability of the shifted form under huge logits is pinned by the
/// example-based tests above.
fn logits_strategy() -> impl Strategy<Value = [f64; 11]> {
    prop::array::uniform11(-50.0_f64..50.0)
}

proptest! {
    /// Softmax outputs are probabilities: each lies in `[0, 1]` and they
    /// sum to one up to rounding.
    #[test]
    fn softmax_outputs_form_a_distribution(logits in logits_strategy()) {
        let probabilities = DVecN::new(logits).softmax();

        for &probability in probabilities.as_array() {
            prop_assert!((0.0..=1.0).contains(&probability));
        }
        let total: f64 = probabilities.as_array().iter().sum();
        prop_assert!((total - 1.0).abs() < 1e-12, "total {}", total);
    }

    /// Softmax is shift-invariant: adding a common constant to every
    /// logit leaves the distribution unchanged up to rounding. The shift
    /// is bounded to `-1e2..1e2` so the shifted logits stay
    /// well-conditioned.
    #[test]
    fn softmax_is_shift_invariant_on_arbitrary_logits(
        logits in logits_strategy(),
        shift in -1e2_f64..1e2,
    ) {
        let base = DVecN::new(logits).softmax();
        let moved = DVecN::new(logits.map(|logit| logit + shift)).softmax();

        for (base, moved) in base.as_array().iter().zip(moved.as_array()) {
            prop_assert!((base - moved).abs() < 1e-10, "{} vs {}", base, moved);
        }
    }

    /// Log-sum-exp is bracketed by its algebraic bounds:
    /// `max <= log_sum_exp <= max + ln(N)`, up to rounding.
    #[test]
    fn log_sum_exp_is_bracketed_by_max_and_max_plus_ln_n(logits in logits_strategy()) {
        let vec = DVecN::new(logits);

        let result = vec.log_sum_exp();
        let maximum = logits.iter().copied().fold(f64::NEG_INFINITY, f64::max);

        prop_assert!(result >= maximum - 1e-9, "{} below max {}", result, maximum);
        prop_assert!(
            result <= maximum + 11.0_f64.ln() + 1e-9,
            "{} above max {} + ln(11)", result, maximum,
        );
    }

    /// `add_scaled` matches the scalar fused reference loop bit for bit
    /// in every component: the SIMD path widens, multiplies, and adds
    /// with the same single rounding as scalar `mul_add`. Components and
    /// the factor are bounded to `-1e3..1e3`.
    #[test]
    fn add_scaled_matches_a_scalar_reference_loop(
        accumulator in prop::array::uniform11(-1e3_f64..1e3),
        direction in prop::array::uniform11(-1e3_f32..1e3),
        factor in -1e3_f64..1e3,
    ) {
        let expected: [f64; 11] = core::array::from_fn(|index| {
            f64::from(direction[index]).mul_add(factor, accumulator[index])
        });

        let mut actual = DVecN::new(accumulator);
        actual.add_scaled(&crate::math::VecN::new(direction), factor);

        prop_assert_eq!(actual.as_array(), &expected);
    }
}

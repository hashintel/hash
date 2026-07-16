#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are the point: single-element identities and empty-fold \
              identities are exact contracts"
)]

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

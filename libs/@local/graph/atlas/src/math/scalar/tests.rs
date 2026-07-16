#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are the point: single-element identities, asymptotes over \
              exactly-representable values, and round-trip narrowing are exact contracts"
)]

use proptest::prelude::*;

use crate::math::scalar::{huber, narrow_f32, narrow_f32_exact, softplus};

#[test]
fn softplus_approaches_asymptotes() {
    // ln_1p(exp(-50)) is far below f32 epsilon at 50, so the positive
    // asymptote is exact.
    assert_eq!(softplus(50.0), 50.0);
    // The negative tail decays like exp(value): tiny at -50, exactly zero
    // once exp underflows f32 entirely.
    assert!(softplus(-50.0) > 0.0);
    assert!(softplus(-50.0) < 1e-20);
    assert_eq!(softplus(-200.0), 0.0);
}

#[test]
fn softplus_satisfies_shift_identity() {
    // softplus(x) - softplus(-x) == x: the ln_1p terms share |x| and cancel.
    for value in [-3.0_f32, -0.5, 0.0, 1.25, 4.0] {
        let difference = softplus(value) - softplus(-value);
        assert!((difference - value).abs() < 1e-5, "value {value}");
    }
}

#[test]
#[expect(
    clippy::imprecise_flops,
    reason = "the textbook `ln(1 + exp(x))` form is the reference the stable evaluation is \
              checked against"
)]
fn softplus_matches_naive_on_small_values() {
    for value in [-4.0_f32, -1.0, 0.0, 0.5, 3.0] {
        let naive = (1.0 + value.exp()).ln();
        assert!((softplus(value) - naive).abs() < 1e-5, "value {value}");
    }
}

#[test]
fn huber_matches_hand_computed_regimes() {
    // Quadratic regime: 0.5 * value^2, over exactly-representable inputs.
    assert_eq!(huber(0.5, 1.0), 0.125);
    assert_eq!(huber(0.0, 1.0), 0.0);
    // At the threshold both formulas give 0.5 * threshold^2.
    assert_eq!(huber(1.0, 1.0), 0.5);
    // Linear regime: threshold * (value - 0.5 * threshold).
    assert_eq!(huber(3.0, 1.0), 2.5);
    assert_eq!(huber(2.0, 0.5), 0.875);
}

#[test]
fn huber_is_continuous_at_the_threshold() {
    let threshold = 1.0_f32;
    let step = 1e-4_f32;

    let below = huber(threshold - step, threshold);
    let above = huber(threshold + step, threshold);

    // The derivative at the threshold is the threshold itself, so values a
    // step apart on either side differ by roughly 2 * step.
    assert!(below < above);
    assert!((above - below) < 1e-3);
}

#[test]
fn narrowing_round_trips_powers_of_two() {
    assert_eq!(narrow_f32(0.25), Some(0.25_f32));
    assert_eq!(narrow_f32_exact(0.25), Some(0.25_f32));
    assert_eq!(narrow_f32(-1024.0), Some(-1024.0_f32));
    assert_eq!(narrow_f32_exact(-1024.0), Some(-1024.0_f32));
}

#[test]
fn narrow_f32_rounds_where_exact_rejects() {
    // 0.1 has no exact binary representation at either width; narrowing
    // rounds to the nearest f32, which is what the 0.1_f32 literal denotes.
    assert_eq!(narrow_f32(0.1), Some(0.1_f32));
    assert_eq!(narrow_f32_exact(0.1), None);
}

#[test]
fn narrowing_rejects_overflow_and_nan() {
    assert_eq!(narrow_f32(1e300), None);
    assert_eq!(narrow_f32_exact(1e300), None);
    assert_eq!(narrow_f32(f64::INFINITY), None);
    assert_eq!(narrow_f32_exact(f64::NEG_INFINITY), None);
    assert!(narrow_f32(f64::NAN).is_none());
    assert!(narrow_f32_exact(f64::NAN).is_none());
}

#[test]
fn narrowing_preserves_negative_zero() {
    let rounded = narrow_f32(-0.0).expect("negative zero is finite");
    assert_eq!(rounded.to_bits(), (-0.0_f32).to_bits());

    let exact = narrow_f32_exact(-0.0).expect("negative zero is exactly representable");
    assert_eq!(exact.to_bits(), (-0.0_f32).to_bits());
}

proptest! {
    /// Softplus is non-negative and satisfies the shift identity
    /// `softplus(x) - softplus(-x) == x` up to rounding scaled by `|x|`.
    /// Inputs are bounded to `-1e4..1e4`, where the stable form is
    /// well-conditioned; the asymptotes are pinned above.
    #[test]
    fn softplus_is_non_negative_and_satisfies_the_shift_identity(value in -1e4_f32..1e4) {
        prop_assert!(softplus(value) >= 0.0);
        prop_assert!(softplus(-value) >= 0.0);

        let difference = softplus(value) - softplus(-value);
        prop_assert!(
            (difference - value).abs() <= 1e-5 * value.abs().max(1.0),
            "softplus({0}) - softplus(-{0}) = {1}", value, difference,
        );
    }

    /// The Huber penalty is non-negative and monotone non-decreasing in
    /// the magnitude for a fixed positive threshold: the quadratic and
    /// linear pieces are each monotone and meet continuously at the
    /// threshold. Magnitudes are bounded to `0..1e3` and thresholds to
    /// `1e-3..1e3`.
    #[test]
    fn huber_is_non_negative_and_monotone_in_the_magnitude(
        first in 0.0_f32..1e3,
        second in 0.0_f32..1e3,
        threshold in 1e-3_f32..1e3,
    ) {
        let (lower, upper) = if first <= second { (first, second) } else { (second, first) };

        prop_assert!(huber(lower, threshold) >= 0.0);
        prop_assert!(
            huber(lower, threshold) <= huber(upper, threshold),
            "huber({}, {}) = {} above huber({}, {}) = {}",
            lower, threshold, huber(lower, threshold),
            upper, threshold, huber(upper, threshold),
        );
    }

    /// Widening an `f32` to `f64` and narrowing it back is the identity:
    /// every finite `f32` is exactly representable in `f64`, and
    /// round-to-nearest returns it unchanged.
    #[test]
    fn narrow_f32_round_trips_every_finite_f32(value in -f32::MAX..=f32::MAX) {
        prop_assert_eq!(narrow_f32(f64::from(value)), Some(value));
        prop_assert_eq!(narrow_f32_exact(f64::from(value)), Some(value));
    }

    /// Exact narrowing is a refinement of rounding narrowing: whenever
    /// `narrow_f32_exact` accepts a value, `narrow_f32` returns the same
    /// bits (a representable value rounds to itself).
    #[test]
    fn narrow_f32_exact_agrees_with_narrow_f32_when_it_succeeds(value in -1e300_f64..1e300) {
        if let Some(exact) = narrow_f32_exact(value) {
            let rounded = narrow_f32(value).expect("an exactly representable value is finite");
            prop_assert_eq!(rounded.to_bits(), exact.to_bits());
        }
    }
}

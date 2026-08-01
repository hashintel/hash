#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are the point: single-element identities, asymptotes over \
              exactly-representable values, and round-trip narrowing are exact contracts"
)]

use proptest::{prop_assert, prop_assert_eq, prop_assert_ne, prop_oneof, property_test};

use crate::math::scalar::{
    DNonNegative, DPositive, GreaterThanOne, Log2, OpenUnitFraction, UnitFraction, huber,
    narrow_f32, narrow_f32_exact, sigmoid, softplus,
};

#[test]
fn unit_fraction_accepts_exactly_the_closed_interval() {
    assert_eq!(UnitFraction::new(0.0), Some(UnitFraction::ZERO));
    assert_eq!(UnitFraction::new(1.0), Some(UnitFraction::ONE));
    assert_eq!(UnitFraction::new(0.25).map(UnitFraction::get), Some(0.25),);

    assert_eq!(UnitFraction::new(-0.1), None);
    assert_eq!(UnitFraction::new(1.5), None);
    assert_eq!(UnitFraction::new(f64::NAN), None);
    assert_eq!(UnitFraction::new(f64::INFINITY), None);
    assert_eq!(UnitFraction::new(f64::NEG_INFINITY), None);
}

#[test]
fn softplus_approaches_asymptotes() {
    // ln_1p(exp(-50)) is far below f32 ε at 50, so the positive
    // asymptote is exact.
    assert_eq!(softplus(50.0), 50.0);
    // The negative tail decays like exp(value): below 1e-20 at -50, exactly zero once exp
    // underflows f32 entirely.
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
fn sigmoid_matches_hand_computed_values() {
    // At zero the two branches agree exactly: 1 / (1 + 1).
    assert_eq!(sigmoid(0.0), 0.5);
    // Saturation: exp(-200) underflows f32, so the asymptotes are exact.
    assert_eq!(sigmoid(200.0), 1.0);
    assert_eq!(sigmoid(-200.0), 0.0);
}

#[test]
fn sigmoid_keeps_relative_precision_on_the_negative_tail() {
    // The complement form `1 - 1/(1 + exp(-|x|))` rounds to zero once exp(-|x|) drops below f32 ε.
    // The direct ratio keeps the tail.
    let tail = sigmoid(-20.0);
    let expected = (-20.0_f32).exp();
    assert!(tail > 0.0);
    assert!((tail - expected).abs() <= 1e-6 * expected, "tail {tail}");
}

#[test]
fn huber_matches_hand_computed_regimes() {
    // Quadratic regime: 0.5 · value^2, over exactly-representable inputs.
    assert_eq!(huber(0.5, 1.0), 0.125);
    assert_eq!(huber(0.0, 1.0), 0.0);
    // At the threshold both formulas give 0.5 · threshold^2.
    assert_eq!(huber(1.0, 1.0), 0.5);
    // Linear regime: threshold · (value - 0.5 · threshold).
    assert_eq!(huber(3.0, 1.0), 2.5);
    assert_eq!(huber(2.0, 0.5), 0.875);
}

#[test]
fn huber_is_continuous_at_the_threshold() {
    let threshold = 1.0_f32;
    let step = 1e-4_f32;

    let below = huber(threshold - step, threshold);
    let above = huber(threshold + step, threshold);

    // The derivative at the threshold is the threshold itself, so values a step apart on either
    // side differ by about 2 · step.
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

/// Softplus is non-negative and satisfies the shift identity.
///
/// `softplus(x) - softplus(-x) == x` up to rounding scaled by `|x|`. The strategy bounds inputs to
/// `-1e4..1e4`, where the stable form is well-conditioned. The tests above pin the asymptotes.
#[property_test]
fn softplus_is_non_negative_and_satisfies_the_shift_identity(
    #[strategy = -1e4_f32..1e4] value: f32,
) {
    prop_assert!(softplus(value) >= 0.0);
    prop_assert!(softplus(-value) >= 0.0);

    let difference = softplus(value) - softplus(-value);
    prop_assert!(
        (difference - value).abs() <= 1e-5 * value.abs().max(1.0),
        "softplus({0}) - softplus(-{0}) = {1}",
        value,
        difference,
    );
}

/// The sigmoid is monotone non-decreasing and satisfies its complement identity.
///
/// Values lie in `[0, 1]`, and `sigmoid(-x) == 1 - sigmoid(x)` up to rounding. The strategy bounds
/// inputs to `-1e4..1e4`. The tests above pin the asymptotes.
#[property_test]
fn sigmoid_is_bounded_monotone_and_complementary(
    #[strategy = -1e4_f32..1e4] first: f32,
    #[strategy = -1e4_f32..1e4] second: f32,
) {
    let (lower, upper) = if first <= second {
        (first, second)
    } else {
        (second, first)
    };

    prop_assert!((0.0..=1.0).contains(&sigmoid(lower)));
    prop_assert!(
        sigmoid(lower) <= sigmoid(upper),
        "sigmoid({}) = {} above sigmoid({}) = {}",
        lower,
        sigmoid(lower),
        upper,
        sigmoid(upper),
    );

    let complement = 1.0 - sigmoid(first);
    prop_assert!(
        (sigmoid(-first) - complement).abs() <= 1e-6,
        "sigmoid(-{0}) = {1} against 1 - sigmoid({0}) = {2}",
        first,
        sigmoid(-first),
        complement,
    );
}

/// The Huber penalty is non-negative and monotone non-decreasing in the magnitude.
///
/// For a fixed positive threshold, the quadratic and linear pieces are each monotone and meet
/// continuously at the threshold. The strategies bound magnitudes to `0..1e3` and thresholds to
/// `1e-3..1e3`.
#[property_test]
fn huber_is_non_negative_and_monotone_in_the_magnitude(
    #[strategy = 0.0_f32..1e3] first: f32,
    #[strategy = 0.0_f32..1e3] second: f32,
    #[strategy = 1e-3_f32..1e3] threshold: f32,
) {
    let (lower, upper) = if first <= second {
        (first, second)
    } else {
        (second, first)
    };

    prop_assert!(huber(lower, threshold) >= 0.0);
    prop_assert!(
        huber(lower, threshold) <= huber(upper, threshold),
        "huber({}, {}) = {} above huber({}, {}) = {}",
        lower,
        threshold,
        huber(lower, threshold),
        upper,
        threshold,
        huber(upper, threshold),
    );
}

/// Widening an `f32` to `f64` and narrowing it back is the identity.
///
/// Every finite `f32` is exactly representable in `f64`, and round-to-nearest returns it
/// unchanged.
#[property_test]
fn narrow_f32_round_trips_every_finite_f32(#[strategy = -f32::MAX..=f32::MAX] value: f32) {
    prop_assert_eq!(narrow_f32(f64::from(value)), Some(value));
    prop_assert_eq!(narrow_f32_exact(f64::from(value)), Some(value));
}

/// Exact narrowing is rounding narrowing filtered by round-trip.
///
/// Whenever `narrow_f32_exact` succeeds, `narrow_f32` succeeds with the same bits and that value
/// round-trips back to the input bit for bit. Whenever `narrow_f32` succeeds but `narrow_f32_exact`
/// does not, the narrowed value must have lost information: it does not round-trip.
/// `narrow_f32_exact` never succeeds where `narrow_f32` fails, since a bit-exact narrowing is in
/// particular a round-to-nearest narrowing.
#[property_test]
fn narrow_f32_exact_is_narrow_f32_filtered_by_round_trip(
    #[strategy = prop_oneof![
        (-f32::MAX..=f32::MAX).prop_map(f64::from),
        -4e38_f64..=4e38_f64,
    ]]
    value: f64,
) {
    match (narrow_f32(value), narrow_f32_exact(value)) {
        (Some(rounded), Some(exact)) => {
            prop_assert_eq!(exact.to_bits(), rounded.to_bits());
            prop_assert_eq!(f64::from(rounded).to_bits(), value.to_bits());
        }
        (Some(rounded), None) => {
            prop_assert_ne!(f64::from(rounded).to_bits(), value.to_bits());
        }
        (None, Some(_)) => {
            prop_assert!(
                false,
                "narrow_f32_exact succeeded while narrow_f32 failed for {value}"
            );
        }
        (None, None) => {}
    }
}

/// The whole `u8` domain, exhaustively: exactly the shiftable exponents construct.
#[test]
fn log2_admits_exactly_the_shift_domain() {
    for value in 0_u8..64 {
        let exponent = Log2::new(value).expect("values below the shift width construct");
        assert_eq!(exponent.get(), value);
        // The type guarantees that a shift by an exponent that exists cannot panic.
        let _power = 1_u64 << exponent.get();
    }
    for value in 64_u8..=u8::MAX {
        assert_eq!(Log2::new(value), None);
    }
}

/// The double-precision positive domain is exactly the finite values strictly above zero.
#[test]
fn d_positive_admits_exactly_the_positive_finite_domain() {
    assert_eq!(
        DPositive::new(1.0e-308)
            .expect("a tiny positive constructs")
            .get(),
        1.0e-308,
    );
    assert_eq!(
        DPositive::new(f64::MAX)
            .expect("the maximum is finite")
            .get(),
        f64::MAX
    );

    assert_eq!(DPositive::new(0.0), None);
    assert_eq!(DPositive::new(-0.0), None);
    assert_eq!(DPositive::new(-1.0), None);
    assert_eq!(DPositive::new(f64::INFINITY), None);
    assert_eq!(DPositive::new(f64::NAN), None);
}

/// The double-precision non-negative domain admits zero and rejects every sign and escape.
#[test]
fn d_non_negative_admits_exactly_the_non_negative_finite_domain() {
    assert_eq!(DNonNegative::new(0.0).expect("zero is admitted").get(), 0.0);
    assert_eq!(
        DNonNegative::new(1.0e-10)
            .expect("a tolerance constructs")
            .get(),
        1.0e-10,
    );

    assert_eq!(DNonNegative::new(-1.0e-300), None);
    assert_eq!(DNonNegative::new(f64::INFINITY), None);
    assert_eq!(DNonNegative::new(f64::NAN), None);
}

/// The open unit interval excludes both endpoints, unlike its closed sibling.
#[test]
fn open_unit_fraction_excludes_the_endpoints() {
    assert_eq!(
        OpenUnitFraction::new(0.25)
            .expect("a quarter is interior")
            .get(),
        0.25
    );
    let almost_one = 1.0 - f64::EPSILON;
    assert_eq!(
        OpenUnitFraction::new(almost_one)
            .expect("below one is interior")
            .get(),
        almost_one,
    );

    assert_eq!(OpenUnitFraction::new(0.0), None);
    assert_eq!(OpenUnitFraction::new(1.0), None);
    assert_eq!(OpenUnitFraction::new(-0.5), None);
    assert_eq!(OpenUnitFraction::new(1.5), None);
    assert_eq!(OpenUnitFraction::new(f64::NAN), None);
}

/// The greater-than-one domain rejects one itself, infinities, and everything below.
#[test]
fn greater_than_one_requires_actual_growth() {
    assert_eq!(GreaterThanOne::new(2.0).expect("doubling grows").get(), 2.0);
    let barely = 1.0 + f64::EPSILON;
    assert_eq!(
        GreaterThanOne::new(barely)
            .expect("one ulp above grows")
            .get(),
        barely
    );

    assert_eq!(GreaterThanOne::new(1.0), None);
    assert_eq!(GreaterThanOne::new(0.5), None);
    assert_eq!(GreaterThanOne::new(f64::INFINITY), None);
    assert_eq!(GreaterThanOne::new(f64::NAN), None);
}

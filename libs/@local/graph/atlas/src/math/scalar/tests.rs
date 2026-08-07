#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are the point: single-element identities, asymptotes over \
              exactly-representable values, and round-trip narrowing are exact contracts"
)]

use core::hash::{Hash, Hasher as _};
use std::hash::DefaultHasher;

use proptest::{prop_assert, prop_assert_eq, prop_assert_ne, prop_oneof, property_test};

use crate::math::{
    d_finite, finite,
    scalar::{
        DFinite, DNonNegative, DPositive, Finite, GreaterThanOne, Log2, NonNegative,
        OpenUnitFraction, Positive, UnitFraction, huber, narrow_f32, narrow_f32_exact, sigmoid,
        softplus,
    },
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

/// Every constructor canonicalizes the sign of zero.
///
/// `-0.0` enters through `new`, `new_clamped`, and `new_unchecked`; one bit pattern per value is
/// the ground for bitwise `Eq`, `Ord`, and `Hash`, so all three must store `+0.0`.
#[test]
fn unit_fraction_constructors_canonicalize_negative_zero() {
    let plus_zero = 0.0_f64.to_bits();

    assert_eq!(
        UnitFraction::new(-0.0)
            .expect("-0.0 lies inside [0, 1]")
            .get()
            .to_bits(),
        plus_zero
    );
    assert_eq!(
        UnitFraction::new_clamped(-0.0)
            .expect("-0.0 is not NaN")
            .get()
            .to_bits(),
        plus_zero
    );
    assert_eq!(UnitFraction::new_unchecked(-0.0).get().to_bits(), plus_zero);
}

/// `new_unchecked` passes an in-domain value through unchanged.
#[test]
fn unit_fraction_new_unchecked_passes_the_promised_value_through() {
    assert_eq!(UnitFraction::new_unchecked(0.625).get(), 0.625);
    assert_eq!(UnitFraction::new_unchecked(0.0), UnitFraction::ZERO);
    assert_eq!(UnitFraction::new_unchecked(1.0), UnitFraction::ONE);
}

/// Counts that divide exactly yield the exact quotient, not an approximation.
#[test]
fn unit_fraction_ratio_divides_small_counts_exactly() {
    assert_eq!(UnitFraction::ratio(3, 4).map(UnitFraction::get), Some(0.75));
    assert_eq!(
        UnitFraction::ratio(1, 8).map(UnitFraction::get),
        Some(0.125)
    );
    assert_eq!(UnitFraction::ratio(1, 1), Some(UnitFraction::ONE));
}

/// Clamping saturates at the nearer endpoint and refuses only NaN.
#[test]
fn unit_fraction_clamp_saturates_and_refuses_only_nan() {
    assert_eq!(UnitFraction::new_clamped(1.5), Some(UnitFraction::ONE));
    assert_eq!(
        UnitFraction::new_clamped(f64::INFINITY),
        Some(UnitFraction::ONE)
    );
    assert_eq!(UnitFraction::new_clamped(-0.25), Some(UnitFraction::ZERO));
    assert_eq!(
        UnitFraction::new_clamped(f64::NEG_INFINITY),
        Some(UnitFraction::ZERO)
    );
    assert_eq!(UnitFraction::new_clamped(f64::NAN), None);
}

/// Inside the domain, clamping is validation: both constructors yield the same value.
#[property_test]
fn unit_fraction_clamp_agrees_with_new_inside_the_domain(#[strategy = 0.0_f64..=1.0] value: f64) {
    prop_assert_eq!(UnitFraction::new_clamped(value), UnitFraction::new(value));
}

/// The complement stays in `[0, 1]` and stays canonical.
#[property_test]
fn unit_fraction_complement_is_closed_and_canonical(#[strategy = 0.0_f64..=1.0] value: f64) {
    let fraction = UnitFraction::new(value).expect("the strategy stays inside [0, 1]");
    let complement = fraction.complement();

    prop_assert!(complement.get() >= 0.0 && complement.get() <= 1.0);
    prop_assert_ne!(complement.get().to_bits(), (-0.0_f64).to_bits());
}

/// The endpoints complement to each other exactly, and one half is its own complement.
#[test]
fn unit_fraction_endpoints_complement_exactly() {
    assert_eq!(UnitFraction::ONE.complement(), UnitFraction::ZERO);
    assert_eq!(UnitFraction::ZERO.complement(), UnitFraction::ONE);
    assert_eq!(UnitFraction::HALF.complement(), UnitFraction::HALF);
}

/// Fraction products stay in the interval, keep a positive sign, and match the iterator fold.
#[property_test]
fn unit_fraction_products_are_closed(
    #[strategy = 0.0_f64..=1.0] left: f64,
    #[strategy = 0.0_f64..=1.0] right: f64,
) {
    let left = UnitFraction::new(left).expect("the strategy stays inside [0, 1]");
    let right = UnitFraction::new(right).expect("the strategy stays inside [0, 1]");

    let product = left * right;
    prop_assert!(product.get() >= 0.0 && product.get() <= 1.0);
    prop_assert_ne!(product.get().to_bits(), (-0.0_f64).to_bits());
    prop_assert_eq!([left, right].into_iter().product::<UnitFraction>(), product);
}

/// The empty product is the multiplicative identity.
#[test]
fn unit_fraction_empty_product_is_one() {
    assert_eq!(
        core::iter::empty::<UnitFraction>().product::<UnitFraction>(),
        UnitFraction::ONE
    );
}

/// `ratio` admits exactly a part within a non-zero total, and the quotient lies in `[0, 1]`.
#[property_test]
fn unit_fraction_ratio_lies_in_the_interval(part: u64, total: u64) {
    match UnitFraction::ratio(part, total) {
        Some(fraction) => {
            prop_assert!(total != 0 && part <= total);
            prop_assert!(fraction.get() >= 0.0 && fraction.get() <= 1.0);
        }
        None => prop_assert!(total == 0 || part > total),
    }
}

/// The total order agrees with the raw float order.
#[property_test]
fn unit_fraction_order_agrees_with_the_raw_floats(
    #[strategy = 0.0_f64..=1.0] left: f64,
    #[strategy = 0.0_f64..=1.0] right: f64,
) {
    let left = UnitFraction::new(left).expect("the strategy stays inside [0, 1]");
    let right = UnitFraction::new(right).expect("the strategy stays inside [0, 1]");

    prop_assert_eq!(
        left.cmp(&right),
        left.get()
            .partial_cmp(&right.get())
            .expect("fractions are never NaN")
    );
}

/// The open complement widens to the closed type at both ends of its range.
#[test]
fn open_unit_fraction_complement_hits_the_closed_endpoints() {
    // Ties-to-even: `1 − 2⁻⁵⁴` is halfway between the largest float below one and one itself,
    // and rounds to the even mantissa, which is one.
    let tie = OpenUnitFraction::new(2.0_f64.powi(-54)).expect("2^-54 lies inside (0, 1)");
    assert_eq!(tie.complement(), UnitFraction::ONE);

    // One spacing further from one, the subtraction is representable again.
    let above = OpenUnitFraction::new(2.0_f64.powi(-53)).expect("2^-53 lies inside (0, 1)");
    assert_eq!(above.complement().get(), 1.0 - 2.0_f64.powi(-53));

    // Sterbenz: the complement of the largest fraction below one is exactly `2⁻⁵³`.
    let largest = OpenUnitFraction::new(1.0 - 2.0_f64.powi(-53)).expect("below one");
    assert_eq!(largest.complement().get(), 2.0_f64.powi(-53));
}

/// Fractions serialize as plain numbers and deserialization re-validates the domain.
#[test]
fn unit_fractions_round_trip_serde_and_refuse_out_of_domain() {
    let value = serde_json::to_value(UnitFraction::HALF).expect("a number serializes");
    assert_eq!(value, serde_json::json!(0.5));
    assert_eq!(
        serde_json::from_value::<UnitFraction>(value).expect("0.5 lies inside [0, 1]"),
        UnitFraction::HALF
    );
    serde_json::from_str::<UnitFraction>("1.5").expect_err("1.5 is out of range");

    let open = OpenUnitFraction::new(0.25).expect("0.25 lies inside (0, 1)");
    let value = serde_json::to_value(open).expect("a number serializes");
    assert_eq!(
        serde_json::from_value::<OpenUnitFraction>(value).expect("0.25 lies inside (0, 1)"),
        open
    );
    serde_json::from_str::<OpenUnitFraction>("0.0").expect_err("0.0 is out of range");
    serde_json::from_str::<OpenUnitFraction>("1.0").expect_err("1.0 is out of range");
}

/// The endpoint predicates detect exactly their endpoint.
#[test]
fn unit_fraction_predicates_detect_exactly_their_endpoint() {
    assert!(UnitFraction::ZERO.is_zero());
    assert!(UnitFraction::ONE.is_one());
    assert!(!UnitFraction::HALF.is_zero());
    assert!(!UnitFraction::HALF.is_one());

    // Exactness: the nearest representable neighbours do not qualify.
    let below_one = UnitFraction::new(1.0 - f64::EPSILON / 2.0).expect("below one");
    assert!(!below_one.is_one());
    let above_zero = UnitFraction::new(f64::MIN_POSITIVE).expect("above zero");
    assert!(!above_zero.is_zero());
}

/// Fractions display as the raw number, and conversion errors name the value and its interval.
#[test]
fn unit_fractions_display_the_number_and_errors_the_interval() {
    assert_eq!(UnitFraction::HALF.to_string(), "0.5");
    let open = OpenUnitFraction::new(0.25).expect("0.25 lies inside (0, 1)");
    assert_eq!(open.to_string(), "0.25");

    assert_eq!(
        UnitFraction::try_from(1.5)
            .expect_err("1.5 lies outside [0, 1]")
            .to_string(),
        "1.5 is not a fraction in [0, 1]"
    );
    assert_eq!(
        OpenUnitFraction::try_from(1.5)
            .expect_err("1.5 lies outside (0, 1)")
            .to_string(),
        "1.5 is not a fraction in (0, 1)"
    );
}

/// Hashes one value with the std default hasher.
fn hash_of(value: impl Hash) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

/// `Hash` agrees with `Eq` and separates distinct fractions.
#[test]
fn unit_fraction_hashes_follow_numeric_value() {
    // A fixed-key DefaultHasher makes distinctness deterministic for fixed inputs.
    assert_eq!(
        hash_of(UnitFraction::new(-0.0).expect("-0.0 lies inside [0, 1]")),
        hash_of(UnitFraction::ZERO)
    );
    assert_ne!(hash_of(UnitFraction::ZERO), hash_of(UnitFraction::ONE));

    let quarter = OpenUnitFraction::new(0.25).expect("0.25 lies inside (0, 1)");
    let half = OpenUnitFraction::new(0.5).expect("0.5 lies inside (0, 1)");
    assert_ne!(hash_of(quarter), hash_of(half));
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
/// Every finite `f32` is exactly representable in `f64`, and round-to-nearest returns it unchanged.
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

/// The positive domain is exactly the finite `f32` values strictly above zero.
#[test]
fn positive_admits_exactly_the_positive_finite_domain() {
    assert_eq!(
        Positive::new(f32::MIN_POSITIVE)
            .expect("a tiny positive constructs")
            .get(),
        f32::MIN_POSITIVE,
    );
    assert_eq!(
        Positive::new(f32::MAX)
            .expect("the maximum is finite")
            .get(),
        f32::MAX
    );

    assert_eq!(Positive::new(0.0), None);
    assert_eq!(Positive::new(-0.0), None);
    assert_eq!(Positive::new(-1.0), None);
    assert_eq!(Positive::new(f32::INFINITY), None);
    assert_eq!(Positive::new(f32::NAN), None);
}

/// The non-negative domain admits zero and rejects every sign and escape.
#[test]
fn non_negative_admits_exactly_the_non_negative_finite_domain() {
    assert_eq!(NonNegative::new(0.0).expect("zero is admitted").get(), 0.0);
    assert_eq!(
        NonNegative::new(1.0e-10)
            .expect("a tolerance constructs")
            .get(),
        1.0e-10,
    );

    assert_eq!(NonNegative::new(-1.0e-10), None);
    assert_eq!(NonNegative::new(f32::INFINITY), None);
    assert_eq!(NonNegative::new(f32::NAN), None);
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

/// The finite `f32` domain is every value except NaN and the two infinities.
#[test]
fn finite_admits_exactly_the_finite_f32_domain() {
    assert_eq!(Finite::new(0.0).expect("zero is finite"), Finite::ZERO);
    assert_eq!(Finite::new(1.0).expect("one is finite"), Finite::ONE);
    assert_eq!(
        Finite::new(-2.5).expect("a negative value is finite").get(),
        -2.5
    );
    assert_eq!(
        Finite::new(f32::MIN).expect("the minimum is finite").get(),
        f32::MIN
    );
    assert_eq!(
        Finite::new(f32::MAX).expect("the maximum is finite").get(),
        f32::MAX
    );

    assert_eq!(Finite::new(f32::NAN), None);
    assert_eq!(Finite::new(f32::INFINITY), None);
    assert_eq!(Finite::new(f32::NEG_INFINITY), None);
}

/// Negative zero is admitted and keeps its sign bit.
#[test]
fn finite_preserves_negative_zero() {
    assert_eq!(
        Finite::new(-0.0)
            .expect("negative zero is finite")
            .get()
            .to_bits(),
        (-0.0_f32).to_bits()
    );
    assert_eq!(
        DFinite::new(-0.0)
            .expect("negative zero is finite")
            .get()
            .to_bits(),
        (-0.0_f64).to_bits()
    );
}

/// The finite `f64` domain is every value except NaN and the two infinities.
#[test]
fn d_finite_admits_exactly_the_finite_f64_domain() {
    assert_eq!(DFinite::new(0.0).expect("zero is finite"), DFinite::ZERO);
    assert_eq!(DFinite::new(1.0).expect("one is finite"), DFinite::ONE);
    assert_eq!(
        DFinite::new(-1.0e-300)
            .expect("a tiny negative is finite")
            .get(),
        -1.0e-300
    );
    assert_eq!(
        DFinite::new(f64::MIN).expect("the minimum is finite").get(),
        f64::MIN
    );
    assert_eq!(
        DFinite::new(f64::MAX).expect("the maximum is finite").get(),
        f64::MAX
    );

    assert_eq!(DFinite::new(f64::NAN), None);
    assert_eq!(DFinite::new(f64::INFINITY), None);
    assert_eq!(DFinite::new(f64::NEG_INFINITY), None);
}

/// The compile-time literal macros construct through the checked constructors.
#[test]
fn finite_literals_validate_in_const_position() {
    assert_eq!(finite!(-2.5).get(), -2.5);
    assert_eq!(d_finite!(1.0e-300).get(), 1.0e-300);
}

/// The sign-bounded types widen into the finiteness-only domain.
#[test]
fn finite_widens_from_the_sign_bounded_types() {
    assert_eq!(Finite::from(Positive::ONE), Finite::ONE);
    assert_eq!(Finite::from(NonNegative::ZERO), Finite::ZERO);
    assert_eq!(DFinite::from(DPositive::ONE), DFinite::ONE);
    assert_eq!(DFinite::from(DNonNegative::ZERO), DFinite::ZERO);
}

/// Finite values serialize as plain numbers and deserialization re-validates the domain.
#[test]
fn finite_round_trips_serde_and_refuses_the_escapes() {
    let single = Finite::new(-2.5).expect("a negative value is finite");
    let value = serde_json::to_value(single).expect("a number serializes");
    assert_eq!(value, serde_json::json!(-2.5));
    assert_eq!(
        serde_json::from_value::<Finite>(value).expect("-2.5 is finite"),
        single
    );

    let double = DFinite::new(0.125).expect("an eighth is finite");
    let value = serde_json::to_value(double).expect("a number serializes");
    assert_eq!(value, serde_json::json!(0.125));
    assert_eq!(
        serde_json::from_value::<DFinite>(value).expect("0.125 is finite"),
        double
    );

    // A NaN written into JSON arrives as `null`, and an overflowing exponent
    // arrives as an infinity or as a parse failure. Both refuse.
    serde_json::from_str::<Finite>("null").expect_err("null is not a number");
    serde_json::from_str::<DFinite>("null").expect_err("null is not a number");
    serde_json::from_str::<Finite>("1e40").expect_err("1e40 overflows the f32 range");
    serde_json::from_str::<DFinite>("1e400").expect_err("1e400 overflows the f64 range");
}

#[property_test]
fn finite_admits_every_finite_f32(#[strategy = -f32::MAX..=f32::MAX] value: f32) {
    prop_assert_eq!(Finite::new(value).map(Finite::get), Some(value));
}

#[property_test]
fn d_finite_admits_every_finite_f64(#[strategy = -f64::MAX..=f64::MAX] value: f64) {
    prop_assert_eq!(DFinite::new(value).map(DFinite::get), Some(value));
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

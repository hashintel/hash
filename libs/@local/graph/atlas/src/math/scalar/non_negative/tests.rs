use proptest::{prop_assert, prop_assert_eq, property_test};

use crate::math::{
    Derivation, NonNegative, Positive, derivation::Diverged, finite, non_negative, positive,
    scalar::tests::hash_of,
};

/// `sigmoid(0)` is exactly `0.5`, and at `±200` the asymptotes `1` and `0` are exact.
#[test]
fn sigmoid_asymptotes() {
    // At zero the two branches agree exactly: 1 / (1 + 1).
    assert_eq!(NonNegative::sigmoid(0.0), 0.5);
    // exp(-200) rounds to zero in f32.
    assert_eq!(NonNegative::sigmoid(200.0), 1.0);
    assert_eq!(NonNegative::sigmoid(-200.0), 0.0);
}

/// `sigmoid(-20)` stays positive and within a relative `1e-6` of `exp(-20)`, where the complement
/// form would round to zero.
#[test]
fn sigmoid_negative_tail() {
    // The complement form `1 - 1/(1 + exp(-|x|))` rounds to zero once exp(-|x|) drops below f32 ε.
    // The direct ratio keeps the tail.
    let tail = NonNegative::sigmoid(-20.0).get();
    let expected = (-20.0_f32).exp();
    assert!(tail > 0.0);
    assert!((tail - expected).abs() <= 1e-6 * expected, "tail {tail}");
}

/// `huber` is `0.5 · v²` below the threshold, `0.5 · t²` at it and `t · (v - 0.5 t)` above it, on
/// exactly representable inputs.
#[test]
fn huber_regimes() {
    // Quadratic regime: 0.5 · value^2, over exactly-representable inputs.
    assert_eq!(
        non_negative!(0.5).huber(positive!(1.0)),
        non_negative!(0.125)
    );
    assert_eq!(NonNegative::ZERO.huber(positive!(1.0)), NonNegative::ZERO);
    // At the threshold both formulas give 0.5 · threshold^2.
    assert_eq!(non_negative!(1.0).huber(positive!(1.0)), non_negative!(0.5));
    // Linear regime: threshold · (value - 0.5 · threshold).
    assert_eq!(non_negative!(3.0).huber(positive!(1.0)), non_negative!(2.5));
    assert_eq!(
        non_negative!(2.0).huber(positive!(0.5)),
        non_negative!(0.875)
    );
}

#[test]
fn huber_threshold_continuity() {
    let threshold = 1.0_f32;
    let step = 1e-4_f32;

    let below = NonNegative::new(threshold - step)
        .expect("a step below the threshold is non-negative")
        .huber(positive!(1.0));
    let above = NonNegative::new(threshold + step)
        .expect("a step above the threshold is non-negative")
        .huber(positive!(1.0));

    // with a unit threshold, the expected difference across this interval is about 2 · step.
    assert!(below < above);
    assert!((above.get() - below.get()) < 1e-3);
}

/// `huber` at `1e20` against a `1e20` threshold clamps to `f32::MAX` instead of overflowing to
/// infinity.
#[test]
fn huber_overflow_saturation() {
    // In the quadratic regime the square of 10²⁰ overflows the `f32` range. The reading clamps
    // to the domain's maximum instead of leaving it.
    assert_eq!(
        non_negative!(1.0e20).huber(positive!(1.0e20)),
        non_negative!(f32::MAX)
    );
}

/// The sigmoid is monotone non-decreasing and satisfies its complement identity.
///
/// Values lie in `[0, 1]`, and `sigmoid(-x) == 1 - sigmoid(x)` up to rounding. The strategy bounds
/// inputs to `-1e4..1e4`. The tests above pin the asymptotes.
#[property_test]
fn sigmoid_range_order_complement(
    #[strategy = -1e4_f32..1e4] first: f32,
    #[strategy = -1e4_f32..1e4] second: f32,
) {
    let (lower, upper) = if first <= second {
        (first, second)
    } else {
        (second, first)
    };

    prop_assert!((0.0..=1.0).contains(&NonNegative::sigmoid(lower).get()));
    prop_assert!(
        NonNegative::sigmoid(lower) <= NonNegative::sigmoid(upper),
        "sigmoid({}) = {} above sigmoid({}) = {}",
        lower,
        NonNegative::sigmoid(lower),
        upper,
        NonNegative::sigmoid(upper),
    );

    let complement = 1.0 - NonNegative::sigmoid(first).get();
    prop_assert!(
        (NonNegative::sigmoid(-first).get() - complement).abs() <= 1e-6,
        "sigmoid(-{0}) = {1} against 1 - sigmoid({0}) = {2}",
        first,
        NonNegative::sigmoid(-first),
        complement,
    );
}

/// The Huber penalty is monotone non-decreasing in the magnitude.
#[property_test]
fn huber_monotonicity(first: NonNegative, second: NonNegative, threshold: Positive) {
    let (lower, upper) = if first <= second {
        (first, second)
    } else {
        (second, first)
    };

    prop_assert!(
        lower.huber(threshold) <= upper.huber(threshold),
        "huber({}, {}) = {} above huber({}, {}) = {}",
        lower,
        threshold,
        lower.huber(threshold),
        upper,
        threshold,
        upper.huber(threshold),
    );
}

/// The non-negative domain admits zero and rejects every sign and escape.
#[test]
fn new_domain() {
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

#[test]
fn constructors_negative_zero() {
    let plus_zero = 0.0_f32.to_bits();

    assert_eq!(
        NonNegative::new(-0.0)
            .expect("-0.0 is non-negative")
            .to_bits(),
        plus_zero
    );
    assert_eq!(NonNegative::new_unchecked(-0.0).to_bits(), plus_zero);
    assert!(NonNegative::new_unchecked(-0.0).is_zero());
    assert_eq!(NonNegative::new(-0.0), Some(NonNegative::ZERO));
}

/// The total order agrees with the raw float order.
#[property_test]
fn cmp_numeric(
    #[strategy = 0.0_f32..=f32::MAX] left: f32,
    #[strategy = 0.0_f32..=f32::MAX] right: f32,
) {
    let left = NonNegative::new(left).expect("the strategy stays inside the domain");
    let right = NonNegative::new(right).expect("the strategy stays inside the domain");

    prop_assert_eq!(
        left.cmp(&right),
        left.get()
            .partial_cmp(&right.get())
            .expect("non-negative values are never NaN")
    );
}

/// Equal values hash equally across the two encodings of zero, and distinct values hash apart.
#[test]
fn hash_numeric() {
    assert_eq!(
        hash_of(NonNegative::new(-0.0).expect("-0.0 is non-negative")),
        hash_of(NonNegative::ZERO)
    );
    assert_ne!(hash_of(NonNegative::ZERO), hash_of(NonNegative::ONE));
}

#[test]
fn power_deferred_overflow() {
    let power = non_negative!(f32::MAX).powf(finite!(2.0));
    assert_eq!(power.finish(), Err(Diverged { raw: f32::INFINITY }));
    let reciprocal = Derivation::from(NonNegative::ONE) / power;
    assert_eq!(reciprocal.finish(), Ok(NonNegative::ZERO));
}

#[test]
fn power_signed_exponent() {
    assert_eq!(
        non_negative!(4.0).powf(finite!(-0.5)).finish(),
        Ok(non_negative!(0.5))
    );
    assert_eq!(
        NonNegative::ZERO.powf(finite!(-1.0)).finish(),
        Err(Diverged { raw: f32::INFINITY })
    );
    assert_eq!(
        NonNegative::ZERO.powf(finite!(0.0)).finish(),
        Ok(NonNegative::ONE)
    );
    assert_eq!(
        non_negative!(f32::from_bits(1)).powf(finite!(2.0)).finish(),
        Ok(NonNegative::ZERO)
    );
}

mod miri {
    #![expect(
        clippy::host_endian_bytes,
        reason = "fixture bytes must match the native-endian representation that is_bit_valid \
                  reads"
    )]

    use zerocopy::TryFromBytes as _;

    use crate::math::NonNegative;

    /// `NonNegative` reads canonical positive bytes and refuses `-0.0`, negatives and NaN.
    #[test]
    fn try_from_bytes_canonical() {
        assert_eq!(
            NonNegative::try_read_from_bytes(&1.5_f32.to_ne_bytes())
                .expect("1.5 is canonical")
                .get(),
            1.5,
        );
        NonNegative::try_read_from_bytes(&(-0.0_f32).to_ne_bytes())
            .expect_err("-0.0 is non-negative but not the canonical +0.0 bit pattern");
        NonNegative::try_read_from_bytes(&(-1.0_f32).to_ne_bytes())
            .expect_err("negative is refused");
        NonNegative::try_read_from_bytes(&f32::NAN.to_ne_bytes()).expect_err("NaN is refused");
    }
}

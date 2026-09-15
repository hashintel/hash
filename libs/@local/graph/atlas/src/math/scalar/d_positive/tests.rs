#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are the point: single-element identities, asymptotes over \
              exactly-representable values, and round-trip narrowing are exact contracts"
)]

use proptest::{prop_assert_eq, property_test};

use crate::math::{
    DPositive, Diverged, OpenUnitFraction, Positive, PositiveUnitFraction, d_positive, positive,
};

/// The double-precision positive domain is exactly the finite values strictly above zero.
#[test]
fn new_domain() {
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

#[test]
fn narrow_subnormal_bounds() {
    let smallest = Positive::MIN.widen();
    assert_eq!(smallest.narrow(), Some(Positive::MIN));
    assert_eq!(
        (smallest / d_positive!(2.0))
            .finish()
            .expect("the half-subnormal is representable in f64")
            .narrow(),
        None
    );
    assert_eq!(
        DPositive::new(smallest.get() * 0.75)
            .expect("the value is positive")
            .narrow(),
        Some(Positive::MIN)
    );
}

#[test]
fn narrow_overflow() {
    assert_eq!(Positive::MAX.widen().narrow(), Some(Positive::MAX));
    assert_eq!(
        (Positive::MAX.widen() * d_positive!(2.0))
            .finish()
            .expect("twice the f32 maximum is finite in f64")
            .narrow(),
        None
    );
    assert_eq!(d_positive!(1.5).narrow(), Some(positive!(1.5)));
}

#[property_test]
fn narrow_widen_round_trip(value: Positive) {
    prop_assert_eq!(value.widen().narrow(), Some(value));
}

#[property_test]
fn mul_positive_fraction(value: DPositive, fraction: PositiveUnitFraction) {
    let expected = DPositive::new(value.get() * fraction.get()).ok_or(Diverged { raw: 0.0 });
    prop_assert_eq!((value * fraction).finish(), expected);
}

#[property_test]
fn mul_open_fraction(value: DPositive, fraction: OpenUnitFraction) {
    let expected = DPositive::new(fraction.get() * value.get()).ok_or(Diverged { raw: 0.0 });
    prop_assert_eq!((fraction * value).finish(), expected);
}

#[property_test]
fn mul_positive_fraction_identity(value: DPositive) {
    prop_assert_eq!((value * PositiveUnitFraction::ONE).finish(), Ok(value));
}

#[test]
fn mul_positive_fraction_underflow() {
    for (value, fraction) in [(1e-200, 1e-200), (f64::from_bits(1), 0.5)] {
        let value = DPositive::new(value).expect("should be positive and finite");
        let fraction = PositiveUnitFraction::new(fraction).expect("should be in (0, 1]");
        assert_eq!((value * fraction).finish(), Err(Diverged { raw: 0.0 }));
    }
}

#[test]
fn mul_open_fraction_underflow() {
    for (value, fraction) in [(1e-200, 1e-200), (f64::from_bits(1), 0.5)] {
        let value = DPositive::new(value).expect("should be positive and finite");
        let fraction = OpenUnitFraction::new(fraction).expect("should be in (0, 1)");
        assert_eq!((fraction * value).finish(), Err(Diverged { raw: 0.0 }));
    }
}

mod miri {
    #![expect(
        clippy::host_endian_bytes,
        reason = "fixture bytes must match the native-endian representation that is_bit_valid \
                  reads"
    )]

    use zerocopy::TryFromBytes as _;

    use crate::math::DPositive;

    /// `DPositive` reads canonical positive bytes and refuses zero and NaN.
    #[test]
    fn try_from_bytes_domain() {
        assert_eq!(
            DPositive::try_read_from_bytes(&1.5_f64.to_ne_bytes())
                .expect("1.5 is canonical")
                .get(),
            1.5,
        );
        DPositive::try_read_from_bytes(&0.0_f64.to_ne_bytes()).expect_err("zero is refused");
        DPositive::try_read_from_bytes(&f64::NAN.to_ne_bytes()).expect_err("NaN is refused");
    }
}

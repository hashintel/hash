#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are the point: single-element identities, asymptotes over \
              exactly-representable values, and round-trip narrowing are exact contracts"
)]

use proptest::{prop_assert_eq, property_test};

use crate::math::{
    DFinite, DNonNegative, DPositive, Finite, NonNegative, Positive, d_finite, finite,
};

/// The finite `f32` domain is every value except NaN and the two infinities.
#[test]
fn new_domain_f32() {
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

/// `Finite::new` admits negative zero and keeps its sign bit.
#[test]
fn new_negative_zero() {
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
fn new_domain_f64() {
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
fn literals_const() {
    assert_eq!(finite!(-2.5).get(), -2.5);
    assert_eq!(d_finite!(1.0e-300).get(), 1.0e-300);
}

/// The sign-bounded types widen into the finiteness-only domain.
#[test]
fn from_sign_bounded() {
    assert_eq!(Finite::from(Positive::ONE), Finite::ONE);
    assert_eq!(Finite::from(NonNegative::ZERO), Finite::ZERO);
    assert_eq!(DFinite::from(DPositive::ONE), DFinite::ONE);
    assert_eq!(DFinite::from(DNonNegative::ZERO), DFinite::ZERO);
}

/// Finite values serialize as plain numbers and deserialization re-validates the domain.
#[test]
fn serde_domain() {
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
fn new_finite_f32(#[strategy = -f32::MAX..=f32::MAX] value: f32) {
    prop_assert_eq!(Finite::new(value).map(Finite::get), Some(value));
}

#[property_test]
fn new_finite_f64(#[strategy = -f64::MAX..=f64::MAX] value: f64) {
    prop_assert_eq!(DFinite::new(value).map(DFinite::get), Some(value));
}

#[property_test]
fn cmp_total_f64(left: DFinite, right: DFinite) {
    prop_assert_eq!(left.cmp(&right), left.get().total_cmp(&right.get()));
    prop_assert_eq!(left == right, left.get().to_bits() == right.get().to_bits());
}

#[property_test]
fn narrow_round_trip_bits(value: Finite) {
    let widened = DFinite::new(f64::from(value)).expect("widening should preserve finiteness");
    prop_assert_eq!(
        widened.narrow().map(|narrowed| narrowed.get().to_bits()),
        Some(value.get().to_bits())
    );
}

#[test]
fn cmp_signed_zero_f64() {
    let negative = DFinite::new(-0.0).expect("negative zero should be finite");
    assert!(negative < DFinite::ZERO);
    assert_ne!(negative, DFinite::ZERO);
}

mod miri {
    #![expect(
        clippy::host_endian_bytes,
        reason = "fixture bytes must match the native-endian representation that is_bit_valid \
                  reads"
    )]

    use zerocopy::TryFromBytes as _;

    use crate::math::{DFinite, Finite};

    /// `Finite` reads finite bytes of either sign and refuses NaN and infinity.
    #[test]
    fn try_from_bytes_domain_f32() {
        assert_eq!(
            Finite::try_read_from_bytes(&(-2.5_f32).to_ne_bytes())
                .expect("a finite value is canonical")
                .get(),
            -2.5,
        );
        Finite::try_read_from_bytes(&f32::NAN.to_ne_bytes()).expect_err("NaN is refused");
        Finite::try_read_from_bytes(&f32::INFINITY.to_ne_bytes()).expect_err("infinity is refused");
    }

    /// `DFinite` reads finite bytes of either sign and refuses NaN and infinity.
    #[test]
    fn try_from_bytes_domain_f64() {
        assert_eq!(
            DFinite::try_read_from_bytes(&(-2.5_f64).to_ne_bytes())
                .expect("a finite value is canonical")
                .get(),
            -2.5,
        );
        DFinite::try_read_from_bytes(&f64::NAN.to_ne_bytes()).expect_err("NaN is refused");
        DFinite::try_read_from_bytes(&f64::NEG_INFINITY.to_ne_bytes())
            .expect_err("infinity is refused");
    }
}

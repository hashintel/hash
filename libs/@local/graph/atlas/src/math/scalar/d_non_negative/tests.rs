#![allow(
    clippy::float_cmp,
    reason = "bit-exact assertions are the point: single-element identities, asymptotes over \
              exactly-representable values, and round-trip narrowing are exact contracts"
)]

use proptest::{prop_assert_eq, property_test};

use crate::math::{
    DNonNegative, Derivation, d_finite, d_non_negative, derivation::Diverged,
    scalar::tests::hash_of,
};

/// The double-precision non-negative domain admits zero and rejects every sign and escape.
#[test]
fn new_domain() {
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

#[test]
fn constructors_negative_zero() {
    let plus_zero = 0.0_f64.to_bits();

    assert_eq!(
        DNonNegative::new(-0.0)
            .expect("-0.0 is non-negative")
            .get()
            .to_bits(),
        plus_zero
    );
    assert_eq!(DNonNegative::new_unchecked(-0.0).get().to_bits(), plus_zero);
    assert_eq!(DNonNegative::new(-0.0), Some(DNonNegative::ZERO));
}

/// The total order agrees with the raw float order.
#[property_test]
fn cmp_numeric(
    #[strategy = 0.0_f64..=f64::MAX] left: f64,
    #[strategy = 0.0_f64..=f64::MAX] right: f64,
) {
    let left = DNonNegative::new(left).expect("the strategy stays inside the domain");
    let right = DNonNegative::new(right).expect("the strategy stays inside the domain");

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
        hash_of(DNonNegative::new(-0.0).expect("-0.0 is non-negative")),
        hash_of(DNonNegative::ZERO)
    );
    assert_ne!(
        hash_of(DNonNegative::ZERO),
        hash_of(DNonNegative::new(1.0).expect("one is non-negative"))
    );
}

#[test]
fn power_deferred_overflow() {
    let power = d_non_negative!(f64::MAX).powf(d_finite!(2.0));
    assert_eq!(power.finish(), Err(Diverged { raw: f64::INFINITY }));
    let reciprocal = Derivation::from(DNonNegative::ONE) / power;
    assert_eq!(reciprocal.finish(), Ok(DNonNegative::ZERO));
}

#[test]
fn power_signed_exponent() {
    assert_eq!(
        d_non_negative!(4.0).powf(d_finite!(-0.5)).finish(),
        Ok(d_non_negative!(0.5))
    );
    assert_eq!(
        DNonNegative::ZERO.powf(d_finite!(-1.0)).finish(),
        Err(Diverged { raw: f64::INFINITY })
    );
    assert_eq!(
        DNonNegative::ZERO.powf(d_finite!(0.0)).finish(),
        Ok(DNonNegative::ONE)
    );
    assert_eq!(
        d_non_negative!(f64::from_bits(1))
            .powf(d_finite!(2.0))
            .finish(),
        Ok(DNonNegative::ZERO)
    );
}

mod miri {
    #![expect(
        clippy::host_endian_bytes,
        reason = "fixture bytes must match the native-endian representation that is_bit_valid \
                  reads"
    )]

    use zerocopy::TryFromBytes as _;

    use crate::math::DNonNegative;

    /// `DNonNegative` reads canonical positive bytes and refuses `-0.0` and NaN.
    #[test]
    fn try_from_bytes_canonical() {
        assert_eq!(
            DNonNegative::try_read_from_bytes(&1.5_f64.to_ne_bytes())
                .expect("1.5 is canonical")
                .get(),
            1.5,
        );
        DNonNegative::try_read_from_bytes(&(-0.0_f64).to_ne_bytes())
            .expect_err("-0.0 is non-negative but not the canonical +0.0 bit pattern");
        DNonNegative::try_read_from_bytes(&f64::NAN.to_ne_bytes()).expect_err("NaN is refused");
    }
}

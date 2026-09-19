#![allow(
    clippy::float_cmp,
    reason = "bit-exact assertions are the point: single-element identities, asymptotes over \
              exactly-representable values, and round-trip narrowing are exact contracts"
)]

use proptest::{prop_assert, prop_assert_eq, prop_assert_ne, property_test};

use crate::math::{OpenUnitFraction, UnitFraction, scalar::tests::hash_of};

/// `UnitFraction::new` accepts `0`, `1` and interior values and refuses negatives, values above
/// one, NaN and both infinities.
#[test]
fn new_domain() {
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
fn constructors_negative_zero() {
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
fn new_unchecked_valid() {
    assert_eq!(UnitFraction::new_unchecked(0.625).get(), 0.625);
    assert_eq!(UnitFraction::new_unchecked(0.0), UnitFraction::ZERO);
    assert_eq!(UnitFraction::new_unchecked(1.0), UnitFraction::ONE);
}

/// Counts that divide exactly yield the exact quotient, not an approximation.
#[test]
fn ratio_exact() {
    assert_eq!(UnitFraction::ratio(3, 4).map(UnitFraction::get), Some(0.75));
    assert_eq!(
        UnitFraction::ratio(1, 8).map(UnitFraction::get),
        Some(0.125)
    );
    assert_eq!(UnitFraction::ratio(1, 1), Some(UnitFraction::ONE));
}

/// Clamping saturates at the nearer endpoint and refuses only NaN.
#[test]
fn new_clamped_domain() {
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
fn new_clamped_valid(#[strategy = 0.0_f64..=1.0] value: f64) {
    prop_assert_eq!(UnitFraction::new_clamped(value), UnitFraction::new(value));
}

/// The complement stays in `[0, 1]` and stays canonical.
#[property_test]
fn complement_domain(#[strategy = 0.0_f64..=1.0] value: f64) {
    let fraction = UnitFraction::new(value).expect("the strategy stays inside [0, 1]");
    let complement = fraction.complement();

    prop_assert!(complement.get() >= 0.0 && complement.get() <= 1.0);
    prop_assert_ne!(complement.get().to_bits(), (-0.0_f64).to_bits());
}

/// The endpoints complement to each other exactly, and one half is its own complement.
#[test]
fn complement_endpoints() {
    assert_eq!(UnitFraction::ONE.complement(), UnitFraction::ZERO);
    assert_eq!(UnitFraction::ZERO.complement(), UnitFraction::ONE);
    assert_eq!(UnitFraction::HALF.complement(), UnitFraction::HALF);
}

/// Fraction products stay in the interval, keep a positive sign, and match the iterator fold.
#[property_test]
fn product_domain(#[strategy = 0.0_f64..=1.0] left: f64, #[strategy = 0.0_f64..=1.0] right: f64) {
    let left = UnitFraction::new(left).expect("the strategy stays inside [0, 1]");
    let right = UnitFraction::new(right).expect("the strategy stays inside [0, 1]");

    let product = left * right;
    prop_assert!(product.get() >= 0.0 && product.get() <= 1.0);
    prop_assert_ne!(product.get().to_bits(), (-0.0_f64).to_bits());
    prop_assert_eq!([left, right].into_iter().product::<UnitFraction>(), product);
}

/// The empty product is the multiplicative identity.
#[test]
fn product_empty() {
    assert_eq!(
        core::iter::empty::<UnitFraction>().product::<UnitFraction>(),
        UnitFraction::ONE
    );
}

/// `ratio` admits exactly a part within a non-zero total, and the quotient lies in `[0, 1]`.
#[property_test]
fn ratio_domain(part: u64, total: u64) {
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
fn cmp_numeric(#[strategy = 0.0_f64..=1.0] left: f64, #[strategy = 0.0_f64..=1.0] right: f64) {
    let left = UnitFraction::new(left).expect("the strategy stays inside [0, 1]");
    let right = UnitFraction::new(right).expect("the strategy stays inside [0, 1]");

    prop_assert_eq!(
        left.cmp(&right),
        left.get()
            .partial_cmp(&right.get())
            .expect("fractions are never NaN")
    );
}

/// Fractions serialize as plain numbers and deserialization re-validates the domain.
#[test]
fn serde_domain() {
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
fn predicates_endpoints() {
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
fn display_values_and_errors() {
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

/// `Hash` agrees with `Eq` and separates distinct fractions.
#[test]
fn hash_numeric() {
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

mod miri {
    #![expect(
        clippy::host_endian_bytes,
        reason = "fixture bytes must match the native-endian representation that is_bit_valid \
                  reads"
    )]

    use zerocopy::TryFromBytes as _;

    use crate::math::UnitFraction;

    /// `UnitFraction` reads canonical interior bytes and refuses `-0.0`, values above one and NaN.
    #[test]
    fn try_from_bytes_canonical() {
        assert_eq!(
            UnitFraction::try_read_from_bytes(&0.5_f64.to_ne_bytes())
                .expect("0.5 is canonical")
                .get(),
            0.5,
        );
        UnitFraction::try_read_from_bytes(&(-0.0_f64).to_ne_bytes())
            .expect_err("-0.0 lies in [0, 1] but is not the canonical +0.0 bit pattern");
        UnitFraction::try_read_from_bytes(&1.5_f64.to_ne_bytes()).expect_err("1.5 is out of range");
        UnitFraction::try_read_from_bytes(&f64::NAN.to_ne_bytes()).expect_err("NaN is refused");
    }
}

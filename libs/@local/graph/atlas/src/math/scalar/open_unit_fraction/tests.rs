#![allow(
    clippy::float_cmp,
    reason = "bit-exact assertions are the point: single-element identities, asymptotes over \
              exactly-representable values, and round-trip narrowing are exact contracts"
)]

use crate::math::{OpenUnitFraction, UnitFraction};

/// The open complement widens to the closed type at both ends of its range.
#[test]
fn complement_rounding() {
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

/// The open unit interval excludes both endpoints, unlike its closed sibling.
#[test]
fn new_domain() {
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

mod miri {
    #![expect(
        clippy::host_endian_bytes,
        reason = "fixture bytes must match the native-endian representation that is_bit_valid \
                  reads"
    )]

    use zerocopy::TryFromBytes as _;

    use crate::math::OpenUnitFraction;

    #[test]
    fn try_from_bytes_domain() {
        assert_eq!(
            OpenUnitFraction::try_read_from_bytes(&0.5_f64.to_ne_bytes())
                .expect("0.5 is canonical, strictly interior")
                .get(),
            0.5,
        );
        OpenUnitFraction::try_read_from_bytes(&0.0_f64.to_ne_bytes())
            .expect_err("zero is excluded, an endpoint");
        OpenUnitFraction::try_read_from_bytes(&1.0_f64.to_ne_bytes())
            .expect_err("one is excluded, an endpoint");
        OpenUnitFraction::try_read_from_bytes(&f64::NAN.to_ne_bytes()).expect_err("NaN is refused");
    }
}

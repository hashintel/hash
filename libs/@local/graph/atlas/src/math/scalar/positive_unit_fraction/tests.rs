#![allow(
    clippy::float_cmp,
    reason = "bit-exact assertions are the point: single-element identities, asymptotes over \
              exactly-representable values, and round-trip narrowing are exact contracts"
)]

use crate::math::{PositiveUnitFraction, UnitFraction};

/// Deserialising refuses exactly what the constructors refuse (`0` for the positive unit fraction,
/// negatives, values above one) and admits the closed endpoints, and serializing writes the plain
/// number.
#[test]
fn serde_domain() {
    let admitted: PositiveUnitFraction =
        serde_json::from_str("1.0e-3").expect("1.0e-3 lies inside (0, 1]");
    assert_eq!(admitted.get(), 1.0e-3);

    serde_json::from_str::<PositiveUnitFraction>("0.0")
        .expect_err("zero is excluded, the domain's open endpoint");
    serde_json::from_str::<PositiveUnitFraction>("-0.5").expect_err("negatives are refused");
    serde_json::from_str::<PositiveUnitFraction>("1.5").expect_err("1.5 is out of range");

    let closed: UnitFraction = serde_json::from_str("0.0").expect("zero lies inside [0, 1]");
    assert_eq!(closed.get(), 0.0);
    serde_json::from_str::<UnitFraction>("1.5").expect_err("1.5 is out of range");

    let wire = serde_json::to_string(&PositiveUnitFraction::ONE).expect("a fraction serializes");
    assert_eq!(wire, "1.0");
}

mod miri {
    #![expect(
        clippy::host_endian_bytes,
        reason = "fixture bytes must match the native-endian representation that is_bit_valid \
                  reads"
    )]

    use zerocopy::TryFromBytes as _;

    use crate::math::PositiveUnitFraction;

    /// `PositiveUnitFraction` reads the closed endpoint `1.0` and refuses zero, values above one
    /// and NaN.
    #[test]
    fn try_from_bytes_domain() {
        assert_eq!(
            PositiveUnitFraction::try_read_from_bytes(&1.0_f64.to_ne_bytes())
                .expect("1.0 is canonical, the domain's closed endpoint")
                .get(),
            1.0,
        );
        PositiveUnitFraction::try_read_from_bytes(&0.0_f64.to_ne_bytes())
            .expect_err("zero is excluded, the domain's open endpoint");
        PositiveUnitFraction::try_read_from_bytes(&1.5_f64.to_ne_bytes())
            .expect_err("1.5 is out of range");
        PositiveUnitFraction::try_read_from_bytes(&f64::NAN.to_ne_bytes())
            .expect_err("NaN is refused");
    }
}

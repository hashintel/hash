#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are the point: single-element identities, asymptotes over \
              exactly-representable values, and round-trip narrowing are exact contracts"
)]

use proptest::{prop_assert_eq, property_test};
use zerocopy::TryFromBytes as _;

use crate::math::GreaterThanOne;

/// The greater-than-one domain rejects one itself, infinities, and everything below.
#[test]
fn new_domain() {
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

#[property_test]
#[expect(
    clippy::host_endian_bytes,
    reason = "the scalar representation uses native byte order"
)]
fn try_from_bytes_validation(bits: u64) {
    let value = f64::from_bits(bits);
    prop_assert_eq!(
        GreaterThanOne::try_read_from_bytes(&bits.to_ne_bytes()).ok(),
        GreaterThanOne::new(value)
    );
}

mod miri {
    #![expect(
        clippy::host_endian_bytes,
        reason = "fixture bytes must match the native-endian representation that is_bit_valid \
                  reads"
    )]

    use zerocopy::TryFromBytes as _;

    use crate::math::GreaterThanOne;

    /// `GreaterThanOne` reads `2.0` and refuses exactly one and NaN.
    #[test]
    fn try_from_bytes_domain() {
        assert_eq!(
            GreaterThanOne::try_read_from_bytes(&2.0_f64.to_ne_bytes())
                .expect("2.0 is canonical")
                .get(),
            2.0,
        );
        GreaterThanOne::try_read_from_bytes(&1.0_f64.to_ne_bytes())
            .expect_err("one itself is refused");
        GreaterThanOne::try_read_from_bytes(&f64::NAN.to_ne_bytes()).expect_err("NaN is refused");
    }
}

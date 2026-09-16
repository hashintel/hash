use proptest::{prop_assert_eq, property_test};

use crate::math::Negative;

#[test]
fn new_domain() {
    for value in [f32::MIN, -1.0, -f32::from_bits(1)] {
        assert_eq!(Negative::new(value).map(f64::from), Some(f64::from(value)));
    }
    for value in [0.0, -0.0, 1.0, f32::INFINITY, f32::NEG_INFINITY, f32::NAN] {
        assert_eq!(Negative::new(value), None);
    }
}

#[property_test]
fn cmp_numeric(left: Negative, right: Negative) {
    prop_assert_eq!(
        left.cmp(&right),
        f64::from(left).total_cmp(&f64::from(right))
    );
}

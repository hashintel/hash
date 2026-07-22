#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are contracts on exactly representable values"
)]

use zerocopy::TryFromBytes as _;

use super::{GeometryClass, Posterior};

#[test]
fn variants_enumerate_the_classes_in_class_order() {
    // Certifies the const-transmute derivation of `VARIANTS` against
    // the literal variants and their declared discriminants.
    assert_eq!(GeometryClass::COUNT, 3);
    assert_eq!(
        GeometryClass::VARIANTS,
        [
            GeometryClass::Coincident,
            GeometryClass::Proximal,
            GeometryClass::Overlay,
        ],
    );
    for (position, class) in GeometryClass::VARIANTS.into_iter().enumerate() {
        assert_eq!(class.index(), position);
    }
}

#[test]
fn wire_bytes_admit_only_declared_discriminants() {
    for class in GeometryClass::VARIANTS {
        let parsed = GeometryClass::try_read_from_bytes(&[class as u8])
            .expect("a declared discriminant parses");
        assert_eq!(parsed, class);
    }

    let overflow = u8::try_from(GeometryClass::COUNT).expect("the class count fits in a byte");
    GeometryClass::try_read_from_bytes(&[overflow])
        .expect_err("one past the last declared discriminant must not parse");
    GeometryClass::try_read_from_bytes(&[u8::MAX])
        .expect_err("an undeclared discriminant must not parse");
}

#[test]
fn posterior_accepts_a_distribution() {
    let posterior = Posterior::new([0.5, 0.25, 0.25]).expect("a distribution should validate");
    assert_eq!(posterior.probability(GeometryClass::Coincident), 0.5);
    assert_eq!(posterior.probability(GeometryClass::Proximal), 0.25);
    assert_eq!(posterior.probability(GeometryClass::Overlay), 0.25);
    assert_eq!(posterior.as_array(), &[0.5, 0.25, 0.25]);
}

#[test]
fn posterior_rejects_non_distributions() {
    assert_eq!(Posterior::new([f64::NAN, 0.5, 0.5]), None);
    assert_eq!(Posterior::new([f64::INFINITY, 0.0, 0.0]), None);
    assert_eq!(Posterior::new([-0.125, 0.625, 0.5]), None);
    assert_eq!(Posterior::new([0.5, 0.25, 0.125]), None);
    assert_eq!(Posterior::new([0.5, 0.5, 0.125]), None);
}

#[test]
fn posterior_tolerates_softmax_rounding() {
    let rounded = [0.2, 0.3, 0.5 + 5.0e-10];
    assert!(Posterior::new(rounded).is_some());
}

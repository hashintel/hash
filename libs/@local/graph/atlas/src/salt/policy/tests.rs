#![allow(
    clippy::float_cmp,
    reason = "bit-exact assertions are contracts on exactly representable values"
)]

use zerocopy::TryFromBytes as _;

use super::{GeometryClass, Posterior};
use crate::math::{UnitFraction, unit_fraction};

/// Lists the three geometry classes in discriminant order under `VARIANTS`.
///
/// `GeometryClass::VARIANTS` lists the three classes in discriminant order, matching `COUNT` and
/// each variant's declared discriminant.
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

/// Each declared discriminant byte parses to its class, and one past the last or `u8::MAX` refuses.
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

/// `Posterior::new` accepts a distribution and reports each class's probability and the array.
#[test]
fn posterior_accepts_a_distribution() {
    let posterior = Posterior::new([
        unit_fraction!(0.5),
        unit_fraction!(0.25),
        unit_fraction!(0.25),
    ])
    .expect("a distribution should validate");
    assert_eq!(posterior.probability(GeometryClass::Coincident), 0.5);
    assert_eq!(posterior.probability(GeometryClass::Proximal), 0.25);
    assert_eq!(posterior.probability(GeometryClass::Overlay), 0.25);
    assert_eq!(posterior.to_array(), [0.5, 0.25, 0.25]);
}

#[test]
fn posterior_accepts_negative_zero_components() {
    let posterior = Posterior::new([
        unit_fraction!(-0.0),
        unit_fraction!(0.5),
        unit_fraction!(0.5),
    ])
    .expect("negative zero compares equal to a legal zero");
    assert_eq!(posterior.probability(GeometryClass::Coincident), 0.0);
}

#[test]
fn posterior_tolerates_softmax_rounding() {
    let rounded = [0.2, 0.3, 0.5 + 5.0e-10];
    assert!(Posterior::new(rounded.map(UnitFraction::new_unchecked)).is_some());
}

#[test]
fn posterior_deserialization_rejects_an_unnormalized_distribution() {
    let error = serde_json::from_value::<Posterior>(serde_json::json!([0.5, 0.5, 0.5]))
        .expect_err("an unnormalized posterior refuses to parse");
    assert!(error.to_string().contains("posterior must sum to one"));
}

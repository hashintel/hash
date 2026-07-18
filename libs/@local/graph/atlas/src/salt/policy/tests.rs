#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are contracts on exactly representable values"
)]

use super::{GeometryClass, Posterior};

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

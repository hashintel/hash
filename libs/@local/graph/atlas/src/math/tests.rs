//! Shared assertions and fixtures for the math module's tests.

use super::Vec2;

/// Four sample points with distinct, exactly representable coordinates.
pub(crate) const POINTS: [Vec2; 4] = [
    Vec2::new(1.0, 5.0),
    Vec2::new(2.0, 6.0),
    Vec2::new(3.0, 7.0),
    Vec2::new(4.0, 8.0),
];

/// Asserts two vectors agree up to a magnitude-scaled tolerance.
///
/// The tolerance is a few dozen ulps of the expected value, which absorbs
/// the rounding of trigonometry, FMA contraction, and inverse round trips
/// without accepting real errors.
#[track_caller]
pub(crate) fn assert_vec2_close(actual: Vec2, expected: Vec2) {
    let tolerance = |reference: f32| 32.0 * f32::EPSILON * reference.abs().max(1.0);

    assert!(
        (actual.x() - expected.x()).abs() < tolerance(expected.x())
            && (actual.y() - expected.y()).abs() < tolerance(expected.y()),
        "expected {expected:?}, got {actual:?}"
    );
}

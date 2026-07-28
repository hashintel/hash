//! Shared assertions and fixtures for the math module's tests.

use super::Vec2;

/// Four sample points with distinct, exactly representable coordinates.
pub(crate) const POINTS: [Vec2; 4] = [
    Vec2::new(1.0, 5.0),
    Vec2::new(2.0, 6.0),
    Vec2::new(3.0, 7.0),
    Vec2::new(4.0, 8.0),
];

/// Points for deterministic apply/`apply_x4` agreement sweeps.
///
/// Spans magnitudes well below and above 1.0, negative coordinates, mixed signs, and zero.
pub(crate) const SWEEP_POINTS: [Vec2; 12] = [
    Vec2::new(0.0, 0.0),
    Vec2::new(0.0005, 0.0005),
    Vec2::new(-0.0007, 0.0009),
    Vec2::new(0.999, -0.999),
    Vec2::new(1.0, 1.0),
    Vec2::new(1.001, 1.001),
    Vec2::new(-3.5, 7.25),
    Vec2::new(100.0, -250.0),
    Vec2::new(12345.6, -6789.1),
    Vec2::new(-0.0001, 500.0),
    Vec2::new(500.0, -0.0001),
    Vec2::new(-99999.0, 0.0),
];

/// Translation offsets for deterministic apply/`apply_x4` agreement sweeps.
///
/// Spans zero, small fractional offsets, mixed-sign offsets, and offsets large enough to move a
/// result across a magnitude decade.
pub(crate) const SWEEP_TRANSLATIONS: [Vec2; 6] = [
    Vec2::new(0.0, 0.0),
    Vec2::new(0.001, -0.001),
    Vec2::new(-7.5, 3.25),
    Vec2::new(1000.0, -1000.0),
    Vec2::new(-0.5, 0.5),
    Vec2::new(50000.0, -0.0001),
];

/// Asserts two vectors agree up to a magnitude-scaled tolerance.
///
/// The tolerance is a few dozen ulps of the expected value, which absorbs the rounding of
/// trigonometry, FMA contraction, and inverse round trips without accepting real errors.
#[track_caller]
pub(crate) fn assert_vec2_close(actual: Vec2, expected: Vec2) {
    let tolerance = |reference: f32| 32.0 * f32::EPSILON * reference.abs().max(1.0);

    assert!(
        (actual.x() - expected.x()).abs() < tolerance(expected.x())
            && (actual.y() - expected.y()).abs() < tolerance(expected.y()),
        "expected {expected:?}, got {actual:?}"
    );
}

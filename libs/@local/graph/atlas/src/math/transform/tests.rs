use proptest::{property_test, strategy::Strategy};

use crate::math::{
    Rotation, Transform, Translation, Vec2, Vec2x4T,
    tests::{POINTS, assert_vec2_close},
};

#[test]
fn identity_maps_vectors_to_themselves() {
    let vec = Vec2::new(3.0, -4.0);

    assert_eq!(Transform::IDENTITY.apply(vec), vec);
    assert_eq!(
        Transform::IDENTITY.apply_x4(Vec2x4T::from(POINTS)),
        Vec2x4T::from(POINTS),
    );
}

#[test]
fn scale_translation_and_rotation() {
    let scale = Transform::from_scale(Vec2::new(2.0, 3.0));
    assert_eq!(scale.apply(Vec2::new(1.0, 1.0)), Vec2::new(2.0, 3.0));

    let translation = Transform::from_translation(Vec2::new(-1.0, 4.0));
    assert_eq!(translation.apply(Vec2::new(1.0, 1.0)), Vec2::new(0.0, 5.0));

    let quarter_turn =
        Transform::from_rotation(Rotation::from_radians(core::f32::consts::FRAC_PI_2));
    assert_vec2_close(quarter_turn.apply(Vec2::new(1.0, 0.0)), Vec2::new(0.0, 1.0));
    assert_vec2_close(
        quarter_turn.apply(Vec2::new(0.0, 1.0)),
        Vec2::new(-1.0, 0.0),
    );
}

#[test]
fn then_composes_in_application_order() {
    let scale = Transform::from_scale(Vec2::new(2.0, 2.0));
    let translation = Transform::from_translation(Vec2::new(10.0, 0.0));
    let vec = Vec2::new(3.0, 4.0);

    // Scale first, then translate: (6, 8) + (10, 0).
    assert_eq!(scale.then(translation).apply(vec), Vec2::new(16.0, 8.0));
    // Translate first, then scale: (13, 4) · 2.
    assert_eq!(translation.then(scale).apply(vec), Vec2::new(26.0, 8.0));
}

#[test]
fn composition_matches_sequential_application() {
    let first = Transform::from_rotation(Rotation::from_radians(0.7));
    let second = Transform::from_scale(Vec2::new(1.5, -0.5))
        .then(Transform::from_translation(Vec2::new(3.0, -2.0)));
    let composed = first.then(second);

    for point in POINTS {
        assert_vec2_close(composed.apply(point), second.apply(first.apply(point)));
    }
}

#[test]
fn apply_x4_matches_scalar_apply() {
    let transform = Transform::from_rotation(Rotation::from_radians(1.2))
        .then(Transform::from_scale(Vec2::new(0.5, 2.0)))
        .then(Transform::from_translation(Vec2::new(-7.0, 0.25)));

    let batch = transform.apply_x4(Vec2x4T::from(POINTS));

    // FMA fuses the rounding of multiply and add, so the SIMD path may
    // differ from the scalar path by a few units in the last place of
    // the intermediate terms.
    for (index, point) in POINTS.into_iter().enumerate() {
        assert_vec2_close(batch.get(index), transform.apply(point));
    }
}

#[test]
fn widening_to_transform_preserves_behaviour() {
    let rotation = Rotation::from_radians(0.4);
    let translation = Translation::new(5.0, -1.0);

    for point in POINTS {
        assert_vec2_close(
            Transform::from(rotation).apply(point),
            rotation.apply(point),
        );
        assert_eq!(
            Transform::from(translation).apply(point),
            translation.apply(point),
        );
    }
}

#[test]
fn transform_inverse_round_trips() {
    let transform = Transform::from_rotation(Rotation::from_radians(0.6))
        .then(Transform::from_scale(Vec2::new(2.0, 0.5)))
        .then(Transform::from_translation(Vec2::new(-4.0, 9.0)));
    let inverse = transform.inverse().expect("transform is invertible");

    for point in POINTS {
        assert_vec2_close(inverse.apply(transform.apply(point)), point);
        assert_vec2_close(transform.apply(inverse.apply(point)), point);
    }
}

#[test]
fn transform_inverse_rejects_collapsed_axes() {
    assert!(
        Transform::from_scale(Vec2::new(0.0, 1.0))
            .inverse()
            .is_none()
    );
    assert!(
        Transform::from_scale(Vec2::new(1.0, 0.0))
            .inverse()
            .is_none()
    );
    assert!(
        Transform::from_cols(
            Vec2::new(1.0, 2.0),
            Vec2::new(2.0, 4.0), // linearly dependent columns
            Vec2::new(0.0, 0.0),
        )
        .inverse()
        .is_none()
    );
}

#[test]
fn then_widens_rotation_and_translation() {
    // Mixed composition against hand-computed values: scale (3, 4) by 2
    // to (6, 8), translate to (7, 8), quarter-turn to (-8, 7).
    let transform = Transform::from_scale(Vec2::new(2.0, 2.0))
        .then(Translation::new(1.0, 0.0))
        .then(Rotation::from_radians(core::f32::consts::FRAC_PI_2));

    assert_vec2_close(transform.apply(Vec2::new(3.0, 4.0)), Vec2::new(-8.0, 7.0));
}

/// A well-conditioned transform.
///
/// Per-axis scale magnitudes in `0.1..10` (condition number at most 100), an arbitrary rotation,
/// and a translation bounded to `-1e3..1e3`.
fn transform_strategy() -> impl Strategy<Value = Transform> {
    (
        0.1_f32..10.0,
        0.1_f32..10.0,
        proptest::bool::ANY,
        proptest::bool::ANY,
        -16.0_f32..16.0,
        -1e3_f32..1e3,
        -1e3_f32..1e3,
    )
        .prop_map(
            |(scale_x, scale_y, flip_x, flip_y, radians, translate_x, translate_y)| {
                let scale = Vec2::new(
                    if flip_x { -scale_x } else { scale_x },
                    if flip_y { -scale_y } else { scale_y },
                );

                Transform::from_scale(scale)
                    .then(Rotation::from_radians(radians))
                    .then(Translation::new(translate_x, translate_y))
            },
        )
}

/// A point with coordinates bounded to the well-conditioned `-1e3..1e3` range.
fn point_strategy() -> impl Strategy<Value = Vec2> {
    (-1e3_f32..1e3, -1e3_f32..1e3).prop_map(|(x, y)| Vec2::new(x, y))
}

/// Asserts two points agree up to a magnitude-scaled tolerance.
///
/// The tolerance scales with the magnitude of the values flowing through the transforms under test.
///
/// Intermediate coordinates reach the order of `magnitude`, and cancellation can leave a result far
/// smaller than the values that produced it, so the tolerance scales with the inputs' magnitude
/// rather than the result's.
#[track_caller]
fn assert_close_at_magnitude(actual: Vec2, expected: Vec2, magnitude: f32) {
    let tolerance = 128.0 * f32::EPSILON * magnitude.max(1.0);

    assert!(
        (actual.x() - expected.x()).abs() <= tolerance
            && (actual.y() - expected.y()).abs() <= tolerance,
        "expected {expected:?}, got {actual:?} (tolerance {tolerance})",
    );
}

/// A well-conditioned transform's inverse round-trips points.
///
/// `inverse().apply(apply(p)) == p` up to rounding amplified by the bounded (at most 100)
/// condition of the linear part.
#[property_test]
fn inverse_round_trips_arbitrary_points(
    #[strategy = transform_strategy()] transform: Transform,
    #[strategy = point_strategy()] point: Vec2,
) {
    let inverse = transform
        .inverse()
        .expect("scales bounded away from zero keep the determinant normal");

    // The forward image reaches |p| · 10 + 1e3; the inverse multiplies
    // the rounding by up to another factor of 10.
    let magnitude = point.length().mul_add(100.0, 1e4);
    assert_close_at_magnitude(inverse.apply(transform.apply(point)), point, magnitude);
}

/// Composition distributes over application.
///
/// `a.then(b).apply(p) == b.apply(a.apply(p))` up to rounding scaled by the intermediate
/// coordinates' magnitude.
#[property_test]
fn then_matches_sequential_application_on_arbitrary_transforms(
    #[strategy = transform_strategy()] first: Transform,
    #[strategy = transform_strategy()] second: Transform,
    #[strategy = point_strategy()] point: Vec2,
) {
    let composed = first.then(second).apply(point);
    let sequential = second.apply(first.apply(point));

    // The first image reaches |p| · 10 + 1e3, the second another
    // factor of 10 plus 1e3.
    let magnitude = point.length().mul_add(100.0, 1.1e4);
    assert_close_at_magnitude(composed, sequential, magnitude);
}

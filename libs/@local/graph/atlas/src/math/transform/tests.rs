use crate::math::{
    Rotation, Transform, Translation, Vec2, Vec2x4T,
    test_util::{POINTS, assert_vec2_close},
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
    // Translate first, then scale: (13, 4) * 2.
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
    // differ from the scalar path by one unit in the last place.
    for (index, point) in POINTS.into_iter().enumerate() {
        assert_vec2_close(batch.get(index), transform.apply(point));
    }
}

#[test]
fn widening_to_transform_preserves_behavior() {
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

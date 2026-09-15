#![expect(
    clippy::float_cmp,
    reason = "the exact fit fixtures produce exactly representable readings, so the asserted \
              constants are exact contracts"
)]

use hashql_core::id::IdSlice;
use proptest::{property_test, strategy::Strategy};

use super::Transform;
use crate::math::{
    FinitePointField, Rotation, Similarity, Translation, Vec2, Vec2x4T,
    tests::{POINTS, assert_vec2_close},
};

hashql_core::id::newtype! {
    /// Row identifiers for paired affine-fitting fixtures.
    ///
    #[id(const)]
    struct PairId(u32)
}

/// Validates fixture coordinates over the tests' row domain.
///
/// # Panics
///
/// Panics when a point is non-finite, including when locating it requires an unrepresentable row
/// ID.
#[track_caller]
fn field(points: &[Vec2]) -> &FinitePointField<PairId> {
    FinitePointField::new(IdSlice::from_raw(points)).expect("the fixture points are finite")
}

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

    // SIMD fusion and grouping differ from the scalar expression
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

/// Generates bounded transforms with invertible linear parts.
///
/// Per-axis scale magnitudes lie in `0.1..10`, the angle in `-16..16` radians and each translation
/// component in `-1e3..1e3`. Before coefficient rounding, the scale ratio bounds the linear part's
/// condition number by 100.
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

/// Generates points with coordinates in `-1e3..1e3`.
fn point_strategy() -> impl Strategy<Value = Vec2> {
    (-1e3_f32..1e3, -1e3_f32..1e3).prop_map(|(x, y)| Vec2::new(x, y))
}

/// Asserts two points agree up to a magnitude-scaled tolerance.
///
/// The absolute allowance is 128 · EPSILON · max(magnitude, 1), using [`f32::EPSILON`].
/// Cancellation can leave a result much smaller than its intermediate terms. The supplied scale
/// estimates those terms rather than the final result alone.
///
/// # Panics
///
/// Panics when either coordinate comparison fails.
#[track_caller]
fn assert_close_at_magnitude(actual: Vec2, expected: Vec2, magnitude: f32) {
    let tolerance = 128.0 * f32::EPSILON * magnitude.max(1.0);

    assert!(
        (actual.x() - expected.x()).abs() <= tolerance
            && (actual.y() - expected.y()).abs() <= tolerance,
        "expected {expected:?}, got {actual:?} (tolerance {tolerance})",
    );
}

#[property_test]
fn inverse_round_trips_arbitrary_points(
    #[strategy = transform_strategy()] transform: Transform,
    #[strategy = point_strategy()] point: Vec2,
) {
    let inverse = transform
        .inverse()
        .expect("scales bounded away from zero keep the determinant normal");

    // each translation component is bounded by 10³, and forward/inverse linear scale magnitudes are
    // bounded near 10. The coordinatewise tolerance scale allows a factor of 100 on ‖p‖ and 10⁴ for
    // translation.
    let magnitude = point.length().get().mul_add(100.0, 1e4);
    assert_close_at_magnitude(inverse.apply(transform.apply(point)), point, magnitude);
}

#[property_test]
fn then_matches_sequential_application_on_arbitrary_transforms(
    #[strategy = transform_strategy()] first: Transform,
    #[strategy = transform_strategy()] second: Transform,
    #[strategy = point_strategy()] point: Vec2,
) {
    let composed = first.then(second).apply(point);
    let sequential = second.apply(first.apply(point));

    // the tolerance scale grows with the two linear scale factors and both translations
    let magnitude = point.length().get().mul_add(100.0, 1.1e4);
    assert_close_at_magnitude(composed, sequential, magnitude);
}

/// Fits an anisotropic map on symmetric axis points.
///
/// The source centroid is zero and its scatter is 2I. The target-source cross-scatter is diag(4,
/// 1). Dividing by the source scatter recovers diag(2, 1/2), and the target centroid is the
/// translation (1, −2). These small dyadic operations and their determinant are exact.
#[test]
fn fit_recovers_an_exact_anisotropic_map() {
    let expected = Transform::from_cols(
        Vec2::new(2.0, 0.0),
        Vec2::new(0.0, 0.5),
        Vec2::new(1.0, -2.0),
    );
    let source = [
        Vec2::new(1.0, 0.0),
        Vec2::new(-1.0, 0.0),
        Vec2::new(0.0, 1.0),
        Vec2::new(0.0, -1.0),
    ];
    let target = source.map(|point| expected.apply(point));

    let fitted =
        Transform::fit_uniform(field(&source), field(&target)).expect("the exact fixture fits");

    assert_eq!(fitted, expected);
    assert_eq!(
        fitted.rms_residual(field(&source), field(&target)).get(),
        0.0
    );
}

#[test]
fn fit_recovers_an_exact_similarity() {
    let source = [
        Vec2::new(1.0, 0.0),
        Vec2::new(-1.0, 0.0),
        Vec2::new(0.0, 1.0),
        Vec2::new(0.0, -1.0),
    ];
    // Scale 2 under a quarter turn, translated by (1, -2), hand-applied.
    let target = [
        Vec2::new(1.0, 0.0),
        Vec2::new(1.0, -4.0),
        Vec2::new(-1.0, -2.0),
        Vec2::new(3.0, -2.0),
    ];

    let fitted =
        Transform::fit_uniform(field(&source), field(&target)).expect("the exact fixture fits");
    let similarity = Similarity::fit_uniform(field(&source), field(&target))
        .expect("the similar fixture fits exactly");

    assert_eq!(fitted, Transform::from(similarity));
    assert_eq!(
        fitted.rms_residual(field(&source), field(&target)).get(),
        0.0
    );
}

/// Separates uniform scale from an anisotropic deformation.
///
/// The target map is diag(2, 1/2) = (5/4)I + diag(3/4, −3/4). The source scatter is 2I, giving the
/// best similarity scale 5/4 and identity rotation. The trace-free remainder moves every unit-axis
/// point by exactly 3/4. The affine fit absorbs both parts and has zero residual.
#[test]
fn fit_absorbs_the_deformation_a_similarity_cannot() {
    let source = [
        Vec2::new(1.0, 0.0),
        Vec2::new(-1.0, 0.0),
        Vec2::new(0.0, 1.0),
        Vec2::new(0.0, -1.0),
    ];
    let target = [
        Vec2::new(2.0, 0.0),
        Vec2::new(-2.0, 0.0),
        Vec2::new(0.0, 0.5),
        Vec2::new(0.0, -0.5),
    ];

    let affine =
        Transform::fit_uniform(field(&source), field(&target)).expect("the exact fixture fits");
    assert_eq!(
        affine.rms_residual(field(&source), field(&target)).get(),
        0.0
    );

    let similarity = Similarity::fit_uniform(field(&source), field(&target))
        .expect("the square has positive variance");
    assert_eq!(similarity.scale().get(), 1.25);
    assert_eq!(
        similarity
            .rms_residual(field(&source), field(&target))
            .get(),
        0.75
    );
}

/// Rejects a dyadic collinear fixture and invalid pair counts.
///
/// Both coordinates follow the same sequence 0, 1, 2, 3. The centred scatter has every entry equal
/// to 5, and its determinant is exactly 25 − 25 = 0. This fixture avoids the rounding residuals
/// that can affect other singular inputs.
#[test]
fn fit_refuses_degenerate_sources() {
    let collinear = [
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 1.0),
        Vec2::new(2.0, 2.0),
        Vec2::new(3.0, 3.0),
    ];
    assert_eq!(
        Transform::fit_uniform(field(&collinear), field(&collinear)),
        None
    );

    let square = [
        Vec2::new(1.0, 0.0),
        Vec2::new(-1.0, 0.0),
        Vec2::new(0.0, 1.0),
    ];
    assert_eq!(
        Transform::fit_uniform(field(&square[..2]), field(&square[..2])),
        None
    );
    assert_eq!(
        Transform::fit_uniform(field(&square), field(&square[..2])),
        None
    );
}

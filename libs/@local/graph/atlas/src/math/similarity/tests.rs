#![expect(
    clippy::float_cmp,
    reason = "exactness assertions on power-of-two coefficients are bit-precise contracts"
)]

use super::Similarity;
use crate::math::{
    Rotation, Transform, Vec2, Vec2x4T,
    tests::{POINTS, assert_vec2_close},
};

/// A similarity mixing all three components with inexact rotation angles.
fn mixed_similarity() -> Similarity {
    Similarity::new(2.0, Rotation::from_radians(0.3), Vec2::new(1.0, 2.0))
        .expect("scale 2.0 is normal and positive")
}

/// Six well-spread, non-degenerate sample points for fitting.
const FIT_POINTS: [Vec2; 6] = [
    Vec2::new(0.0, 0.0),
    Vec2::new(4.0, 1.0),
    Vec2::new(-2.0, 3.0),
    Vec2::new(1.5, -2.5),
    Vec2::new(-3.0, -4.0),
    Vec2::new(5.0, 5.0),
];

/// Asserts two scalars agree up to a magnitude-scaled tolerance.
///
/// The fit narrows double-precision sums built from `f32`-rounded inputs,
/// so its coefficients carry a few ulps of working-precision error.
#[track_caller]
fn assert_scalar_close(actual: f32, expected: f32) {
    let tolerance = 32.0 * f32::EPSILON * expected.abs().max(1.0);

    assert!(
        (actual - expected).abs() < tolerance,
        "expected {expected}, got {actual}"
    );
}

#[test]
fn identity_maps_points_to_themselves() {
    for point in POINTS {
        assert_eq!(Similarity::IDENTITY.apply(point), point);
    }

    // The identity coefficients match salt's persistence default.
    assert_eq!(Similarity::IDENTITY.to_array(), [1.0, 1.0, 0.0, 0.0, 0.0]);
}

#[test]
fn new_stores_components_unchanged() {
    let rotation = Rotation::from_cos_sin(0.0, 1.0);
    let similarity = Similarity::new(4.0, rotation, Vec2::new(0.5, -8.0))
        .expect("scale 4.0 is normal and positive");

    assert_eq!(similarity.scale(), 4.0);
    assert_eq!(similarity.rotation(), rotation);
    assert_eq!(similarity.translation(), Vec2::new(0.5, -8.0));
}

#[test]
fn apply_matches_hand_computed_values() {
    // Quarter turn with exact coefficients, power-of-two scale and offsets:
    // every intermediate is exactly representable.
    let similarity = Similarity::new(2.0, Rotation::from_cos_sin(0.0, 1.0), Vec2::new(0.5, -4.0))
        .expect("scale 2.0 is normal and positive");

    // (1, 2) rotates to (-2, 1), scales to (-4, 2), moves to (-3.5, -2).
    assert_eq!(similarity.apply(Vec2::new(1.0, 2.0)), Vec2::new(-3.5, -2.0));
    // (0.25, -0.5) rotates to (0.5, 0.25), scales to (1, 0.5), moves to
    // (1.5, -3.5).
    assert_eq!(
        similarity.apply(Vec2::new(0.25, -0.5)),
        Vec2::new(1.5, -3.5)
    );
}

#[test]
fn composition_matches_sequential_application() {
    let first = mixed_similarity();
    let second = Similarity::new(0.5, Rotation::from_radians(1.1), Vec2::new(-3.0, 4.0))
        .expect("scale 0.5 is normal and positive");
    let composed = first.then(second);

    // The scales multiply exactly for powers of two.
    assert_eq!(composed.scale(), 1.0);

    for point in POINTS {
        assert_vec2_close(composed.apply(point), second.apply(first.apply(point)));
    }
}

#[test]
fn inverse_round_trips_both_directions() {
    let similarity = Similarity::new(4.0, Rotation::from_radians(0.7), Vec2::new(10.0, -2.0))
        .expect("scale 4.0 is normal and positive");
    let inverse = similarity.inverse();

    // A power-of-two scale inverts exactly.
    assert_eq!(inverse.scale(), 0.25);

    for point in POINTS {
        assert_vec2_close(inverse.apply(similarity.apply(point)), point);
        assert_vec2_close(similarity.apply(inverse.apply(point)), point);
    }
}

#[test]
fn apply_x4_matches_apply_per_lane() {
    let similarity = mixed_similarity();
    let batch = similarity.apply_x4(Vec2x4T::from(POINTS));

    for (index, point) in POINTS.into_iter().enumerate() {
        assert_vec2_close(batch.get(index), similarity.apply(point));
    }
}

#[test]
fn transform_widening_matches_apply() {
    assert_eq!(Transform::from(Similarity::IDENTITY), Transform::IDENTITY);

    let similarity = mixed_similarity();
    let transform = Transform::from(similarity);

    for point in POINTS {
        assert_vec2_close(transform.apply(point), similarity.apply(point));
    }
}

#[test]
fn to_array_from_array_round_trip() {
    let similarity = Similarity::new(2.0, Rotation::from_cos_sin(0.6, 0.8), Vec2::new(1.5, -2.25))
        .expect("scale 2.0 is normal and positive");

    // Every slot holds a distinct value, pinning the persistence order.
    assert_eq!(similarity.to_array(), [2.0, 0.6, 0.8, 1.5, -2.25]);

    let restored =
        Similarity::from_array(similarity.to_array()).expect("round trip keeps the scale valid");
    assert_eq!(restored, similarity);
}

#[test]
fn fit_recovers_a_known_transform() {
    let expected = Similarity::new(2.0, Rotation::from_radians(0.7), Vec2::new(3.0, -1.0))
        .expect("scale 2.0 is normal and positive");
    let target = FIT_POINTS.map(|point| expected.apply(point));

    let fitted = Similarity::fit(&FIT_POINTS, &target, &[1.0; 6])
        .expect("exact correspondences determine the transform");

    for (actual, reference) in fitted.to_array().into_iter().zip(expected.to_array()) {
        assert_scalar_close(actual, reference);
    }
}

#[test]
fn fit_round_trips_an_exact_similarity_image() {
    let expected = Similarity::new(0.75, Rotation::from_radians(-1.2), Vec2::new(-4.0, 2.5))
        .expect("scale 0.75 is normal and positive");
    let target = FIT_POINTS.map(|point| expected.apply(point));
    let weights = [1.0, 2.0, 0.5, 1.5, 3.0, 0.25];

    let fitted = Similarity::fit(&FIT_POINTS, &target, &weights)
        .expect("exact correspondences determine the transform");

    // The target is an exact similarity image of the source, so applying
    // the fit reproduces it point for point.
    for (point, reference) in FIT_POINTS.into_iter().zip(target) {
        assert_vec2_close(fitted.apply(point), reference);
    }
}

#[test]
fn fit_ignores_zero_weight_pairs() {
    let expected = Similarity::new(1.5, Rotation::from_radians(0.4), Vec2::new(1.0, 2.0))
        .expect("scale 1.5 is normal and positive");
    let target = FIT_POINTS.map(|point| expected.apply(point));

    let without_outlier = Similarity::fit(&FIT_POINTS, &target, &[1.0; 6])
        .expect("exact correspondences determine the transform");

    // Append a wildly wrong pair with weight zero: every sum it touches
    // gains an exact zero, so the fit is bit-identical.
    let mut source = FIT_POINTS.to_vec();
    let mut target = target.to_vec();
    source.push(Vec2::new(1000.0, -1000.0));
    target.push(Vec2::new(-5000.0, 300.0));
    let mut weights = vec![1.0; 6];
    weights.push(0.0);

    let with_outlier = Similarity::fit(&source, &target, &weights)
        .expect("the zero-weight outlier leaves the system well-determined");

    assert_eq!(with_outlier.to_array(), without_outlier.to_array());
}

#[test]
fn fit_rejects_degenerate_inputs() {
    let source = [
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 0.0),
        Vec2::new(0.0, 1.0),
    ];
    let target = [
        Vec2::new(1.0, 1.0),
        Vec2::new(2.0, 1.0),
        Vec2::new(1.0, 2.0),
    ];
    let weights = [1.0_f32; 3];

    // Mismatched slice lengths.
    assert!(Similarity::fit(&source[..2], &target, &weights).is_none());
    assert!(Similarity::fit(&source, &target[..2], &weights).is_none());
    assert!(Similarity::fit(&source, &target, &weights[..2]).is_none());

    // Fewer than two pairs.
    assert!(Similarity::fit(&[], &[], &[]).is_none());
    assert!(Similarity::fit(&source[..1], &target[..1], &weights[..1]).is_none());

    // Coincident source points carry no scale.
    assert!(Similarity::fit(&[Vec2::new(1.0, 1.0); 3], &target, &weights).is_none());

    // Non-finite coordinates on either side.
    let mut nan_source = source;
    nan_source[1] = Vec2::new(f32::NAN, 0.0);
    assert!(Similarity::fit(&nan_source, &target, &weights).is_none());
    let mut nan_target = target;
    nan_target[2] = Vec2::new(0.0, f32::NAN);
    assert!(Similarity::fit(&source, &nan_target, &weights).is_none());

    // Invalid weights: negative, non-finite, or summing to zero.
    assert!(Similarity::fit(&source, &target, &[1.0, -1.0, 1.0]).is_none());
    assert!(Similarity::fit(&source, &target, &[1.0, f32::NAN, 1.0]).is_none());
    assert!(Similarity::fit(&source, &target, &[0.0; 3]).is_none());

    // Coincident targets cancel the covariance: no orientation.
    assert!(Similarity::fit(&source, &[Vec2::new(1.0, 1.0); 3], &weights).is_none());
}

#[test]
fn invalid_scales_are_rejected() {
    let invalid_scales = [
        0.0,
        -0.0,
        -1.0,
        f32::NAN,
        f32::INFINITY,
        f32::NEG_INFINITY,
        f32::MIN_POSITIVE / 2.0,
    ];

    for scale in invalid_scales {
        assert!(
            Similarity::new(scale, Rotation::IDENTITY, Vec2::ZERO).is_none(),
            "new must reject scale {scale}",
        );
        assert!(
            Similarity::from_array([scale, 1.0, 0.0, 0.0, 0.0]).is_none(),
            "from_array must reject scale {scale}",
        );
    }
}

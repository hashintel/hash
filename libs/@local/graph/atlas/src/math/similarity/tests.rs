#![expect(
    clippy::float_cmp,
    reason = "exactness assertions on power-of-two coefficients are bit-precise contracts"
)]

use proptest::prelude::*;

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

/// Twelve spread-out, non-symmetric sample points for the fit certificates.
const CERT_POINTS: [Vec2; 12] = [
    Vec2::new(0.0, 0.0),
    Vec2::new(4.0, 1.0),
    Vec2::new(-2.0, 3.0),
    Vec2::new(1.5, -2.5),
    Vec2::new(-3.0, -4.0),
    Vec2::new(5.0, 5.0),
    Vec2::new(6.5, -1.75),
    Vec2::new(-5.25, 2.0),
    Vec2::new(2.25, 6.0),
    Vec2::new(-1.0, -6.5),
    Vec2::new(7.0, 3.5),
    Vec2::new(-6.0, -0.5),
];

/// Varied positive weights for the certificate points.
const CERT_WEIGHTS: [f32; 12] = [
    1.0, 2.0, 0.5, 1.5, 3.0, 0.25, 1.25, 0.75, 2.5, 0.125, 1.75, 0.375,
];

/// Small asymmetric offsets keeping the fitted residual nonzero.
///
/// So the error surface has a strict minimum away from the exact-recovery case.
const CERT_NOISE: [Vec2; 12] = [
    Vec2::new(0.02, -0.03),
    Vec2::new(-0.04, 0.01),
    Vec2::new(0.03, 0.05),
    Vec2::new(-0.01, -0.02),
    Vec2::new(0.05, 0.02),
    Vec2::new(-0.03, 0.04),
    Vec2::new(0.01, -0.05),
    Vec2::new(-0.05, -0.01),
    Vec2::new(0.04, 0.03),
    Vec2::new(-0.02, 0.05),
    Vec2::new(0.05, -0.04),
    Vec2::new(0.03, 0.01),
];

/// The certificate target.
///
/// A known similarity image of [`CERT_POINTS`] plus the asymmetric [`CERT_NOISE`].
fn noisy_certificate_target() -> [Vec2; 12] {
    let known = Similarity::new(1.75, Rotation::from_radians(0.55), Vec2::new(2.5, -1.25))
        .expect("scale 1.75 is normal and positive");

    core::array::from_fn(|index| known.apply(CERT_POINTS[index]) + CERT_NOISE[index])
}

/// Weighted squared alignment error of `similarity` over the pairs.
///
/// Computed in plain double precision, independent of the fit's fused accumulation, so it can
/// referee the optimality certificate.
#[expect(
    clippy::suboptimal_flops,
    reason = "the reference error deliberately uses plain arithmetic, independent of the FMA path \
              under test"
)]
fn weighted_error(
    similarity: Similarity,
    source: &[Vec2],
    target: &[Vec2],
    weights: &[f32],
) -> f64 {
    let [scale, cos, sin, translation_x, translation_y] = similarity.to_array().map(f64::from);

    source
        .iter()
        .zip(target)
        .zip(weights)
        .map(|((&source, &target), &weight)| {
            let mapped_x =
                scale * (cos * f64::from(source.x()) - sin * f64::from(source.y())) + translation_x;
            let mapped_y =
                scale * (sin * f64::from(source.x()) + cos * f64::from(source.y())) + translation_y;
            let error_x = mapped_x - f64::from(target.x());
            let error_y = mapped_y - f64::from(target.y());

            f64::from(weight) * (error_x * error_x + error_y * error_y)
        })
        .sum()
}

/// Asserts two scalars agree up to a magnitude-scaled tolerance.
///
/// The fit narrows double-precision sums built from `f32`-rounded inputs, so its coefficients carry
/// a few ulps of working-precision error.
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
fn fit_is_optimal_against_a_perturbation_grid() {
    let target = noisy_certificate_target();
    let fitted = Similarity::fit(&CERT_POINTS, &target, &CERT_WEIGHTS)
        .expect("twelve spread pairs determine the transform");
    let best = weighted_error(fitted, &CERT_POINTS, &target, &CERT_WEIGHTS);

    let scale = fitted.scale();
    let rotation = fitted.rotation();
    let angle = rotation.sin().atan2(rotation.cos());
    let translation = fitted.translation();

    // The objective is smooth in each of the four parameters (quadratic
    // in scale and translation, analytic in the angle), so a vanishing
    // directional derivative along each coordinate axis is exactly a
    // vanishing gradient: perturbing one parameter at a time certifies
    // each partial at the returned minimizer.
    for delta in [-1e-3_f32, 1e-3] {
        let perturbed = [
            Similarity::new(scale * (1.0 + delta), rotation, translation)
                .expect("a relative nudge keeps the scale normal and positive"),
            Similarity::new(scale, Rotation::from_radians(angle + delta), translation)
                .expect("the scale is untouched"),
            Similarity::new(scale, rotation, translation + Vec2::new(delta, 0.0))
                .expect("the scale is untouched"),
            Similarity::new(scale, rotation, translation + Vec2::new(0.0, delta))
                .expect("the scale is untouched"),
        ];

        for candidate in perturbed {
            let error = weighted_error(candidate, &CERT_POINTS, &target, &CERT_WEIGHTS);
            assert!(
                best <= error,
                "fit error {best} must not exceed perturbed error {error} at delta {delta}",
            );
        }
    }
}

#[test]
fn fit_is_equivariant_under_target_transformation() {
    let target = noisy_certificate_target();
    let base = Similarity::fit(&CERT_POINTS, &target, &CERT_WEIGHTS)
        .expect("twelve spread pairs determine the transform");

    // Post-transforming the target by a similarity scales every residual
    // uniformly, so the minimizer moves to the composition with it.
    let post = Similarity::new(0.5, Rotation::from_radians(-0.9), Vec2::new(-3.0, 7.0))
        .expect("scale 0.5 is normal and positive");
    let moved_target = target.map(|point| post.apply(point));

    let refitted = Similarity::fit(&CERT_POINTS, &moved_target, &CERT_WEIGHTS)
        .expect("a similarity image of a well-determined target stays well-determined");
    let expected = base.then(post);

    for (actual, reference) in refitted.to_array().into_iter().zip(expected.to_array()) {
        assert_scalar_close(actual, reference);
    }
}

#[test]
fn fit_is_invariant_under_uniform_weight_scaling() {
    let target = noisy_certificate_target();
    let base = Similarity::fit(&CERT_POINTS, &target, &CERT_WEIGHTS)
        .expect("twelve spread pairs determine the transform");

    // Every moment scales by the common factor, which the total-weight
    // divisions cancel. Multiplying by five rounds each accumulation
    // differently, so agreement is ulp-level rather than bit-exact.
    let scaled_weights = CERT_WEIGHTS.map(|weight| weight * 5.0);
    let scaled = Similarity::fit(&CERT_POINTS, &target, &scaled_weights)
        .expect("uniform weight scaling keeps the system well-determined");

    for (actual, reference) in scaled.to_array().into_iter().zip(base.to_array()) {
        assert_scalar_close(actual, reference);
    }
}

#[test]
fn fit_par_matches_fit_on_large_input() {
    const PAIRS: usize = 10_000;

    let known = Similarity::new(1.25, Rotation::from_radians(-0.35), Vec2::new(4.0, -2.0))
        .expect("scale 1.25 is normal and positive");

    // A logistic-map scramble: deterministic, allocation-light, and
    // chaotic enough to spread points, noise, and weights.
    let mut value = 0.37_f32;
    let mut pseudo = move || {
        value = 3.9 * value * (1.0 - value);
        value
    };

    let mut source = Vec::with_capacity(PAIRS);
    let mut target = Vec::with_capacity(PAIRS);
    let mut weights = Vec::with_capacity(PAIRS);
    for _ in 0..PAIRS {
        let point = Vec2::new(
            20.0_f32.mul_add(pseudo(), -10.0),
            20.0_f32.mul_add(pseudo(), -10.0),
        );
        let noise = Vec2::new(
            0.1_f32.mul_add(pseudo(), -0.05),
            0.1_f32.mul_add(pseudo(), -0.05),
        );
        source.push(point);
        target.push(known.apply(point) + noise);
        weights.push(pseudo() + 0.25);
    }

    let serial = Similarity::fit(&source, &target, &weights)
        .expect("ten thousand spread pairs determine the transform");
    let parallel = Similarity::fit_par(&source, &target, &weights)
        .expect("the parallel fit shares the serial contract");

    // The parallel reduction combines per-chunk sums in a different
    // order than the serial fold, so agreement is magnitude-scaled ulps
    // rather than bit-exact.
    for (actual, reference) in parallel.to_array().into_iter().zip(serial.to_array()) {
        assert_scalar_close(actual, reference);
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
fn fit_uniform_matches_fit_with_unit_weights() {
    let target = noisy_certificate_target();

    let weighted = Similarity::fit(&CERT_POINTS, &target, &[1.0; 12])
        .expect("twelve spread pairs determine the transform");
    let uniform = Similarity::fit_uniform(&CERT_POINTS, &target)
        .expect("the uniform fit shares the weighted contract");

    // The uniform pass accumulates the same moments without the weight
    // multiplications, so each sum rounds differently: agreement is
    // magnitude-scaled ulps rather than bit-exact.
    for (actual, reference) in uniform.to_array().into_iter().zip(weighted.to_array()) {
        assert_scalar_close(actual, reference);
    }
}

#[test]
fn fit_uniform_par_matches_fit_uniform_on_large_input() {
    const PAIRS: usize = 10_000;

    let known = Similarity::new(0.8, Rotation::from_radians(2.1), Vec2::new(-1.0, 6.0))
        .expect("scale 0.8 is normal and positive");

    let mut value = 0.61_f32;
    let mut pseudo = move || {
        value = 3.9 * value * (1.0 - value);
        value
    };

    let mut source = Vec::with_capacity(PAIRS);
    let mut target = Vec::with_capacity(PAIRS);
    for _ in 0..PAIRS {
        let point = Vec2::new(
            20.0_f32.mul_add(pseudo(), -10.0),
            20.0_f32.mul_add(pseudo(), -10.0),
        );
        let noise = Vec2::new(
            0.1_f32.mul_add(pseudo(), -0.05),
            0.1_f32.mul_add(pseudo(), -0.05),
        );
        source.push(point);
        target.push(known.apply(point) + noise);
    }

    let serial = Similarity::fit_uniform(&source, &target)
        .expect("ten thousand spread pairs determine the transform");
    let parallel = Similarity::fit_uniform_par(&source, &target)
        .expect("the parallel fit shares the serial contract");

    for (actual, reference) in parallel.to_array().into_iter().zip(serial.to_array()) {
        assert_scalar_close(actual, reference);
    }
}

#[test]
fn rms_residual_reduces_hand_computed_distances() {
    // Residual distances 3 and 4 under the identity: the RMS is
    // sqrt((9 + 16) / 2) by hand.
    let source = [Vec2::new(0.0, 0.0), Vec2::new(10.0, 0.0)];
    let target = [Vec2::new(0.0, 3.0), Vec2::new(14.0, 0.0)];

    let residual = Similarity::IDENTITY
        .rms_residual(&source, &target)
        .expect("the pairs are finite");

    assert!((residual - 12.5_f64.sqrt()).abs() < 1e-12);
}

#[test]
fn rms_residual_vanishes_on_an_exact_image() {
    let similarity = Similarity::new(2.0, Rotation::from_radians(0.7), Vec2::new(3.0, -1.0))
        .expect("scale 2.0 is normal and positive");
    let target = FIT_POINTS.map(|point| similarity.apply(point));

    let residual = similarity
        .rms_residual(&FIT_POINTS, &target)
        .expect("the pairs are finite");

    // The targets were produced by the `f32` application while the
    // residual applies widened `f64` coefficients, so the mismatch is
    // the `f32` rounding of the application, not zero.
    assert!(residual < 1e-5, "exact image residual was {residual}");
}

#[test]
fn rms_residual_is_the_fit_objective_at_the_minimizer() {
    let target = noisy_certificate_target();
    let fitted = Similarity::fit(&CERT_POINTS, &target, &CERT_WEIGHTS)
        .expect("twelve spread pairs determine the transform");

    // The unweighted residual of a nearby similarity must not fall
    // below the unweighted optimum's; certify against the uniform fit.
    let uniform = Similarity::fit_uniform(&CERT_POINTS, &target)
        .expect("twelve spread pairs determine the transform");
    let best = uniform
        .rms_residual(&CERT_POINTS, &target)
        .expect("the pairs are finite");
    let off = fitted
        .rms_residual(&CERT_POINTS, &target)
        .expect("the pairs are finite");

    assert!(
        best <= off + 1e-9,
        "uniform optimum {best} must not exceed the weighted fit's residual {off}"
    );
}

#[test]
fn rms_residual_par_matches_rms_residual() {
    const PAIRS: usize = 10_000;

    let similarity = Similarity::new(1.5, Rotation::from_radians(-0.2), Vec2::new(2.0, 2.0))
        .expect("scale 1.5 is normal and positive");

    let mut value = 0.43_f32;
    let mut pseudo = move || {
        value = 3.9 * value * (1.0 - value);
        value
    };
    let mut source = Vec::with_capacity(PAIRS);
    let mut target = Vec::with_capacity(PAIRS);
    for _ in 0..PAIRS {
        let point = Vec2::new(
            20.0_f32.mul_add(pseudo(), -10.0),
            20.0_f32.mul_add(pseudo(), -10.0),
        );
        source.push(point);
        target.push(Vec2::new(pseudo(), pseudo()));
    }

    let serial = similarity
        .rms_residual(&source, &target)
        .expect("the pairs are finite");
    let parallel = similarity
        .rms_residual_par(&source, &target)
        .expect("the parallel residual shares the serial contract");

    // Chunked summation rounds differently from the serial fold.
    assert!((serial - parallel).abs() <= serial * 1e-12);
}

#[test]
fn rms_residual_rejects_invalid_pairings() {
    let points = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)];
    let similarity = Similarity::IDENTITY;

    // Mismatched lengths and empty input.
    assert!(similarity.rms_residual(&points, &points[..1]).is_none());
    assert!(similarity.rms_residual(&[], &[]).is_none());
    assert!(similarity.rms_residual_par(&points, &points[..1]).is_none());
    assert!(similarity.rms_residual_par(&[], &[]).is_none());

    // A non-finite coordinate propagates into the sum and is rejected
    // rather than returned.
    let nan = [Vec2::new(f32::NAN, 0.0), Vec2::new(1.0, 0.0)];
    assert!(similarity.rms_residual(&nan, &points).is_none());
    assert!(similarity.rms_residual(&points, &nan).is_none());
    assert!(similarity.rms_residual_par(&nan, &points).is_none());
}

/// Asserts both fit entry points reject the pairing, certifying their [`None`] agreement case by
/// case.
#[track_caller]
fn assert_fit_rejects(source: &[Vec2], target: &[Vec2], weights: &[f32]) {
    assert!(Similarity::fit(source, target, weights).is_none());
    assert!(Similarity::fit_par(source, target, weights).is_none());
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
    assert_fit_rejects(&source[..2], &target, &weights);
    assert_fit_rejects(&source, &target[..2], &weights);
    assert_fit_rejects(&source, &target, &weights[..2]);

    // Fewer than two pairs.
    assert_fit_rejects(&[], &[], &[]);
    assert_fit_rejects(&source[..1], &target[..1], &weights[..1]);

    // Coincident source points carry no scale.
    assert_fit_rejects(&[Vec2::new(1.0, 1.0); 3], &target, &weights);
    assert!(Similarity::fit_uniform(&[Vec2::new(1.0, 1.0); 3], &target).is_none());
    assert!(Similarity::fit_uniform_par(&[Vec2::new(1.0, 1.0); 3], &target).is_none());

    // Non-finite coordinates on either side.
    let mut nan_source = source;
    nan_source[1] = Vec2::new(f32::NAN, 0.0);
    assert_fit_rejects(&nan_source, &target, &weights);
    let mut nan_target = target;
    nan_target[2] = Vec2::new(0.0, f32::NAN);
    assert_fit_rejects(&source, &nan_target, &weights);

    // Invalid weights: negative, non-finite, or summing to zero.
    assert_fit_rejects(&source, &target, &[1.0, -1.0, 1.0]);
    assert_fit_rejects(&source, &target, &[1.0, f32::NAN, 1.0]);
    assert_fit_rejects(&source, &target, &[0.0; 3]);

    // Coincident targets cancel the covariance: no orientation.
    assert_fit_rejects(&source, &[Vec2::new(1.0, 1.0); 3], &weights);
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

/// An arbitrary well-conditioned similarity.
///
/// Scale in `0.1..10`, an arbitrary rotation angle, and a translation bounded to `-1e2..1e2`.
fn similarity_strategy() -> impl Strategy<Value = Similarity> {
    (0.1_f32..10.0, -16.0_f32..16.0, -1e2_f32..1e2, -1e2_f32..1e2).prop_map(
        |(scale, radians, translate_x, translate_y)| {
            Similarity::new(
                scale,
                Rotation::from_radians(radians),
                Vec2::new(translate_x, translate_y),
            )
            .expect("the strategy's scale range is normal and positive")
        },
    )
}

proptest! {
    /// A similarity scales all distances uniformly: for any two points separated by at least one unit, the distance ratio equals the scale up to a relative tolerance. Coordinates are bounded to `-1e3..1e3` and the separation floor keeps the subtraction's cancellation error small relative to the distance.
    #[test]
    fn apply_scales_distances_uniformly(
        similarity in similarity_strategy(),
        (left_x, left_y) in (-1e3_f32..1e3, -1e3_f32..1e3),
        (right_x, right_y) in (-1e3_f32..1e3, -1e3_f32..1e3),
    ) {
        let left = Vec2::new(left_x, left_y);
        let right = Vec2::new(right_x, right_y);
        prop_assume!(left.distance(right) >= 1.0);

        let ratio = similarity.apply(left).distance(similarity.apply(right))
            / left.distance(right);

        prop_assert!(
            (ratio - similarity.scale()).abs() <= 1e-3 * similarity.scale(),
            "distance ratio {} vs scale {}", ratio, similarity.scale(),
        );
    }

    /// Fitting an exact similarity image of non-collinear points recovers the similarity's coefficients. The sources are four well-spread base points jittered by at most `0.5`, far less than the base triangle's extent, so the points can never become collinear.
    #[test]
    fn fit_recovers_a_random_similarity(
        similarity in similarity_strategy(),
        jitter in prop::array::uniform8(-0.5_f32..0.5),
    ) {
        let source = [
            Vec2::new(jitter[0], jitter[1]),
            Vec2::new(8.0 + jitter[2], jitter[3]),
            Vec2::new(jitter[4], 8.0 + jitter[5]),
            Vec2::new(-8.0 + jitter[6], -8.0 + jitter[7]),
        ];
        let target = source.map(|point| similarity.apply(point));

        let fitted = Similarity::fit(&source, &target, &[1.0; 4])
            .expect("well-spread points with an exact image are well-conditioned");

        // The target coordinates are f32-rounded images, so the recovered
        // coefficients carry working-precision error scaled by their
        // magnitude.
        let expected = similarity.to_array();
        for (index, (actual, expected)) in fitted.to_array().into_iter().zip(expected).enumerate() {
            prop_assert!(
                (actual - expected).abs() <= 1e-3 * expected.abs().max(1.0),
                "coefficient {}: expected {}, got {}", index, expected, actual,
            );
        }
    }
}

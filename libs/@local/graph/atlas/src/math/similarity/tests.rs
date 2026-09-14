#![expect(
    clippy::float_cmp,
    reason = "exactness assertions on power-of-two coefficients are bit-precise contracts"
)]

use hashql_core::id::IdSlice;
use proptest::{prop_assert, prop_assume, property_test, strategy::Strategy};

use super::Similarity;
use crate::math::{
    DNonNegative, FinitePointField, Positive, Rotation, Vec2, Vec2x4T, nz, positive,
    tests::{POINTS, assert_vec2_close},
    transform::Transform,
};

hashql_core::id::newtype! {
    /// Row identifiers for paired fitting fixtures.
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

/// Creates a scale-and-translation fixture with an inexact rotation angle.
fn mixed_similarity() -> Similarity {
    Similarity::new(
        positive!(2.0),
        Rotation::from_radians(0.3),
        Vec2::new(1.0, 2.0),
    )
    .expect("scale 2.0 is normal and positive")
}

/// Source points spanning both axes, with distinct points in every prefix of length two.
const FIT_POINTS: [Vec2; 6] = [
    Vec2::new(0.0, 0.0),
    Vec2::new(4.0, 1.0),
    Vec2::new(-2.0, 3.0),
    Vec2::new(1.5, -2.5),
    Vec2::new(-3.0, -4.0),
    Vec2::new(5.0, 5.0),
];

/// Asymmetric source points for noisy-fit comparisons.
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

/// Varied positive weights for [`CERT_POINTS`].
const CERT_WEIGHTS: [f32; 12] = [
    1.0, 2.0, 0.5, 1.5, 3.0, 0.25, 1.25, 0.75, 2.5, 0.125, 1.75, 0.375,
];

/// Small asymmetric offsets keeping the fitted residual nonzero.
///
/// These perturb the known similarity's images to produce a noisy alignment fixture.
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

/// Transforms [`CERT_POINTS`] and adds the asymmetric [`CERT_NOISE`].
fn noisy_certificate_target() -> [Vec2; 12] {
    let known = Similarity::new(
        positive!(1.75),
        Rotation::from_radians(0.55),
        Vec2::new(2.5, -1.25),
    )
    .expect("scale 1.75 is normal and positive");

    core::array::from_fn(|index| known.apply(CERT_POINTS[index]) + CERT_NOISE[index])
}

/// Computes weighted squared alignment error with separate `f64` operations.
///
/// The comparison uses ordinary floating-point rounding over only the common prefix of the slices.
/// It evaluates the objective directly from the coefficients, independently of the fitting moments.
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
/// Requires |actual − expected| < 32 · EPSILON · max(|expected|, 1), using [`f32::EPSILON`]. The
/// absolute floor also covers coefficients near zero.
///
/// # Panics
///
/// Panics when the comparison fails, including for non-finite inputs.
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

    assert_eq!(Similarity::IDENTITY.to_array(), [1.0, 1.0, 0.0, 0.0, 0.0]);
}

#[test]
fn new_stores_components_unchanged() {
    let rotation = Rotation::from_cos_sin(0.0, 1.0);
    let similarity = Similarity::new(positive!(4.0), rotation, Vec2::new(0.5, -8.0))
        .expect("scale 4.0 is normal and positive");

    assert_eq!(similarity.scale(), 4.0);
    assert_eq!(similarity.rotation(), rotation);
    assert_eq!(similarity.translation(), Vec2::new(0.5, -8.0));
}

#[test]
fn apply_matches_hand_computed_values() {
    // Quarter turn with exact coefficients, power-of-two scale and offsets:
    // every intermediate is exactly representable.
    let similarity = Similarity::new(
        positive!(2.0),
        Rotation::from_cos_sin(0.0, 1.0),
        Vec2::new(0.5, -4.0),
    )
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
    let second = Similarity::new(
        positive!(0.5),
        Rotation::from_radians(1.1),
        Vec2::new(-3.0, 4.0),
    )
    .expect("scale 0.5 is normal and positive");
    let composed = first
        .then(second)
        .expect("the product 2.0 * 0.5 = 1.0 stays in the accepted range");

    // The scales multiply exactly for powers of two.
    assert_eq!(composed.scale(), 1.0);

    for point in POINTS {
        assert_vec2_close(composed.apply(point), second.apply(first.apply(point)));
    }
}

#[test]
fn inverse_round_trips_both_directions() {
    let similarity = Similarity::new(
        positive!(4.0),
        Rotation::from_radians(0.7),
        Vec2::new(10.0, -2.0),
    )
    .expect("scale 4.0 is normal and positive");
    let inverse = similarity
        .inverse()
        .expect("inverse coefficients are in range");

    // A power-of-two scale inverts exactly.
    assert_eq!(inverse.scale(), 0.25);

    for point in POINTS {
        assert_vec2_close(inverse.apply(similarity.apply(point)), point);
        assert_vec2_close(similarity.apply(inverse.apply(point)), point);
    }
}

#[test]
fn boundary_scales_and_their_inverses_stay_valid() {
    // The smallest normal and its exact reciprocal 2¹²⁶ are the accepted range's two edges.
    let bottom = Similarity::new(positive!(f32::MIN_POSITIVE), Rotation::IDENTITY, Vec2::ZERO)
        .expect("the smallest normal has the reciprocal 2^126, which is normal");
    let top = Similarity::new(
        Positive::new(2.0_f32.powi(126)).expect("2^126 is finite"),
        Rotation::IDENTITY,
        Vec2::ZERO,
    )
    .expect("2^126 has the reciprocal f32::MIN_POSITIVE, which is normal");

    assert_eq!(
        bottom.inverse().expect("zero translation").scale(),
        2.0_f32.powi(126)
    );
    assert_eq!(
        top.inverse().expect("zero translation").scale(),
        f32::MIN_POSITIVE
    );
}

#[test]
fn composition_rejects_scales_leaving_the_range() {
    let large = Similarity::new(positive!(1.0e20), Rotation::IDENTITY, Vec2::ZERO)
        .expect("1e20 and its reciprocal are normal");
    let small = Similarity::new(positive!(1.0e-30), Rotation::IDENTITY, Vec2::ZERO)
        .expect("1e-30 and its reciprocal are normal");

    // 1e20 · 1e20 overflows to infinity. 1e-30 · 1e-30 underflows to zero.
    assert!(large.then(large).is_none());
    assert!(small.then(small).is_none());
    // the mixed product is about 10⁻¹⁰, within the accepted range
    assert!(large.then(small).is_some());
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
    let similarity = Similarity::new(
        positive!(2.0),
        Rotation::from_cos_sin(0.6, 0.8),
        Vec2::new(1.5, -2.25),
    )
    .expect("scale 2.0 is normal and positive");

    // Every slot holds a distinct value, pinning the persistence order.
    assert_eq!(similarity.to_array(), [2.0, 0.6, 0.8, 1.5, -2.25]);

    let restored =
        Similarity::from_array(similarity.to_array()).expect("round trip keeps the scale valid");
    assert_eq!(restored, similarity);
}

#[test]
fn fit_recovers_a_known_transform() {
    let expected = Similarity::new(
        positive!(2.0),
        Rotation::from_radians(0.7),
        Vec2::new(3.0, -1.0),
    )
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
    let expected = Similarity::new(
        positive!(0.75),
        Rotation::from_radians(-1.2),
        Vec2::new(-4.0, 2.5),
    )
    .expect("scale 0.75 is normal and positive");
    let target = FIT_POINTS.map(|point| expected.apply(point));
    let weights = [1.0, 2.0, 0.5, 1.5, 3.0, 0.25];

    let fitted = Similarity::fit(&FIT_POINTS, &target, &weights)
        .expect("exact correspondences determine the transform");

    // targets are rounded f32 images, and the fitted application is compared with a tolerance
    for (point, reference) in FIT_POINTS.into_iter().zip(target) {
        assert_vec2_close(fitted.apply(point), reference);
    }
}

/// Compares the fitted objective against coordinatewise perturbations.
///
/// Scale changes by a relative ±10⁻³, while angle and each translation component change by an
/// absolute ±10⁻³. These comparisons sample the nearby error surface without certifying vanishing
/// partial derivatives or an exact minimizer.
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

    // With the other parameters fixed, the real-arithmetic objective is quadratic in scale and
    // translation, and sinusoidal in angle. A minimum cannot improve under either signed
    // perturbation. Finite steps and rounded coefficients limit this check to the sampled
    // candidates.
    for delta in [-1e-3_f32, 1e-3] {
        let perturbed = [
            Similarity::new(
                Positive::new(scale * (1.0 + delta)).expect("a relative nudge stays finite"),
                rotation,
                translation,
            )
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

    // In real arithmetic, post-composing both the candidate and target with an invertible
    // similarity of scale a multiplies every squared residual by a². The candidate family maps
    // bijectively onto itself. Therefore its minimizer post-composes by the same similarity. The
    // fixture comparisons allow for f32 rounding.
    let post = Similarity::new(
        positive!(0.5),
        Rotation::from_radians(-0.9),
        Vec2::new(-3.0, 7.0),
    )
    .expect("scale 0.5 is normal and positive");
    let moved_target = target.map(|point| post.apply(point));

    let refitted = Similarity::fit(&CERT_POINTS, &moved_target, &CERT_WEIGHTS)
        .expect("a similarity image of a well-determined target stays well-determined");
    let expected = base
        .then(post)
        .expect("multiplying the near-one fixture scales stays inside the accepted range");

    for (actual, reference) in refitted.to_array().into_iter().zip(expected.to_array()) {
        assert_scalar_close(actual, reference);
    }
}

#[test]
fn fit_is_invariant_under_uniform_weight_scaling() {
    let target = noisy_certificate_target();
    let base = Similarity::fit(&CERT_POINTS, &target, &CERT_WEIGHTS)
        .expect("twelve spread pairs determine the transform");

    // Multiplying positive weights by five multiplies the real-arithmetic objective by five and
    // preserves its minimizer. The absolute/relative tolerance accounts for differently rounded
    // moment accumulation and centring.
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

    let known = Similarity::new(
        positive!(1.25),
        Rotation::from_radians(-0.35),
        Vec2::new(4.0, -2.0),
    )
    .expect("scale 1.25 is normal and positive");

    // the logistic recurrence supplies a reproducible, bounded sequence for the fixture
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

    // parallel moment grouping can round differently from the serial fold
    for (actual, reference) in parallel.to_array().into_iter().zip(serial.to_array()) {
        assert_scalar_close(actual, reference);
    }
}

#[test]
fn fit_ignores_zero_weight_pairs() {
    let expected = Similarity::new(
        positive!(1.5),
        Rotation::from_radians(0.4),
        Vec2::new(1.0, 2.0),
    )
    .expect("scale 1.5 is normal and positive");
    let target = FIT_POINTS.map(|point| expected.apply(point));

    let without_outlier = Similarity::fit(&FIT_POINTS, &target, &[1.0; 6])
        .expect("exact correspondences determine the transform");

    // Appending pair seven keeps the first four pairs in the SIMD batch and the remaining pairs in
    // the scalar tail. Its zero weight adds only zeros without regrouping the existing terms.
    // Therefore the numerical coefficients remain equal in this fixture.
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
    let uniform = Similarity::fit_uniform(field(&CERT_POINTS), field(&target))
        .expect("the uniform fit shares the weighted contract");

    // removing unit-weight operations preserves the model, without requiring bitwise equality
    for (actual, reference) in uniform.to_array().into_iter().zip(weighted.to_array()) {
        assert_scalar_close(actual, reference);
    }
}

#[test]
fn fit_uniform_par_matches_fit_uniform_on_large_input() {
    const PAIRS: usize = 10_000;

    let known = Similarity::new(
        positive!(0.8),
        Rotation::from_radians(2.1),
        Vec2::new(-1.0, 6.0),
    )
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

    let serial = Similarity::fit_uniform(field(&source), field(&target))
        .expect("ten thousand spread pairs determine the transform");
    let parallel = Similarity::fit_uniform_par(field(&source), field(&target))
        .expect("the parallel fit shares the serial contract");

    for (actual, reference) in parallel.to_array().into_iter().zip(serial.to_array()) {
        assert_scalar_close(actual, reference);
    }
}

#[test]
fn rms_residual_reduces_hand_computed_distances() {
    // Residual distances 3 and 4 under the identity: the RMS is
    // √((9 + 16) / 2) by hand.
    let source = [Vec2::new(0.0, 0.0), Vec2::new(10.0, 0.0)];
    let target = [Vec2::new(0.0, 3.0), Vec2::new(14.0, 0.0)];

    let residual = Similarity::IDENTITY.rms_residual(field(&source), field(&target));

    assert!((residual.get() - 12.5_f64.sqrt()).abs() < 1e-12);
}

#[test]
fn rms_residual_vanishes_on_an_exact_image() {
    let similarity = Similarity::new(
        positive!(2.0),
        Rotation::from_radians(0.7),
        Vec2::new(3.0, -1.0),
    )
    .expect("scale 2.0 is normal and positive");
    let target = FIT_POINTS.map(|point| similarity.apply(point));

    let residual = similarity.rms_residual(field(&FIT_POINTS), field(&target));

    // f32 application produced the targets, while the residual applies widened coefficients with
    // different grouping and fusion
    assert!(residual.get() < 1e-5, "exact image residual was {residual}");
}

#[test]
fn rms_residual_is_the_fit_objective_at_the_minimizer() {
    let target = noisy_certificate_target();
    let fitted = Similarity::fit(&CERT_POINTS, &target, &CERT_WEIGHTS)
        .expect("twelve spread pairs determine the transform");

    // The unweighted real-arithmetic optimum minimizes this residual. Compare its estimated fit
    // with the weighted fit, allowing a 10⁻⁹ absolute tolerance.
    let uniform = Similarity::fit_uniform(field(&CERT_POINTS), field(&target))
        .expect("twelve spread pairs determine the transform");
    let best = uniform.rms_residual(field(&CERT_POINTS), field(&target));
    let off = fitted.rms_residual(field(&CERT_POINTS), field(&target));

    assert!(
        best.get() <= off.get() + 1e-9,
        "uniform optimum {best} must not exceed the weighted fit's residual {off}"
    );
}

#[test]
fn rms_residual_par_matches_rms_residual() {
    const PAIRS: usize = 10_000;

    let similarity = Similarity::new(
        positive!(1.5),
        Rotation::from_radians(-0.2),
        Vec2::new(2.0, 2.0),
    )
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

    let serial = similarity.rms_residual(field(&source), field(&target));
    let parallel = similarity.rms_residual_par(field(&source), field(&target));

    // Chunked summation rounds differently from the serial fold.
    assert!((serial.get() - parallel.get()).abs() <= serial.get() * 1e-12);
}

#[test]
#[should_panic(expected = "paired fields must cover the same rows")]
fn rms_residual_panics_on_mismatched_lengths() {
    let points = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)];

    let _: DNonNegative = Similarity::IDENTITY.rms_residual(field(&points), field(&points[..1]));
}

#[test]
#[should_panic(expected = "an RMS residual needs at least one pair")]
fn rms_residual_panics_on_empty_fields() {
    let _: DNonNegative = Similarity::IDENTITY.rms_residual(field(&[]), field(&[]));
}

#[test]
#[should_panic(expected = "paired fields must cover the same rows")]
fn rms_residual_par_panics_on_mismatched_lengths() {
    let points = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)];

    let _: DNonNegative =
        Similarity::IDENTITY.rms_residual_par(field(&points), field(&points[..1]));
}

#[test]
#[should_panic(expected = "an RMS residual needs at least one pair")]
fn rms_residual_par_panics_on_empty_fields() {
    let _: DNonNegative = Similarity::IDENTITY.rms_residual_par(field(&[]), field(&[]));
}

/// Asserts that both weighted fit entry points reject the pairing.
///
/// # Panics
///
/// Panics when either fit returns [`Some`].
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
    assert!(Similarity::fit_uniform(field(&[Vec2::new(1.0, 1.0); 3]), field(&target)).is_none());
    assert!(
        Similarity::fit_uniform_par(field(&[Vec2::new(1.0, 1.0); 3]), field(&target)).is_none()
    );

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
fn fit_recovers_exact_images_at_every_accepted_length() {
    let known = mixed_similarity();
    let target = FIT_POINTS.map(|point| known.apply(point));

    // Lengths 2 and 3 fold entirely in the scalar tail, 4 entirely in a SIMD batch, and 5 and 6 in
    // both. The shortest prefix also exercises the minimum accepted pair count.
    let unit_weights = [1.0_f32; 6];
    for pairs in 2..=FIT_POINTS.len() {
        let source = &FIT_POINTS[..pairs];
        let target = &target[..pairs];
        let weights = &unit_weights[..pairs];

        for fitted in [
            Similarity::fit(source, target, weights),
            Similarity::fit_par(source, target, weights),
            Similarity::fit_uniform(field(source), field(target)),
            Similarity::fit_uniform_par(field(source), field(target)),
        ] {
            let fitted = fitted.expect("distinct exact pairs determine the similarity");
            for (&actual, &expected) in fitted.to_array().iter().zip(&known.to_array()) {
                assert_scalar_close(actual, expected);
            }
        }
    }
}

#[test]
fn fit_uniform_rejects_mismatched_lengths() {
    let known = mixed_similarity();
    let target = FIT_POINTS.map(|point| known.apply(point));

    assert!(Similarity::fit_uniform(field(&FIT_POINTS[..5]), field(&target)).is_none());
    assert!(Similarity::fit_uniform(field(&FIT_POINTS), field(&target[..5])).is_none());
    assert!(Similarity::fit_uniform_par(field(&FIT_POINTS[..5]), field(&target)).is_none());
    assert!(Similarity::fit_uniform_par(field(&FIT_POINTS), field(&target[..5])).is_none());
}

#[test]
fn fit_rejects_a_negative_weight_at_every_index() {
    let known = mixed_similarity();
    let source = &FIT_POINTS[..5];
    let target: Vec<Vec2> = source.iter().map(|&point| known.apply(point)).collect();

    // indices 0 through 3 fill one SIMD batch, and index 4 uses the scalar tail
    for index in 0..source.len() {
        let mut weights = [1.0_f32; 5];
        weights[index] = -0.5;

        assert!(
            Similarity::fit(source, &target, &weights).is_none(),
            "a negative weight at index {index} must reject"
        );
        assert!(
            Similarity::fit_par(source, &target, &weights).is_none(),
            "a negative weight at index {index} must reject in the parallel fit"
        );
    }
}

#[test]
fn fit_par_rejects_an_invalid_chunk_beside_a_valid_one() {
    let known = mixed_similarity();
    let source = &CERT_POINTS[..8];
    let target: Vec<Vec2> = source.iter().map(|&point| known.apply(point)).collect();

    // a chunk size of four puts the negative weight in the second partial sum and exercises
    // validity propagation through the merge
    let mut weights = [1.0_f32; 8];
    weights[6] = -0.5;
    let chunk = nz!(4);
    assert!(Similarity::fit_par_with(source, &target, &weights, chunk).is_none());
}

#[test]
fn similarity_construction_validates_rotation_and_translation() {
    for [cos, sin, x, y] in [
        [0.0, 0.0, 0.0, 0.0],
        [2.0, 0.0, 0.0, 0.0],
        [f32::NAN, 0.0, 0.0, 0.0],
        [1.0, f32::INFINITY, 0.0, 0.0],
        [1.0, 0.0, f32::INFINITY, 0.0],
        [1.0, 0.0, 0.0, f32::NAN],
    ] {
        assert!(
            Similarity::new(
                Positive::ONE,
                Rotation::from_cos_sin(cos, sin),
                Vec2::new(x, y)
            )
            .is_none()
        );
        assert!(Similarity::from_array([1.0, cos, sin, x, y]).is_none());
    }

    let accepted_cos = f32::from_bits(1.0_f32.to_bits() + 4);
    let rejected_cos = f32::from_bits(1.0_f32.to_bits() + 5);
    let coefficients = [1.0, accepted_cos, 0.0, 3.0, -4.0];
    let similarity = Similarity::from_array(coefficients).expect("squared-norm defect below 1e-6");
    assert_eq!(similarity.to_array(), coefficients);
    assert!(Similarity::from_array([1.0, rejected_cos, 0.0, 3.0, -4.0]).is_none());
    assert!(similarity.then(similarity).is_none());
    assert_eq!(similarity.then(Similarity::IDENTITY), Some(similarity));
}

#[test]
fn similarity_serde_validates_all_coefficients() {
    for json in [
        r#"{"scale":1e-45,"rotation":[1,0],"translation":[0,0]}"#,
        r#"{"scale":1e38,"rotation":[1,0],"translation":[0,0]}"#,
        r#"{"scale":1,"rotation":[2,0],"translation":[0,0]}"#,
        r#"{"scale":1,"rotation":[1,1e40],"translation":[0,0]}"#,
        r#"{"scale":1,"rotation":[1,0],"translation":[1e40,0]}"#,
        r#"{"scale":1,"rotation":[1,0],"translation":[0,-1e40]}"#,
    ] {
        serde_json::from_str::<Similarity>(json)
            .expect_err("invalid coefficients should not deserialize");
    }
    let json = r#"{"scale":2.0,"rotation":[0.0,1.0],"translation":[3.0,-4.0]}"#;
    let similarity: Similarity = serde_json::from_str(json).expect("valid coefficients");
    assert_eq!(similarity.to_array(), [2.0, 0.0, 1.0, 3.0, -4.0]);
    assert_eq!(
        serde_json::to_string(&similarity).expect("finite coefficients"),
        json
    );

    let accepted_cos = f32::from_bits(1.0_f32.to_bits() + 4);
    let similarity = Similarity::from_array([1.0, accepted_cos, 0.0, 0.0, 0.0])
        .expect("squared-norm defect below 1e-6");
    let encoded = serde_json::to_string(&similarity).expect("finite coefficients");
    let restored: Similarity =
        serde_json::from_str(&encoded).expect("admitted rotation stays valid");
    assert_eq!(restored.to_array(), similarity.to_array());
}

#[test]
fn similarity_inverse_rejects_translation_overflow() {
    let scaled = Similarity::new(
        positive!(f32::MIN_POSITIVE),
        Rotation::IDENTITY,
        Vec2::new(8.0, 0.0),
    )
    .expect("finite coefficients with invertible scale");
    assert!(scaled.inverse().is_none());

    let rotated = Similarity::new(
        Positive::ONE,
        Rotation::from_radians(core::f32::consts::FRAC_PI_4),
        Vec2::splat(f32::MAX),
    )
    .expect("finite coefficients with unit rotation");
    assert!(rotated.inverse().is_none());

    let finite = Similarity::new(Positive::ONE, Rotation::IDENTITY, Vec2::splat(f32::MAX))
        .expect("finite coefficients");
    assert_eq!(
        finite
            .inverse()
            .expect("negation remains finite")
            .translation(),
        Vec2::splat(-f32::MAX)
    );
}

#[test]
fn similarity_composition_rejects_translation_overflow() {
    let translated = Similarity::new(Positive::ONE, Rotation::IDENTITY, Vec2::new(f32::MAX, 0.0))
        .expect("finite translation");
    assert!(translated.then(translated).is_none());
    let scaled =
        Similarity::new(positive!(2.0), Rotation::IDENTITY, Vec2::ZERO).expect("normal scale");
    assert!(translated.then(scaled).is_none());
    assert_eq!(translated.then(Similarity::IDENTITY), Some(translated));
}

#[test]
fn similarity_fit_rejects_unrepresentable_translation() {
    let source = [Vec2::new(-f32::MAX, 0.0), Vec2::new(-f32::MAX / 2.0, 0.0)];
    let target = [Vec2::new(f32::MAX / 2.0, 0.0), Vec2::new(f32::MAX, 0.0)];
    assert_fit_rejects(&source, &target, &[1.0; 2]);
    assert!(Similarity::fit_uniform(field(&source), field(&target)).is_none());
    assert!(Similarity::fit_uniform_par(field(&source), field(&target)).is_none());

    let source = [Vec2::new(-4.0, 0.0), Vec2::new(-2.0, 0.0)];
    let target = [Vec2::new(2.0, 0.0), Vec2::new(4.0, 0.0)];
    for fitted in [
        Similarity::fit(&source, &target, &[1.0; 2]),
        Similarity::fit_par(&source, &target, &[1.0; 2]),
        Similarity::fit_uniform(field(&source), field(&target)),
        Similarity::fit_uniform_par(field(&source), field(&target)),
    ] {
        assert_eq!(
            fitted
                .expect("unit scale and finite translation")
                .to_array(),
            [1.0, 1.0, 0.0, 6.0, 0.0]
        );
    }
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
        // Normal scales whose reciprocals are subnormal.
        1.0e38,
        f32::MAX,
    ];

    for scale in invalid_scales {
        // Positive::new rejects nonpositive and non-finite values. The remaining invalid scales
        // exercise new's normality and reciprocal checks.
        if let Some(scale) = Positive::new(scale) {
            assert!(
                Similarity::new(scale, Rotation::IDENTITY, Vec2::ZERO).is_none(),
                "new must reject scale {scale}",
            );
        }
        assert!(
            Similarity::from_array([scale, 1.0, 0.0, 0.0, 0.0]).is_none(),
            "from_array must reject scale {scale}",
        );
    }
}

/// Generates similarities with bounded scale, angle and translation.
///
/// Scale lies in `0.1..10`, the angle in `-16..16` radians and each translation component in
/// `-1e2..1e2`.
fn similarity_strategy() -> impl Strategy<Value = Similarity> {
    (0.1_f32..10.0, -16.0_f32..16.0, -1e2_f32..1e2, -1e2_f32..1e2).prop_map(
        |(scale, radians, translate_x, translate_y)| {
            Similarity::new(
                Positive::new(scale).expect("the strategy's scale range is finite"),
                Rotation::from_radians(radians),
                Vec2::new(translate_x, translate_y),
            )
            .expect("the strategy's scale range is normal and positive")
        },
    )
}

/// Compares distance ratios on separated points under a bounded similarity.
///
/// Coordinates lie in `-1e3..1e3`. Requiring separation of at least one unit limits cancellation
/// relative to the reference distance. The assertion allows a relative error of 10⁻³.
#[property_test]
fn apply_scales_distances_uniformly(
    #[strategy = similarity_strategy()] similarity: Similarity,
    #[strategy = (-1e3_f32..1e3, -1e3_f32..1e3)] (left_x, left_y): (f32, f32),
    #[strategy = (-1e3_f32..1e3, -1e3_f32..1e3)] (right_x, right_y): (f32, f32),
) {
    let left = Vec2::new(left_x, left_y);
    let right = Vec2::new(right_x, right_y);
    prop_assume!(left.distance(right) >= 1.0);

    // Raw ratio: the reference computation is the test's own scalar mirror, and the assumption
    // above establishes the divisor at 1.0 or more.
    let ratio = similarity
        .apply(left)
        .distance(similarity.apply(right))
        .get()
        / left.distance(right).get();

    prop_assert!(
        (ratio - similarity.scale().get()).abs() <= 1e-3 * similarity.scale().get(),
        "distance ratio {} vs scale {}",
        ratio,
        similarity.scale(),
    );
}

/// Fits rounded similarity images of distinct jittered source points.
///
/// Every prefix of length two or more contains the first two points, whose x coordinates differ by
/// more than seven. A similarity needs distinct source points, not noncollinearity.
#[property_test]
fn fit_recovers_a_random_similarity(
    #[strategy = similarity_strategy()] similarity: Similarity,
    #[strategy = proptest::array::uniform8(-0.5_f32..0.5)] jitter: [f32; 8],
    #[strategy = 2_usize..=8] pairs: usize,
) {
    // varying the prefix length exercises full SIMD batches and every scalar-tail length
    let pool = [
        Vec2::new(jitter[0], jitter[1]),
        Vec2::new(8.0 + jitter[2], jitter[3]),
        Vec2::new(jitter[4], 8.0 + jitter[5]),
        Vec2::new(-8.0 + jitter[6], -8.0 + jitter[7]),
        Vec2::new(8.0 + jitter[1], 8.0 + jitter[6]),
        Vec2::new(-8.0 + jitter[3], jitter[0]),
        Vec2::new(jitter[7], -8.0 + jitter[2]),
        Vec2::new(-8.0 + jitter[5], 8.0 + jitter[4]),
    ];
    let source = &pool[..pairs];
    let target: Vec<Vec2> = source
        .iter()
        .map(|&point| similarity.apply(point))
        .collect();

    let fitted = Similarity::fit(source, &target, &[1.0_f32; 8][..pairs])
        .expect("well-spread points with an exact image are well-conditioned");

    // f32 rounding of the target images introduces working-precision error into the recovered
    // coefficients. The comparison allows for this error relative to coefficient magnitude.
    let expected = similarity.to_array();
    for (index, (actual, expected)) in fitted.to_array().into_iter().zip(expected).enumerate() {
        prop_assert!(
            (actual - expected).abs() <= 1e-3 * expected.abs().max(1.0),
            "coefficient {}: expected {}, got {}",
            index,
            expected,
            actual,
        );
    }
}

/// Checks reciprocal-scale closure across the accepted exponent range.
///
/// Mantissas in [1, 2) and exponents from −126 through 125 give positive normal scales below 2¹²⁶.
/// Reciprocals may round. Zero translation isolates scale closure from translation overflow.
#[property_test]
fn inverse_stays_inside_the_constructed_range(
    #[strategy = (1.0_f32..2.0, -126_i32..=125, -16.0_f32..16.0)] (mantissa, exponent, radians): (
        f32,
        i32,
        f32,
    ),
) {
    let scale = mantissa * 2.0_f32.powi(exponent);
    let similarity = Similarity::new(
        Positive::new(scale).expect("a normal positive scale is in domain"),
        Rotation::from_radians(radians),
        Vec2::ZERO,
    )
    .expect("a normal scale below 2^126 has a normal reciprocal");

    let inverse = similarity
        .inverse()
        .expect("zero translation remains finite");
    prop_assert!(
        Similarity::from_array(inverse.to_array()).is_some(),
        "inverse scale {} left the accepted range",
        inverse.scale(),
    );

    let double = inverse.inverse().expect("zero translation remains finite");
    prop_assert!(
        Similarity::from_array(double.to_array()).is_some(),
        "double-inverse scale {} left the accepted range",
        double.scale(),
    );
}

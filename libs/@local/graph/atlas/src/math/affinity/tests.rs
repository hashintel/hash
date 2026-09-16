#![expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: zero gradients for coincident pairs and exact \
              clip saturation are bit-precise contracts"
)]
#![expect(
    clippy::suboptimal_flops,
    reason = "the f64 reference implementations deliberately use plain multiply-add so they stay \
              independent of the FMA path under test"
)]

use proptest::{prop_assert, prop_assume, property_test, strategy::Strategy};

use super::{
    AffinityFitConfig,
    fit::{SampleGrid, fit_curve},
};
use crate::math::{
    AffinityCurve, NonNegative, Positive, Vec2, Vec2x4T, d_positive, non_negative, positive,
    tests::POINTS,
};

/// The rounded reference coefficient for spread 1.0 and minimum distance 0.1.
// umap-learn's find_ab_params uses the same 300-sample target, with recorded a ≈ 1.5769 and b ≈
// 0.8951
const CURVE_A: Positive = positive!(1.577);
/// The rounded reference exponent paired with [`CURVE_A`].
const CURVE_B: Positive = positive!(0.895);

/// Computes the target residual sum of squares with a separate `f64` loop.
///
/// The grid uses 300 samples over [0, 3σ], where σ is `spread`. The fixed constants match the
/// documented default grid without using the solver's grid construction.
fn reference_rss(spread: f64, minimum_distance: f64, curve_a: f64, curve_b: f64) -> f64 {
    let mut rss = 0.0;
    for index in 0..300_u16 {
        let distance = f64::from(index) * (3.0 * spread / 299.0);
        let target = if distance < minimum_distance {
            1.0
        } else {
            (-(distance - minimum_distance) / spread).exp()
        };
        let residual = 1.0 / (1.0 + curve_a * distance.powf(2.0 * curve_b)) - target;
        rss += residual * residual;
    }

    rss
}

/// Creates the curve with parameters [`CURVE_A`] and [`CURVE_B`].
fn curve() -> AffinityCurve {
    AffinityCurve::new(CURVE_A, CURVE_B)
}

/// Computes the attraction update using separate `f64` powers.
///
/// The squared distance is first computed in `f32`, then widened. The coefficient evaluates ρ^(b−1)
/// and ρᵇ separately before clipping. Inputs must meet [`Vec2::distance_squared`]'s finite-result
/// contract.
fn reference_attraction(from: Vec2, to: Vec2) -> Vec2 {
    let distance_squared = f64::from(from.distance_squared(to));
    if distance_squared <= 0.0 {
        return Vec2::ZERO;
    }

    let (curve_a, curve_b) = (f64::from(CURVE_A), f64::from(CURVE_B));
    let coefficient = -2.0 * curve_a * curve_b * distance_squared.powf(curve_b - 1.0)
        / (curve_a * distance_squared.powf(curve_b) + 1.0);

    reference_clipped(from, to, coefficient)
}

/// Computes the regularized repulsion update with a `f64` coefficient.
///
/// The squared distance is first computed in `f32`, then widened. Inputs must meet
/// [`Vec2::distance_squared`]'s finite-result contract.
fn reference_repulsion(from: Vec2, to: Vec2, repulsion_strength: f64) -> Vec2 {
    let distance_squared = f64::from(from.distance_squared(to));
    if distance_squared <= 0.0 {
        return Vec2::ZERO;
    }

    let (curve_a, curve_b) = (f64::from(CURVE_A), f64::from(CURVE_B));
    let coefficient = 2.0 * repulsion_strength * curve_b
        / ((0.001 + distance_squared) * (curve_a * distance_squared.powf(curve_b) + 1.0));

    reference_clipped(from, to, coefficient)
}

/// Scales widened `f32` differences, clips to ±4 and narrows to `f32`.
fn reference_clipped(from: Vec2, to: Vec2, coefficient: f64) -> Vec2 {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "narrowing the f64 reference result to the f32 domain under test is the \
                  comparison being made"
    )]
    let component = |delta: f32| (coefficient * f64::from(delta)).clamp(-4.0, 4.0) as f32;

    Vec2::new(component(from.x() - to.x()), component(from.y() - to.y()))
}

/// Asserts componentwise agreement within a relative/absolute tolerance.
///
/// Each absolute difference must be below 10⁻⁵ · max(|expected|, 1).
///
/// # Panics
///
/// Panics when either component fails the comparison, naming `context`.
#[track_caller]
fn assert_close(actual: Vec2, expected: Vec2, context: &str) {
    let tolerance = |reference: f32| 1e-5 * reference.abs().max(1.0);

    assert!(
        (actual.x() - expected.x()).abs() < tolerance(expected.x())
            && (actual.y() - expected.y()).abs() < tolerance(expected.y()),
        "{context}: expected {expected:?}, got {actual:?}",
    );
}

/// Anchor points for paired updates against [`POINTS`].
const ANCHORS: [Vec2; 4] = [
    Vec2::new(0.0, 0.0),
    Vec2::new(1.5, 6.5),
    Vec2::new(3.25, 5.0),
    Vec2::new(10.0, -3.0),
];

#[test]
fn fit_reproduces_the_reference_parameters() {
    let fitted = AffinityCurve::fit(positive!(1.0), positive!(0.1))
        .expect("the reference inputs are well-conditioned");

    assert!(
        (fitted.a() - CURVE_A).abs() < 0.01,
        "expected a close to {CURVE_A}, got {}",
        fitted.a(),
    );
    assert!(
        (fitted.b() - CURVE_B).abs() < 0.01,
        "expected b close to {CURVE_B}, got {}",
        fitted.b(),
    );
}

/// Compares the fitted objective with a local parameter grid.
///
/// The comparison varies a by a relative ±10⁻³ and b by an additive ±10⁻³, checking only the
/// resulting grid points.
#[test]
fn fit_result_is_a_local_minimum_of_the_sampled_objective() {
    let fitted = AffinityCurve::fit(positive!(1.0), positive!(0.1))
        .expect("the reference inputs are well-conditioned");
    let (curve_a, curve_b) = (f64::from(fitted.a()), f64::from(fitted.b()));
    let centre = reference_rss(1.0, 0.1, curve_a, curve_b);

    for epsilon_a in [-1e-3, 0.0, 1e-3] {
        for epsilon_b in [-1e-3, 0.0, 1e-3] {
            if epsilon_a == 0.0 && epsilon_b == 0.0 {
                continue;
            }

            let perturbed =
                reference_rss(1.0, 0.1, curve_a * (1.0 + epsilon_a), curve_b + epsilon_b);
            assert!(
                centre <= perturbed,
                "perturbation ({epsilon_a}, {epsilon_b}) scores {perturbed}, better than the \
                 fitted parameters' {centre}",
            );
        }
    }
}

#[test]
fn fit_recovers_the_parameters_of_an_exact_affinity_target() {
    // A target from the same curve family has zero real-arithmetic residual at its generating
    // parameters. This gives known coefficients to compare with the numerical solve.
    let (known_a, known_b) = (1.5_f64, 0.9_f64);
    let grid = SampleGrid::new(300, d_positive!(3.0 / 299.0));

    let (fitted_a, fitted_b) = fit_curve(grid, |distance| {
        1.0 / (1.0 + known_a * f64::from(distance).powf(2.0 * known_b))
    })
    .expect("an exact affinity target is well-conditioned");

    assert!(
        (f64::from(fitted_a) - known_a).abs() < 1e-6 * known_a,
        "expected a to recover {known_a}, got {fitted_a}",
    );
    assert!(
        (f64::from(fitted_b) - known_b).abs() < 1e-6 * known_b,
        "expected b to recover {known_b}, got {fitted_b}",
    );
}

/// Compares fitted parameters under a rescaling of distances.

#[test]
fn fit_scales_equivariantly_with_distance() {
    // In real arithmetic, replacing each distance d by sd gives a · s^(−2b) · (sd)^(2b) = a ·
    // d^(2b). Scaling spread and minimum distance by the same s preserves the target values at
    // corresponding grid points. Therefore (a · s^(−2b), b) is the corresponding fitted model. The
    // assertions allow numerical fitting and narrowing error.
    let base = AffinityCurve::fit(positive!(1.0), positive!(0.1))
        .expect("the reference inputs are well-conditioned");

    for scale in [0.5_f32, 2.0] {
        let scaled = AffinityCurve::fit(
            Positive::new(scale).expect("the scale is positive"),
            Positive::new(0.1 * scale).expect("the scaled distance is positive"),
        )
        .expect("scaling preserves validity");

        assert!(
            (scaled.b() - base.b()).abs() < 1e-4 * base.b(),
            "at scale {scale}: expected b to stay {}, got {}",
            base.b(),
            scaled.b(),
        );

        let expected_a = f64::from(base.a()) * f64::from(scale).powf(-2.0 * f64::from(base.b()));
        assert!(
            (f64::from(scaled.a()) - expected_a).abs() < 1e-3 * expected_a,
            "at scale {scale}: expected a to become {expected_a}, got {}",
            scaled.a(),
        );
    }
}

#[test]
fn fitted_curve_tracks_its_target_falloff() {
    let spread = 2.0_f32;
    let minimum_distance = 0.5_f32;
    let fitted = AffinityCurve::fit(
        Positive::new(spread).expect("the spread is positive"),
        Positive::new(minimum_distance).expect("the distance is positive"),
    )
    .expect("the inputs are well-conditioned");

    // Inside the minimum distance the target membership is 1.
    assert_eq!(fitted.affinity(NonNegative::ZERO), 1.0);
    assert!(fitted.affinity(non_negative!(0.25 * 0.25)) > 0.9);

    // Beyond it the curve tracks the exponential falloff to within
    // 0.05: the fit trades pointwise accuracy for least-squares
    // balance.
    for distance in [0.75_f32, 1.5, 3.0, 4.5] {
        let target = (-(distance - minimum_distance) / spread).exp();
        let affinity = fitted.affinity(
            NonNegative::new(distance * distance)
                .expect("the fixture distances have finite squares"),
        );
        assert!(
            (affinity - target).abs() < 0.05,
            "at distance {distance}: expected roughly {target}, got {affinity}",
        );
    }
}

#[test]
fn fit_rejects_a_minimum_distance_beyond_the_spread() {
    assert!(AffinityCurve::fit(positive!(1.0), positive!(2.0)).is_none());
}

#[test]
fn fit_with_rejects_degenerate_configs() {
    assert!(
        AffinityCurve::fit_with(
            positive!(1.0),
            positive!(0.1),
            AffinityFitConfig { samples: 7, .. }
        )
        .is_none()
    );
    assert!(
        AffinityCurve::fit_with(
            positive!(1.0),
            positive!(0.1),
            AffinityFitConfig { samples: 0, .. }
        )
        .is_none()
    );
    // The fit accepts the documented lower bound itself.
    assert!(
        AffinityCurve::fit_with(
            positive!(1.0),
            positive!(0.1),
            AffinityFitConfig { samples: 8, .. }
        )
        .is_some()
    );
}

#[test]
fn fit_is_stable_under_sample_refinement() {
    // the 10⁻² tolerance accommodates shifts in the minimizer as grid refinement changes the
    // sampled objective.
    let base = AffinityCurve::fit(positive!(1.0), positive!(0.1))
        .expect("the reference inputs are well-conditioned");

    for samples in [600_u16, 1200] {
        let refined = AffinityCurve::fit_with(
            positive!(1.0),
            positive!(0.1),
            AffinityFitConfig { samples, .. },
        )
        .expect("refining the grid preserves conditioning");

        assert!(
            (refined.a() - base.a()).abs() < 1e-2,
            "at {samples} samples: expected a near {}, got {}",
            base.a(),
            refined.a(),
        );
        assert!(
            (refined.b() - base.b()).abs() < 1e-2,
            "at {samples} samples: expected b near {}, got {}",
            base.b(),
            refined.b(),
        );
    }
}

#[test]
fn fit_accepts_a_minimum_distance_equal_to_the_spread() {
    assert!(AffinityCurve::fit(positive!(1.0), positive!(1.0)).is_some());
}

#[test]
fn fit_with_divides_the_range_into_samples_minus_one_steps() {
    // spacing 3/7 places the last of eight samples at distance 3 in real arithmetic. The explicit
    // grid uses the same rounded spacing and widened minimum distance as fit_with.
    let fitted = AffinityCurve::fit_with(
        positive!(1.0),
        positive!(0.1),
        AffinityFitConfig { samples: 8, .. },
    )
    .expect("eight samples meet the documented minimum");

    let minimum_distance = f64::from(0.1_f32);
    let (expected_a, expected_b) =
        fit_curve(SampleGrid::new(8, d_positive!(3.0 / 7.0)), |distance| {
            if distance < minimum_distance {
                1.0
            } else {
                (-(distance - minimum_distance)).exp()
            }
        })
        .expect("the explicit reference grid is well-conditioned");

    assert!(
        (f64::from(fitted.a()) - f64::from(expected_a)).abs() < 1e-4 * f64::from(expected_a),
        "expected a near {expected_a}, got {}",
        fitted.a(),
    );
    assert!(
        (f64::from(fitted.b()) - f64::from(expected_b)).abs() < 1e-4 * f64::from(expected_b),
        "expected b near {expected_b}, got {}",
        fitted.b(),
    );
}

#[test]
fn solver_refuses_a_target_that_poisons_only_the_objective() {
    // At distance zero both parameter partials vanish and are skipped. A NaN target there affects
    // only the residual sum of squares, while the normal matrix and right-hand side stay finite.
    let result = fit_curve(SampleGrid::new(300, d_positive!(3.0 / 299.0)), |distance| {
        if distance == 0.0 {
            f64::NAN
        } else {
            1.0 / (1.0 + 1.5 * f64::from(distance).powf(1.8))
        }
    });

    assert!(
        result.is_none(),
        "a poisoned objective must not fit: {result:?}",
    );
}

#[test]
fn solver_refuses_a_grid_that_cannot_move_the_exponent() {
    // The only positive sample is d = 1, where ln(1) = 0 makes every b-partial zero. The
    // corresponding normal-matrix diagonal is zero and multiplicative damping leaves it zero.
    // Therefore the determinant test rejects every retry.
    let result = fit_curve(SampleGrid::new(2, d_positive!(1.0)), |distance| {
        if distance == 0.0 { 1.0 } else { 0.3 }
    });

    assert!(
        result.is_none(),
        "a singular system must not fit: {result:?}",
    );
}

#[test]
fn solver_solves_a_well_conditioned_system_of_tiny_magnitudes() {
    // Tiny distances make the Jacobian entries small. Scaling the determinant floor by the product
    // of both damped diagonals tests relative cancellation without imposing an absolute
    // matrix-magnitude floor.
    let (fitted_a, fitted_b) = fit_curve(SampleGrid::new(4, d_positive!(1e-5)), |distance| {
        1.0 / (1.0 + 2.0 * f64::from(distance).powf(2.0))
    })
    .expect("a tiny well-conditioned grid still fits");

    assert!(
        (f64::from(fitted_a) - 2.0).abs() < 2e-3,
        "expected a to recover 2.0, got {fitted_a}",
    );
    assert!(
        (f64::from(fitted_b) - 1.0).abs() < 1e-3,
        "expected b to recover 1.0, got {fitted_b}",
    );
}

#[test]
fn fit_recovers_parameters_orders_of_magnitude_from_the_start() {
    // the target coefficient a spans several orders of magnitude from the fixed start at one
    for known_a in [100.0, 1e8] {
        let (fitted_a, fitted_b) =
            fit_curve(SampleGrid::new(300, d_positive!(3.0 / 299.0)), |distance| {
                1.0 / (1.0 + known_a * f64::from(distance).powf(2.0))
            })
            .expect("an exact affinity target is well-conditioned");

        assert!(
            (f64::from(fitted_a) - known_a).abs() < 1e-6 * known_a,
            "expected a to recover {known_a}, got {fitted_a}",
        );
        assert!(
            (f64::from(fitted_b) - 1.0).abs() < 1e-6,
            "expected b to recover 1.0, got {fitted_b}",
        );
    }
}

/// Terminates a fit to a target extending above the affinity range.

#[test]
fn solver_terminates_a_creep_along_the_domain_boundary() {
    // The target approaches 30 near zero, while the curve cannot exceed one. For positive
    // distances, decreasing a moves the curve toward one. This puts the fit near its
    // positive-parameter boundary, where damping and stopping thresholds matter.
    let result = fit_curve(SampleGrid::new(300, d_positive!(3.0 / 299.0)), |distance| {
        30.0 / (1.0 + 1.5 * f64::from(distance).powf(1.8))
    });

    assert!(
        result.is_some(),
        "the boundary creep must converge: {result:?}",
    );
}

#[test]
fn tiny_step_convergence_requires_both_parameters() {
    // At the initial (a, b) = (1, 1), this target gives a first damped a-step near 8 × 10⁻¹⁸ and a
    // b-step near 0.843. One component is well below the relative step threshold while the other
    // remains large. Both components must satisfy the threshold to stop.
    const TUNED_A: f64 = 0.931_322_701_934_099;

    let (fitted_a, fitted_b) = fit_curve(SampleGrid::new(12, d_positive!(0.25)), |distance| {
        1.0 / (1.0 + TUNED_A * f64::from(distance).powf(6.0))
    })
    .expect("an exact affinity target is well-conditioned");

    assert!(
        (f64::from(fitted_a) - TUNED_A).abs() < 1e-6 * TUNED_A,
        "expected a to recover {TUNED_A}, got {fitted_a}",
    );
    assert!(
        (f64::from(fitted_b) - 3.0).abs() < 3e-6,
        "expected b to recover 3.0, got {fitted_b}",
    );
}

#[test]
fn solver_rescues_a_walk_whose_steps_worsen_the_objective() {
    // the target a = b = 30 has a steep falloff over a grid extending to distance 30
    let (fitted_a, fitted_b) =
        fit_curve(SampleGrid::new(50, d_positive!(30.0 / 49.0)), |distance| {
            1.0 / (1.0 + 30.0 * f64::from(distance).powf(60.0))
        })
        .expect("a steep exact target still fits");

    assert!(
        (f64::from(fitted_a) - 30.0).abs() < 1e-3 * 30.0,
        "expected a to recover 30.0, got {fitted_a}",
    );
    assert!(
        (f64::from(fitted_b) - 30.0).abs() < 1e-3 * 30.0,
        "expected b to recover 30.0, got {fitted_b}",
    );
}

#[test]
fn affinity_overflowed_power() {
    let curve = AffinityCurve::new(Positive::ONE, positive!(2.0));

    assert_eq!(curve.affinity(non_negative!(f32::MAX)), 0.0);
}

#[test]
fn affinity_overflowed_denominator() {
    let curve = AffinityCurve::new(Positive::MAX, Positive::ONE);

    assert_eq!(curve.affinity(non_negative!(2.0)), 0.0);
}

#[test]
fn attraction_indeterminate_coefficient() {
    let curve = AffinityCurve::new(Positive::ONE, positive!(3.0));
    // ρ = 10²⁰ is finite, but ρ² overflows. The coefficient is then ∞/∞.
    let gradient = curve.attraction(Vec2::new(1e10, 0.0), Vec2::ZERO);

    assert!(gradient.x().is_nan());
    assert!(gradient.y().is_nan());
}

#[test]
fn affinity_is_one_at_zero_and_decreases() {
    let curve = curve();

    assert_eq!(curve.affinity(NonNegative::ZERO), 1.0);

    let mut previous = 1.0;
    for step in 1..=8_u8 {
        let affinity = curve.affinity(
            NonNegative::new(f32::from(step) * 2.0)
                .expect("the eight steps have finite positive distances"),
        );
        assert!(affinity < previous, "affinity must fall monotonically");
        assert!(affinity > 0.0);
        previous = affinity;
    }
}

#[test]
fn attraction_matches_f64_reference() {
    let curve = curve();

    for (from, to) in POINTS.into_iter().zip(ANCHORS) {
        assert_close(
            curve.attraction(from, to),
            reference_attraction(from, to),
            "scalar attraction",
        );
    }

    let batch = curve.attraction_x4(Vec2x4T::from(POINTS), Vec2x4T::from(ANCHORS));
    for (index, (from, to)) in POINTS.into_iter().zip(ANCHORS).enumerate() {
        assert_close(
            batch.get(index),
            reference_attraction(from, to),
            "batched attraction",
        );
    }
}

#[test]
fn repulsion_matches_f64_reference() {
    let curve = curve();
    let strength = NonNegative::ONE;

    for (from, to) in POINTS.into_iter().zip(ANCHORS) {
        assert_close(
            curve.repulsion(from, to, strength),
            reference_repulsion(from, to, f64::from(strength)),
            "scalar repulsion",
        );
    }

    let batch = curve.repulsion_x4(Vec2x4T::from(POINTS), Vec2x4T::from(ANCHORS), strength);
    for (index, (from, to)) in POINTS.into_iter().zip(ANCHORS).enumerate() {
        assert_close(
            batch.get(index),
            reference_repulsion(from, to, f64::from(strength)),
            "batched repulsion",
        );
    }
}

#[test]
fn gradients_point_in_the_right_direction() {
    let curve = curve();
    let from = Vec2::new(3.0, 1.0);
    let to = Vec2::new(-1.0, 4.0);

    // Attraction descends from `from` toward `to`: against the difference.
    let attraction = curve.attraction(from, to);
    assert!(attraction.dot(from - to) < 0.0);

    // Repulsion pushes `from` away from `to`: along the difference.
    let repulsion = curve.repulsion(from, to, NonNegative::ONE);
    assert!(repulsion.dot(from - to) > 0.0);
}

#[test]
fn coincident_pairs_receive_no_gradient() {
    let curve = curve();
    let point = Vec2::new(2.5, -1.5);

    assert_eq!(curve.attraction(point, point), Vec2::ZERO);
    assert_eq!(curve.repulsion(point, point, NonNegative::ONE), Vec2::ZERO);

    // A batch with one coincident lane zeroes only that lane.
    let mut anchors = ANCHORS;
    anchors[2] = POINTS[2];
    let batch = curve.attraction_x4(Vec2x4T::from(POINTS), Vec2x4T::from(anchors));
    assert_eq!(batch.get(2), Vec2::ZERO);
    assert!(batch.get(0) != Vec2::ZERO);
}

#[test]
fn near_coincident_repulsion_saturates_the_clip() {
    let curve = curve();
    // With ρ ≈ 10⁻⁴ and γ = 1, the denominator is about 0.0011 and the numerator about 1.79. The
    // coefficient is about 1600, giving an x update near 16 before clipping to 4.
    let from = Vec2::new(0.01, 0.0);
    let to = Vec2::ZERO;

    let gradient = curve.repulsion(from, to, NonNegative::ONE);
    assert_eq!(gradient.x(), AffinityCurve::GRADIENT_CLIP);
    assert_eq!(gradient.y(), 0.0);

    let batch = curve.repulsion_x4(
        Vec2x4T::from([from; 4]),
        Vec2x4T::from([to; 4]),
        NonNegative::ONE,
    );
    assert_eq!(batch.get(0), gradient);
}

#[test]
fn gradients_stay_finite_at_extreme_distances() {
    let curve = curve();
    let far = Vec2::new(1e18, -1e18);

    assert!(curve.attraction(far, Vec2::ZERO).is_finite());
    assert!(
        curve
            .repulsion(far, Vec2::ZERO, NonNegative::ONE)
            .is_finite()
    );
    assert!(curve.affinity(non_negative!(f32::MAX)).is_finite());

    let batch = curve.attraction_x4(Vec2x4T::from([far; 4]), Vec2x4T::from([Vec2::ZERO; 4]));
    assert!(batch.get(0).is_finite());
}

/// Generates finite points with coordinates in `-1e3..1e3`.
fn point_strategy() -> impl Strategy<Value = Vec2> {
    (-1e3_f32..1e3, -1e3_f32..1e3).prop_map(|(x, y)| Vec2::new(x, y))
}

/// Generates a four-point batch from [`point_strategy`].
fn point_array_strategy() -> impl Strategy<Value = [Vec2; 4]> {
    proptest::array::uniform4(point_strategy())
}

/// Generates curves with a in `1e-3..1e3` and b in `0.1..5`.
fn curve_strategy() -> impl Strategy<Value = AffinityCurve> {
    (1e-3_f32..1e3, 0.1_f32..5.0).prop_map(|(curve_a, curve_b)| {
        AffinityCurve::new(
            Positive::new(curve_a).expect("the strategy's coefficient is positive and finite"),
            Positive::new(curve_b).expect("the strategy's exponent is positive and finite"),
        )
    })
}

/// Asserts componentwise agreement under a relative tolerance and absolute floor.
///
/// The allowance is 10⁻³ · max(|expected|, 10⁻³), giving an absolute floor of 10⁻⁶. Scalar and SIMD
/// paths use different distance grouping and power approximations. This is the fixture's comparison
/// tolerance, not a certified ULP bound for either power implementation.
///
/// # Panics
///
/// Panics when either component fails the comparison, naming `context`.
#[track_caller]
fn assert_lane_close(actual: Vec2, expected: Vec2, context: &str) {
    let tolerance = |reference: f32| 1e-3 * reference.abs().max(1e-3);

    assert!(
        (actual.x() - expected.x()).abs() <= tolerance(expected.x())
            && (actual.y() - expected.y()).abs() <= tolerance(expected.y()),
        "{context}: expected {expected:?}, got {actual:?}",
    );
}

/// Samples affinity range and approximate ordering on bounded squared distances.
///
/// With ρ < 10⁶, a < 10³ and b < 5, the real-arithmetic product aρᵇ is below 10³³ for ρ ≥ 1,
/// keeping it within `f32` range. Ordering uses a relative tolerance.
#[property_test]
fn affinity_is_a_monotone_probability(
    #[strategy = curve_strategy()] curve: AffinityCurve,
    #[strategy = 0.0_f32..1e6] first: f32,
    #[strategy = 0.0_f32..1e6] second: f32,
) {
    let first =
        NonNegative::new(first).expect("the strategy's distances are non-negative and finite");
    let second =
        NonNegative::new(second).expect("the strategy's distances are non-negative and finite");
    let (near, far) = if first <= second {
        (first, second)
    } else {
        (second, first)
    };

    for distance_squared in [near, far] {
        let affinity = curve.affinity(distance_squared);
        prop_assert!(affinity > 0.0);
        prop_assert!(affinity <= 1.0);
    }

    // allow an ordering discrepancy up to 8 · EPSILON times the near affinity
    let slack = 8.0 * f32::EPSILON * curve.affinity(near);
    prop_assert!(
        curve.affinity(near) >= curve.affinity(far) - slack,
        "affinity({}) = {} below affinity({}) = {}",
        near,
        curve.affinity(near),
        far,
        curve.affinity(far),
    );
}

/// Checks attraction and repulsion signs relative to the point difference.
///
/// The squared-distance floor 10⁻⁶ excludes computed-coincident pairs. The assertions test
/// dot-product signs, without requiring clipped updates to remain parallel to the difference.
#[property_test]
fn gradients_align_with_the_difference_vector(
    #[strategy = point_strategy()] from: Vec2,
    #[strategy = point_strategy()] to: Vec2,
) {
    prop_assume!(from.distance_squared(to) >= 1e-6);
    let curve = curve();
    let difference = from - to;

    prop_assert!(curve.attraction(from, to).dot(difference) < 0.0);
    prop_assert!(curve.repulsion(from, to, NonNegative::ONE).dot(difference) > 0.0);
}

#[property_test]
fn attraction_x4_matches_scalar_attraction_per_lane(
    #[strategy = point_array_strategy()] from: [Vec2; 4],
    #[strategy = point_array_strategy()] to: [Vec2; 4],
) {
    let curve = curve();

    let batch = curve.attraction_x4(Vec2x4T::from(from), Vec2x4T::from(to));
    for (index, (from, to)) in from.into_iter().zip(to).enumerate() {
        assert_lane_close(
            batch.get(index),
            curve.attraction(from, to),
            "batched attraction",
        );
    }
}

#[property_test]
fn repulsion_x4_matches_scalar_repulsion_per_lane(
    #[strategy = point_array_strategy()] from: [Vec2; 4],
    #[strategy = point_array_strategy()] to: [Vec2; 4],
    #[strategy = 1e-2_f32..1e2] strength: f32,
) {
    let curve = curve();
    let strength =
        NonNegative::new(strength).expect("the strategy's strength is positive and finite");

    let batch = curve.repulsion_x4(Vec2x4T::from(from), Vec2x4T::from(to), strength);
    for (index, (from, to)) in from.into_iter().zip(to).enumerate() {
        assert_lane_close(
            batch.get(index),
            curve.repulsion(from, to, strength),
            "batched repulsion",
        );
    }
}

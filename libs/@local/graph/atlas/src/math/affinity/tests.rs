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
use crate::math::{AffinityCurve, Vec2, Vec2x4T, tests::POINTS};

/// The reference parameters for spread 1.0, minimum distance 0.1.
// Provenance: umap-learn's `find_ab_params(spread=1.0, min_dist=0.1)`
// yields a ≈ 1.5769, b ≈ 0.8951 over the same 300-sample grid.
const CURVE_A: f32 = 1.577;
const CURVE_B: f32 = 0.895;

/// Independent f64 reference for the fit objective.
///
/// The residual sum of squares of a candidate curve against the target falloff sampled on the
/// crate's default grid, 300 samples over `[0, 3 · spread]`.
///
/// This reference spells the grid constants out by hand, so it fails when the documented default
/// contract changes.
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

fn curve() -> AffinityCurve {
    AffinityCurve::new(CURVE_A, CURVE_B).expect("reference parameters are positive and finite")
}

/// Independent f64 reference for the attraction coefficient.
///
/// Transcribed from the pre-SIMD scalar kernel rather than from the implementation under test.
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

/// Independent f64 reference for the repulsion coefficient.
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

fn reference_clipped(from: Vec2, to: Vec2, coefficient: f64) -> Vec2 {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "narrowing the f64 reference result to the f32 domain under test is the \
                  comparison being made"
    )]
    let component = |delta: f32| (coefficient * f64::from(delta)).clamp(-4.0, 4.0) as f32;

    Vec2::new(component(from.x() - to.x()), component(from.y() - to.y()))
}

#[track_caller]
fn assert_close(actual: Vec2, expected: Vec2, context: &str) {
    let tolerance = |reference: f32| 1e-5 * reference.abs().max(1.0);

    assert!(
        (actual.x() - expected.x()).abs() < tolerance(expected.x())
            && (actual.y() - expected.y()).abs() < tolerance(expected.y()),
        "{context}: expected {expected:?}, got {actual:?}",
    );
}

const ANCHORS: [Vec2; 4] = [
    Vec2::new(0.0, 0.0),
    Vec2::new(1.5, 6.5),
    Vec2::new(3.25, 5.0),
    Vec2::new(10.0, -3.0),
];

#[test]
fn fit_reproduces_the_reference_parameters() {
    let fitted = AffinityCurve::fit(1.0, 0.1).expect("the reference inputs are well-conditioned");

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

#[test]
fn fit_result_is_a_local_minimum_of_the_sampled_objective() {
    // Local-optimality certificate: the fitted parameters score at least
    // as well as every small perturbation on a grid around them, against
    // the same sampled objective recomputed independently in f64.
    let fitted = AffinityCurve::fit(1.0, 0.1).expect("the reference inputs are well-conditioned");
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
    // Exact-recovery certificate: when the sampled target IS an affinity
    // curve, the zero-residual minimum sits at its parameters and the
    // solver must return them. This drives the internal solver directly;
    // the public API only exposes the exponential-falloff target, which
    // no affinity curve reproduces exactly.
    let (known_a, known_b) = (1.5_f64, 0.9_f64);
    let grid = SampleGrid::new(300, 3.0 / 299.0);

    let (fitted_a, fitted_b) = fit_curve(grid, |distance| {
        1.0 / (1.0 + known_a * distance.powf(2.0 * known_b))
    })
    .expect("an exact affinity target is well-conditioned");

    assert!(
        (fitted_a - known_a).abs() < 1e-6 * known_a,
        "expected a to recover {known_a}, got {fitted_a}",
    );
    assert!(
        (fitted_b - known_b).abs() < 1e-6 * known_b,
        "expected b to recover {known_b}, got {fitted_b}",
    );
}

#[test]
fn fit_scales_equivariantly_with_distance() {
    // Scaling-law certificate: scaling all distances by `s` maps a
    // solution `(a, b)` to `(a · s^(-2b), b)` exactly, and
    // `fit(s · spread, s · minimum_distance)` samples the same target at
    // distances scaled by `s`.
    let base = AffinityCurve::fit(1.0, 0.1).expect("the reference inputs are well-conditioned");

    for scale in [0.5_f32, 2.0] {
        let scaled = AffinityCurve::fit(scale, 0.1 * scale).expect("scaling preserves validity");

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
    let fitted =
        AffinityCurve::fit(spread, minimum_distance).expect("the inputs are well-conditioned");

    // Inside the minimum distance the target membership is 1.
    assert_eq!(fitted.affinity(0.0), 1.0);
    assert!(fitted.affinity(0.25 * 0.25) > 0.9);

    // Beyond it the curve tracks the exponential falloff to within
    // 0.05: the fit trades pointwise accuracy for least-squares
    // balance.
    for distance in [0.75_f32, 1.5, 3.0, 4.5] {
        let target = (-(distance - minimum_distance) / spread).exp();
        let affinity = fitted.affinity(distance * distance);
        assert!(
            (affinity - target).abs() < 0.05,
            "at distance {distance}: expected roughly {target}, got {affinity}",
        );
    }
}

#[test]
fn fit_rejects_degenerate_inputs() {
    // Degenerate spread values.
    assert!(AffinityCurve::fit(0.0, 0.1).is_none());
    assert!(AffinityCurve::fit(-1.0, 0.1).is_none());
    assert!(AffinityCurve::fit(f32::NAN, 0.1).is_none());
    assert!(AffinityCurve::fit(f32::INFINITY, 0.1).is_none());

    // Degenerate minimum distances, including one beyond the spread.
    assert!(AffinityCurve::fit(1.0, 0.0).is_none());
    assert!(AffinityCurve::fit(1.0, -0.1).is_none());
    assert!(AffinityCurve::fit(1.0, f32::NAN).is_none());
    assert!(AffinityCurve::fit(1.0, f32::INFINITY).is_none());
    assert!(AffinityCurve::fit(1.0, 2.0).is_none());
}

#[test]
fn fit_with_rejects_degenerate_configs() {
    // Too few samples for the two-parameter fit.
    assert!(AffinityCurve::fit_with(1.0, 0.1, AffinityFitConfig { samples: 7, .. }).is_none());
    assert!(AffinityCurve::fit_with(1.0, 0.1, AffinityFitConfig { samples: 0, .. }).is_none());
    // The fit accepts the documented lower bound itself.
    assert!(AffinityCurve::fit_with(1.0, 0.1, AffinityFitConfig { samples: 8, .. }).is_some());

    // Degenerate ranges.
    for range_in_spreads in [0.0, -3.0, f32::NAN, f32::INFINITY] {
        assert!(
            AffinityCurve::fit_with(
                1.0,
                0.1,
                AffinityFitConfig {
                    range_in_spreads,
                    ..
                }
            )
            .is_none(),
            "range {range_in_spreads} must be rejected",
        );
    }
}

#[test]
fn fit_is_stable_under_sample_refinement() {
    // Refining the discretization must not move the minimizer: the
    // sampled objective converges to its continuous limit.
    let base = AffinityCurve::fit(1.0, 0.1).expect("the reference inputs are well-conditioned");

    for samples in [600_u16, 1200] {
        let refined = AffinityCurve::fit_with(1.0, 0.1, AffinityFitConfig { samples, .. })
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
    // The documented domain excludes only `minimum_distance > spread`;
    // equality is the boundary case that stays inside.
    assert!(AffinityCurve::fit(1.0, 1.0).is_some());
}

#[test]
fn fit_with_divides_the_range_into_samples_minus_one_steps() {
    // The spacing divides the sampled range by `samples - 1`, not by
    // `samples`, and the final sample therefore sits exactly at the range
    // end. The explicit grid spells that spacing out; fitting over it runs
    // the identical solver on identical inputs, so the results agree to
    // narrowing precision. A coarse eight-sample grid makes any spacing
    // drift orders of magnitude wider than the tolerance.
    let fitted = AffinityCurve::fit_with(1.0, 0.1, AffinityFitConfig { samples: 8, .. })
        .expect("eight samples meet the documented minimum");

    let minimum_distance = f64::from(0.1_f32);
    let (expected_a, expected_b) = fit_curve(SampleGrid::new(8, 3.0 / 7.0), |distance| {
        if distance < minimum_distance {
            1.0
        } else {
            (-(distance - minimum_distance)).exp()
        }
    })
    .expect("the explicit reference grid is well-conditioned");

    assert!(
        (f64::from(fitted.a()) - expected_a).abs() < 1e-4 * expected_a,
        "expected a near {expected_a}, got {}",
        fitted.a(),
    );
    assert!(
        (f64::from(fitted.b()) - expected_b).abs() < 1e-4 * expected_b,
        "expected b near {expected_b}, got {}",
        fitted.b(),
    );
}

#[test]
fn solver_refuses_a_target_that_poisons_only_the_objective() {
    // The zero-distance sample contributes its residual and nothing else
    // (its partials are skipped), so a NaN target at zero drives exactly
    // one accumulated sum non-finite: the residual sum of squares. The
    // finiteness gate is the only check standing between that poisoned
    // objective and a solver that converges happily on the remaining
    // samples.
    let result = fit_curve(SampleGrid::new(300, 3.0 / 299.0), |distance| {
        if distance == 0.0 {
            f64::NAN
        } else {
            1.0 / (1.0 + 1.5 * distance.powf(1.8))
        }
    });

    assert!(
        result.is_none(),
        "a poisoned objective must not fit: {result:?}",
    );
}

#[test]
fn solver_keeps_parameters_strictly_positive() {
    // A constant target above one rewards a negative `a`: the curve only
    // exceeds one where `a · d^(2b)` is below zero. Each step out of the
    // positive quadrant is a failed step, so whatever the solver returns
    // (here it fails to converge) stays inside the domain `new` accepts.
    let result = fit_curve(SampleGrid::new(300, 1.0 / 299.0), |_| 1.4);

    assert!(
        result.is_none_or(|(a, b)| a > 0.0 && b > 0.0),
        "parameters left the positive domain: {result:?}",
    );
}

#[test]
fn solver_refuses_a_grid_that_cannot_move_the_exponent() {
    // With distance one as the only positive sample, `ln 1 = 0` zeroes
    // every `b`-partial: the normal matrix's `b` diagonal is exactly zero,
    // and multiplicative damping keeps it zero. The damped solve must
    // refuse the singular system at every retry rather than invent a step
    // from an additively repaired diagonal.
    let result = fit_curve(SampleGrid::new(2, 1.0), |distance| {
        if distance == 0.0 { 1.0 } else { 0.3 }
    });

    assert!(
        result.is_none(),
        "a singular system must not fit: {result:?}",
    );
}

#[test]
fn solver_solves_a_well_conditioned_system_of_tiny_magnitudes() {
    // Distances of 1e-5 shrink every normal-equation entry by tens of
    // orders of magnitude while the system stays perfectly solvable. The
    // cancellation floor scales with the product of BOTH damped diagonals;
    // a floor divided by either diagonal inflates astronomically here and
    // refuses every step.
    let (fitted_a, fitted_b) = fit_curve(SampleGrid::new(4, 1e-5), |distance| {
        1.0 / (1.0 + 2.0 * distance.powf(2.0))
    })
    .expect("a tiny well-conditioned grid still fits");

    assert!(
        (fitted_a - 2.0).abs() < 2e-3,
        "expected a to recover 2.0, got {fitted_a}",
    );
    assert!(
        (fitted_b - 1.0).abs() < 1e-3,
        "expected b to recover 1.0, got {fitted_b}",
    );
}

#[test]
fn fit_recovers_parameters_orders_of_magnitude_from_the_start() {
    // From the fixed start (1, 1), an exact target at a = 100 or a = 1e8
    // is reached only through the damping controller's full cycle:
    // rejected overshoots raise the damping multiplicatively, accepted
    // steps relax it, and the tiny-step exit measures each step against
    // its own parameter. Flipping or rescaling any of those strands the
    // walk short of recovery.
    for known_a in [100.0, 1e8] {
        let (fitted_a, fitted_b) = fit_curve(SampleGrid::new(300, 3.0 / 299.0), |distance| {
            1.0 / (1.0 + known_a * distance.powf(2.0))
        })
        .expect("an exact affinity target is well-conditioned");

        assert!(
            (fitted_a - known_a).abs() < 1e-6 * known_a,
            "expected a to recover {known_a}, got {fitted_a}",
        );
        assert!(
            (fitted_b - 1.0).abs() < 1e-6,
            "expected b to recover 1.0, got {fitted_b}",
        );
    }
}

#[test]
fn solver_terminates_a_creep_along_the_domain_boundary() {
    // A target thirty times the curve's whole range pulls `a` toward the
    // zero boundary it may never cross: every Newton step overshoots into
    // the forbidden quadrant, and only a damped fraction survives. The
    // walk ends through the improvement difference falling under its
    // relative tolerance. Additive damping growth on domain rejections
    // and both broken improvement readings leave the creep unfinished.
    let result = fit_curve(SampleGrid::new(300, 3.0 / 299.0), |distance| {
        30.0 / (1.0 + 1.5 * distance.powf(1.8))
    });

    assert!(
        result.is_some_and(|(a, b)| a > 0.0 && b > 0.0),
        "the boundary creep must converge: {result:?}",
    );
}

#[test]
fn tiny_step_convergence_requires_both_parameters() {
    // The `a` parameter is bisected so the first damped step moves `a` by
    // under 1e-17 (seven orders inside the relative tolerance) while
    // moving `b` by 0.84. An exit that accepts either tiny component
    // alone, or measures `b` against an absolute threshold, stops at the
    // start (1, 1); the conjunction of relative thresholds walks on and
    // recovers the target exactly.
    const TUNED_A: f64 = 0.931_322_701_934_099;

    let (fitted_a, fitted_b) = fit_curve(SampleGrid::new(12, 0.25), |distance| {
        1.0 / (1.0 + TUNED_A * distance.powf(6.0))
    })
    .expect("an exact affinity target is well-conditioned");

    assert!(
        (fitted_a - TUNED_A).abs() < 1e-6 * TUNED_A,
        "expected a to recover {TUNED_A}, got {fitted_a}",
    );
    assert!(
        (fitted_b - 3.0).abs() < 3e-6,
        "expected b to recover 3.0, got {fitted_b}",
    );
}

#[test]
fn solver_rescues_a_walk_whose_steps_worsen_the_objective() {
    // A steep falloff thirty spreads out makes whole stretches of proposed
    // steps worsen the objective before the walk finds the descent again.
    // The rescue lives in the rejection damping growing multiplicatively:
    // sixteen additive bumps cap the damping near fifty, and the walk
    // never re-enters the acceptable region.
    let (fitted_a, fitted_b) = fit_curve(SampleGrid::new(50, 30.0 / 49.0), |distance| {
        1.0 / (1.0 + 30.0 * distance.powf(60.0))
    })
    .expect("a steep exact target still fits");

    assert!(
        (fitted_a - 30.0).abs() < 1e-3 * 30.0,
        "expected a to recover 30.0, got {fitted_a}",
    );
    assert!(
        (fitted_b - 30.0).abs() < 1e-3 * 30.0,
        "expected b to recover 30.0, got {fitted_b}",
    );
}

#[test]
fn new_rejects_degenerate_parameters() {
    assert!(AffinityCurve::new(1.0, 1.0).is_some());
    assert!(AffinityCurve::new(0.0, 1.0).is_none());
    assert!(AffinityCurve::new(1.0, 0.0).is_none());
    assert!(AffinityCurve::new(-1.0, 1.0).is_none());
    assert!(AffinityCurve::new(f32::NAN, 1.0).is_none());
    assert!(AffinityCurve::new(1.0, f32::INFINITY).is_none());
}

#[test]
fn affinity_is_one_at_zero_and_decreases() {
    let curve = curve();

    assert_eq!(curve.affinity(0.0), 1.0);

    let mut previous = 1.0;
    for step in 1..=8_u8 {
        let affinity = curve.affinity(f32::from(step) * 2.0);
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
    let strength = 1.0;

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
    let repulsion = curve.repulsion(from, to, 1.0);
    assert!(repulsion.dot(from - to) > 0.0);
}

#[test]
fn coincident_pairs_receive_no_gradient() {
    let curve = curve();
    let point = Vec2::new(2.5, -1.5);

    assert_eq!(curve.attraction(point, point), Vec2::ZERO);
    assert_eq!(curve.repulsion(point, point, 1.0), Vec2::ZERO);

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
    // Close along x, but far enough that the coefficient (capped near
    // 2 · γ · b / 0.001 by the repulsion guard) times the difference
    // still exceeds the clip: 0.01 · ~1600 is ~16, clamped to 4.
    let from = Vec2::new(0.01, 0.0);
    let to = Vec2::ZERO;

    let gradient = curve.repulsion(from, to, 1.0);
    assert_eq!(gradient.x(), AffinityCurve::GRADIENT_CLIP);
    assert_eq!(gradient.y(), 0.0);

    let batch = curve.repulsion_x4(Vec2x4T::from([from; 4]), Vec2x4T::from([to; 4]), 1.0);
    assert_eq!(batch.get(0), gradient);
}

#[test]
fn gradients_stay_finite_at_extreme_distances() {
    let curve = curve();
    let far = Vec2::new(1e18, -1e18);

    assert!(curve.attraction(far, Vec2::ZERO).is_finite());
    assert!(curve.repulsion(far, Vec2::ZERO, 1.0).is_finite());
    assert!(curve.affinity(f32::MAX).is_finite());

    let batch = curve.attraction_x4(Vec2x4T::from([far; 4]), Vec2x4T::from([Vec2::ZERO; 4]));
    assert!(batch.get(0).is_finite());
}

/// A point with coordinates bounded to the well-conditioned `-1e3..1e3` range.
///
/// The example-based tests above pin extreme-distance behaviour.
fn point_strategy() -> impl Strategy<Value = Vec2> {
    (-1e3_f32..1e3, -1e3_f32..1e3).prop_map(|(x, y)| Vec2::new(x, y))
}

/// Arbitrary in-range points, one per batch lane.
fn point_array_strategy() -> impl Strategy<Value = [Vec2; 4]> {
    proptest::array::uniform4(point_strategy())
}

/// Curve parameters bounded to `a` in `1e-3..1e3` and `b` in `0.1..5`.
///
/// Where `a · d^(2b)` stays finite over the strategy's distances.
fn curve_strategy() -> impl Strategy<Value = AffinityCurve> {
    (1e-3_f32..1e3, 0.1_f32..5.0).prop_map(|(curve_a, curve_b)| {
        AffinityCurve::new(curve_a, curve_b).expect("the strategy's ranges are positive and finite")
    })
}

/// Asserts a batch lane agrees with its scalar twin within a relative tolerance of `1e-3`.
///
/// A matching absolute floor covers near-zero gradients.
///
/// The bound covers the batch kernels' vectorized `d^(2b)` power, which composes sleef's 3.5-ulp
/// `exp2`/`log2` stages. The exponent's absolute error grows with `|log2(d^2)|`, so the power's
/// relative error reaches a few times `1e-5` over the strategy's distance range, well inside
/// `1e-3`, against the scalar path's 0.5-ulp libm `powf`.
#[track_caller]
fn assert_lane_close(actual: Vec2, expected: Vec2, context: &str) {
    let tolerance = |reference: f32| 1e-3 * reference.abs().max(1e-3);

    assert!(
        (actual.x() - expected.x()).abs() <= tolerance(expected.x())
            && (actual.y() - expected.y()).abs() <= tolerance(expected.y()),
        "{context}: expected {expected:?}, got {actual:?}",
    );
}

/// The affinity lies in `(0, 1]` and is monotone non-increasing in the squared distance.
///
/// Monotonicity holds up to a few ulps of libm `powf` rounding. This test bounds squared distances
/// to `0..1e6`, where `a · d^(2b)` stays finite for every curve in the strategy.
#[property_test]
fn affinity_is_a_monotone_probability(
    #[strategy = curve_strategy()] curve: AffinityCurve,
    #[strategy = 0.0_f32..1e6] first: f32,
    #[strategy = 0.0_f32..1e6] second: f32,
) {
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

    // `powf` is accurate to a fraction of an ulp but not proven
    // monotone; the slack admits a few ulps of the result without
    // accepting a real ordering violation.
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

/// Attraction pulls `from` toward `to`, and repulsion pushes it away.
///
/// For distinct points, the attraction gradient is anti-parallel to the difference vector and the
/// repulsion gradient is parallel. The separation floor keeps the coefficients away from underflow.
#[property_test]
fn gradients_align_with_the_difference_vector(
    #[strategy = point_strategy()] from: Vec2,
    #[strategy = point_strategy()] to: Vec2,
) {
    prop_assume!(from.distance_squared(to) >= 1e-6);
    let curve = curve();
    let difference = from - to;

    prop_assert!(curve.attraction(from, to).dot(difference) < 0.0);
    prop_assert!(curve.repulsion(from, to, 1.0).dot(difference) > 0.0);
}

/// The batch attraction kernel agrees with the scalar kernel in every lane.
///
/// This crosses the sleef `exp2`/`log2` pow path against the scalar libm `powf` path over the whole
/// in-range input space. The tolerance follows the kernel's documented 3.5-ulp-stage bound.
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

/// The batch repulsion kernel agrees with the scalar kernel in every lane.
///
/// The same pow-path bound as attraction applies.
#[property_test]
fn repulsion_x4_matches_scalar_repulsion_per_lane(
    #[strategy = point_array_strategy()] from: [Vec2; 4],
    #[strategy = point_array_strategy()] to: [Vec2; 4],
    #[strategy = 1e-2_f32..1e2] strength: f32,
) {
    let curve = curve();

    let batch = curve.repulsion_x4(Vec2x4T::from(from), Vec2x4T::from(to), strength);
    for (index, (from, to)) in from.into_iter().zip(to).enumerate() {
        assert_lane_close(
            batch.get(index),
            curve.repulsion(from, to, strength),
            "batched repulsion",
        );
    }
}

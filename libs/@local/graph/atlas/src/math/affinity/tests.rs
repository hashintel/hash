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

use crate::math::{AffinityCurve, Vec2, Vec2x4T, tests::POINTS};

/// The umap-learn reference parameters for spread 1.0, `min_dist` 0.1.
const CURVE_A: f32 = 1.577;
const CURVE_B: f32 = 0.895;

fn curve() -> AffinityCurve {
    AffinityCurve::new(CURVE_A, CURVE_B).expect("reference parameters are positive and finite")
}

/// Independent f64 reference for the attraction coefficient, transcribed
/// from the pre-SIMD scalar kernel rather than from the implementation
/// under test.
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
    // 2 * gamma * b / 0.001 by the repulsion guard) times the difference
    // still exceeds the clip: 0.01 * ~1600 is ~16, clamped to 4.
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

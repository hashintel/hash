#![expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: lane order and layout round trips are \
              bit-precise contracts"
)]

use core::simd::Simd;

use proptest::{prop_assert, prop_assert_eq, property_test, strategy::Strategy};

use crate::math::{Vec2, Vec2x4, Vec2x4T, tests::POINTS};

#[test]
fn arithmetic_operators_are_component_wise() {
    let left = Vec2::new(1.0, -2.0);
    let right = Vec2::new(0.5, 4.0);

    assert_eq!(left + right, Vec2::new(1.5, 2.0));
    assert_eq!(left - right, Vec2::new(0.5, -6.0));
    assert_eq!(-left, Vec2::new(-1.0, 2.0));
    assert_eq!(left * right, Vec2::new(0.5, -8.0));
    assert_eq!(left * 2.0, Vec2::new(2.0, -4.0));
    assert_eq!(2.0 * left, left * 2.0);
    assert_eq!(left / 2.0, Vec2::new(0.5, -1.0));

    let mut assigned = left;
    assigned += right;
    assigned -= right;
    assigned *= 2.0;
    assigned /= 2.0;
    assert_eq!(assigned, left);
}

#[test]
fn dot_and_perp_dot_match_known_values() {
    let x_axis = Vec2::new(1.0, 0.0);
    let y_axis = Vec2::new(0.0, 1.0);

    // Orthogonal axes: zero dot product, unit perpendicular product.
    assert_eq!(x_axis.dot(y_axis), 0.0);
    assert_eq!(x_axis.perp_dot(y_axis), 1.0);
    // The perpendicular product is antisymmetric.
    assert_eq!(y_axis.perp_dot(x_axis), -1.0);
    // Parallel vectors have zero perpendicular product.
    assert_eq!(x_axis.perp_dot(x_axis * 3.0), 0.0);

    assert_eq!(Vec2::new(3.0, 4.0).dot(Vec2::new(2.0, -1.0)), 2.0);
}

#[test]
fn lengths_and_distances_match_known_triangles() {
    // The 3-4-5 triangle is exact in f32.
    let vec = Vec2::new(3.0, 4.0);
    assert_eq!(vec.length_squared(), 25.0);
    assert_eq!(vec.length(), 5.0);

    let from = Vec2::new(1.0, 2.0);
    let to = Vec2::new(4.0, 6.0);
    assert_eq!(from.distance_squared(to), 25.0);
    assert_eq!(from.distance(to), 5.0);
    // Distance is symmetric and zero to itself.
    assert_eq!(to.distance(from), 5.0);
    assert_eq!(from.distance(from), 0.0);
}

#[test]
fn lerp_hits_endpoints_and_midpoint() {
    let from = Vec2::new(2.0, -4.0);
    let to = Vec2::new(6.0, 4.0);

    assert_eq!(from.lerp(to, 0.0), from);
    assert_eq!(from.lerp(to, 1.0), to);
    assert_eq!(from.lerp(to, 0.5), Vec2::new(4.0, 0.0));
    // Extrapolation continues the line.
    assert_eq!(from.lerp(to, 2.0), Vec2::new(10.0, 12.0));
}

#[test]
fn min_max_clamp_operate_per_component() {
    let left = Vec2::new(1.0, 5.0);
    let right = Vec2::new(3.0, 2.0);

    assert_eq!(left.min(right), Vec2::new(1.0, 2.0));
    assert_eq!(left.max(right), Vec2::new(3.0, 5.0));
    assert_eq!(
        Vec2::new(-7.0, 7.0).clamp(Vec2::splat(-4.0), Vec2::splat(4.0)),
        Vec2::new(-4.0, 4.0),
    );
}

#[test]
fn is_finite_rejects_nan_and_infinity() {
    assert!(Vec2::new(1.0, 2.0).is_finite());
    assert!(!Vec2::new(f32::NAN, 0.0).is_finite());
    assert!(!Vec2::new(0.0, f32::INFINITY).is_finite());
    assert!(!Vec2::splat(f32::NEG_INFINITY).is_finite());
}

#[test]
fn batch_operators_match_scalar_operators() {
    let other = [
        Vec2::new(0.5, -1.0),
        Vec2::new(2.0, 3.0),
        Vec2::new(-4.0, 0.25),
        Vec2::new(8.0, -2.0),
    ];

    let lhs = Vec2x4T::from(POINTS);
    let rhs = Vec2x4T::from(other);

    let sum = lhs + rhs;
    let difference = lhs - rhs;
    let negated = -lhs;
    let scaled = lhs * 3.0;

    for index in 0..4 {
        assert_eq!(sum.get(index), POINTS[index] + other[index]);
        assert_eq!(difference.get(index), POINTS[index] - other[index]);
        assert_eq!(negated.get(index), -POINTS[index]);
        assert_eq!(scaled.get(index), POINTS[index] * 3.0);
    }
}

#[test]
fn batch_dot_and_distance_match_scalar_lanes() {
    let other = [
        Vec2::new(0.5, -1.0),
        Vec2::new(2.0, 3.0),
        Vec2::new(-4.0, 0.25),
        Vec2::new(8.0, -2.0),
    ];

    let lhs = Vec2x4T::from(POINTS);
    let rhs = Vec2x4T::from(other);

    let dots = lhs.dot(rhs);
    let distances = lhs.distance_squared(rhs);
    let lengths = lhs.length_squared();

    // The sample values are exact in f32, so FMA contraction changes
    // nothing and the comparison can be exact.
    for lane in 0..4 {
        assert_eq!(dots[lane], POINTS[lane].dot(other[lane]));
        assert_eq!(distances[lane], POINTS[lane].distance_squared(other[lane]));
        assert_eq!(lengths[lane], POINTS[lane].length_squared());
    }
}

#[test]
fn batch_perp_dot_matches_scalar_lanes() {
    let other = [
        Vec2::new(0.5, -1.0),
        Vec2::new(2.0, 3.0),
        Vec2::new(-4.0, 0.25),
        Vec2::new(8.0, -2.0),
    ];

    let lhs = Vec2x4T::from(POINTS);
    let rhs = Vec2x4T::from(other);

    let perps = lhs.perp_dot(rhs);
    let reversed = rhs.perp_dot(lhs);

    // The sample values are exact in f32, so FMA contraction changes
    // nothing and the comparison can be exact.
    for lane in 0..4 {
        assert_eq!(perps[lane], POINTS[lane].perp_dot(other[lane]));
        // The perpendicular product is antisymmetric lane-wise.
        assert_eq!(reversed[lane], -perps[lane]);
    }
}

#[test]
fn batch_lane_ops_match_known_values() {
    let batch = Vec2x4T::from(POINTS) * 2.0;

    assert_eq!(batch.xs().to_array(), [2.0, 4.0, 6.0, 8.0]);
    assert_eq!(batch.ys().to_array(), [10.0, 12.0, 14.0, 16.0]);
    assert_eq!(
        (Vec2x4T::from(POINTS) + Vec2x4T::from_lanes(Simd::splat(1.0), Simd::splat(-1.0))).get(0),
        Vec2::new(2.0, 4.0),
    );
}

#[test]
fn vec2_accessors_and_indexing() {
    let vec = Vec2::new(1.5, -2.5);

    assert_eq!(vec.x(), 1.5);
    assert_eq!(vec.y(), -2.5);
    assert_eq!(vec[0], vec.x());
    assert_eq!(vec[1], vec.y());
    assert_eq!(<[f32; 2]>::from(vec), [1.5, -2.5]);
    assert_eq!(Vec2::from([1.5, -2.5]), vec);
}

#[test]
#[should_panic(expected = "index out of bounds")]
fn vec2_index_out_of_bounds() {
    let _: f32 = Vec2::new(0.0, 0.0)[2];
}

#[test]
fn from_slice_reinterprets_in_place() {
    let components = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
    let points = Vec2::from_slice(&components).expect("three whole vectors");

    assert_eq!(
        points,
        [
            Vec2::new(1.0, 2.0),
            Vec2::new(3.0, 4.0),
            Vec2::new(5.0, 6.0)
        ],
    );
    // The points alias the component storage.
    assert_eq!(points.as_ptr().cast::<f32>(), components.as_ptr());

    assert_eq!(
        Vec2::from_slice(&[]).expect("zero whole vectors"),
        &[] as &[Vec2],
    );
    assert!(
        Vec2::from_slice(&components[..5]).is_none(),
        "a dangling component is not a vector"
    );
}

#[test]
fn transposed_deinterleaves_by_axis() {
    let batch = Vec2x4T::from(POINTS);

    assert_eq!(batch.xs().to_array(), [1.0, 2.0, 3.0, 4.0]);
    assert_eq!(batch.ys().to_array(), [5.0, 6.0, 7.0, 8.0]);
    assert_eq!(
        batch.to_simd().to_array(),
        [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0],
    );
}

#[test]
fn natural_preserves_interleaved_order() {
    let batch = Vec2x4::from(POINTS);

    assert_eq!(
        batch.to_simd().to_array(),
        [1.0, 5.0, 2.0, 6.0, 3.0, 7.0, 4.0, 8.0],
    );
    assert_eq!(<[Vec2; 4]>::from(batch), POINTS);
}

#[test]
fn batch_getters_agree_across_layouts() {
    let natural = Vec2x4::from(POINTS);
    let transposed = Vec2x4T::from(POINTS);

    for (index, point) in POINTS.into_iter().enumerate() {
        assert_eq!(natural.get(index), point);
        assert_eq!(natural[index], point);
        assert_eq!(transposed.get(index), point);
    }
}

#[test]
#[should_panic(expected = "index out of bounds")]
fn natural_index_out_of_bounds() {
    let _: Vec2 = Vec2x4::from(POINTS)[4];
}

#[test]
fn natural_splat_repeats_the_vector() {
    let batch = Vec2x4::splat(Vec2::new(1.5, -2.0));

    for index in 0..4 {
        assert_eq!(batch.get(index), Vec2::new(1.5, -2.0));
    }
}

#[test]
fn natural_from_slice_splits_and_rejoins_at_every_offset() {
    let points: Vec<Vec2> = (0..24_u8)
        .map(|index| {
            let value = f32::from(index);

            Vec2::new(value, -value)
        })
        .collect();

    for offset in 0..8 {
        let window = &points[offset..];
        let (prefix, batches, suffix) = Vec2x4::from_slice(window);

        // Every point lands in exactly one part, in order.
        assert_eq!(
            prefix.len() + 4 * batches.len() + suffix.len(),
            window.len(),
            "offset {offset}",
        );
        let rejoined: Vec<Vec2> = prefix
            .iter()
            .copied()
            .chain(batches.iter().flat_map(|batch| *batch.as_array()))
            .chain(suffix.iter().copied())
            .collect();
        assert_eq!(rejoined, window, "offset {offset}");

        // The middle meets the batch alignment and aliases the input storage.
        assert!(batches.as_ptr().addr().is_multiple_of(align_of::<Vec2x4>()));
        if !batches.is_empty() {
            assert_eq!(
                batches[0].as_array().as_ptr(),
                window[prefix.len()..].as_ptr(),
            );
        }
    }
}

#[test]
fn natural_min_max_and_reductions_match_scalar() {
    let other = [
        Vec2::new(0.5, -1.0),
        Vec2::new(2.0, 3.0),
        Vec2::new(-4.0, 0.25),
        Vec2::new(8.0, -2.0),
    ];

    let lhs = Vec2x4::from(POINTS);
    let rhs = Vec2x4::from(other);

    let min = lhs.min(rhs);
    let max = lhs.max(rhs);
    for index in 0..4 {
        assert_eq!(min.get(index), POINTS[index].min(other[index]));
        assert_eq!(max.get(index), POINTS[index].max(other[index]));
    }

    assert_eq!(
        rhs.reduce_min(),
        other[0].min(other[1]).min(other[2].min(other[3])),
    );
    assert_eq!(
        rhs.reduce_max(),
        other[0].max(other[1]).max(other[2].max(other[3])),
    );
}

#[test]
fn natural_is_finite_rejects_nan_and_infinity() {
    assert!(Vec2x4::from(POINTS).is_finite());
    assert!(!Vec2x4::from([Vec2::new(f32::NAN, 0.0), POINTS[1], POINTS[2], POINTS[3]]).is_finite(),);
    assert!(
        !Vec2x4::from([
            POINTS[0],
            POINTS[1],
            Vec2::new(1.0, f32::INFINITY),
            POINTS[3]
        ])
        .is_finite(),
    );
}

#[test]
fn natural_operators_match_scalar_operators() {
    let other = [
        Vec2::new(0.5, -1.0),
        Vec2::new(2.0, 3.0),
        Vec2::new(-4.0, 0.25),
        Vec2::new(8.0, -2.0),
    ];

    let lhs = Vec2x4::from(POINTS);
    let rhs = Vec2x4::from(other);

    let sum = lhs + rhs;
    let difference = lhs - rhs;
    let negated = -lhs;
    let scaled = lhs * 3.0;

    for index in 0..4 {
        assert_eq!(sum.get(index), POINTS[index] + other[index]);
        assert_eq!(difference.get(index), POINTS[index] - other[index]);
        assert_eq!(negated.get(index), -POINTS[index]);
        assert_eq!(scaled.get(index), POINTS[index] * 3.0);
    }
}

#[test]
fn layout_conversions_round_trip() {
    let natural = Vec2x4::from(POINTS);
    let transposed = Vec2x4T::from(POINTS);

    assert_eq!(Vec2x4::from(transposed), natural);
    assert_eq!(Vec2x4T::from(natural), transposed);
    assert_eq!(Vec2x4::from(Vec2x4T::from(natural)), natural);
}

#[test]
fn simd_conversions_round_trip() {
    let natural = Vec2x4::from(POINTS);
    let transposed = Vec2x4T::from(POINTS);

    assert_eq!(Vec2x4::from(natural.to_simd()), natural);
    assert_eq!(Vec2x4T::from(transposed.to_simd()), transposed);
}

#[test]
fn from_lanes_inverts_lane_extraction() {
    let batch = Vec2x4T::from(POINTS);

    assert_eq!(Vec2x4T::from_lanes(*batch.xs(), *batch.ys()), batch);
}

#[test]
fn into_lanes_extracts_axis_groups() {
    let batch = Vec2x4T::from(POINTS);
    let (xs, ys) = batch.into_lanes();

    assert_eq!(xs, *batch.xs());
    assert_eq!(ys, *batch.ys());
    assert_eq!(Vec2x4T::from_lanes(xs, ys), batch);
}

#[test]
fn natural_from_lanes_interleaves_axis_groups() {
    let xs = Simd::from_array([1.0, 2.0, 3.0, 4.0]);
    let ys = Simd::from_array([5.0, 6.0, 7.0, 8.0]);

    assert_eq!(
        Vec2x4::from_lanes(xs, ys),
        Vec2x4::from([
            Vec2::new(1.0, 5.0),
            Vec2::new(2.0, 6.0),
            Vec2::new(3.0, 7.0),
            Vec2::new(4.0, 8.0),
        ])
    );
}

/// A coordinate bounded to a well-conditioned range.
///
/// The laws below are algebraic contracts. The example-based tests above pin overflow behaviour.
fn coordinate() -> impl Strategy<Value = f32> {
    -1e5_f32..1e5
}

/// An arbitrary in-range vector.
fn vec2_strategy() -> impl Strategy<Value = Vec2> {
    (coordinate(), coordinate()).prop_map(|(x, y)| Vec2::new(x, y))
}

/// Arbitrary in-range vectors, one per batch lane.
fn vec2_array_strategy() -> impl Strategy<Value = [Vec2; 4]> {
    proptest::array::uniform4(vec2_strategy())
}

/// The dot product commutes bit for bit: both orders multiply and add the same values.
///
/// Coordinates lie in `-1e5..1e5`.
#[property_test]
fn dot_is_commutative(
    #[strategy = vec2_strategy()] left: Vec2,
    #[strategy = vec2_strategy()] right: Vec2,
) {
    prop_assert_eq!(left.dot(right), right.dot(left));
}

/// The perpendicular product is antisymmetric.
///
/// Swapping the operands negates the result exactly, because IEEE negation of a difference is
/// exact. Coordinates lie in `-1e5..1e5`.
#[property_test]
fn perp_dot_is_antisymmetric(
    #[strategy = vec2_strategy()] left: Vec2,
    #[strategy = vec2_strategy()] right: Vec2,
) {
    prop_assert_eq!(left.perp_dot(right), -right.perp_dot(left));
}

/// Distance is symmetric, and the distance from a point to itself is exactly zero.
///
/// Coordinates lie in `-1e5..1e5`.
#[property_test]
fn distance_is_symmetric_with_zero_self_distance(
    #[strategy = vec2_strategy()] left: Vec2,
    #[strategy = vec2_strategy()] right: Vec2,
) {
    prop_assert_eq!(left.distance(right), right.distance(left));
    prop_assert_eq!(left.distance(left), 0.0);
}

/// Lerp hits its endpoints.
///
/// Factor zero is exact; factor one holds up to rounding scaled by the operands' magnitude (the
/// interpolation computes `from + (to - from) · factor`, which rounds twice). Coordinates lie in
/// `-1e5..1e5`.
#[property_test]
fn lerp_hits_endpoints_on_arbitrary_vectors(
    #[strategy = vec2_strategy()] from: Vec2,
    #[strategy = vec2_strategy()] to: Vec2,
) {
    prop_assert_eq!(from.lerp(to, 0.0), from);

    let scale = from
        .x()
        .abs()
        .max(from.y().abs())
        .max(to.x().abs())
        .max(to.y().abs())
        .max(1.0);
    let tolerance = 8.0 * f32::EPSILON * scale;
    let at_one = from.lerp(to, 1.0);
    prop_assert!(
        (at_one.x() - to.x()).abs() <= tolerance && (at_one.y() - to.y()).abs() <= tolerance,
        "expected {:?}, got {:?}",
        to,
        at_one,
    );
}

/// Batch arithmetic operators match the scalar operators bit for bit in every lane.
///
/// SIMD IEEE arithmetic is scalar arithmetic per lane. Coordinates lie in `-1e5..1e5`.
#[property_test]
fn batch_operators_match_scalar_lanes_on_arbitrary_inputs(
    #[strategy = vec2_array_strategy()] lhs: [Vec2; 4],
    #[strategy = vec2_array_strategy()] rhs: [Vec2; 4],
    #[strategy = -1e3_f32..1e3] factor: f32,
) {
    let left = Vec2x4T::from(lhs);
    let right = Vec2x4T::from(rhs);

    let sum = left + right;
    let difference = left - right;
    let negated = -left;
    let scaled = left * factor;

    for index in 0..4 {
        prop_assert_eq!(sum.get(index), lhs[index] + rhs[index]);
        prop_assert_eq!(difference.get(index), lhs[index] - rhs[index]);
        prop_assert_eq!(negated.get(index), -lhs[index]);
        prop_assert_eq!(scaled.get(index), lhs[index] * factor);
    }
}

/// Batch reductions match the scalar reductions per lane up to FMA contraction.
///
/// The contraction's rounding scales with the products' magnitude rather than the (possibly
/// cancelled) result. Coordinates lie in `-1e5..1e5`.
#[property_test]
fn batch_reductions_match_scalar_lanes_on_arbitrary_inputs(
    #[strategy = vec2_array_strategy()] lhs: [Vec2; 4],
    #[strategy = vec2_array_strategy()] rhs: [Vec2; 4],
) {
    let left = Vec2x4T::from(lhs);
    let right = Vec2x4T::from(rhs);

    let dots = left.dot(right);
    let perps = left.perp_dot(right);
    let distances = left.distance_squared(right);
    let lengths = left.length_squared();

    let close = |actual: f32, expected: f32, magnitude: f32| {
        (actual - expected).abs() <= 8.0 * f32::EPSILON * magnitude.max(1.0)
    };
    for lane in 0..4 {
        let dot_magnitude = (lhs[lane].x() * rhs[lane].x())
            .abs()
            .max((lhs[lane].y() * rhs[lane].y()).abs());
        prop_assert!(close(dots[lane], lhs[lane].dot(rhs[lane]), dot_magnitude));

        let perp_magnitude = (lhs[lane].x() * rhs[lane].y())
            .abs()
            .max((lhs[lane].y() * rhs[lane].x()).abs());
        prop_assert!(close(
            perps[lane],
            lhs[lane].perp_dot(rhs[lane]),
            perp_magnitude
        ));

        let distance = lhs[lane].distance_squared(rhs[lane]);
        prop_assert!(close(distances[lane], distance, distance));

        let length = lhs[lane].length_squared().get();
        prop_assert!(close(lengths[lane], length, length));
    }
}

/// Layout conversions round-trip bit for bit.
///
/// `[Vec2; 4] -> Vec2x4 -> Vec2x4T -> Vec2x4 -> [Vec2; 4]` reproduces every coordinate's exact
/// bits.
#[property_test]
fn layout_round_trips_are_bit_exact(#[strategy = vec2_array_strategy()] points: [Vec2; 4]) {
    let transposed = Vec2x4T::from(Vec2x4::from(points));
    let round_tripped = <[Vec2; 4]>::from(Vec2x4::from(transposed));

    for (original, returned) in points.into_iter().zip(round_tripped) {
        prop_assert_eq!(original.x().to_bits(), returned.x().to_bits());
        prop_assert_eq!(original.y().to_bits(), returned.y().to_bits());
    }
}

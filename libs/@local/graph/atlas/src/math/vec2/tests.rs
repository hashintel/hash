#![expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: lane order and layout round trips are \
              bit-precise contracts"
)]

use core::simd::Simd;

use crate::math::{Vec2, Vec2x4, Vec2x4T, test_util::POINTS};

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

    assert_eq!(Vec2x4T::from_lanes(batch.xs(), batch.ys()), batch);
}

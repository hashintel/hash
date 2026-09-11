#![expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: widening is exact for every f32, and the \
              operators are single IEEE operations per component"
)]

use proptest::{prop_assert, prop_assert_eq, property_test};

use crate::math::{DVec2, DVec2x4T, DVecN, Vec2};

#[test]
fn operators_match_component_arithmetic() {
    let left = DVec2::new(1.5, -2.0);
    let right = DVec2::new(0.25, 4.0);

    assert_eq!(left + right, DVec2::new(1.75, 2.0));
    assert_eq!(left - right, DVec2::new(1.25, -6.0));
    assert_eq!(left * 2.0, DVec2::new(3.0, -4.0));
    assert_eq!(left / 2.0, DVec2::new(0.75, -1.0));

    let mut assigned = left;
    assigned += right;
    assert_eq!(assigned, left + right);
}

#[test]
fn products_match_known_values() {
    let x_axis = DVec2::new(1.0, 0.0);
    let y_axis = DVec2::new(0.0, 1.0);

    assert_eq!(x_axis.dot(y_axis).into_raw(), 0.0);
    assert_eq!(x_axis.perp_dot(y_axis).into_raw(), 1.0);
    assert_eq!(y_axis.perp_dot(x_axis).into_raw(), -1.0);
    assert_eq!(DVec2::new(3.0, 4.0).norm_squared().into_raw(), 25.0);
}

#[test]
fn mul_add_matches_scalar_fma() {
    let vec = DVec2::new(1.5, -2.5);
    let accumulator = DVec2::new(10.0, 20.0);

    let result = vec.mul_add(0.5, accumulator);
    assert_eq!(result.x(), 1.5_f64.mul_add(0.5, 10.0));
    assert_eq!(result.y(), (-2.5_f64).mul_add(0.5, 20.0));
}

#[test]
fn narrow_follows_the_checked_narrowing_contract() {
    assert_eq!(
        DVec2::new(0.25, -1024.0).narrow(),
        Some(Vec2::new(0.25, -1024.0)),
    );
    // Overflow in either component poisons the whole vector.
    assert_eq!(DVec2::new(1e300, 0.0).narrow(), None);
    assert_eq!(DVec2::new(0.0, f64::NAN).narrow(), None);
}

/// Four sign-varying, exactly representable vectors.
fn batch_points() -> [Vec2; 4] {
    [
        Vec2::new(1.5, -2.25),
        Vec2::new(0.75, 3.5),
        Vec2::new(-4.125, 0.5),
        Vec2::new(2.0, -0.375),
    ]
}

/// Assembles a batch from four double-precision vectors, one per lane.
fn batch_of(vectors: [DVec2; 4]) -> DVec2x4T {
    DVec2x4T::from_lanes(
        core::simd::Simd::from_array(vectors.map(DVec2::x)),
        core::simd::Simd::from_array(vectors.map(DVec2::y)),
    )
}

/// Four full-mantissa vector pairs on which the fused and separate distance forms disagree.
///
/// Points widened from `f32` cannot discriminate: their lane differences and squares are exact
/// in `f64`, so a fused mutant agrees with the unfused kernel on that whole domain. These pairs
/// come from a search for the property that `dx.mul_add(dx, dy * dy)` differs from
/// `dx * dx + dy * dy` in every lane.
fn distance_pairs() -> ([DVec2; 4], [DVec2; 4]) {
    (
        [
            DVec2::new(-3.6, 6.4),
            DVec2::new(3.18, -7.44),
            DVec2::new(-3.4, -2.8),
            DVec2::new(0.3, -5.343),
        ],
        [
            DVec2::new(-1.561, 7.1),
            DVec2::new(-7.084, 4.5),
            DVec2::new(2.34, -4.356),
            DVec2::new(6.351, 1.3),
        ],
    )
}

/// Widening is exact for every finite f32 pair.
///
/// Narrowing back reproduces the input bit for bit.
#[property_test]
fn widening_round_trips_exactly(
    #[strategy = -1e30_f32..1e30] x: f32,
    #[strategy = -1e30_f32..1e30] y: f32,
) {
    let vec = Vec2::new(x, y);
    let widened = DVec2::from(vec);

    prop_assert_eq!(widened.x(), f64::from(x));
    prop_assert_eq!(widened.narrow(), Some(vec));
}

/// The products agree with their f32 counterparts computed on widened inputs.
///
/// Products of exactly-widened values carry no f32 rounding.
#[property_test]
fn products_refine_the_f32_counterparts(
    #[strategy = -1e3_f32..1e3] ax: f32,
    #[strategy = -1e3_f32..1e3] ay: f32,
    #[strategy = -1e3_f32..1e3] bx: f32,
    #[strategy = -1e3_f32..1e3] by: f32,
) {
    let narrow_dot = f64::from(Vec2::new(ax, ay).dot(Vec2::new(bx, by)));
    let wide_dot = DVec2::from(Vec2::new(ax, ay))
        .dot(DVec2::from(Vec2::new(bx, by)))
        .into_raw();

    // The narrow path rounds each product at f32; those errors scale
    // with the products' magnitudes, which cancellation can leave far
    // above the result. The tolerance therefore follows the
    // intermediates, not the final value.
    let products = (f64::from(ax) * f64::from(bx)).abs() + (f64::from(ay) * f64::from(by)).abs();
    let tolerance = f64::from(f32::EPSILON) * 4.0 * (products + 1.0);
    prop_assert!((narrow_dot - wide_dot).abs() <= tolerance);
}

/// The lane metric is the scalar metric, bit for bit, on every input.
#[property_test]
fn distance_squared_lanes_match_the_scalar_metric_bitwise(
    #[strategy = -1e150_f64..1e150] ax: f64,
    #[strategy = -1e150_f64..1e150] ay: f64,
    #[strategy = -1e150_f64..1e150] bx: f64,
    #[strategy = -1e150_f64..1e150] by: f64,
) {
    let source = DVec2::new(ax, ay);
    let target = DVec2::new(bx, by);

    let distances = DVec2x4T::splat(source).distance_squared(DVec2x4T::splat(target));

    prop_assert_eq!(distances, DVecN::new([source.distance_squared(target); 4]));
}

/// The tests the `miri` nextest profile selects.
///
/// Each test here runs the transposed double-precision batch beside its scalar twin, lane by lane.
/// The profile selects by module path, so moving a test in or out of this module is the whole edit.
mod miri {
    use super::{batch_of, batch_points, distance_pairs};
    use crate::math::{DVec2, DVec2x4T, Vec2, Vec2x4T};

    #[test]
    fn dvec2x4t_widens_exactly_per_lane() {
        let points = batch_points();
        let batch = DVec2x4T::from(Vec2x4T::from(points));

        for (index, point) in points.iter().enumerate() {
            assert_eq!(batch.xs()[index], f64::from(point.x()));
            assert_eq!(batch.ys()[index], f64::from(point.y()));
        }
    }

    #[test]
    fn dvec2x4t_products_match_the_scalar_twin_per_lane() {
        let sources = batch_points();
        let targets = [
            Vec2::new(-0.5, 1.25),
            Vec2::new(2.5, -3.0),
            Vec2::new(0.125, 4.0),
            Vec2::new(-1.75, -0.25),
        ];

        let source = DVec2x4T::from(Vec2x4T::from(sources));
        let target = DVec2x4T::from(Vec2x4T::from(targets));
        let dot = source.dot(target);
        let perp_dot = source.perp_dot(target);
        let length_squared = source.length_squared();

        // The lane kernels share `DVec2`'s fused shape, so the paths agree
        // bit for bit on every input.
        for index in 0..4 {
            let source = DVec2::from(sources[index]);
            let target = DVec2::from(targets[index]);
            assert_eq!(dot[index], source.dot(target).into_raw());
            assert_eq!(perp_dot[index], source.perp_dot(target).into_raw());
            assert_eq!(length_squared[index], source.norm_squared().into_raw());
        }
    }

    #[test]
    fn dvec2x4t_mul_add_matches_the_scalar_twin_per_lane() {
        let points = batch_points();
        let batch = DVec2x4T::from(Vec2x4T::from(points));
        let factors = core::simd::Simd::from_array([0.5, -2.0, 0.25, 3.0]);
        let accumulator = DVec2x4T::from_lanes(
            core::simd::Simd::splat(10.0),
            core::simd::Simd::splat(-20.0),
        );

        let accumulated = batch.mul_add(factors, accumulator);

        for index in 0..4 {
            let expected =
                DVec2::from(points[index]).mul_add(factors[index], DVec2::new(10.0, -20.0));
            assert_eq!(accumulated.xs()[index], expected.x());
            assert_eq!(accumulated.ys()[index], expected.y());
        }
    }

    #[test]
    fn dvec2x4t_splat_repeats_the_vector_in_every_lane() {
        let batch = DVec2x4T::splat(DVec2::new(1.5, -2.25));

        assert_eq!(*batch.xs(), core::simd::Simd::splat(1.5));
        assert_eq!(*batch.ys(), core::simd::Simd::splat(-2.25));
    }

    #[test]
    #[expect(
        clippy::suboptimal_flops,
        reason = "the potency guard contrasts the fused and separate forms, so the separate form \
                  must stay unfused"
    )]
    fn dvec2x4t_distance_squared_matches_the_scalar_twin_per_lane() {
        let (sources, targets) = distance_pairs();

        // The fixture can fail under fusion: every lane's fused form disagrees with the separate
        // form, so a `mul_add` mutant in the kernel dies in all four lanes.
        for (source, target) in sources.iter().zip(&targets) {
            let dx = source.x() - target.x();
            let dy = source.y() - target.y();
            assert_ne!(dx.mul_add(dx, dy * dy), dx * dx + dy * dy);
        }

        let distances = batch_of(sources).distance_squared(batch_of(targets));

        for index in 0..4 {
            assert_eq!(
                distances.as_array()[index],
                sources[index].distance_squared(targets[index]),
            );
        }
    }

    #[test]
    fn dvec2x4t_reduce_sums_each_axis() {
        // Integer-valued components sum exactly in any association order.
        let batch = DVec2x4T::from(Vec2x4T::from([
            Vec2::new(1.0, 16.0),
            Vec2::new(2.0, 32.0),
            Vec2::new(4.0, 64.0),
            Vec2::new(8.0, 128.0),
        ]));

        assert_eq!(batch.reduce_sum(), DVec2::new(15.0, 240.0));
        assert_eq!(DVec2x4T::ZERO.reduce_sum(), DVec2::ZERO);
    }

    #[test]
    fn dvec2x4t_from_lanes_inverts_lane_extraction() {
        let batch = DVec2x4T::from(Vec2x4T::from([
            Vec2::new(1.0, 5.0),
            Vec2::new(2.0, 6.0),
            Vec2::new(3.0, 7.0),
            Vec2::new(4.0, 8.0),
        ]));

        assert_eq!(DVec2x4T::from_lanes(*batch.xs(), *batch.ys()), batch);
    }

    #[test]
    fn dvec2x4t_into_lanes_extracts_axis_groups() {
        let batch = DVec2x4T::from(Vec2x4T::from([
            Vec2::new(1.0, 5.0),
            Vec2::new(2.0, 6.0),
            Vec2::new(3.0, 7.0),
            Vec2::new(4.0, 8.0),
        ]));
        let (xs, ys) = batch.into_lanes();

        assert_eq!(xs.to_array(), [1.0, 2.0, 3.0, 4.0]);
        assert_eq!(ys.to_array(), [5.0, 6.0, 7.0, 8.0]);
        assert_eq!(xs, *batch.xs());
        assert_eq!(ys, *batch.ys());
        assert_eq!(DVec2x4T::from_lanes(xs, ys), batch);
    }
}

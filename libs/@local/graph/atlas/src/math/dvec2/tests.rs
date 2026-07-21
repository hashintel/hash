#![expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: widening is exact for every f32, and the \
              operators are single IEEE operations per component"
)]

use proptest::prelude::*;

use crate::math::{DVec2, DVec2x4T, Vec2, Vec2x4T};

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

    assert_eq!(x_axis.dot(y_axis), 0.0);
    assert_eq!(x_axis.perp_dot(y_axis), 1.0);
    assert_eq!(y_axis.perp_dot(x_axis), -1.0);
    assert_eq!(DVec2::new(3.0, 4.0).norm_squared(), 25.0);
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
        assert_eq!(dot[index], source.dot(target));
        assert_eq!(perp_dot[index], source.perp_dot(target));
        assert_eq!(length_squared[index], source.norm_squared());
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
        let expected = DVec2::from(points[index]).mul_add(factors[index], DVec2::new(10.0, -20.0));
        assert_eq!(accumulated.xs()[index], expected.x());
        assert_eq!(accumulated.ys()[index], expected.y());
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

    assert_eq!(batch.reduce(), DVec2::new(15.0, 240.0));
    assert_eq!(DVec2x4T::ZERO.reduce(), DVec2::ZERO);
}

proptest! {
    /// Widening is exact for every finite f32 pair, and narrowing it back reproduces the input bit for bit.
    #[test]
    fn widening_round_trips_exactly(
        x in -1e30_f32..1e30,
        y in -1e30_f32..1e30,
    ) {
        let vec = Vec2::new(x, y);
        let widened = DVec2::from(vec);

        prop_assert_eq!(widened.x(), f64::from(x));
        prop_assert_eq!(widened.narrow(), Some(vec));
    }

    /// The products agree with their f32 counterparts computed on widened inputs: products of exactly-widened values carry no f32 rounding.
    #[test]
    fn products_refine_the_f32_counterparts(
        ax in -1e3_f32..1e3, ay in -1e3_f32..1e3,
        bx in -1e3_f32..1e3, by in -1e3_f32..1e3,
    ) {
        let narrow_dot = f64::from(Vec2::new(ax, ay).dot(Vec2::new(bx, by)));
        let wide_dot = DVec2::from(Vec2::new(ax, ay)).dot(DVec2::from(Vec2::new(bx, by)));

        // The narrow path rounds each product at f32; those errors scale
        // with the products' magnitudes, which cancellation can leave far
        // above the result. The tolerance therefore follows the
        // intermediates, not the (possibly tiny) final value.
        let products =
            (f64::from(ax) * f64::from(bx)).abs() + (f64::from(ay) * f64::from(by)).abs();
        let tolerance = f64::from(f32::EPSILON) * 4.0 * (products + 1.0);
        prop_assert!((narrow_dot - wide_dot).abs() <= tolerance);
    }
}

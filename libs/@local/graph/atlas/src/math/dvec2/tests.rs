#![expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: widening is exact for every f32, and the \
              operators are single IEEE operations per component"
)]

use proptest::prelude::*;

use crate::math::{DVec2, Vec2};

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

proptest! {
    /// Widening is exact for every finite f32 pair, and narrowing it back
    /// reproduces the input bit for bit.
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

    /// The products agree with their f32 counterparts computed on widened
    /// inputs: products of exactly-widened values carry no f32 rounding.
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

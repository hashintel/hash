use core::hash::{Hash, Hasher as _};
use std::hash::DefaultHasher;

use proptest::{prop_assert, prop_assert_eq, property_test};

use crate::math::scalar::{narrow_f32, narrow_f32_down, narrow_f32_up, softplus};

/// Hashes one value with the std default hasher.
pub(super) fn hash_of(value: impl Hash) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

/// `softplus(50)` is exactly `50`, `softplus(-50)` is positive but below `1e-20`, and
/// `softplus(-200)` is exactly zero once `exp` underflows `f32`.
#[test]
fn softplus_asymptotes() {
    // ln_1p(exp(-50)) is far below f32 ε at 50, so the positive
    // asymptote is exact.
    assert_eq!(softplus(50.0), 50.0);
    // The negative tail decays like exp(value): below 1e-20 at -50, exactly zero once exp
    // underflows f32 entirely.
    assert!(softplus(-50.0) > 0.0);
    assert!(softplus(-50.0) < 1e-20);
    assert_eq!(softplus(-200.0), 0.0);
}

/// `softplus(x) - softplus(-x) = x` within `1e-5` across negative, zero and positive inputs.
#[test]
fn softplus_shift_identity() {
    // softplus(x) - softplus(-x) == x: the ln_1p terms share |x| and cancel.
    for value in [-3.0_f32, -0.5, 0.0, 1.25, 4.0] {
        let difference = softplus(value) - softplus(-value);
        assert!((difference - value).abs() < 1e-5, "value {value}");
    }
}

/// The stable `softplus` agrees with the textbook `ln(1 + exp(x))` within `1e-5` on moderate
/// inputs.
#[test]
#[expect(
    clippy::imprecise_flops,
    reason = "the textbook `ln(1 + exp(x))` form is the reference the stable evaluation is \
              checked against"
)]
fn softplus_naive_reference() {
    for value in [-4.0_f32, -1.0, 0.0, 0.5, 3.0] {
        let naive = (1.0 + value.exp()).ln();
        assert!((softplus(value) - naive).abs() < 1e-5, "value {value}");
    }
}

/// `narrow_f32` returns powers of two unchanged.
#[test]
fn narrow_f32_powers_of_two() {
    assert_eq!(narrow_f32(0.25), Some(0.25_f32));
    assert_eq!(narrow_f32(-1024.0), Some(-1024.0_f32));
}

/// `narrow_f32(0.1)` rounds to the nearest `f32`, the value the `0.1_f32` literal denotes.
#[test]
fn narrow_f32_inexact() {
    // 0.1 has no exact binary representation at either width; narrowing
    // rounds to the nearest f32, which is what the 0.1_f32 literal denotes.
    assert_eq!(narrow_f32(0.1), Some(0.1_f32));
}

/// `narrow_f32` returns `None` for values beyond the `f32` range, infinity and NaN.
#[test]
fn narrow_f32_invalid() {
    assert_eq!(narrow_f32(1e300), None);
    assert_eq!(narrow_f32(f64::INFINITY), None);
    assert!(narrow_f32(f64::NAN).is_none());
}

/// `narrow_f32(-0.0)` keeps the sign bit.
#[test]
fn narrow_f32_negative_zero() {
    let rounded = narrow_f32(-0.0).expect("negative zero is finite");
    assert_eq!(rounded.to_bits(), (-0.0_f32).to_bits());
}

/// The directed narrowings bracket a value the nearest rounding would cross: `0.1_f32` lies above
/// `0.1`: `narrow_f32_down` steps below it and `narrow_f32_up` returns it.
#[test]
fn directed_narrowing_inexact() {
    // `0.1_f32` is the nearest `f32` to 0.1 and sits above it.
    assert!(f64::from(0.1_f32) > 0.1);

    assert_eq!(narrow_f32_down(0.1), Some(0.1_f32.next_down()));
    assert_eq!(narrow_f32_up(0.1), Some(0.1_f32));

    // A value whose nearest `f32` lies below it: the mirror image.
    let below = f64::from(0.1_f32.next_down());
    let between = f64::midpoint(below, f64::from(0.1_f32)) - 1e-12;
    assert_eq!(narrow_f32_down(between), Some(0.1_f32.next_down()));
    assert_eq!(narrow_f32_up(between), Some(0.1_f32));
}

/// A value that is already an `f32` narrows to itself in both directions, `-0.0` with its sign bit.
#[test]
fn directed_narrowing_exact() {
    assert_eq!(narrow_f32_down(0.25), Some(0.25_f32));
    assert_eq!(narrow_f32_up(0.25), Some(0.25_f32));
    assert_eq!(narrow_f32_down(f64::from(f32::MAX)), Some(f32::MAX));
    assert_eq!(narrow_f32_up(f64::from(-f32::MAX)), Some(-f32::MAX));

    let down = narrow_f32_down(-0.0).expect("negative zero is finite");
    let up = narrow_f32_up(-0.0).expect("negative zero is finite");
    assert_eq!(down.to_bits(), (-0.0_f32).to_bits());
    assert_eq!(up.to_bits(), (-0.0_f32).to_bits());
}

/// Beyond `f32::MAX` only the downward narrowing has an answer, beyond `-f32::MAX` only the upward
/// one, and neither has one for NaN or the infinities.
#[test]
fn directed_narrowing_range_edges() {
    // Just past the range, where the nearest rounding still returns `f32::MAX`.
    let past_max = f64::from(f32::MAX) + 1e30;
    assert_eq!(narrow_f32_down(past_max), Some(f32::MAX));
    assert_eq!(narrow_f32_up(past_max), None);

    // Far past the range, where the nearest rounding is infinite.
    assert_eq!(narrow_f32_down(1e300), Some(f32::MAX));
    assert_eq!(narrow_f32_up(1e300), None);
    assert_eq!(narrow_f32_down(-1e300), None);
    assert_eq!(narrow_f32_up(-1e300), Some(-f32::MAX));

    for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        assert_eq!(narrow_f32_down(value), None, "down({value})");
        assert_eq!(narrow_f32_up(value), None, "up({value})");
    }
}

/// Below the smallest subnormal magnitude the directed narrowings step onto the neighbouring
/// subnormal or zero, on the side the direction names.
#[test]
fn directed_narrowing_subnormal() {
    let tiny = f32::from_bits(1);

    assert_eq!(narrow_f32_down(1e-50), Some(0.0));
    assert_eq!(narrow_f32_up(1e-50), Some(tiny));
    assert_eq!(narrow_f32_down(-1e-50), Some(-tiny));

    let up = narrow_f32_up(-1e-50).expect("the value is finite");
    assert_eq!(up.to_bits(), (-0.0_f32).to_bits());
}

/// Softplus is non-negative and satisfies the shift identity.
///
/// `softplus(x) - softplus(-x) == x` up to rounding scaled by `|x|`. The strategy bounds inputs to
/// `-1e4..1e4`, where the stable form is well-conditioned. The tests above pin the asymptotes.
#[property_test]
fn softplus_range_and_shift_identity(#[strategy = -1e4_f32..1e4] value: f32) {
    prop_assert!(softplus(value) >= 0.0);
    prop_assert!(softplus(-value) >= 0.0);

    let difference = softplus(value) - softplus(-value);
    prop_assert!(
        (difference - value).abs() <= 1e-5 * value.abs().max(1.0),
        "softplus({0}) - softplus(-{0}) = {1}",
        value,
        difference,
    );
}

/// Widening an `f32` to `f64` and narrowing it back is the identity.
///
/// Every finite `f32` is exactly representable in `f64`, and round-to-nearest returns it unchanged.
#[property_test]
fn narrow_f32_round_trip_identity(#[strategy = -f32::MAX..=f32::MAX] value: f32) {
    prop_assert_eq!(narrow_f32(f64::from(value)), Some(value));
}

/// The directed narrowings are the floor and ceiling onto the `f32` grid.
///
/// For every finite `f64` inside the `f32` range, `narrow_f32_down` returns a value at or below it
/// whose successor lies above it, and `narrow_f32_up` a value at or above it whose predecessor lies
/// below it. The strategy spans the whole range in both signs, subnormals included.
#[property_test]
fn directed_narrowing_order_laws(
    #[strategy = -f64::from(f32::MAX)..=f64::from(f32::MAX)] value: f64,
) {
    let down = narrow_f32_down(value).expect("the value is inside the range");
    prop_assert!(
        f64::from(down) <= value,
        "down({value}) = {down} lies above"
    );
    prop_assert!(
        f64::from(down.next_up()) > value,
        "down({value}) = {down} has a successor at or below",
    );

    let up = narrow_f32_up(value).expect("the value is inside the range");
    prop_assert!(f64::from(up) >= value, "up({value}) = {up} lies below");
    prop_assert!(
        f64::from(up.next_down()) < value,
        "up({value}) = {up} has a predecessor at or above",
    );
}

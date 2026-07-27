//! Stable arithmetic primitives behind every solver control decision.
//!
//! Two primitives carry all scalar reductions whose values steer the solver: [`ordered_dot`] is
//! the sole scalar product for branch-controlling dots (curvature, residual norm squares, model
//! reduction, boundary coefficients, accepted-step curvature), and [`stable_l2`] is the sole norm
//! (gradient, residual, direction, Hessian-vector product, boundary, and diagnostic norms). Both
//! visit components in declared vector order with one fixed operation shape, so a given
//! environment reproduces identical control decisions run after run.
//!
//! Both return [`None`] for non-finite results instead of letting an overflow or NaN steer a
//! branch; each call site maps [`None`] onto its own typed failure.

/// Dot product folded with `mul_add` in declared vector order.
///
/// Initializes an accumulator at `0.0` and updates it as `x[j].mul_add(y[j], accumulator)` for
/// ascending `j`; each term therefore contributes with a single rounding. Returns [`None`] when
/// the accumulated value is not finite; a non-finite value entering the fold can only produce a
/// non-finite accumulator, so checking the result covers every component and intermediate.
///
/// # Panics
///
/// Panics when the slices differ in length; the operands of every solver dot are same-dimension
/// vectors by construction.
pub(super) fn ordered_dot(x: &[f64], y: &[f64]) -> Option<f64> {
    assert_eq!(x.len(), y.len(), "dot operands share one dimension");

    let mut accumulator = 0.0_f64;
    for (&left, &right) in x.iter().zip(y) {
        accumulator = left.mul_add(right, accumulator);
    }

    accumulator.is_finite().then_some(accumulator)
}

/// Euclidean norm through the scaled sum-of-squares recurrence, in declared vector order.
///
/// Tracks the largest magnitude seen so far as `scale` and a `sum_squares` of ratios against it:
/// zero components are skipped; a component `a` larger than the running scale rescales the sum
/// as `1 + sum_squares·(scale/a)²` and replaces the scale; any other component adds `(a/scale)²`.
/// The result is `scale·√sum_squares`. Every ratio lies in `(0, 1]`, so squares never overflow
/// or underflow on the way: subnormal-only vectors keep their norm and vectors of magnitudes
/// near [`f64::MAX`] stay finite where naive squared accumulation would not.
///
/// The norm of the empty and the all-zero vector is `0.0`. Returns [`None`] when a component or
/// the result is not finite.
pub(super) fn stable_l2(vector: &[f64]) -> Option<f64> {
    let mut scale = 0.0_f64;
    let mut sum_squares = 1.0_f64;

    for &component in vector {
        if !component.is_finite() {
            return None;
        }

        let magnitude = component.abs();
        if magnitude == 0.0 {
            continue;
        }

        if magnitude > scale {
            let ratio = scale / magnitude;
            sum_squares = sum_squares.mul_add(ratio * ratio, 1.0);
            scale = magnitude;
        } else {
            let ratio = magnitude / scale;
            sum_squares = ratio.mul_add(ratio, sum_squares);
        }
    }

    let norm = scale * sum_squares.sqrt();
    norm.is_finite().then_some(norm)
}

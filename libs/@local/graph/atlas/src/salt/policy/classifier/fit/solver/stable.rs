//! Checked arithmetic primitives behind every solver control decision.
//!
//! Every reduction whose value steers the solver goes through these primitives. [`checked_dot`] and
//! [`checked_norm_squared`] are the sole scalar products for branch-controlling dots (curvature,
//! residual norm squares, model reduction, boundary coefficients, accepted-step curvature), and
//! [`stable_l2`] is the sole norm (gradient, residual, direction, Hessian-vector product, boundary,
//! and diagnostic norms). All delegate to the house kernels ([`AlignedDVecN::dot`],
//! [`AlignedDVecN::norm_squared`], and [`AlignedDVecN::stable_l2`]), which pin the striped fold
//! shape. That shape uses fixed 8-lane groups, two interleaved fused-multiply-add accumulators, one
//! fixed horizontal reduction, and a scalar-fma remainder, so a given environment reproduces
//! identical control decisions run after run.
//!
//! All return [`None`] for non-finite results instead of letting an overflow or NaN steer a branch.
//! Each call site maps [`None`] onto its own typed failure. Operand dimensions agree at compile
//! time, because the vector lengths are part of the signatures.

use crate::math::AlignedDVecN;

/// The house dot product ([`AlignedDVecN::dot`]) gated on a finite result.
///
/// Returns [`None`] when the reduced value is not finite; a non-finite value entering the fold
/// can only produce a non-finite accumulator, so checking the result covers every component and
/// intermediate.
pub(super) fn checked_dot<const N: usize>(x: &AlignedDVecN<N>, y: &AlignedDVecN<N>) -> Option<f64> {
    let value = x.dot(y);
    value.is_finite().then_some(value)
}

/// The house squared norm ([`AlignedDVecN::norm_squared`]) gated on a finite result.
///
/// The self-dot with the same fold shape and gate as [`checked_dot`].
pub(super) fn checked_norm_squared<const N: usize>(vector: &AlignedDVecN<N>) -> Option<f64> {
    let value = vector.norm_squared();
    value.is_finite().then_some(value)
}

/// The house scaled two-pass Euclidean norm ([`AlignedDVecN::stable_l2`]) gated on a finite result.
///
/// Subnormal-only vectors keep their norm and magnitudes near [`f64::MAX`] stay finite where
/// naive squared accumulation would not. The norm of the empty and the all-zero vector is
/// `0.0`. Returns [`None`] when a component or the result is not finite.
pub(super) fn stable_l2<const N: usize>(vector: &AlignedDVecN<N>) -> Option<f64> {
    let norm = vector.stable_l2();
    norm.is_finite().then_some(norm)
}

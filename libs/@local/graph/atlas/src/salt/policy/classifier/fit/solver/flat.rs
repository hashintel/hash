//! Componentwise operations over flat solver vectors.
//!
//! The update recurrences of the solver loop - steps, residuals, directions, and gradient
//! differences - are componentwise advances `base + factor·along` in declared vector order, one
//! `mul_add` per coordinate. Results are plain values that may be non-finite; [`all_finite`] is
//! the shared escape check each caller maps onto its own typed outcome.

use super::SOLVER_DIMENSIONS;
use crate::math::{AlignedDVecN, BoxedDVecN};

/// The componentwise advance `base + factor·along`, one `mul_add` per coordinate.
pub(super) fn advance(
    base: &AlignedDVecN<SOLVER_DIMENSIONS>,
    factor: f64,
    along: &AlignedDVecN<SOLVER_DIMENSIONS>,
) -> BoxedDVecN<SOLVER_DIMENSIONS> {
    let mut advanced = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    for ((out, &start), &component) in advanced
        .as_array_mut()
        .iter_mut()
        .zip(base.as_array())
        .zip(along.as_array())
    {
        *out = factor.mul_add(component, start);
    }
    advanced
}

/// The componentwise negation.
pub(super) fn negated(vector: &AlignedDVecN<SOLVER_DIMENSIONS>) -> BoxedDVecN<SOLVER_DIMENSIONS> {
    let mut negation = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    for (out, &component) in negation.as_array_mut().iter_mut().zip(vector.as_array()) {
        *out = -component;
    }
    negation
}

/// Whether every component is finite.
pub(super) fn all_finite(vector: &AlignedDVecN<SOLVER_DIMENSIONS>) -> bool {
    vector
        .as_array()
        .iter()
        .all(|component| component.is_finite())
}

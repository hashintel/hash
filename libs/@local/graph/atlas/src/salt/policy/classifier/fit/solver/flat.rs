//! Componentwise operations over flat solver vectors.
//!
//! The update recurrences of the solver loop - steps, residuals, directions, and gradient
//! differences - are componentwise advances `base + factor·along`, one fused multiply-add per
//! coordinate through the house kernel [`DVecN::mul_add`]. Results are plain values that may be
//! non-finite; [`AlignedDVecN::is_finite`] is the shared escape check each caller maps onto its own
//! typed outcome.

use super::SOLVER_DIMENSIONS;
use crate::math::{AlignedDVecN, BoxedDVecN, DFinite, DVecN};

/// The componentwise advance `base + factor·along`, one fused multiply-add per coordinate.
pub(super) fn advance(
    base: &AlignedDVecN<SOLVER_DIMENSIONS>,
    factor: DFinite,
    along: &AlignedDVecN<SOLVER_DIMENSIONS>,
) -> BoxedDVecN<SOLVER_DIMENSIONS> {
    let mut advanced = BoxedDVecN::new(DVecN::from_ref(base.as_array()));
    advanced.mul_add(along, factor.get());
    advanced
}

/// The componentwise negation.
pub(super) fn negated(vector: &AlignedDVecN<SOLVER_DIMENSIONS>) -> BoxedDVecN<SOLVER_DIMENSIONS> {
    let mut negation = BoxedDVecN::new(DVecN::from_ref(vector.as_array()));
    negation.negate();
    negation
}

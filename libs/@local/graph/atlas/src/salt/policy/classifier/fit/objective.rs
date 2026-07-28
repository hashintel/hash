//! The flat class-parameter layout and its per-row evaluation.
//!
//! Parameters are one flat vector `[w_C | w_P | w_O | b]`: the three coefficient rows in class
//! order followed by the three intercepts. The bounded solver ([`solver`](super::solver)) fits
//! models in contrast coordinates; [`expand_point`] returns its solutions to this layout, and
//! [`logits`] evaluates one embedding under it. `f32` embeddings enter the double-precision
//! logits through [`AlignedVecN::dot_wide`].

use super::solver::{ContrastVector, basis};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    math::{AlignedDVecN, AlignedVecN, BoxedDVecN},
    salt::policy::GeometryClass,
};

/// Coefficient components ahead of the intercepts.
const COEFFICIENT_COUNT: usize = GeometryClass::COUNT * CANONICAL_DIMENSIONS;

/// Flat parameter dimension: coefficients plus intercepts.
pub(super) const PARAMETER_COUNT: usize = COEFFICIENT_COUNT + GeometryClass::COUNT;

/// The flat parameter vector.
pub(super) type Parameters = BoxedDVecN<PARAMETER_COUNT>;

/// Class logits of one embedding under flat parameters.
pub(super) fn logits(
    parameters: &Parameters,
    embedding: &AlignedVecN<CANONICAL_DIMENSIONS>,
) -> [f64; GeometryClass::COUNT] {
    let (rows, intercepts) = parameters.as_array().as_chunks::<CANONICAL_DIMENSIONS>();

    core::array::from_fn(|class| {
        let coefficients = AlignedDVecN::from_ref(&rows[class]).unwrap_or_else(|| {
            unreachable!(
                "class rows start at multiples of `CANONICAL_DIMENSIONS * 8` bytes inside an \
                 allocation aligned for `f64x8`"
            )
        });

        embedding.dot_wide(coefficients) + intercepts[class]
    })
}

/// Expands contrast coordinates into flat class parameters: `W = B·A`, `b = B·a`.
pub(super) fn expand_point(point: &ContrastVector) -> Parameters {
    let mut parameters = Parameters::zero();
    let (rows, intercepts) = parameters
        .as_array_mut()
        .as_chunks_mut::<CANONICAL_DIMENSIONS>();
    for dimension in 0..CANONICAL_DIMENSIONS {
        let classes = basis::expand(core::array::from_fn(|row| {
            point.coefficients[row].as_array()[dimension]
        }));
        for (row, class) in rows.iter_mut().zip(classes) {
            row[dimension] = class;
        }
    }
    let classes = basis::expand(point.intercepts);
    intercepts.copy_from_slice(&classes);
    parameters
}

//! Deterministic bounded solver components for the soft-target classifier objective.
//!
//! The classifier's external objective is weighted soft-target cross-entropy plus coefficient-only
//! L2 regularization over three class logits. A common shift of the three logits moves no
//! probability, so the solver operates in the two-dimensional contrast space reached through the
//! fixed [`basis`], where coefficient regularization plus positive aggregate class mass makes the
//! minimizer finite and unique.
//!
//! Everything here is deterministic bounded work: arithmetic visits rows in ascending original
//! index and classes in discriminant order, there is no randomness, and every row traversal is
//! charged to explicit counters.
//!
//! # Coordinates and vector layout
//!
//! Physical contrast parameters are `T = [A|a] ∈ ℝ^(2×(d+1))`: two coefficient rows of `d`
//! embedding dimensions, each with one appended intercept coordinate. Flat solver vectors are
//! contrast-major, `[A_0,0 … A_0,d−1, a_0, A_1,0 … A_1,d−1, a_1]`, and [`ContrastVector`]
//! carries the same coordinates in structured form. The physical objective, gradient, and
//! Hessian-vector products evaluate in these coordinates; the solver's own iterate lives in
//! scaled coordinates `ζ` reached through the preparation-time diagonal ([`scale`]).

use crate::{
    dataset::CANONICAL_DIMENSIONS,
    math::{AlignedDVecN, BoxedDVecN},
};

mod basis;
mod boundary;
mod cg;
mod config;
mod evaluate;
mod flat;
mod prepare;
mod problem;
mod receipt;
mod resolution;
mod scale;
mod solve;
mod stable;
mod target;
mod terminal;
mod work;

#[cfg(test)]
mod tests;

/// Augmented coordinates per contrast row: the embedding dimensions plus one intercept.
const AUGMENTED_DIMENSIONS: usize = CANONICAL_DIMENSIONS + 1;

/// Flat solver vector dimension: two contrast rows of augmented coordinates.
const SOLVER_DIMENSIONS: usize = 2 * AUGMENTED_DIMENSIONS;

/// A contrast-major solver vector in structured form.
///
/// Represents parameters, gradients, directions, and Hessian-vector products alike: two
/// coefficient rows over the embedding dimensions and one intercept per row. Each coefficient
/// row owns an allocation aligned for wide dots against `f32` embeddings, and
/// [`from_flat`](Self::from_flat) / [`to_flat`](Self::to_flat) convert against the flat
/// contrast-major layout without reordering coordinates.
#[derive(Debug, Clone, PartialEq)]
struct ContrastVector {
    /// Coefficient rows `A_0` and `A_1` over the embedding dimensions.
    coefficients: [BoxedDVecN<CANONICAL_DIMENSIONS>; 2],
    /// Intercepts `a_0` and `a_1`.
    intercepts: [f64; 2],
}

impl ContrastVector {
    /// The zero vector.
    fn zero() -> Self {
        Self {
            coefficients: [BoxedDVecN::zero(), BoxedDVecN::zero()],
            intercepts: [0.0; 2],
        }
    }

    /// Reads a flat contrast-major vector into structured form.
    fn from_flat(flat: &AlignedDVecN<SOLVER_DIMENSIONS>) -> Self {
        let mut vector = Self::zero();
        for row in 0..2 {
            let start = row * AUGMENTED_DIMENSIONS;
            vector.coefficients[row]
                .as_array_mut()
                .copy_from_slice(&flat.as_array()[start..start + CANONICAL_DIMENSIONS]);
            vector.intercepts[row] = flat.as_array()[start + CANONICAL_DIMENSIONS];
        }
        vector
    }

    /// Writes the structured coordinates into a flat contrast-major vector.
    fn to_flat(&self) -> BoxedDVecN<SOLVER_DIMENSIONS> {
        let mut flat = BoxedDVecN::zero();
        for row in 0..2 {
            let start = row * AUGMENTED_DIMENSIONS;
            flat.as_array_mut()[start..start + CANONICAL_DIMENSIONS]
                .copy_from_slice(self.coefficients[row].as_array());
            flat.as_array_mut()[start + CANONICAL_DIMENSIONS] = self.intercepts[row];
        }
        flat
    }
}

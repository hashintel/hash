//! Deterministic bounded solver components for the soft-target classifier objective.
//!
//! The classifier's external objective combines weighted soft-target cross-entropy with
//! coefficient-only L2 regularization over the class logits. A common shift of the logits moves no
//! probability, so the solver operates in the contrast space of dimension one below the class
//! count, reached through the fixed [`basis`], where coefficient regularization plus positive
//! aggregate class mass makes the minimizer finite and unique.
//!
//! Everything here is deterministic bounded work. Arithmetic visits rows in ascending original
//! index and classes in discriminant order, no step uses randomness, and explicit counters charge
//! every row traversal. Every reduction whose value steers a branch goes through the checked
//! vector reductions ([`AlignedDVecN::checked_dot`], [`AlignedDVecN::checked_norm_squared`], and
//! [`AlignedDVecN::checked_stable_l2`]), so an overflow or NaN never steers a control decision,
//! and each call site maps [`None`] onto its own typed failure.
//!
//! # Coordinates and vector layout
//!
//! Physical contrast parameters are `T = [A|a] ∈ ℝ^(r×(d+1))` with `r` contrast rows of `d`
//! embedding dimensions, each with one appended intercept coordinate. Flat solver vectors are
//! contrast-major, `[A_0,0 … A_0,d−1, a_0, A_1,0 … A_1,d−1, a_1, …]`, and [`ContrastVector`]
//! carries the same coordinates in structured form. The physical objective, gradient, and
//! Hessian-vector products evaluate in these coordinates. The solver's own iterate lives in scaled
//! coordinates `ζ` reached through the preparation-time diagonal ([`scale`]).

use crate::{
    dataset::CANONICAL_DIMENSIONS,
    math::{AlignedDVecN, AlignedVecN, BoxedDVecN},
    salt::policy::GeometryClass,
};

pub(super) mod basis;
mod boundary;
mod config;
mod evaluate;
mod flat;
mod gram;
mod newton;
mod prepare;
mod problem;
mod receipt;
pub(crate) mod report;
mod resolution;
mod scale;
mod solve;
mod target;
mod terminal;
mod work;

#[cfg(test)]
mod tests;

pub(crate) use self::{
    config::{SolverConfig, SolverConfigError},
    gram::{Gram, GramView},
    prepare::{PreparationError, PreparationSettings},
    receipt::ReceiptDetail,
    terminal::{NewtonStage, SolverFailure},
    work::WorkCounters,
};
pub(super) use self::{prepare::prepare, problem::ScaledProblem, solve::solve};

/// Augmented coordinates per contrast row: the embedding dimensions plus one intercept.
const AUGMENTED_DIMENSIONS: usize = CANONICAL_DIMENSIONS + 1;

/// Contrast rows: one per class beyond the softmax shift gauge.
const CONTRAST_ROWS: usize = GeometryClass::COUNT - 1;

/// Leading classes with stored components.
///
/// The last class is the derived reference.
const LEADING_CLASSES: usize = GeometryClass::COUNT - 1;

/// Flat solver vector dimension: one block of augmented coordinates per contrast row.
const SOLVER_DIMENSIONS: usize = CONTRAST_ROWS * AUGMENTED_DIMENSIONS;

/// A contrast-major solver vector in structured form.
///
/// Represents parameters, gradients, directions, and Hessian-vector products alike: one coefficient
/// row per contrast coordinate over the embedding dimensions, with one intercept each. Each
/// coefficient row owns an allocation aligned for wide dots against `f32` embeddings, and
/// [`from_flat`](Self::from_flat) / [`to_flat`](Self::to_flat) convert against the flat
/// contrast-major layout without reordering coordinates.
#[derive(Debug, Clone, PartialEq)]
pub(super) struct ContrastVector {
    /// Coefficient rows `A_r`, one per contrast coordinate, over the embedding dimensions.
    pub coefficients: [BoxedDVecN<CANONICAL_DIMENSIONS>; CONTRAST_ROWS],
    /// Intercepts `a_r`, one per contrast coordinate.
    pub intercepts: [f64; CONTRAST_ROWS],
}

impl ContrastVector {
    /// The zero vector.
    fn zero() -> Self {
        Self {
            coefficients: core::array::from_fn(|_index| BoxedDVecN::zero()),
            intercepts: [0.0; CONTRAST_ROWS],
        }
    }

    /// Reads a flat contrast-major vector into structured form.
    fn from_flat(flat: &AlignedDVecN<SOLVER_DIMENSIONS>) -> Self {
        let mut vector = Self::zero();

        for row in 0..CONTRAST_ROWS {
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

        for row in 0..CONTRAST_ROWS {
            let start = row * AUGMENTED_DIMENSIONS;
            flat.as_array_mut()[start..start + CANONICAL_DIMENSIONS]
                .copy_from_slice(self.coefficients[row].as_array());
            flat.as_array_mut()[start + CANONICAL_DIMENSIONS] = self.intercepts[row];
        }

        flat
    }

    /// Whether every coordinate is finite.
    fn is_finite(&self) -> bool {
        self.coefficients.iter().all(|row| row.is_finite())
            && self.intercepts.iter().all(|value| value.is_finite())
    }

    /// Contrast logits `t = T·x̄`: one wide dot plus the intercept per contrast row.
    fn logits(&self, embedding: &AlignedVecN<CANONICAL_DIMENSIONS>) -> [f64; CONTRAST_ROWS] {
        core::array::from_fn(|row| {
            embedding.dot_wide(&self.coefficients[row]) + self.intercepts[row]
        })
    }
}

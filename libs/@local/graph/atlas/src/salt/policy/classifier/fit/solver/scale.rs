//! The fixed diagonal between physical and scaled solver coordinates.
//!
//! Preparation derives one positive scale per augmented coordinate from the initial Hessian
//! diagonal, identical for every contrast row. [`Scaling`] holds that diagonal `D` expanded to
//! the flat solver layout and applies its inverse: accepted points live in scaled coordinates
//! `ζ` with `θ(ζ) = D⁻¹ζ`, gradients transform as `gζ = D⁻¹gθ`, and Hessian-vector products as
//! `Hζ[v] = D⁻¹Hθ[D⁻¹v]`, so every transformation the solver needs is one componentwise
//! division by `D`.

use super::{AUGMENTED_DIMENSIONS, CONTRAST_ROWS, SOLVER_DIMENSIONS};
use crate::math::{AlignedDVecN, BoxedDVecN, DVecN};

/// The positive diagonal `D` between scaled and physical coordinates.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Scaling {
    /// `D` in flat contrast-major layout; every row carries the same augmented-coordinate scales.
    diagonal: BoxedDVecN<SOLVER_DIMENSIONS>,
}

impl Scaling {
    /// Expands per-augmented-coordinate scales into the flat solver layout, one copy per
    /// contrast row.
    pub(super) fn from_augmented(scales: &AlignedDVecN<AUGMENTED_DIMENSIONS>) -> Self {
        let mut diagonal = BoxedDVecN::zero();
        for row in 0..CONTRAST_ROWS {
            diagonal.as_array_mut()[row * AUGMENTED_DIMENSIONS..(row + 1) * AUGMENTED_DIMENSIONS]
                .copy_from_slice(scales.as_array());
        }
        Self { diagonal }
    }

    /// Applies `D⁻¹` componentwise: one division per coordinate.
    pub(super) fn divide(
        &self,
        vector: &AlignedDVecN<SOLVER_DIMENSIONS>,
    ) -> BoxedDVecN<SOLVER_DIMENSIONS> {
        let mut quotient = BoxedDVecN::new(DVecN::from_ref(vector.as_array()));
        quotient.divide_components(&self.diagonal);
        quotient
    }

    /// The diagonal in flat contrast-major layout.
    #[inline]
    pub(super) const fn diagonal(&self) -> &AlignedDVecN<SOLVER_DIMENSIONS> {
        &self.diagonal
    }
}

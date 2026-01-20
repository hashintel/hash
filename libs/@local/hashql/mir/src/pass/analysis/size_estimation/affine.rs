//! Affine equations for tracking size dependencies on function parameters.
//!
//! When a function's output size depends on its input sizes, we model this as an affine equation:
//!
//! ```text
//! y = c₁·param₁ + c₂·param₂ + ... + k
//! ```
//!
//! Where:
//! - `cᵢ` are coefficients (how much each parameter contributes to the output size)
//! - `k` is the constant term (size contribution independent of parameters)
//!
//! This allows the analysis to propagate size information through function calls.

use core::cmp;

use hashql_core::collections::{InlineVec, small_vec_from_elem};

use crate::pass::analysis::dataflow::lattice::{
    AdditiveMonoid, JoinSemiLattice, SaturatingSemiring,
};

type Coefficient = u16;

/// Maximum coefficients stored inline before spilling to heap.
#[expect(clippy::integer_division, clippy::integer_division_remainder_used)]
const MAX_INLINE_COEFFICIENTS: usize = size_of::<usize>() / size_of::<Coefficient>() * 2;

/// An affine equation representing size as a linear function of parameters.
///
/// Models `y = c₁·a + c₂·b + ... + k` where coefficients track how each parameter
/// contributes to the total size.
#[derive(Debug, PartialEq, Eq, Hash)]
pub struct AffineEquation<T> {
    /// Coefficients for each function parameter (index matches parameter position).
    pub coefficients: InlineVec<Coefficient, MAX_INLINE_COEFFICIENTS>,
    /// The constant term (size independent of parameters).
    pub constant: T,
}

impl<T> AffineEquation<T> {
    /// Creates an equation that equals exactly the parameter at `index`.
    ///
    /// Produces `y = 1·paramᵢ + 0` (coefficient 1 at position `index`, zero elsewhere).
    #[must_use]
    pub fn coefficient(index: usize, length: usize) -> Self
    where
        SaturatingSemiring: AdditiveMonoid<T>,
    {
        let mut coefficients = small_vec_from_elem(length, 0 as Coefficient);
        coefficients[index] = 1;

        Self {
            coefficients,
            constant: SaturatingSemiring.zero(),
        }
    }
}

impl<T: Clone> Clone for AffineEquation<T> {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            coefficients: self.coefficients.clone(),
            constant: self.constant.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self {
            coefficients,
            constant,
        } = self;

        coefficients.clone_from(&source.coefficients);
        constant.clone_from(&source.constant);
    }
}

impl<T> AdditiveMonoid<AffineEquation<T>> for SaturatingSemiring
where
    Self: AdditiveMonoid<T> + AdditiveMonoid<u16>,
{
    fn zero(&self) -> AffineEquation<T> {
        AffineEquation {
            coefficients: InlineVec::new(),
            constant: self.zero(),
        }
    }

    fn plus(&self, lhs: &mut AffineEquation<T>, rhs: &AffineEquation<T>) -> bool {
        let mut changed = false;

        if rhs.coefficients.len() > lhs.coefficients.len() {
            lhs.coefficients.resize(rhs.coefficients.len(), self.zero());
        }

        for (lhs_coeff, rhs_coeff) in lhs.coefficients.iter_mut().zip(rhs.coefficients.iter()) {
            changed |= self.plus(lhs_coeff, rhs_coeff);
        }

        changed |= self.plus(&mut lhs.constant, &rhs.constant);

        changed
    }
}

impl<T> JoinSemiLattice<AffineEquation<T>> for SaturatingSemiring
where
    Self: JoinSemiLattice<T>,
{
    fn join(&self, lhs: &mut AffineEquation<T>, rhs: &AffineEquation<T>) -> bool {
        let mut changed = false;

        if rhs.coefficients.len() > lhs.coefficients.len() {
            lhs.coefficients.resize(rhs.coefficients.len(), self.zero());
        }

        for (lhs_coeff, rhs_coeff) in lhs.coefficients.iter_mut().zip(rhs.coefficients.iter()) {
            let prev = *lhs_coeff;
            *lhs_coeff = cmp::max(*lhs_coeff, *rhs_coeff);
            changed |= prev != *lhs_coeff;
        }

        changed |= self.join(&mut lhs.constant, &rhs.constant);

        changed
    }
}

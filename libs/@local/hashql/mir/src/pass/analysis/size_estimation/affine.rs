use core::cmp;

use hashql_core::collections::InlineVec;

use crate::pass::analysis::dataflow::lattice::{JoinSemiLattice, SaturatingSemiring};

// For dynamic values, we use a linear equation that takes into account the params. this means we
// have two parts, we first have the first part, which is the dynamic value, and then the underlying
// unit as base value.
// Our linear equation is of the form `y = ma + nb + .. + x`, we use a u16 here because that's large
// enough.
type Coefficient = u16;
#[expect(clippy::integer_division, clippy::integer_division_remainder_used)]
const MAX_INLINE_COEFFICIENTS: usize = size_of::<usize>() / size_of::<Coefficient>() * 2;

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct AffineEquation<T> {
    pub coefficients: InlineVec<Coefficient, MAX_INLINE_COEFFICIENTS>,
    pub constant: T,
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

impl<T> JoinSemiLattice<AffineEquation<T>> for SaturatingSemiring
where
    Self: JoinSemiLattice<T>,
{
    fn join(&self, lhs: &mut AffineEquation<T>, rhs: &AffineEquation<T>) -> bool {
        let mut changed = false;

        for (lhs_coeff, rhs_coeff) in lhs.coefficients.iter_mut().zip(rhs.coefficients.iter()) {
            let prev = *lhs_coeff;
            *lhs_coeff = cmp::max(*lhs_coeff, *rhs_coeff);
            changed |= prev != *lhs_coeff;
        }

        changed |= self.join(&mut lhs.constant, &rhs.constant);

        changed
    }
}

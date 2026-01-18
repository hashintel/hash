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

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct AffineEquation<T> {
    pub coefficients: InlineVec<Coefficient, MAX_INLINE_COEFFICIENTS>,
    pub constant: T,
}

impl<T> JoinSemiLattice<AffineEquation<T>> for SaturatingSemiring
where
    SaturatingSemiring: JoinSemiLattice<T>,
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

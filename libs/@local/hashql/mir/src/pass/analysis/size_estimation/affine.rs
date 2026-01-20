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
#[derive(Debug)]
pub struct AffineEquation<T> {
    /// Coefficients for each function parameter (index matches parameter position).
    pub coefficients: InlineVec<Coefficient, MAX_INLINE_COEFFICIENTS>,
    /// The constant term (size independent of parameters).
    pub constant: T,
}

impl<T: PartialEq> PartialEq for AffineEquation<T> {
    fn eq(&self, other: &Self) -> bool {
        let Self {
            coefficients,
            constant,
        } = self;

        // Compare constant first, then prefix, then verify trailing coefficients are zero
        let min = coefficients.len().min(other.coefficients.len());
        *constant == other.constant
            && coefficients[..min] == other.coefficients[..min]
            && coefficients[min..].iter().all(|&value| value == 0)
            && other.coefficients[min..].iter().all(|&value| value == 0)
    }
}

impl<T: Eq> Eq for AffineEquation<T> {}

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

#[cfg(test)]
mod tests {
    #![expect(clippy::min_ident_chars)]
    use crate::pass::analysis::{
        dataflow::lattice::{
            AdditiveMonoid as _, JoinSemiLattice as _, SaturatingSemiring,
            laws::{assert_additive_monoid, assert_join_semilattice},
        },
        size_estimation::{AffineEquation, InformationRange},
    };

    fn make_affine(
        coeffs: impl IntoIterator<Item = u16>,
        constant: InformationRange,
    ) -> AffineEquation<InformationRange> {
        AffineEquation {
            coefficients: coeffs.into_iter().collect(),
            constant,
        }
    }

    #[test]
    fn coefficient_constructor_correctness() {
        let eq: AffineEquation<InformationRange> = AffineEquation::coefficient(2, 5);

        assert_eq!(eq.coefficients.as_slice(), &[0, 0, 1, 0, 0]);
        assert_eq!(eq.constant, InformationRange::empty());
    }

    #[test]
    fn plus_handles_mismatched_lengths() {
        let mut lhs = make_affine([1, 2, 3], InformationRange::empty());
        let rhs = make_affine([4, 5, 6, 7, 8], InformationRange::empty());

        SaturatingSemiring.plus(&mut lhs, &rhs);

        assert_eq!(lhs.coefficients.len(), 5);
    }

    #[test]
    fn plus_computes_pointwise_sum() {
        let mut lhs = make_affine([1, 2, 3], InformationRange::one());
        let rhs = make_affine([4, 5, 6], InformationRange::one());

        SaturatingSemiring.plus(&mut lhs, &rhs);

        assert_eq!(lhs.coefficients.as_slice(), &[5, 7, 9]);

        let expected_constant = {
            let mut c = InformationRange::one();
            SaturatingSemiring.plus(&mut c, &InformationRange::one());
            c
        };
        assert_eq!(lhs.constant, expected_constant);
    }

    #[test]
    fn join_computes_pointwise_max() {
        let mut lhs = make_affine([1, 5, 3], InformationRange::empty());
        let rhs = make_affine([4, 2, 6], InformationRange::one());

        SaturatingSemiring.join(&mut lhs, &rhs);

        assert_eq!(lhs.coefficients.as_slice(), &[4, 5, 6]);
        assert_eq!(lhs.constant, InformationRange::one());
    }

    #[test]
    fn laws() {
        let a = make_affine([1, 2], InformationRange::one());
        let b = make_affine([3, 4], InformationRange::empty());
        let c = make_affine([5, 6], InformationRange::full());

        assert_additive_monoid(&SaturatingSemiring, a.clone(), b.clone(), c.clone());
        assert_join_semilattice(&SaturatingSemiring, a, b, c);
    }

    #[test]
    fn partial_eq_ignores_trailing_zeros() {
        let short = make_affine([1, 2], InformationRange::one());
        let long_with_zeros = make_affine([1, 2, 0, 0, 0], InformationRange::one());
        let long_with_nonzero = make_affine([1, 2, 0, 0, 1], InformationRange::one());

        assert_eq!(short, long_with_zeros);
        assert_eq!(long_with_zeros, short);
        assert_ne!(short, long_with_nonzero);
        assert_ne!(long_with_nonzero, short);
    }

    #[test]
    fn partial_eq_empty_coefficients_equals_all_zeros() {
        let empty = make_affine([], InformationRange::one());
        let all_zeros = make_affine([0, 0, 0], InformationRange::one());
        let not_all_zeros = make_affine([0, 1, 0], InformationRange::one());

        assert_eq!(empty, all_zeros);
        assert_eq!(all_zeros, empty);
        assert_ne!(empty, not_all_zeros);
    }
}

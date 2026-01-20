//! Estimate type that can be either constant or parameter-dependent.
//!
//! An [`Estimate`] wraps a value type (like [`InformationRange`] or [`Cardinality`]) and
//! tracks whether it's a fixed constant or depends on function parameters via an
//! [`AffineEquation`].

use core::{fmt, mem};

use hashql_core::collections::small_vec_from_elem;

use super::{affine::AffineEquation, range::SaturatingMul};
use crate::pass::analysis::dataflow::lattice::{
    AdditiveMonoid, HasBottom, JoinSemiLattice, SaturatingSemiring,
};

/// A size estimate that may be constant or depend on function parameters.
///
/// - `Constant`: A fixed value independent of inputs
/// - `Affine`: A value computed as a linear combination of parameter sizes
#[derive(Debug)]
pub enum Estimate<T> {
    /// A fixed constant value.
    Constant(T),
    /// A value that depends on function parameters via an affine equation.
    Affine(AffineEquation<T>),
}

impl<T: PartialEq> PartialEq for Estimate<T> {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Constant(lhs), Self::Constant(rhs)) => lhs == rhs,
            (Self::Affine(lhs), Self::Affine(rhs)) => lhs == rhs,
            // Cross-variant: compare constant first for early exit, then check coefficients
            (Self::Constant(lhs), Self::Affine(rhs)) => {
                *lhs == rhs.constant && rhs.coefficients.iter().all(|&value| value == 0)
            }
            (Self::Affine(lhs), Self::Constant(rhs)) => {
                lhs.constant == *rhs && lhs.coefficients.iter().all(|&value| value == 0)
            }
        }
    }
}

impl<T: Eq> Eq for Estimate<T> {}

impl<T: fmt::Display> fmt::Display for Estimate<T> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Constant(value) => fmt::Display::fmt(value, fmt),
            Self::Affine(affine) => fmt::Display::fmt(affine, fmt),
        }
    }
}

impl<T: Clone> Clone for Estimate<T> {
    #[inline]
    fn clone(&self) -> Self {
        match self {
            Self::Constant(constant) => Self::Constant(constant.clone()),
            Self::Affine(affine) => Self::Affine(affine.clone()),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        match (self, source) {
            (Self::Constant(lhs), Self::Constant(rhs)) => lhs.clone_from(rhs),
            (Self::Affine(lhs), Self::Affine(rhs)) => lhs.clone_from(rhs),
            (this, source) => *this = source.clone(),
        }
    }
}

impl<T> Estimate<T> {
    /// Returns the constant term (for `Constant`) or the equation's constant (for `Affine`).
    pub(crate) const fn constant(&self) -> &T {
        match self {
            Self::Constant(value) => value,
            Self::Affine(equation) => &equation.constant,
        }
    }

    /// Returns the coefficients (empty slice for `Constant`).
    pub(crate) fn coefficients(&self) -> &[u16] {
        match self {
            Self::Constant(_) => &[],
            Self::Affine(equation) => &equation.coefficients,
        }
    }

    /// Returns mutable access to the coefficients.
    pub(crate) fn coefficients_mut(&mut self) -> &mut [u16] {
        match self {
            Self::Constant(_) => &mut [],
            Self::Affine(equation) => &mut equation.coefficients,
        }
    }

    /// Returns mutable access to the constant term.
    pub(crate) const fn constant_mut(&mut self) -> &mut T {
        match self {
            Self::Constant(value) => value,
            Self::Affine(equation) => &mut equation.constant,
        }
    }

    /// Ensures the estimate has at least `length` coefficient slots.
    ///
    /// Upgrades `Constant` to `Affine` if coefficients are needed.
    fn resize_coefficients(&mut self, length: usize)
    where
        T: Clone,
    {
        match self {
            Self::Constant(_) if length == 0 => {}
            Self::Constant(constant) => {
                let constant = constant.clone();

                *self = Self::Affine(AffineEquation {
                    coefficients: small_vec_from_elem(length, 0),
                    constant,
                });
            }
            Self::Affine(equation) => {
                let len = equation.coefficients.len().max(length);
                equation.coefficients.resize(len, 0);
            }
        }
    }

    /// Computes `self += other * coefficient` with saturation.
    ///
    /// Adds `other`'s coefficients and constant (scaled by `coefficient`) to `self`.
    pub(crate) fn saturating_mul_add(&mut self, other: &Self, coefficient: u16)
    where
        T: Clone,
        for<'a> &'a T: SaturatingMul<u16, Output = T>,
        SaturatingSemiring: AdditiveMonoid<T>,
    {
        self.resize_coefficients(other.coefficients().len());

        for (coeff, other_coeff) in self
            .coefficients_mut()
            .iter_mut()
            .zip(other.coefficients().iter())
        {
            *coeff = coeff.saturating_add(other_coeff.saturating_mul(coefficient));
        }

        SaturatingSemiring.plus(
            self.constant_mut(),
            &other.constant().saturating_mul(coefficient),
        );
    }
}

impl<T> AdditiveMonoid<Estimate<T>> for SaturatingSemiring
where
    Self: AdditiveMonoid<T> + AdditiveMonoid<AffineEquation<T>>,
    T: Clone,
{
    fn zero(&self) -> Estimate<T> {
        Estimate::Constant(self.zero())
    }

    fn plus(&self, lhs: &mut Estimate<T>, rhs: &Estimate<T>) -> bool {
        match (lhs, rhs) {
            (Estimate::Constant(lhs), Estimate::Constant(rhs)) => self.plus(lhs, rhs),
            (lhs @ Estimate::Constant(_), Estimate::Affine(rhs)) => {
                // Result must be Affine to preserve rhs's parameter dependencies.
                // We compute rhs + lhs instead of lhs + rhs, which is valid because
                // the additive monoid is commutative.
                let Estimate::Constant(constant) = mem::replace(lhs, Estimate::Affine(rhs.clone()))
                else {
                    unreachable!("lhs was just verified to be Constant")
                };

                self.plus(lhs.constant_mut(), &constant);
                true
            }
            (Estimate::Affine(lhs), Estimate::Constant(rhs)) => self.plus(&mut lhs.constant, rhs),
            (Estimate::Affine(lhs), Estimate::Affine(rhs)) => self.plus(lhs, rhs),
        }
    }
}

impl<T> JoinSemiLattice<Estimate<T>> for SaturatingSemiring
where
    Self: JoinSemiLattice<T> + JoinSemiLattice<AffineEquation<T>> + HasBottom<T>,
    T: Clone,
{
    fn join(&self, lhs: &mut Estimate<T>, rhs: &Estimate<T>) -> bool {
        match (lhs, rhs) {
            (Estimate::Constant(lhs), Estimate::Constant(rhs)) => self.join(lhs, rhs),
            (Estimate::Affine(lhs), Estimate::Affine(rhs)) => self.join(lhs, rhs),
            (lhs @ Estimate::Constant(_), Estimate::Affine(rhs)) => {
                // Result must be Affine to preserve rhs's parameter dependencies.
                // We compute rhs ⊔ lhs instead of lhs ⊔ rhs, which is valid because
                // the semilattice join is commutative.
                let Estimate::Constant(constant) = mem::replace(lhs, Estimate::Affine(rhs.clone()))
                else {
                    unreachable!("lhs was just verified to be Constant")
                };

                self.join(lhs.constant_mut(), &constant);
                true
            }
            (Estimate::Affine(lhs), Estimate::Constant(rhs)) => self.join(&mut lhs.constant, rhs),
        }
    }
}

impl<T> HasBottom<Estimate<T>> for SaturatingSemiring
where
    Self: HasBottom<T>,
{
    fn bottom(&self) -> Estimate<T> {
        Estimate::Constant(self.bottom())
    }

    fn is_bottom(&self, value: &Estimate<T>) -> bool {
        match value {
            Estimate::Constant(value) => self.is_bottom(value),
            Estimate::Affine(affine) => {
                affine.coefficients.iter().all(|&value| value == 0)
                    && self.is_bottom(&affine.constant)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    #![expect(clippy::min_ident_chars)]
    use core::ops::Bound;

    use super::Estimate;
    use crate::pass::analysis::{
        dataflow::lattice::{
            AdditiveMonoid as _, HasBottom as _, JoinSemiLattice as _, SaturatingSemiring,
            laws::{
                assert_additive_monoid, assert_bounded_join_semilattice,
                assert_is_bottom_consistent,
            },
        },
        size_estimation::{AffineEquation, InformationRange, InformationUnit},
    };

    fn constant(val: InformationRange) -> Estimate<InformationRange> {
        Estimate::Constant(val)
    }

    fn affine(
        coeffs: impl IntoIterator<Item = u16>,
        constant: InformationRange,
    ) -> Estimate<InformationRange> {
        Estimate::Affine(AffineEquation {
            coefficients: coeffs.into_iter().collect(),
            constant,
        })
    }

    fn range(min: u32, max: u32) -> InformationRange {
        InformationRange::new(
            InformationUnit::new(min),
            Bound::Included(InformationUnit::new(max)),
        )
    }

    #[test]
    fn plus_upgrades_constant_to_affine() {
        let semiring = SaturatingSemiring;

        let c = constant(range(10, 20));
        let a = affine([3, 5], range(2, 4));

        let mut result = c.clone();
        semiring.plus(&mut result, &a);

        let Estimate::Affine(eq) = &result else {
            panic!("Expected Affine, got Constant");
        };
        assert_eq!(eq.coefficients.as_slice(), &[3, 5]);
        assert_eq!(eq.constant, range(12, 24));

        let mut result2 = a.clone();
        semiring.plus(&mut result2, &c);

        let Estimate::Affine(eq2) = &result2 else {
            panic!("Expected Affine, got Constant");
        };
        assert_eq!(eq2.coefficients.as_slice(), &[3, 5]);
        assert_eq!(eq2.constant, range(12, 24));

        assert_eq!(result, result2);
    }

    #[test]
    fn join_upgrades_constant_to_affine() {
        let semiring = SaturatingSemiring;

        let c = constant(range(5, 10));
        let a = affine([2, 4], range(1, 3));

        let mut result = c.clone();
        semiring.join(&mut result, &a);

        let Estimate::Affine(eq) = &result else {
            panic!("Expected Affine, got Constant");
        };
        assert_eq!(eq.coefficients.as_slice(), &[2, 4]);
        assert_eq!(eq.constant, range(1, 10));

        let mut result2 = a.clone();
        semiring.join(&mut result2, &c);

        let Estimate::Affine(eq2) = &result2 else {
            panic!("Expected Affine, got Constant");
        };
        assert_eq!(eq2.coefficients.as_slice(), &[2, 4]);
        assert_eq!(eq2.constant, range(1, 10));

        assert_eq!(result, result2);
    }

    #[test]
    fn saturating_mul_add_formula() {
        let mut estimate = affine([10, 20], range(100, 200));
        let other = affine([5, 3], range(50, 60));

        estimate.saturating_mul_add(&other, 2);

        assert_eq!(estimate.coefficients(), &[20, 26]);
        assert_eq!(*estimate.constant(), range(200, 320));

        let mut estimate2 = constant(range(10, 20));
        let other2 = affine([1, 2, 3], range(5, 10));

        estimate2.saturating_mul_add(&other2, 3);

        assert_eq!(estimate2.coefficients(), &[3, 6, 9]);
        assert_eq!(*estimate2.constant(), range(25, 50));
    }

    #[test]
    fn is_bottom_correctness() {
        let semiring = SaturatingSemiring;

        let bottom_constant = constant(InformationRange::empty());
        assert!(semiring.is_bottom(&bottom_constant));

        let bottom_affine = affine([0, 0, 0], InformationRange::empty());
        assert!(semiring.is_bottom(&bottom_affine));

        let not_bottom_coeff = affine([0, 1, 0], InformationRange::empty());
        assert!(!semiring.is_bottom(&not_bottom_coeff));

        let not_bottom_const = affine([0, 0], range(1, 1));
        assert!(!semiring.is_bottom(&not_bottom_const));

        let not_bottom_simple = constant(range(1, 5));
        assert!(!semiring.is_bottom(&not_bottom_simple));
    }

    #[test]
    fn laws() {
        let semiring = SaturatingSemiring;

        let a = constant(range(1, 10));
        let b = affine([1, 2], range(5, 15));
        let c = affine([3, 0, 1], range(0, 5));

        assert_additive_monoid(&semiring, a.clone(), b.clone(), c.clone());
        assert_bounded_join_semilattice(&semiring, a, b, c);
        assert_is_bottom_consistent::<SaturatingSemiring, Estimate<InformationRange>>(&semiring);
    }

    #[test]
    fn partial_eq_constant_equals_affine_with_zero_coefficients() {
        let c = constant(range(10, 20));
        let a_zero = affine([0, 0, 0], range(10, 20));
        let a_nonzero = affine([0, 1, 0], range(10, 20));

        assert_eq!(c, a_zero);
        assert_eq!(a_zero, c);
        assert_ne!(c, a_nonzero);
        assert_ne!(a_nonzero, c);
    }

    #[test]
    fn partial_eq_affine_ignores_trailing_zeros() {
        let short = affine([1, 2], range(5, 10));
        let long_zeros = affine([1, 2, 0, 0], range(5, 10));
        let long_nonzero = affine([1, 2, 0, 1], range(5, 10));

        assert_eq!(short, long_zeros);
        assert_eq!(long_zeros, short);
        assert_ne!(short, long_nonzero);
    }

    #[test]
    fn partial_eq_empty_affine_equals_constant() {
        let c = constant(range(1, 5));
        let empty_affine = affine([], range(1, 5));

        assert_eq!(c, empty_affine);
        assert_eq!(empty_affine, c);
    }
}

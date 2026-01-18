use core::mem;

use super::affine::AffineEquation;
use crate::pass::analysis::dataflow::lattice::{
    AdditiveMonoid, HasBottom, JoinSemiLattice, SaturatingSemiring,
};

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum Estimate<T> {
    Constant(T),
    Affine(AffineEquation<T>),
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
    const fn constant_mut(&mut self) -> &mut T {
        match self {
            Self::Constant(value) => value,
            Self::Affine(equation) => &mut equation.constant,
        }
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
                let Estimate::Constant(constant) = mem::replace(lhs, Estimate::Affine(rhs.clone()))
                else {
                    unreachable!("we have just verified that this is a constant")
                };

                // The additive monoid is commutative and associative, so we are allowed to swap the
                // order of addition
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
                let Estimate::Constant(constant) = mem::replace(lhs, Estimate::Affine(rhs.clone()))
                else {
                    unreachable!("we have just verified that this is a constant")
                };

                // semilattice is commutative and associative, so we can just swap the operands
                self.join(lhs.constant_mut(), &constant);

                true // We **have** changed something by cloning the coefficients
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

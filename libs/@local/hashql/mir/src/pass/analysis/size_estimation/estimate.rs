use core::mem;

use super::affine::AffineEquation;
use crate::pass::analysis::dataflow::lattice::{HasBottom, JoinSemiLattice, SaturatingSemiring};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Estimate<T> {
    Constant(T),
    Affine(AffineEquation<T>),
}

impl<T> Estimate<T> {
    fn constant_mut(&mut self) -> &mut T {
        match self {
            Estimate::Constant(value) => value,
            Estimate::Affine(equation) => &mut equation.constant,
        }
    }
}

impl<T> JoinSemiLattice<Estimate<T>> for SaturatingSemiring
where
    SaturatingSemiring: JoinSemiLattice<T> + JoinSemiLattice<AffineEquation<T>> + HasBottom<T>,
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
    SaturatingSemiring: HasBottom<T>,
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

use super::affine::AffineEquation;
use crate::pass::analysis::dataflow::lattice::{HasBottom, SaturatingSemiring};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Estimate<T> {
    Constant(T),
    Affine(AffineEquation<T>),
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

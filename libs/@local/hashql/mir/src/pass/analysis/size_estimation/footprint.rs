use core::alloc::Allocator;

use hashql_core::heap::TryCloneIn;

use super::{
    affine::AffineEquation,
    estimate::Estimate,
    range::{Cardinality, InformationRange},
};
use crate::{
    body::local::LocalVec,
    pass::analysis::dataflow::lattice::{
        AdditiveMonoid, HasBottom, JoinSemiLattice, SaturatingSemiring,
    },
};

pub(crate) struct BodyFootprintSemilattice<A: Allocator> {
    pub alloc: A,
    pub domain_size: usize,
    pub args: usize,
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct BodyFootprint<A: Allocator> {
    pub args: usize,
    pub locals: LocalVec<Footprint, A>,
    pub returns: Footprint,
}

impl<A: Allocator, B: Allocator> TryCloneIn<B> for BodyFootprint<A> {
    type Cloned = BodyFootprint<B>;

    fn try_clone_in(&self, allocator: B) -> Result<Self::Cloned, core::alloc::AllocError> {
        let Self {
            args: params,
            locals,
            returns,
        } = self;

        let locals = locals.try_clone_in(allocator)?;

        Ok(BodyFootprint {
            args: *params,
            locals,
            returns: returns.clone(),
        })
    }

    fn try_clone_into(
        &self,
        into: &mut Self::Cloned,
        allocator: B,
    ) -> Result<(), core::alloc::AllocError> {
        let Self {
            args: params,
            locals,
            returns,
        } = self;

        into.args = *params;
        locals.try_clone_into(&mut into.locals, allocator)?;
        into.returns.clone_from(returns);

        Ok(())
    }
}

impl<A: Allocator + Clone> Clone for BodyFootprint<A> {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            args: self.args,
            locals: self.locals.clone(),
            returns: self.returns.clone(),
        }
    }

    fn clone_from(&mut self, source: &Self) {
        let Self {
            args: params,
            locals,
            returns,
        } = self;

        *params = source.args;
        locals.clone_from(&source.locals);
        returns.clone_from(&source.returns);
    }
}

impl<A: Allocator> JoinSemiLattice<BodyFootprint<A>> for BodyFootprintSemilattice<A> {
    fn join(&self, lhs: &mut BodyFootprint<A>, rhs: &BodyFootprint<A>) -> bool {
        assert_eq!(lhs.locals.len(), rhs.locals.len());

        let mut changed = false;
        for (lhs_local, rhs_local) in lhs.locals.iter_mut().zip(rhs.locals.iter()) {
            changed |= SaturatingSemiring.join(lhs_local, rhs_local);
        }
        changed |= SaturatingSemiring.join(&mut lhs.returns, &rhs.returns);

        changed
    }
}

impl<A: Allocator + Clone> HasBottom<BodyFootprint<A>> for BodyFootprintSemilattice<A> {
    fn bottom(&self) -> BodyFootprint<A> {
        BodyFootprint {
            args: self.args,
            locals: LocalVec::from_elem_in(
                SaturatingSemiring.bottom(),
                self.domain_size,
                self.alloc.clone(),
            ),
            returns: SaturatingSemiring.bottom(),
        }
    }

    fn is_bottom(&self, value: &BodyFootprint<A>) -> bool {
        value
            .locals
            .iter()
            .all(|local| SaturatingSemiring.is_bottom(local))
            && SaturatingSemiring.is_bottom(&value.returns)
    }
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct Footprint {
    pub units: Estimate<InformationRange>,
    pub cardinality: Estimate<Cardinality>,
}

impl Footprint {
    pub const fn scalar() -> Self {
        Self {
            units: Estimate::Constant(InformationRange::one()),
            cardinality: Estimate::Constant(Cardinality::one()),
        }
    }

    pub const fn unknown() -> Self {
        Self {
            units: Estimate::Constant(InformationRange::full()),
            cardinality: Estimate::Constant(Cardinality::one()),
        }
    }

    pub fn coefficient(index: usize, length: usize) -> Self {
        Self {
            units: Estimate::Affine(AffineEquation::coefficient(index, length)),
            cardinality: Estimate::Affine(AffineEquation::coefficient(index, length)),
        }
    }

    pub fn saturating_mul(&self, units_coefficient: u16, cardinality_coefficient: u16) -> Self {
        Self {
            units: self.units.saturating_mul(units_coefficient),
            cardinality: self.cardinality.saturating_mul(cardinality_coefficient),
        }
    }
}

impl Clone for Footprint {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            units: self.units.clone(),
            cardinality: self.cardinality.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self { units, cardinality } = self;

        units.clone_from(&source.units);
        cardinality.clone_from(&source.cardinality);
    }
}

impl AdditiveMonoid<Footprint> for SaturatingSemiring {
    fn zero(&self) -> Footprint {
        Footprint {
            units: self.zero(),
            cardinality: self.zero(),
        }
    }

    fn plus(&self, lhs: &mut Footprint, rhs: &Footprint) -> bool {
        self.plus(&mut lhs.units, &rhs.units) || self.plus(&mut lhs.cardinality, &rhs.cardinality)
    }
}

impl JoinSemiLattice<Footprint> for SaturatingSemiring {
    fn join(&self, lhs: &mut Footprint, rhs: &Footprint) -> bool {
        self.join(&mut lhs.units, &rhs.units) || self.join(&mut lhs.cardinality, &rhs.cardinality)
    }
}

impl HasBottom<Footprint> for SaturatingSemiring {
    fn bottom(&self) -> Footprint {
        Footprint {
            units: self.bottom(),
            cardinality: self.bottom(),
        }
    }

    fn is_bottom(&self, value: &Footprint) -> bool {
        self.is_bottom(&value.units) && self.is_bottom(&value.cardinality)
    }
}

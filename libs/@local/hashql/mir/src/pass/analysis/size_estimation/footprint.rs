use core::alloc::Allocator;

use hashql_core::heap::TryCloneIn;

use super::{
    estimate::Estimate,
    range::{Cardinality, InformationRange},
};
use crate::{
    body::local::LocalVec,
    pass::analysis::dataflow::lattice::{HasBottom, JoinSemiLattice, SaturatingSemiring},
};

pub(crate) struct BodyFootprintSemilattice<A: Allocator> {
    pub alloc: A,
    pub domain_size: usize,
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct BodyFootprint<A: Allocator> {
    pub locals: LocalVec<Footprint, A>,
    pub returns: Footprint,
}

impl<A: Allocator, B: Allocator> TryCloneIn<B> for BodyFootprint<A> {
    type Cloned = BodyFootprint<B>;

    fn try_clone_in(&self, allocator: B) -> Result<Self::Cloned, core::alloc::AllocError> {
        let Self { locals, returns } = self;

        let locals = locals.try_clone_in(allocator)?;

        Ok(BodyFootprint {
            locals,
            returns: returns.clone(),
        })
    }

    fn try_clone_into(
        &self,
        into: &mut Self::Cloned,
        allocator: B,
    ) -> Result<(), core::alloc::AllocError> {
        let Self { locals, returns } = self;

        locals.try_clone_into(&mut into.locals, allocator)?;
        into.returns.clone_from(returns);

        Ok(())
    }
}

impl<A: Allocator + Clone> Clone for BodyFootprint<A> {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            locals: self.locals.clone(),
            returns: self.returns.clone(),
        }
    }

    fn clone_from(&mut self, source: &Self) {
        let Self { locals, returns } = self;

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

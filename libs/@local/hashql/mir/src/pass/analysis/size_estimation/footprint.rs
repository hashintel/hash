use super::{
    estimate::Estimate,
    range::{Cardinality, InformationRange},
};
use crate::pass::analysis::dataflow::lattice::{HasBottom, JoinSemiLattice, SaturatingSemiring};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Footprint {
    pub units: Estimate<InformationRange>,
    pub cardinality: Estimate<Cardinality>,
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

use super::{
    estimate::Estimate,
    range::{Cardinality, InformationRange},
};
use crate::pass::analysis::dataflow::lattice::{HasBottom, SaturatingSemiring};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Bandwidth {
    pub units: Estimate<InformationRange>,
    pub cardinality: Estimate<Cardinality>,
}

impl HasBottom<Bandwidth> for SaturatingSemiring {
    fn bottom(&self) -> Bandwidth {
        Bandwidth {
            units: self.bottom(),
            cardinality: self.bottom(),
        }
    }

    fn is_bottom(&self, value: &Bandwidth) -> bool {
        self.is_bottom(&value.units) && self.is_bottom(&value.cardinality)
    }
}

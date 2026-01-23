use core::{alloc::Allocator, cmp::Reverse};

use hashql_core::id::bit_vec::DenseBitSet;

use super::cost::CostVec;
use crate::{
    body::{Body, local::Local},
    pass::analysis::dataflow::{
        framework::DataflowAnalysis,
        lattice::{JoinSemiLattice, MeetSemiLattice, PowersetLattice},
    },
};

struct PostgresSemilattice {
    powerset: PowersetLattice,
}

struct PostgresDomain<A: Allocator> {
    internal: DenseBitSet<Local>,
}

impl<A: Allocator> JoinSemiLattice<PostgresDomain<A>> for PostgresSemilattice {
    fn join(&self, lhs: &mut PostgresDomain<A>, rhs: &PostgresDomain<A>) -> bool {
        // We only join over the internal dense bitset, in reverse (aka via meet)
        return self.powerset.meet(&mut lhs.internal, &rhs.internal);
    }
}

struct PostgresAnalysis;

// TODO: we need access to a residual that we can just continuously update without state
// interference?
impl<'heap> DataflowAnalysis<'heap> for PostgresAnalysis {
    type Domain<A: Allocator> = DenseBitSet<Local>;
    type Lattice<A: Allocator + Clone> = Reverse<PowersetLattice>;
    type Metadata<A: Allocator> = !;
    type SwitchIntData = !;

    fn lattice_in<A: Allocator + Clone>(&self, body: &Body<'heap>, _: A) -> Self::Lattice<A> {
        Reverse(PowersetLattice::new(body.local_decls.len()))
    }

    fn initialize_boundary<A: Allocator>(
        &self,
        body: &Body<'heap>,
        domain: &mut Self::Domain<A>,
        _: A,
    ) {
        domain.insert_range(Local::new(0)..Local::new(body.args));
    }

    fn transfer_statement<A: Allocator>(
        &self,
        location: crate::body::location::Location,
        statement: &crate::body::statement::Statement<'heap>,
        state: &mut Self::Domain<A>,
    ) {
        // TODO: we need statement residual, maybe in the domain?!
    }
}

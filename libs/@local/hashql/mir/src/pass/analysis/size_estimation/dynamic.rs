use core::alloc::Allocator;

use hashql_core::heap::CloneIn as _;

use super::footprint::{BodyFootprint, BodyFootprintSemilattice};
use crate::{
    body::{
        Body, basic_block::BasicBlockId, local::Local, location::Location, operand::Operand,
        statement::Statement, terminator::Terminator,
    },
    pass::analysis::dataflow::framework::{DataflowAnalysis, Direction},
};

struct SizeEstimationDataflowAnalysis<A: Allocator> {
    boundary: BodyFootprint<A>,
}

impl<'heap, B: Allocator> DataflowAnalysis<'heap> for SizeEstimationDataflowAnalysis<B> {
    type Domain<A: Allocator> = BodyFootprint<A>;
    type Lattice<A: Allocator + Clone> = BodyFootprintSemilattice<A>;
    type SwitchIntData = !;

    const DIRECTION: Direction = Direction::Forward;

    fn lattice_in<A: Allocator + Clone>(&self, body: &Body<'heap>, alloc: A) -> Self::Lattice<A> {
        BodyFootprintSemilattice {
            alloc,
            domain_size: body.local_decls.len(),
        }
    }

    fn initialize_boundary<A: Allocator>(
        &self,
        _: &Body<'heap>,
        domain: &mut Self::Domain<A>,
        alloc: A,
    ) {
        self.boundary.clone_into(domain, alloc);
    }

    fn transfer_statement<A: Allocator>(
        &self,
        location: Location,
        statement: &Statement<'heap>,
        state: &mut Self::Domain<A>,
    ) {
        // check if the statement location requires adjustment, otherwise just... don't.
    }

    fn transfer_edge<A: Allocator>(
        &self,
        source_block: BasicBlockId,
        source_args: &[Operand<'heap>],

        target_block: BasicBlockId,
        target_params: &[Local],

        state: &mut Self::Domain<A>,
    ) {
        // our domain must be the `BodyBandwidth` I think, with an efficient clone from?
        // for places we estimate, the root is easy for places we take a look at the resulting type,
        // if it's easy? pog, otherwise? We just take the place as the worst estimate, if anything
        // we narrow in places, so this is a good estimation.
    }

    fn transfer_terminator<A: Allocator>(
        &self,
        location: Location,
        terminator: &Terminator<'heap>,
        state: &mut Self::Domain<A>,
    ) {
        // This is only needed on return
    }
}

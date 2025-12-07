#[cfg(test)]
mod tests;

use core::alloc::Allocator;

use hashql_core::{id::bit_vec::DenseBitSet, intern::Interned};

use super::{
    framework::{DataflowAnalysis, Direction},
    lattice::PowersetLattice,
};
use crate::{
    body::{
        Body,
        local::Local,
        location::Location,
        place::{DefUse, PlaceContext},
        statement::Statement,
        terminator::Terminator,
    },
    visit::Visitor,
};

pub struct LivenessAnalysis;

impl<'heap> DataflowAnalysis<'heap> for LivenessAnalysis {
    type Domain<A: Allocator> = DenseBitSet<Local>;
    type Lattice<A: Allocator> = PowersetLattice;
    type SwitchIntData = !;

    const DIRECTION: Direction = Direction::Backward;

    fn lattice_in<A: Allocator>(&self, body: &Body<'heap>, _: A) -> Self::Lattice<A> {
        PowersetLattice::new(body.local_decls.len())
    }

    fn initialize_boundary<A: Allocator>(&self, _: &Body<'heap>, _: &mut Self::Domain<A>) {
        // No variables are live until we observe their first use
    }

    fn transfer_block_params<A: Allocator>(
        &self,
        location: Location,
        params: Interned<'heap, [Local]>,
        state: &mut Self::Domain<A>,
    ) {
        Ok(()) = TransferFunction(state).visit_basic_block_params(location, params);
    }

    fn transfer_statement<A: Allocator>(
        &self,
        location: Location,
        statement: &Statement<'heap>,
        state: &mut Self::Domain<A>,
    ) {
        Ok(()) = TransferFunction(state).visit_statement(location, statement);
    }

    fn transfer_terminator<A: Allocator>(
        &self,
        location: Location,
        terminator: &Terminator<'heap>,
        state: &mut Self::Domain<A>,
    ) {
        Ok(()) = TransferFunction(state).visit_terminator(location, terminator);
    }
}

struct TransferFunction<'mir>(pub &'mir mut DenseBitSet<Local>);

impl Visitor<'_> for TransferFunction<'_> {
    type Result = Result<(), !>;

    fn visit_local(&mut self, _: Location, context: PlaceContext, local: Local) -> Self::Result {
        let Some(def_use) = context.into_def_use() else {
            return Ok(());
        };

        match def_use {
            DefUse::Def => self.0.remove(local),
            DefUse::PartialDef | DefUse::Use => self.0.insert(local),
        };

        Ok(())
    }
}

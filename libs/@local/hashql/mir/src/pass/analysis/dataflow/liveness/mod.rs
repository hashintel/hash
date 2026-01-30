//! Liveness analysis for HashQL MIR.
//!
//! Liveness analysis determines which variables may be read before being written at each
//! program point. A variable is *live* at a point if there exists a path from that point to a
//! use of the variable that does not pass through a definition.
//!
//! # Transfer Function
//!
//! For each instruction, the transfer function:
//! - **Kills** (removes from live set): variables that are defined
//! - **Gens** (adds to live set): variables that are used
//!
//! # Example
//!
//! ```text
//! bb0:
//!     x = 5       // x is defined, kills x
//!     y = x + 1   // x is used, gens x; y is defined, kills y
//!     return y    // y is used, gens y
//!
//! Live at entry of bb0: {}
//! Live at exit of bb0: {}
//! ```

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

/// Computes liveness information for all locals in a MIR body.
///
/// A local is live at a program point if its current value may be read along some
/// path before being overwritten.
pub struct LivenessAnalysis;

impl<'heap> DataflowAnalysis<'heap> for LivenessAnalysis {
    type Domain<A: Allocator> = DenseBitSet<Local>;
    type Lattice<A: Allocator + Clone> = PowersetLattice;
    type SwitchIntData = !;

    const DIRECTION: Direction = Direction::Backward;

    fn lattice_in<A: Allocator + Clone>(&self, body: &Body<'heap>, _: A) -> Self::Lattice<A> {
        PowersetLattice::new(body.local_decls.len())
    }

    fn initialize_boundary<A: Allocator>(&self, _: &Body<'heap>, _: &mut Self::Domain<A>, _: A) {
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

struct TransferFunction<'mir>(&'mir mut DenseBitSet<Local>);

impl Visitor<'_> for TransferFunction<'_> {
    type Result = Result<(), !>;

    fn visit_local(&mut self, _: Location, context: PlaceContext, local: Local) -> Self::Result {
        let Some(def_use) = context.into_def_use() else {
            return Ok(());
        };

        match def_use {
            // Full definition kills liveness - the variable gets a new value
            DefUse::Def => self.0.remove(local),
            // Partial definitions and uses generate liveness - the current value is needed
            DefUse::PartialDef | DefUse::Use => self.0.insert(local),
        };

        Ok(())
    }
}

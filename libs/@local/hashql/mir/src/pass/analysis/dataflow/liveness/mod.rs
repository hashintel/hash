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
//! # Analysis Variants
//!
//! This module provides two liveness analyses:
//!
//! - [`LivenessAnalysis`]: Standard liveness following the gen/kill semantics above.
//! - [`TraversalLivenessAnalysis`]: Traversal-aware liveness that suppresses uses of a traversal
//!   source when assigning to a known traversal destination.
//!
//! ## Traversal-Aware Liveness
//!
//! When performing traversal extraction, a source local (e.g., `entity`) may have multiple
//! partial projections extracted into separate destination locals (e.g., `entity.uuid`,
//! `entity.name`). Standard liveness would mark `entity` as live at every assignment to these
//! destinations, even though only the projections are needed.
//!
//! [`TraversalLivenessAnalysis`] takes a [`Traversals`] reference and modifies the transfer
//! function: when an assignment's left-hand side is a full definition of a registered traversal
//! destination, uses of the traversal source on the right-hand side are *not* generated.
//!
//! ```text
//! // Given: traversals.source() = _1, traversals.contains(_2) = true
//! bb0:
//!     _2 = _1.uuid   // Standard: gens _1. Traversal-aware: skips _1 (full def of _2)
//!     _3 = _1.name   // If _3 not in traversals: gens _1 normally
//!     return _2
//! ```
//!
//! This allows dead code elimination to remove the source local when all its uses are through
//! extracted traversals.
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
        statement::{Assign, Statement, StatementKind},
        terminator::Terminator,
    },
    pass::transform::Traversals,
    visit::Visitor,
};

/// Traversal-aware liveness analysis.
///
/// Extends standard liveness with special handling for traversal extraction. When the left-hand
/// side of an assignment is a full definition of a traversal destination, uses of the traversal
/// source on the right-hand side are suppressed (not added to the live set).
///
/// This allows subsequent dead code elimination to remove the source local when its only uses
/// are through extracted traversal projections.
pub struct TraversalLivenessAnalysis<'ctx, 'heap> {
    pub traversals: &'ctx Traversals<'heap>,
}

impl<'heap> DataflowAnalysis<'heap> for TraversalLivenessAnalysis<'_, '_> {
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
        Ok(()) = TraversalTransferFunction(state, None).visit_basic_block_params(location, params);
    }

    fn transfer_statement<A: Allocator>(
        &self,
        location: Location,
        statement: &Statement<'heap>,
        state: &mut Self::Domain<A>,
    ) {
        // This is the pattern that's exhibited by explicit traversal extraction, in particular.
        // Meaning we skip any assignments to our local, as long as it is a `Def`, to the particular
        // chosen source.
        let skip_uses_of = if let StatementKind::Assign(Assign { lhs, rhs: _ }) = &statement.kind
            && lhs.projections.is_empty()
            && self.traversals.contains(lhs.local)
        {
            Some(self.traversals.source())
        } else {
            None
        };

        Ok(()) =
            TraversalTransferFunction(state, skip_uses_of).visit_statement(location, statement);
    }

    fn transfer_terminator<A: Allocator>(
        &self,
        location: Location,
        terminator: &Terminator<'heap>,
        state: &mut Self::Domain<A>,
    ) {
        Ok(()) = TraversalTransferFunction(state, None).visit_terminator(location, terminator);
    }
}

struct TraversalTransferFunction<'mir>(&'mir mut DenseBitSet<Local>, Option<Local>);

impl Visitor<'_> for TraversalTransferFunction<'_> {
    type Result = Result<(), !>;

    fn visit_local(&mut self, _: Location, context: PlaceContext, local: Local) -> Self::Result {
        let Some(def_use) = context.into_def_use() else {
            return Ok(());
        };

        match def_use {
            // Full definition kills liveness - the variable gets a new value
            DefUse::Def => self.0.remove(local),
            // Partial definitions and uses generate liveness - the current value is needed
            DefUse::Use if Some(local) == self.1 => false,
            DefUse::PartialDef | DefUse::Use => self.0.insert(local),
        };

        Ok(())
    }
}

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

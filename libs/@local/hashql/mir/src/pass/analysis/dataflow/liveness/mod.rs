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
//! - [`TraversalLivenessAnalysis`]: Tracks local liveness alongside per-vertex path liveness.
//!
//! ## Traversal-Aware Liveness
//!
//! In a [`GraphReadFilter`] body, the vertex local (`_1`) is an input representing a graph
//! vertex. Rather than tracking the vertex as a monolithic live value, this analysis resolves
//! each vertex projection to an [`EntityPath`] and records it in a [`TraversalPathBitSet`].
//! The vertex local itself is never marked live in the local bitset.
//!
//! This allows edge cost computation to sum only the [`InformationRange`] of live paths,
//! rather than charging the full entity size at every edge where the vertex is used.
//!
//! ```text
//! bb0:
//!     _2 = _1.metadata.archived  // gens EntityPath::Archived in path bitset, _1 stays dead
//!     _3 = _1.properties         // gens EntityPath::Properties in path bitset, _1 stays dead
//!     _4 = _1                    // unresolvable: insert_all in path bitset, _1 stays dead
//!     return _2
//! ```
//!
//! [`GraphReadFilter`]: crate::body::Source::GraphReadFilter
//! [`InformationRange`]: crate::pass::analysis::size_estimation::InformationRange
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
        place::{DefUse, Place, PlaceContext},
        statement::Statement,
        terminator::Terminator,
    },
    pass::execution::{
        VertexType,
        traversal::{EntityPath, TraversalLattice, TraversalPathBitSet},
    },
    visit::{self, Visitor},
};

/// Liveness analysis that tracks local liveness and per-vertex path liveness in parallel.
///
/// The domain is `(DenseBitSet<Local>, TraversalPathBitSet)`:
/// - The local bitset tracks which locals are live, with the vertex local excluded entirely.
/// - The path bitset tracks which vertex field paths are live (resolved via [`EntityPath`]).
///
/// When the vertex is accessed through a resolvable projection (e.g., `_1.metadata.archived`),
/// the corresponding [`EntityPath`] is gen'd in the path bitset. When the projection cannot be
/// resolved (bare `_1` or unknown path), all paths are marked live via
/// [`insert_all`](EntityPathBitSet::insert_all).
pub struct TraversalLivenessAnalysis {
    pub vertex: VertexType,
}

impl<'heap> DataflowAnalysis<'heap> for TraversalLivenessAnalysis {
    type Domain<A: Allocator> = (DenseBitSet<Local>, TraversalPathBitSet);
    type Lattice<A: Allocator + Clone> = (PowersetLattice, TraversalLattice);
    type SwitchIntData = !;

    const DIRECTION: Direction = Direction::Backward;

    fn lattice_in<A: Allocator + Clone>(&self, body: &Body<'heap>, _: A) -> Self::Lattice<A> {
        let locals = PowersetLattice::new(body.local_decls.len());
        let paths = TraversalLattice::new(self.vertex);

        (locals, paths)
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
        let (locals, paths) = state;
        Ok(()) =
            TraversalTransferFunction { locals, paths }.visit_basic_block_params(location, params);
    }

    fn transfer_statement<A: Allocator>(
        &self,
        location: Location,
        statement: &Statement<'heap>,
        state: &mut Self::Domain<A>,
    ) {
        let (locals, paths) = state;
        Ok(()) = TraversalTransferFunction { locals, paths }.visit_statement(location, statement);
    }

    fn transfer_terminator<A: Allocator>(
        &self,
        location: Location,
        terminator: &Terminator<'heap>,
        state: &mut Self::Domain<A>,
    ) {
        let (locals, paths) = state;
        Ok(()) = TraversalTransferFunction { locals, paths }.visit_terminator(location, terminator);
    }
}

struct TraversalTransferFunction<'mir> {
    locals: &'mir mut DenseBitSet<Local>,
    paths: &'mir mut TraversalPathBitSet,
}

impl Visitor<'_> for TraversalTransferFunction<'_> {
    type Result = Result<(), !>;

    fn visit_local(&mut self, _: Location, context: PlaceContext, local: Local) -> Self::Result {
        let Some(def_use) = context.into_def_use() else {
            return Ok(());
        };

        if local == Local::VERTEX {
            debug_assert_eq!(
                def_use,
                DefUse::Use,
                "vertex local is immutable in GraphReadFilter bodies"
            );
            return Ok(());
        }

        match def_use {
            DefUse::Def => self.locals.remove(local),
            DefUse::PartialDef | DefUse::Use => self.locals.insert(local),
        };

        Ok(())
    }

    fn visit_place(
        &mut self,
        location: Location,
        context: PlaceContext,
        place: &Place<'_>,
    ) -> Self::Result {
        if place.local == Local::VERTEX && Some(DefUse::Use) == context.into_def_use() {
            match self.paths {
                TraversalPathBitSet::Entity(bitset) => {
                    if let Some((path, _)) = EntityPath::resolve(&place.projections) {
                        bitset.insert(path);
                    } else {
                        bitset.insert_all();
                    }
                }
            }
        }

        visit::r#ref::walk_place(self, location, context, place)
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

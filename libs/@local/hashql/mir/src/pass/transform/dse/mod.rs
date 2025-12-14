//! Dead Store Elimination (DSE) pass for MIR.
//!
//! This module provides [`DeadStoreElimination`], a transform pass that removes assignments,
//! storage statements, and block parameters whose values are never used. The pass uses a
//! backwards "mark-live" algorithm that correctly handles dead cycles in the dataflow graph.
//!
//! # Algorithm
//!
//! The pass operates in two phases:
//!
//! 1. **Analysis**: Build a dependency graph and identify live locals via backwards propagation.
//! 2. **Elimination**: Remove statements, block params, and target args for dead locals.
//!
//! ## Analysis Phase
//!
//! The analysis distinguishes between two types of uses:
//!
//! - **Root uses**: Uses that are directly observable (return values, branch conditions, graph
//!   reads). These seed the liveness propagation.
//! - **Dataflow uses**: Uses within assignment RHS or target args that flow into another local's
//!   definition. These create edges in the dependency graph.
//!
//! A dependency graph is built where edges point from a definition to its operands
//! (`def → operand`). Starting from root uses, liveness propagates backwards through outgoing
//! edges: if a local is live, all locals it depends on are also live.
//!
//! This approach correctly handles dead cycles: if a set of locals form a cycle with no path to
//! any root use, none are marked live and all are eliminated.
//!
//! ## Elimination Phase
//!
//! After computing the dead set (complement of live), the pass removes:
//!
//! - Assignments to dead locals (converted to `Nop`, then removed)
//! - `StorageLive`/`StorageDead` for dead locals
//! - Dead block parameters and their corresponding target arguments
//!
//! # Requirements
//!
//! This pass requires the MIR to be in SSA form:
//!
//! - Each local has exactly one definition
//! - No `PartialDef` contexts exist
//! - No aliasing or mutation through references

use core::{alloc::Allocator, convert::Infallible};

use hashql_core::{
    collections::WorkQueue,
    graph::{LinkedGraph, NodeId},
    heap::Scratch,
    id::{Id as _, bit_vec::DenseBitSet},
    intern::Interned,
};

use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId, BasicBlockVec},
        local::Local,
        location::Location,
        operand::Operand,
        place::{DefUse, PlaceContext},
        statement::{Assign, Statement, StatementKind},
        terminator::{GraphRead, Target},
    },
    context::MirContext,
    intern::Interner,
    pass::TransformPass,
    visit::{self, Visitor, VisitorMut, r#mut::filter},
};

/// A transform pass that eliminates dead stores from MIR.
///
/// Dead stores are assignments, storage statements, and block parameters whose values are never
/// used in any observable way. This includes locals that are only used by other dead locals,
/// even in cyclic dependency patterns.
pub struct DeadStoreElimination {
    scratch: Scratch,
}

impl DeadStoreElimination {
    /// Computes the set of dead locals in the body.
    ///
    /// Uses a backwards "mark-live" algorithm: starting from root uses (observable uses like
    /// return values and branch conditions), propagates liveness through the dependency graph.
    /// Returns the complement (all locals not marked live).
    fn dead_locals(&self, body: &Body<'_>) -> DenseBitSet<Local> {
        let mut dependencies = DependencyVisitor::new_in(body, &self.scratch);
        dependencies.visit_body(body);

        let DependencyVisitor {
            body: _,
            graph,
            mut live,
            roots: mut queue,
            current_def: _,
        } = dependencies;

        while let Some(local) = queue.dequeue() {
            for edge in graph.outgoing_edges(NodeId::new(local.as_usize())) {
                let dependency = Local::new(edge.target().as_usize());
                if live.insert(dependency) {
                    queue.enqueue(dependency);
                }
            }
        }

        live.negate();
        live
    }
}

impl<'env, 'heap> TransformPass<'env, 'heap> for DeadStoreElimination {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        let dead = self.dead_locals(body);
        let mut visitor = EliminationVisitor {
            dead,
            params: BasicBlockVec::from_fn_in(
                body.basic_blocks.len(),
                |block| body.basic_blocks[block].params,
                &self.scratch,
            ),
            interner: context.interner,
            scratch_locals: Vec::new_in(&self.scratch),
            scratch_operands: Vec::new_in(&self.scratch),
        };

        Ok(()) = visitor.visit_body_preserving_cfg(body);

        drop(visitor);
        self.scratch.reset();
    }
}

/// Visitor that builds the dependency graph and identifies root uses.
///
/// This visitor traverses the MIR body once, collecting:
///
/// - **Dependency edges** (`def → operand`): Created for each use within an assignment RHS or
///   target argument. Multiple uses of the same operand create multiple edges (preserving
///   multiplicity for correct use-count propagation).
///
/// - **Root uses**: Uses outside of any definition context (e.g., return values, branch
///   conditions). These are immediately marked live and enqueued for propagation.
///
/// The `current_def` field tracks which local is currently being defined. It is set when visiting
/// a `Def` context and reset to `Local::MAX` after each statement/target completes. Uses
/// encountered when `current_def == Local::MAX` are root uses.
struct DependencyVisitor<'body, 'heap, A: Allocator> {
    body: &'body Body<'heap>,

    /// Dependency graph where edges point from definitions to their operands.
    graph: LinkedGraph<(), (), A>,

    /// Bitset of locals known to be live.
    live: DenseBitSet<Local>,

    /// Work queue of root locals to propagate liveness from.
    roots: WorkQueue<Local, A>,

    /// The local currently being defined, or `Local::MAX` if not in a definition context.
    current_def: Local,
}

impl<'body, 'heap, A: Allocator> DependencyVisitor<'body, 'heap, A> {
    fn new_in(body: &'body Body<'heap>, alloc: A) -> Self
    where
        A: Clone,
    {
        let mut graph = LinkedGraph::new_in(alloc.clone());
        graph.derive(&body.local_decls, |_, _| ());

        Self {
            body,
            graph,

            live: DenseBitSet::new_empty(body.local_decls.len()),
            roots: WorkQueue::new_in(body.local_decls.len(), alloc),

            current_def: Local::MAX,
        }
    }
}

impl<'heap, A: Allocator> Visitor<'heap> for DependencyVisitor<'_, 'heap, A> {
    type Result = Result<(), !>;

    fn visit_statement_assign(
        &mut self,
        location: Location,
        assign: &Assign<'heap>,
    ) -> Self::Result {
        Ok(()) = visit::r#ref::walk_statement_assign(self, location, assign);

        self.current_def = Local::MAX;
        Ok(())
    }

    fn visit_basic_block_params(
        &mut self,
        _: Location,
        _: Interned<'heap, [Local]>,
    ) -> Self::Result {
        // Block params are handled via `visit_target`, where we pair each param with its
        // corresponding argument. Skip the default walk to avoid processing them twice.
        Ok(())
    }

    fn visit_target(&mut self, location: Location, target: &Target<'heap>) -> Self::Result {
        // Handle block params here instead of in `visit_basic_block_params` so we can pair
        // each param with its corresponding argument operand.
        let target_block = &self.body.basic_blocks[target.block];
        let params = &target_block.params;
        debug_assert_eq!(params.len(), target.args.len());

        for (&param, arg) in params.iter().zip(target.args) {
            self.current_def = param;
            Ok(()) = self.visit_operand(location, arg);
        }

        self.current_def = Local::MAX;
        Ok(())
    }

    fn visit_local(&mut self, _: Location, context: PlaceContext, local: Local) -> Self::Result {
        let Some(def_use) = context.into_def_use() else {
            return Ok(());
        };

        match def_use {
            DefUse::Def => self.current_def = local,
            DefUse::PartialDef => unimplemented!("MIR must be in SSA"),
            DefUse::Use => {
                if self.current_def == Local::MAX {
                    // Root use: a use outside any definition context. This includes return values,
                    // branch conditions, and other terminator operands that aren't target args.
                    self.roots.enqueue(local);
                    self.live.insert(local);
                } else {
                    // Dataflow use: the current definition depends on this local. Create an edge
                    // from the definition to its operand.
                    self.graph.add_edge(
                        NodeId::new(self.current_def.as_usize()),
                        NodeId::new(local.as_usize()),
                        (),
                    );
                }
            }
        }

        Ok(())
    }

    fn visit_terminator_graph_read(
        &mut self,
        location: Location,
        graph_read: &GraphRead<'heap>,
    ) -> Self::Result {
        Ok(()) = visit::r#ref::walk_terminator_graph_read(self, location, graph_read);

        // The graph read's target block has a single param representing the graph effect token.
        // This token must be kept live because eliminating it would remove a side effect.
        let target_block = &self.body.basic_blocks[graph_read.target];
        debug_assert_eq!(target_block.params.len(), 1);

        let param = target_block.params[0];
        self.roots.enqueue(param);
        self.live.insert(param);
        Ok(())
    }
}

/// Visitor that eliminates dead stores from the MIR.
///
/// This mutable visitor removes:
///
/// - **Assignments** to dead locals (replaced with `Nop`, then removed)
/// - **Storage statements** (`StorageLive`/`StorageDead`) for dead locals
/// - **Block parameters** that are dead
/// - **Target arguments** corresponding to dead block parameters
///
/// The `params` field stores a snapshot of the original block parameters before modification,
/// ensuring that target argument removal correctly corresponds to the original parameter positions.
struct EliminationVisitor<'env, 'heap, A: Allocator> {
    /// Bitset of locals identified as dead by the analysis phase.
    dead: DenseBitSet<Local>,

    /// Snapshot of original block parameters (before elimination modifies them).
    params: BasicBlockVec<Interned<'heap, [Local]>, A>,

    interner: &'env Interner<'heap>,

    /// Scratch buffer for building new block parameter lists.
    scratch_locals: Vec<Local, A>,

    /// Scratch buffer for building new target argument lists.
    scratch_operands: Vec<Operand<'heap>, A>,
}

impl<'heap, A: Allocator> VisitorMut<'heap> for EliminationVisitor<'_, 'heap, A> {
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn visit_basic_block(
        &mut self,
        id: BasicBlockId,
        block: &mut BasicBlock<'heap>,
    ) -> Self::Result<()> {
        Ok(()) = visit::r#mut::walk_basic_block(self, id, block);

        // Remove any no-ops
        block
            .statements
            .retain(|statement| !matches!(statement.kind, StatementKind::Nop));

        // Remove any params that are dead
        if block.params.iter().any(|&param| self.dead.contains(param)) {
            self.scratch_locals.clear();
            self.scratch_locals.extend_from_slice(&block.params);
            self.scratch_locals
                .retain(|&param| !self.dead.contains(param));

            block.params = self.interner.locals.intern_slice(&self.scratch_locals);
        }

        Ok(())
    }

    fn visit_statement(
        &mut self,
        _: Location,
        statement: &mut Statement<'heap>,
    ) -> Self::Result<()> {
        let local = match &statement.kind {
            StatementKind::Assign(assign) => assign.lhs.local,
            &StatementKind::StorageLive(local) | &StatementKind::StorageDead(local) => local,
            StatementKind::Nop => return Ok(()),
        };

        if self.dead.contains(local) {
            statement.kind = StatementKind::Nop;
        }

        Ok(())
    }

    fn visit_target(&mut self, _: Location, target: &mut Target<'heap>) -> Self::Result<()> {
        let target_params = self.params[target.block];
        debug_assert_eq!(target_params.len(), target.args.len());

        // Skip if no params need to be removed.
        if !target_params.iter().any(|&param| self.dead.contains(param)) {
            return Ok(());
        }

        self.scratch_operands.clear();
        self.scratch_operands.extend_from_slice(&target.args);

        let mut index = 0;
        self.scratch_operands.retain(|_| {
            let should_retain = !self.dead.contains(target_params[index]);
            index += 1;

            should_retain
        });
        let operands = self.interner.operands.intern_slice(&self.scratch_operands);

        target.args = operands;

        Ok(())
    }
}

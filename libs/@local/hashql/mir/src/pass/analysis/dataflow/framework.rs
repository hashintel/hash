//! Dataflow analysis framework for HashQL MIR.
//!
//! This module provides a generic framework for implementing dataflow analyses over the MIR
//! control-flow graph. It supports both forward and backward analyses and handles the
//! fixed-point iteration automatically.
//!
//! # Overview
//!
//! Dataflow analysis computes information about program state at each point in the control-flow
//! graph. The framework iterates until a fixed point is reached, where no further changes occur.
//!
//! To implement a dataflow analysis:
//!
//! 1. Define a domain type that represents the abstract state at each program point
//! 2. Define a lattice that provides the algebraic operations over the domain
//! 3. Implement [`DataflowAnalysis`] with transfer functions for statements, terminators, and edges

use alloc::alloc::Global;
use core::alloc::Allocator;

use hashql_core::{collections::WorkQueue, graph::Predecessors as _, id::IdVec};

use super::lattice::{BoundedJoinSemiLattice, HasBottom as _, JoinSemiLattice as _};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId},
        local::Local,
        location::Location,
        operand::Operand,
        statement::Statement,
        terminator::{
            Goto, GraphRead, SwitchInt, SwitchIntValue, SwitchTargets, Terminator, TerminatorKind,
        },
    },
    pass::simplify_type_name,
};

/// The direction of dataflow propagation through the control-flow graph.
///
/// The direction determines:
/// - Which blocks are initialized as boundary conditions
/// - The order in which transfer functions are applied within a block
/// - How information flows between blocks
pub enum Direction {
    /// Information flows from predecessors to successors.
    ///
    /// Transfer functions are applied in program order: statements first (in order),
    /// then the terminator. The entry block is initialized with boundary conditions.
    Forward,

    /// Information flows from successors to predecessors.
    ///
    /// Transfer functions are applied in reverse program order: terminator first,
    /// then statements (in reverse order). Return blocks are initialized with boundary
    /// conditions.
    Backward,
}

/// The results of a dataflow analysis after reaching a fixed point.
///
/// Contains the computed abstract state for each basic block, representing the dataflow
/// facts that hold at the entry (for forward analyses) or exit (for backward analyses)
/// of each block.
pub struct DataflowResults<'heap, D: DataflowAnalysis<'heap>, A: Allocator = Global> {
    /// The analysis that produced these results.
    ///
    /// Returned to allow further inspection or to run additional analyses that depend
    /// on the same analysis state.
    pub analysis: D,

    /// The computed state for each basic block.
    ///
    /// For forward analyses, this is the state at block entry (before any statements).
    /// For backward analyses, this is the state at block exit (after the terminator).
    pub states: IdVec<BasicBlockId, D::Domain<A>, A>,
}

/// A dataflow analysis over the MIR control-flow graph.
///
/// Implementors define the abstract domain, lattice operations, and transfer functions
/// that describe how dataflow facts propagate through the program.
pub trait DataflowAnalysis<'heap> {
    /// The abstract state tracked at each program point.
    ///
    /// Must implement [`Clone`] for propagation between blocks. For efficiency, consider
    /// using types that support in-place cloning via [`clone_from`](Clone::clone_from),
    /// such as [`DenseBitSet`](hashql_core::id::bit_vec::DenseBitSet), which can reuse
    /// existing allocations.
    type Domain<A: Allocator>: Clone;

    /// The lattice providing algebraic operations over the domain.
    type Lattice<A: Allocator>: BoundedJoinSemiLattice<Self::Domain<A>>;

    /// Optional data computed for switch terminators to enable edge-specific refinement.
    ///
    /// When [`switch_int_data`](Self::switch_int_data) returns `Some`, the framework calls
    /// [`apply_switch_int_edge_effect`](Self::apply_switch_int_edge_effect) for each outgoing
    /// edge. Which allows analysis to refine state based on which branch was taken.
    ///
    /// The default type `!` (never) indicates no edge effects are used.
    type SwitchIntData = !;

    /// The direction of dataflow propagation.
    ///
    /// Defaults to [`Direction::Forward`].
    const DIRECTION: Direction = Direction::Forward;

    /// Returns a human-readable name for this analysis.
    ///
    /// Used for debugging and diagnostic output. The default implementation extracts
    /// the type name without module path or generic parameters.
    fn name(&self) -> &'static str {
        const { simplify_type_name(core::any::type_name::<Self>()) }
    }

    /// Creates a lattice instance for this analysis.
    fn lattice_in<A: Allocator>(&self, body: &Body<'heap>, alloc: A) -> Self::Lattice<A>;

    /// Initializes the boundary condition for the analysis.
    ///
    /// For forward analyses, this is called on the entry block ([`BasicBlockId::START`]).
    /// For backward analyses, this is called on each block with a
    /// [`Return`](TerminatorKind::Return) terminator.
    ///
    /// The `domain` is pre-initialized to [`bottom`](super::lattice::HasBottom::bottom);
    /// this method should modify it to represent the boundary condition.
    fn initialize_boundary<A: Allocator>(&self, body: &Body<'heap>, domain: &mut Self::Domain<A>);

    /// Computes optional data for a switch terminator to enable edge-specific refinement.
    ///
    /// If this returns `Some`, [`apply_switch_int_edge_effect`](Self::apply_switch_int_edge_effect)
    /// will be called for each outgoing edge of the switch. This allows analyses like constant
    /// propagation to refine the state based on which branch was taken.
    ///
    /// The default implementation returns `None`, disabling edge effects.
    ///
    /// # Note
    ///
    /// Edge effects are only supported for forward analyses. Backward analyses will panic
    /// if this method returns `Some`.
    #[expect(unused_variables, reason = "trait definition")]
    fn switch_int_data(
        &self,
        block: BasicBlockId,
        discriminant: &Operand<'heap>,
    ) -> Option<Self::SwitchIntData> {
        None
    }

    /// Applies edge-specific refinement for a switch branch.
    ///
    /// Called when [`switch_int_data`](Self::switch_int_data) returns `Some`. The `value`
    /// indicates which branch is being taken:
    /// - [`SwitchIntValue::Direct(n)`](SwitchIntValue::Direct) for explicit case `n`
    /// - [`SwitchIntValue::Otherwise`] for the default/otherwise branch
    ///
    /// The `data` parameter contains the value returned by `switch_int_data` and can be
    /// mutated across calls (e.g., to track which cases have been seen).
    ///
    /// The default implementation is unreachable since it's only called when `switch_int_data`
    /// returns `Some`.
    #[expect(unused_variables, reason = "trait definition")]
    fn apply_switch_int_edge_effect<A: Allocator>(
        &self,
        targets: &SwitchTargets,
        value: SwitchIntValue,
        state: &mut Self::Domain<A>,
        data: &mut Self::SwitchIntData,
    ) {
        unreachable!();
    }

    /// Applies the transfer function for a statement.
    ///
    /// Updates `state` to reflect the effect of executing `statement` at `location`.
    /// The default implementation does nothing (identity transfer).
    #[expect(unused_variables, reason = "trait definition")]
    fn transfer_statement<A: Allocator>(
        &self,
        location: Location,
        statement: &Statement<'heap>,
        state: &mut Self::Domain<A>,
    ) {
    }

    /// Applies the transfer function for a terminator.
    ///
    /// Updates `state` to reflect the effect of executing `terminator` at `location`.
    /// This is called before edge transfer functions. The default implementation does
    /// nothing (identity transfer).
    #[expect(unused_variables, reason = "trait definition")]
    fn transfer_terminator<A: Allocator>(
        &self,
        location: Location,
        terminator: &Terminator<'heap>,
        state: &mut Self::Domain<A>,
    ) {
    }

    /// Applies the transfer function for a control-flow edge.
    ///
    /// Called when control transfers from `source_block` to `target_block` via a
    /// [`Goto`] or [`SwitchInt`] terminator. The `source_args` are the operands passed
    /// from the source, and `target_params` are the corresponding parameters in the
    /// target block.
    ///
    /// This allows modeling parameter passing between blocks (e.g., for SSA-based analyses).
    /// The default implementation does nothing.
    #[expect(unused_variables, reason = "trait definition")]
    fn transfer_edge<A: Allocator>(
        &self,
        source_block: BasicBlockId,
        source_args: &[Operand<'heap>],

        target_block: BasicBlockId,
        target_params: &[Local],

        state: &mut Self::Domain<A>,
    ) {
    }

    /// Applies the transfer function for a graph read edge.
    ///
    /// Called when control transfers from a [`GraphRead`] terminator to its target block.
    /// Unlike regular edges, graph reads don't pass explicit arguments; instead, the query
    /// result is bound to the target block's first parameter.
    ///
    /// The default implementation does nothing.
    #[expect(unused_variables, reason = "trait definition")]
    fn transfer_graph_read_edge<A: Allocator>(
        &self,
        source_block: BasicBlockId,

        target_block: BasicBlockId,
        target_params: &[Local],

        state: &mut Self::Domain<A>,
    ) {
    }

    /// Runs the analysis to a fixed point using the provided allocator.
    ///
    /// Iterates over the control-flow graph, applying transfer functions and propagating
    /// state until no further changes occur. Returns the computed [`DataflowResults`].
    ///
    /// # Algorithm
    ///
    /// 1. Initialize all blocks to [`bottom`](super::lattice::HasBottom::bottom)
    /// 2. Apply boundary conditions via [`initialize_boundary`](Self::initialize_boundary)
    /// 3. Process blocks in an optimal order (reverse postorder for forward, postorder for
    ///    backward)
    /// 4. For each block, apply transfer functions and propagate to successors/predecessors
    /// 5. Re-queue blocks whose incoming state changed
    /// 6. Repeat until the work queue is empty (fixed point reached)
    fn iterate_to_fixpoint_in<A>(
        self,
        body: &Body<'heap>,
        alloc: A,
    ) -> DataflowResults<'heap, Self, A>
    where
        Self: Sized,
        A: Allocator + Clone,
    {
        let lattice = self.lattice_in(body, alloc.clone());

        let mut queue = WorkQueue::new_in(body.basic_blocks.len(), alloc.clone());
        let mut states = IdVec::from_fn_in(
            body.basic_blocks.len(),
            |_: BasicBlockId| lattice.bottom(),
            alloc,
        );

        // Initialize boundary conditions based on analysis direction
        match Self::DIRECTION {
            Direction::Forward => {
                self.initialize_boundary(body, &mut states[BasicBlockId::START]);
            }
            Direction::Backward => {
                for (bb, block) in body.basic_blocks.iter_enumerated() {
                    if matches!(block.terminator.kind, TerminatorKind::Return(_)) {
                        self.initialize_boundary(body, &mut states[bb]);
                    }
                }
            }
        }

        // Seed the work queue
        match Self::DIRECTION {
            Direction::Forward => {
                // reverse postorder ensures predecessors are processed before successors
                queue.extend(body.basic_blocks.reverse_postorder().iter().copied());
            }
            Direction::Backward => {
                // postorder ensures successors are processed before predecessors
                queue.extend(body.basic_blocks.reverse_postorder().iter().copied().rev());
            }
        }

        // Reuse a single state buffer across iterations to avoid repeated allocations.
        // This is particularly important for bitset domains where `clone_from` can reuse
        // the existing allocation rather than allocating a new one.
        let mut state = lattice.bottom();

        while let Some(bb) = queue.dequeue() {
            // Load the current state for this block. Using `clone_from` instead of
            // `clone` allows reusing the existing allocation in `state`.
            // Using a cloned state here allows us to liberally modify the exit state inside of the
            // driver, as the value isn't persisted.
            state.clone_from(&states[bb]);

            let driver = Driver {
                analysis: &self,
                lattice: &lattice,

                body,
                state: &mut state,
                id: bb,
                block: &body.basic_blocks[bb],
                propagate: |target: BasicBlockId, state: &Self::Domain<A>| {
                    // Join the propagated state into the target's state.
                    // If this changed the target's state, re-queue it for processing.
                    let changed = lattice.join(&mut states[target], state);
                    if changed {
                        queue.enqueue(target);
                    }
                },
            };

            match Self::DIRECTION {
                Direction::Forward => {
                    driver.forward();
                }
                Direction::Backward => {
                    driver.backward();
                }
            }
        }

        DataflowResults {
            analysis: self,
            states,
        }
    }

    /// Runs the analysis to a fixed point using the global allocator.
    ///
    /// Convenience wrapper around [`iterate_to_fixpoint_in`](Self::iterate_to_fixpoint_in).
    fn iterate_to_fixpoint(self, body: &Body<'heap>) -> DataflowResults<'heap, Self>
    where
        Self: Sized,
    {
        self.iterate_to_fixpoint_in(body, Global)
    }
}

/// Internal driver that processes a single basic block during fixed-point iteration.
///
/// Encapsulates the logic for applying transfer functions within a block and propagating
/// the resulting state to neighboring blocks. The `propagate` callback handles joining
/// state into neighbors and re-queueing changed blocks.
struct Driver<'analysis, 'heap, D: DataflowAnalysis<'heap> + ?Sized, A: Allocator, F> {
    analysis: &'analysis D,
    lattice: &'analysis D::Lattice<A>,

    body: &'analysis Body<'heap>,
    state: &'analysis mut D::Domain<A>,

    id: BasicBlockId,
    block: &'analysis BasicBlock<'heap>,

    /// Callback to propagate state to a neighboring block.
    ///
    /// Called with `(target_block, state)` after applying edge transfer functions.
    /// Should join the state into the target and re-queue if changed.
    propagate: F,
}

impl<
    'heap,
    D: DataflowAnalysis<'heap> + ?Sized,
    A: Allocator,
    F: FnMut(BasicBlockId, &D::Domain<A>),
> Driver<'_, 'heap, D, A, F>
{
    /// Processes the block in forward direction.
    ///
    /// Applies transfer functions in program order:
    /// 1. Statements (in order)
    /// 2. Terminator
    /// 3. Edge effects (propagate to successors)
    #[expect(clippy::too_many_lines, reason = "minimal amount")]
    fn forward(self) {
        let Self {
            analysis,
            lattice,

            body,
            state,
            id,
            block,
            mut propagate,
        } = self;

        // Apply transfer functions to each statement in program order.
        // Statement indices start at 1 because index 0 represents the block parameters.
        for (index, statement) in block.statements.iter().enumerate() {
            let location = Location {
                block: id,
                statement_index: index + 1,
            };

            analysis.transfer_statement(location, statement, state);
        }

        // Apply the terminator transfer function.
        // The terminator's statement index follows all statements.
        let location = Location {
            block: id,
            statement_index: block.statements.len() + 1,
        };

        analysis.transfer_terminator(location, &block.terminator, state);

        // After processing all instructions, `state` holds the exit state of this block.
        let exit_state = state;
        match &block.terminator.kind {
            TerminatorKind::Goto(Goto { target }) => {
                analysis.transfer_edge(
                    id,
                    &target.args,
                    target.block,
                    &body.basic_blocks[target.block].params,
                    exit_state,
                );

                propagate(target.block, exit_state);
            }
            &TerminatorKind::GraphRead(GraphRead {
                head: _,
                body: _,
                tail: _,
                target,
            }) => {
                analysis.transfer_graph_read_edge(
                    id,
                    target,
                    &body.basic_blocks[target].params,
                    exit_state,
                );

                propagate(target, exit_state);
            }
            TerminatorKind::SwitchInt(SwitchInt {
                discriminant,
                targets,
            }) => {
                if let Some(mut data) = analysis.switch_int_data(id, discriminant) {
                    // Edge effects are enabled: apply branch-specific refinement.
                    // We use `switch_data` as a reusable buffer, to avoid repeated allocations.
                    let mut switch_data = lattice.bottom();

                    // Process explicit case values (excludes the otherwise branch).
                    for (value, target) in targets.iter() {
                        switch_data.clone_from(exit_state);
                        analysis.apply_switch_int_edge_effect(
                            targets,
                            SwitchIntValue::Direct(value),
                            &mut switch_data,
                            &mut data,
                        );

                        analysis.transfer_edge(
                            id,
                            &target.args,
                            target.block,
                            &body.basic_blocks[target.block].params,
                            &mut switch_data,
                        );

                        propagate(target.block, &switch_data);
                    }

                    if let Some(otherwise) = targets.otherwise() {
                        // For the otherwise branch, we can mutate `exit_state` directly since
                        // it's the last edge and we don't need to preserve the original state.
                        analysis.apply_switch_int_edge_effect(
                            targets,
                            SwitchIntValue::Otherwise,
                            exit_state,
                            &mut data,
                        );

                        analysis.transfer_edge(
                            id,
                            &otherwise.args,
                            otherwise.block,
                            &body.basic_blocks[otherwise.block].params,
                            exit_state,
                        );

                        propagate(otherwise.block, exit_state);
                    }
                } else {
                    // No edge effects: propagate the same exit state to all targets.
                    // We still need per-edge copies because `transfer_edge` may modify the state
                    // (e.g., for parameter binding), and each edge should start from exit_state.
                    let mut switch_data = lattice.bottom();
                    for &target in targets.targets() {
                        switch_data.clone_from(exit_state);

                        analysis.transfer_edge(
                            id,
                            &target.args,
                            target.block,
                            &body.basic_blocks[target.block].params,
                            &mut switch_data,
                        );

                        propagate(target.block, &switch_data);
                    }
                }
            }
            TerminatorKind::Return(_) | TerminatorKind::Unreachable => {}
        }
    }

    /// Processes the block in backward direction.
    ///
    /// Applies transfer functions in reverse program order:
    /// 1. Terminator
    /// 2. Statements (in reverse order)
    /// 3. Edge effects (propagate to predecessors)
    fn backward(self) {
        let Self {
            analysis,
            lattice,
            body,
            state,
            id,
            block,
            mut propagate,
        } = self;

        // In backward analysis, we start from the exit and work toward the entry.
        // First, apply the terminator transfer function.
        let location = Location {
            block: id,
            statement_index: block.statements.len() + 1,
        };

        analysis.transfer_terminator(location, &block.terminator, state);

        // Apply statement transfer functions in reverse order.
        for (index, statement) in block.statements.iter().enumerate().rev() {
            let location = Location {
                block: id,
                statement_index: index + 1,
            };

            analysis.transfer_statement(location, statement, state);
        }

        // After processing all instructions in reverse, `state` holds the entry state.
        let entry_state = state;

        // Propagate to all predecessors. In backward analysis, we're computing what must
        // be true at the exit of predecessors for our entry requirements to be satisfied.
        for predecessor in body.basic_blocks.predecessors(id) {
            match &body.basic_blocks[predecessor].terminator.kind {
                TerminatorKind::Goto(Goto { target }) => {
                    debug_assert_eq!(target.block, id);

                    let mut state = entry_state.clone();
                    analysis.transfer_edge(
                        predecessor,
                        &target.args,
                        id,
                        &block.params,
                        &mut state,
                    );
                    propagate(predecessor, &state);
                }
                TerminatorKind::SwitchInt(SwitchInt {
                    discriminant,
                    targets,
                }) => {
                    // Edge effects (branch refinement) are not supported for backward analyses.
                    // There's no semantically correct way to apply "which branch was taken"
                    // refinement when propagating information backward.
                    if let Some(_data) = analysis.switch_int_data(predecessor, discriminant) {
                        unimplemented!("switch_int_data is not supported for backward analyses");
                    }

                    // A switch may have multiple edges to the same target (different values
                    // jumping to the same block). We need to join the effects of all such edges.
                    let mut combined = lattice.bottom();
                    // Reuse `edge_state` buffer across iterations to avoid repeated allocations.
                    let mut edge_state = lattice.bottom();

                    for &target in targets.targets() {
                        if target.block != id {
                            continue;
                        }

                        // Each matching edge contributes to the combined state.
                        edge_state.clone_from(entry_state);
                        analysis.transfer_edge(
                            predecessor,
                            &target.args,
                            id,
                            &block.params,
                            &mut edge_state,
                        );
                        lattice.join(&mut combined, &edge_state);
                    }

                    propagate(predecessor, &combined);
                }
                TerminatorKind::GraphRead(GraphRead {
                    head: _,
                    body: _,
                    tail: _,
                    target,
                }) => {
                    debug_assert_eq!(*target, id);

                    let mut state = entry_state.clone();
                    analysis.transfer_graph_read_edge(predecessor, id, &block.params, &mut state);
                    propagate(predecessor, &state);
                }

                TerminatorKind::Return(_) | TerminatorKind::Unreachable => {
                    // These terminators have no successors, so they can't be predecessors.
                    unreachable!("predecessor {predecessor} has no edge to {id}")
                }
            }
        }
    }
}

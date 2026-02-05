//! Terminator placement analysis for MIR execution planning.
//!
//! Complements [`StatementPlacement`] by analyzing control flow edges rather than individual
//! statements. For each terminator edge, produces a [`TransMatrix`] encoding which backend
//! transitions are valid and their associated transfer costs.
//!
//! The execution planner uses this to determine optimal points for backend switches during query
//! execution.
//!
//! # Main Types
//!
//! - [`TransMatrix`]: Per-edge transition costs indexed by (source, destination) target pairs
//! - [`TerminatorCostVec`]: Collection of transition matrices for all edges in a body
//! - [`TerminatorPlacement`]: Analysis driver that computes placement for a body
//!
//! # Transition Rules
//!
//! The analysis enforces these constraints on backend transitions:
//!
//! | Transition | Allowed? | Cost |
//! |------------|----------|------|
//! | Same backend (A → A) | Always | 0 |
//! | Any → Interpreter | Always | Transfer cost |
//! | Other → Postgres | Never | — |
//! | Any in loop → Postgres | Never | — |
//! | `GraphRead` edge | Interpreter → Interpreter only | 0 |
//! | `Goto` edge | Any supported transition | Transfer cost |
//! | `SwitchInt` edge | Same-backend or → Interpreter only | Transfer cost |
//!
//! Transfer cost is computed from the estimated size of live locals that must cross the edge.
//!
//! [`StatementPlacement`]: super::statement_placement::StatementPlacement

use alloc::alloc::Global;
use core::{
    alloc::Allocator,
    iter,
    ops::{Index, IndexMut},
};

use hashql_core::{
    graph::algorithms::{
        Tarjan,
        tarjan::{Metadata, SccId, StronglyConnectedComponents},
    },
    heap::Heap,
    id::{
        Id as _,
        bit_vec::{BitRelations as _, DenseBitSet},
    },
};

use super::{
    Cost,
    target::{TargetBitSet, TargetId},
};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId, BasicBlockSlice, BasicBlockVec},
        basic_blocks::BasicBlocks,
        local::Local,
        terminator::TerminatorKind,
    },
    context::MirContext,
    pass::analysis::{
        dataflow::{
            LivenessAnalysis,
            framework::{DataflowAnalysis as _, DataflowResults},
        },
        size_estimation::{BodyFootprint, Cardinality, InformationRange},
    },
};

/// Transition cost matrix for a single terminator edge.
///
/// Maps each (source, destination) [`TargetId`] pair to either `Some(cost)` if the transition is
/// valid, or `None` if disallowed. Supports indexing with tuple syntax: `matrix[(from, to)]`.
///
/// # Invariants
///
/// - Same-backend transitions (`A → A`) always have cost 0, enforced by [`insert`](Self::insert)
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TransMatrix {
    matrix: [Option<Cost>; TargetId::VARIANT_COUNT * TargetId::VARIANT_COUNT],
}

impl TransMatrix {
    /// Creates an empty matrix with all transitions disallowed.
    ///
    /// ```
    /// # use hashql_mir::pass::execution::terminator_placement::TransMatrix;
    /// # use hashql_mir::pass::execution::target::TargetId;
    /// let matrix = TransMatrix::new();
    /// assert!(
    ///     matrix
    ///         .get(TargetId::Interpreter, TargetId::Postgres)
    ///         .is_none()
    /// );
    /// ```
    #[must_use]
    pub const fn new() -> Self {
        Self {
            matrix: [None; TargetId::VARIANT_COUNT * TargetId::VARIANT_COUNT],
        }
    }

    #[inline]
    fn offset(from: TargetId, to: TargetId) -> usize {
        from.as_usize() * TargetId::VARIANT_COUNT + to.as_usize()
    }

    /// Returns the cost for transitioning from `from` to `to`, or `None` if disallowed.
    ///
    /// ```
    /// # use hashql_mir::pass::execution::terminator_placement::TransMatrix;
    /// # use hashql_mir::pass::execution::target::TargetId;
    /// # use hashql_mir::pass::execution::Cost;
    /// let mut matrix = TransMatrix::new();
    /// matrix.insert(
    ///     TargetId::Postgres,
    ///     TargetId::Interpreter,
    ///     Cost::new(100).unwrap(),
    /// );
    ///
    /// assert_eq!(
    ///     matrix.get(TargetId::Postgres, TargetId::Interpreter),
    ///     Some(Cost::new(100).unwrap())
    /// );
    /// assert_eq!(matrix.get(TargetId::Interpreter, TargetId::Postgres), None);
    /// ```
    #[inline]
    #[must_use]
    pub fn get(&self, from: TargetId, to: TargetId) -> Option<Cost> {
        self.matrix[Self::offset(from, to)]
    }

    /// Returns a mutable reference to the cost entry for the given transition.
    ///
    /// ```
    /// # use hashql_mir::pass::execution::terminator_placement::TransMatrix;
    /// # use hashql_mir::pass::execution::target::TargetId;
    /// # use hashql_mir::pass::execution::Cost;
    /// let mut matrix = TransMatrix::new();
    ///
    /// *matrix.get_mut(TargetId::Postgres, TargetId::Interpreter) = Some(Cost::new(50).unwrap());
    /// assert_eq!(
    ///     matrix.get(TargetId::Postgres, TargetId::Interpreter),
    ///     Some(Cost::new(50).unwrap())
    /// );
    /// ```
    #[inline]
    pub fn get_mut(&mut self, from: TargetId, to: TargetId) -> &mut Option<Cost> {
        &mut self.matrix[Self::offset(from, to)]
    }

    /// Inserts a transition with the given cost.
    ///
    /// Same-backend transitions (where `from == to`) are always recorded with cost 0,
    /// regardless of the `cost` argument.
    ///
    /// ```
    /// # use hashql_mir::pass::execution::terminator_placement::TransMatrix;
    /// # use hashql_mir::pass::execution::target::TargetId;
    /// # use hashql_mir::pass::execution::Cost;
    /// let mut matrix = TransMatrix::new();
    ///
    /// // Cross-backend transition uses the provided cost
    /// matrix.insert(
    ///     TargetId::Postgres,
    ///     TargetId::Interpreter,
    ///     Cost::new(100).unwrap(),
    /// );
    /// assert_eq!(
    ///     matrix.get(TargetId::Postgres, TargetId::Interpreter),
    ///     Some(Cost::new(100).unwrap())
    /// );
    ///
    /// // Same-backend transition is always zero cost
    /// matrix.insert(
    ///     TargetId::Interpreter,
    ///     TargetId::Interpreter,
    ///     Cost::new(100).unwrap(),
    /// );
    /// assert_eq!(
    ///     matrix.get(TargetId::Interpreter, TargetId::Interpreter),
    ///     Some(Cost::new(0).unwrap())
    /// );
    /// ```
    #[inline]
    pub fn insert(&mut self, from: TargetId, to: TargetId, mut cost: Cost) {
        if from == to {
            cost = cost!(0);
        }

        self.matrix[Self::offset(from, to)] = Some(cost);
    }

    /// Resets all transitions to disallowed.
    ///
    /// ```
    /// # use hashql_mir::pass::execution::terminator_placement::TransMatrix;
    /// # use hashql_mir::pass::execution::target::TargetId;
    /// # use hashql_mir::pass::execution::Cost;
    /// let mut matrix = TransMatrix::new();
    /// matrix.insert(
    ///     TargetId::Postgres,
    ///     TargetId::Interpreter,
    ///     Cost::new(10).unwrap(),
    /// );
    ///
    /// matrix.clear();
    /// assert!(
    ///     matrix
    ///         .get(TargetId::Postgres, TargetId::Interpreter)
    ///         .is_none()
    /// );
    /// ```
    #[inline]
    pub fn clear(&mut self) {
        self.matrix.fill(None);
    }

    /// Removes all incoming transitions to `target` from other backends.
    ///
    /// Self-loops (`target` → `target`) are preserved.
    ///
    /// ```
    /// # use hashql_mir::pass::execution::terminator_placement::TransMatrix;
    /// # use hashql_mir::pass::execution::target::TargetId;
    /// # use hashql_mir::pass::execution::Cost;
    /// let mut matrix = TransMatrix::new();
    /// matrix.insert(
    ///     TargetId::Interpreter,
    ///     TargetId::Postgres,
    ///     Cost::new(10).unwrap(),
    /// );
    /// matrix.insert(
    ///     TargetId::Postgres,
    ///     TargetId::Postgres,
    ///     Cost::new(0).unwrap(),
    /// );
    ///
    /// matrix.remove_incoming(TargetId::Postgres);
    ///
    /// // Incoming from other backends removed
    /// assert!(
    ///     matrix
    ///         .get(TargetId::Interpreter, TargetId::Postgres)
    ///         .is_none()
    /// );
    /// // Self-loop preserved
    /// assert!(matrix.get(TargetId::Postgres, TargetId::Postgres).is_some());
    /// ```
    #[inline]
    pub fn remove_incoming(&mut self, target: TargetId) {
        for source in TargetId::all() {
            if source == target {
                continue;
            }

            self.matrix[Self::offset(source, target)] = None;
        }
    }

    /// Removes all transitions both to and from `target`.
    ///
    /// ```
    /// # use hashql_mir::pass::execution::terminator_placement::TransMatrix;
    /// # use hashql_mir::pass::execution::target::TargetId;
    /// # use hashql_mir::pass::execution::Cost;
    /// let mut matrix = TransMatrix::new();
    /// matrix.insert(
    ///     TargetId::Interpreter,
    ///     TargetId::Postgres,
    ///     Cost::new(10).unwrap(),
    /// );
    /// matrix.insert(
    ///     TargetId::Postgres,
    ///     TargetId::Interpreter,
    ///     Cost::new(20).unwrap(),
    /// );
    /// matrix.insert(
    ///     TargetId::Postgres,
    ///     TargetId::Postgres,
    ///     Cost::new(0).unwrap(),
    /// );
    ///
    /// matrix.remove_all(TargetId::Postgres);
    ///
    /// assert!(
    ///     matrix
    ///         .get(TargetId::Interpreter, TargetId::Postgres)
    ///         .is_none()
    /// );
    /// assert!(
    ///     matrix
    ///         .get(TargetId::Postgres, TargetId::Interpreter)
    ///         .is_none()
    /// );
    /// assert!(matrix.get(TargetId::Postgres, TargetId::Postgres).is_none());
    /// ```
    pub fn remove_all(&mut self, target: TargetId) {
        for other in TargetId::all() {
            self.matrix[Self::offset(other, target)] = None;
            self.matrix[Self::offset(target, other)] = None;
        }
    }
}

impl Default for TransMatrix {
    fn default() -> Self {
        Self::new()
    }
}

impl Index<(TargetId, TargetId)> for TransMatrix {
    type Output = Option<Cost>;

    fn index(&self, (from, to): (TargetId, TargetId)) -> &Self::Output {
        &self.matrix[Self::offset(from, to)]
    }
}

impl IndexMut<(TargetId, TargetId)> for TransMatrix {
    fn index_mut(&mut self, (from, to): (TargetId, TargetId)) -> &mut Self::Output {
        &mut self.matrix[Self::offset(from, to)]
    }
}

/// Collection of [`TransMatrix`] entries for all terminator edges in a body.
///
/// Indexed by [`BasicBlockId`] via [`of`](Self::of), returning a slice of matrices corresponding
/// to that block's successor edges. The slice length matches the terminator's successor count:
///
/// | Terminator | Edges |
/// |------------|-------|
/// | [`Goto`] / [`GraphRead`] | 1 |
/// | [`SwitchInt`] | N (branch count) |
/// | [`Return`] / [`Unreachable`] | 0 |
///
/// [`Goto`]: TerminatorKind::Goto
/// [`GraphRead`]: TerminatorKind::GraphRead
/// [`SwitchInt`]: TerminatorKind::SwitchInt
/// [`Return`]: TerminatorKind::Return
/// [`Unreachable`]: TerminatorKind::Unreachable
pub struct TerminatorCostVec<A: Allocator = Global> {
    offsets: Box<BasicBlockSlice<u32>, A>,
    matrices: Vec<TransMatrix, A>,
}

impl<A: Allocator> TerminatorCostVec<A> {
    #[expect(unsafe_code)]
    fn compute_offsets(
        mut iter: impl ExactSizeIterator<Item = u32>,
        alloc: A,
    ) -> (Box<BasicBlockSlice<u32>, A>, usize) {
        let mut offsets = Box::new_uninit_slice_in(iter.len() + 1, alloc);
        let mut running_offset = 0_u32;

        offsets[0].write(0);

        let (_, rest) = offsets[1..].write_iter(iter::from_fn(|| {
            let successor_count = iter.next()?;
            running_offset += successor_count;
            Some(running_offset)
        }));

        debug_assert!(rest.is_empty());
        debug_assert_eq!(iter.len(), 0);

        // SAFETY: All elements initialized by write_iter loop.
        let offsets = unsafe { offsets.assume_init() };
        let offsets = BasicBlockSlice::from_boxed_slice(offsets);

        (offsets, running_offset as usize)
    }

    fn from_successor_counts(iter: impl ExactSizeIterator<Item = u32>, alloc: A) -> Self
    where
        A: Clone,
    {
        let (offsets, total_edges) = Self::compute_offsets(iter, alloc.clone());
        let matrices = alloc::vec::from_elem_in(TransMatrix::new(), total_edges, alloc);

        Self { offsets, matrices }
    }

    /// Creates a cost vector sized for `blocks`, with all transitions initially disallowed.
    pub fn new(blocks: &BasicBlocks, alloc: A) -> Self
    where
        A: Clone,
    {
        Self::from_successor_counts(blocks.iter().map(Self::successor_count), alloc)
    }

    #[expect(clippy::cast_possible_truncation)]
    fn successor_count(block: &BasicBlock) -> u32 {
        match &block.terminator.kind {
            TerminatorKind::SwitchInt(switch) => switch.targets.targets().len() as u32,
            TerminatorKind::Goto(_) | TerminatorKind::GraphRead(_) => 1,
            TerminatorKind::Return(_) | TerminatorKind::Unreachable => 0,
        }
    }

    /// Returns the transition matrices for all successor edges of `block`.
    pub fn of(&self, block: BasicBlockId) -> &[TransMatrix] {
        let start = self.offsets[block] as usize;
        let end = self.offsets[block.plus(1)] as usize;

        &self.matrices[start..end]
    }

    /// Returns mutable transition matrices for all successor edges of `block`.
    pub fn of_mut(&mut self, block: BasicBlockId) -> &mut [TransMatrix] {
        let start = self.offsets[block] as usize;
        let end = self.offsets[block.plus(1)] as usize;

        &mut self.matrices[start..end]
    }
}

/// Tarjan metadata that counts nodes per strongly connected component.
struct ComponentSizeMetadata;

impl<N, S> Metadata<N, S> for ComponentSizeMetadata {
    type Annotation = u32;

    fn annotate_node(&mut self, _: N) -> Self::Annotation {
        1
    }

    fn annotate_scc(&mut self, _: S, _: N) -> Self::Annotation {
        0
    }

    fn merge_into_scc(&mut self, lhs: &mut Self::Annotation, other: Self::Annotation) {
        *lhs += other;
    }

    fn merge_reachable(&mut self, _: &mut Self::Annotation, _: &Self::Annotation) {}
}

/// Parameters for populating a single edge's [`TransMatrix`].
struct PopulateEdgeMatrix {
    /// Backends the source block can execute on.
    source_targets: TargetBitSet,
    /// Backends the destination block can execute on.
    target_targets: TargetBitSet,

    /// Cost of transferring live data across this edge.
    transfer_cost: Cost,
    /// Whether this edge is part of a loop (disables Postgres transitions).
    is_in_loop: bool,
}

impl PopulateEdgeMatrix {
    /// Populates a transition matrix for a single terminator edge.
    fn populate(&self, matrix: &mut TransMatrix, terminator: &TerminatorKind) {
        self.add_same_backend_transitions(matrix);
        self.add_interpreter_fallback(matrix);
        self.add_terminator_specific_transitions(matrix, terminator);
        self.apply_postgres_restrictions(matrix);
    }

    /// Adds zero-cost transitions for staying on the same backend.
    fn add_same_backend_transitions(&self, matrix: &mut TransMatrix) {
        let mut common = self.target_targets;
        common.intersect(&self.source_targets);

        for target in &common {
            matrix.insert(target, target, cost!(0));
        }
    }

    /// Adds transitions to Interpreter (always allowed as fallback).
    fn add_interpreter_fallback(&self, matrix: &mut TransMatrix) {
        if !self.target_targets.contains(TargetId::Interpreter) {
            // TODO: warning that this shouldn't happen
            return;
        }

        for source in &self.source_targets {
            matrix.insert(source, TargetId::Interpreter, self.transfer_cost);
        }
    }

    /// Adds transitions based on terminator-specific rules.
    fn add_terminator_specific_transitions(
        &self,
        matrix: &mut TransMatrix,
        terminator: &TerminatorKind,
    ) {
        match terminator {
            TerminatorKind::Goto(_) => {
                self.add_goto_transitions(matrix);
            }
            TerminatorKind::SwitchInt(_) => {
                // SwitchInt does not allow additional cross-backend transitions
                // due to complexity of coordinating branches across backends.
            }
            TerminatorKind::GraphRead(_) => {
                self.restrict_to_interpreter_only(matrix);
            }
            TerminatorKind::Return(_) | TerminatorKind::Unreachable => {
                unreachable!("terminal blocks have no successor edges")
            }
        }
    }

    /// Goto allows transitions to any supported target.
    fn add_goto_transitions(&self, matrix: &mut TransMatrix) {
        for source in &self.source_targets {
            for target in &self.target_targets {
                matrix.insert(source, target, self.transfer_cost);
            }
        }
    }

    /// `GraphRead` requires Interpreter execution (graph operations need runtime).
    fn restrict_to_interpreter_only(&self, matrix: &mut TransMatrix) {
        matrix.clear();

        if self.source_targets.contains(TargetId::Interpreter)
            && self.target_targets.contains(TargetId::Interpreter)
        {
            matrix.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));
        }
    }

    /// Applies Postgres-specific restrictions.
    ///
    /// - Transitions *to* Postgres from other backends are not allowed (once data leaves the
    ///   database, it cannot return)
    /// - In loops, all Postgres transitions are disabled (declarative SQL cannot model iteration)
    fn apply_postgres_restrictions(&self, matrix: &mut TransMatrix) {
        matrix.remove_incoming(TargetId::Postgres);

        if self.is_in_loop {
            matrix.remove_all(TargetId::Postgres);
        }
    }
}

/// Computes terminator placement for a [`Body`].
///
/// Analyzes control flow edges to determine valid backend transitions and their costs. The
/// resulting [`TerminatorCostVec`] is used by the execution planner alongside statement placement
/// to select optimal execution targets.
///
/// # Usage
///
/// ```ignore
/// let placement = TerminatorPlacement::new(&alloc, entity_size);
/// let costs = placement.terminator_placement(context, body, footprint, targets);
///
/// // Query transitions for block 0's first successor edge
/// let matrices = costs.of(BasicBlockId::new(0));
/// let can_transition = matrices[0].get(TargetId::Postgres, TargetId::Interpreter);
/// ```
pub struct TerminatorPlacement<A: Allocator> {
    alloc: A,
    entity_size: InformationRange,
}

impl<A: Allocator> TerminatorPlacement<A> {
    /// Creates a new placement analyzer.
    ///
    /// The `entity_size` estimate is used when computing transfer costs — it represents the
    /// expected size of entity data that may need to cross backend boundaries.
    pub const fn new_in(entity_size: InformationRange, alloc: A) -> Self {
        Self { alloc, entity_size }
    }

    fn compute_liveness(&self, body: &Body) -> BasicBlockVec<DenseBitSet<Local>, &A> {
        let DataflowResults {
            analysis: _,
            entry_states: live_in,
            exit_states: _,
        } = LivenessAnalysis.iterate_to_fixpoint_in(body, &self.alloc);

        live_in
    }

    fn compute_scc<'a>(
        &'a self,
        body: &Body,
    ) -> StronglyConnectedComponents<BasicBlockId, SccId, ComponentSizeMetadata, &'a A> {
        Tarjan::new_with_metadata_in(&body.basic_blocks, ComponentSizeMetadata, &self.alloc).run()
    }

    /// Computes transition costs for all terminator edges in `body`.
    ///
    /// For each edge, determines which (source → destination) backend transitions are valid and
    /// their associated costs. The `targets` slice provides the set of backends each block can
    /// execute on (from statement placement), and `footprint` provides size estimates for
    /// computing transfer costs.
    ///
    /// The returned [`TerminatorCostVec`] can be indexed by block ID to get the transition
    /// matrices for that block's successor edges.
    pub fn terminator_placement<'heap>(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        footprint: &BodyFootprint<&'heap Heap>,
        targets: &BasicBlockSlice<TargetBitSet>,
    ) -> TerminatorCostVec<&'heap Heap> {
        let live_in = self.compute_liveness(body);
        let scc = self.compute_scc(body);

        let mut output = TerminatorCostVec::new(&body.basic_blocks, context.heap);
        let mut required_locals = DenseBitSet::new_empty(body.local_decls.len());

        for (block_id, block) in body.basic_blocks.iter_enumerated() {
            let block_targets = targets[block_id];
            let is_in_loop = *scc.annotation(scc.scc(block_id)) > 1;
            let matrices = output.of_mut(block_id);

            for (edge_index, successor_id) in block.terminator.kind.successor_blocks().enumerate() {
                let successor_targets = targets[successor_id];
                let transfer_cost = self.compute_transfer_cost(
                    &mut required_locals,
                    body,
                    footprint,
                    &live_in,
                    successor_id,
                );

                PopulateEdgeMatrix {
                    source_targets: block_targets,
                    target_targets: successor_targets,
                    transfer_cost,
                    is_in_loop,
                }
                .populate(&mut matrices[edge_index], &block.terminator.kind);
            }
        }

        output
    }

    /// Computes the cost of transferring live data across an edge to `successor`.
    ///
    /// The cost is the sum of estimated sizes for all locals that are:
    /// - Live at the successor's entry
    /// - Passed as parameters to the successor block
    fn compute_transfer_cost(
        &self,
        required_locals: &mut DenseBitSet<Local>,
        body: &Body,
        footprint: &BodyFootprint<&Heap>,
        live_in: &BasicBlockSlice<DenseBitSet<Local>>,
        successor: BasicBlockId,
    ) -> Cost {
        required_locals.clone_from(&live_in[successor]);

        for &param in body.basic_blocks[successor].params {
            required_locals.insert(param);
        }

        self.sum_local_sizes(footprint, required_locals)
    }

    /// Sums the estimated sizes of all locals in the set.
    ///
    /// Uses conservative estimates: env size = 0 (amortized over many invocations),
    /// entity cardinality = 1 (we operate on single entities in filter functions).
    fn sum_local_sizes(
        &self,
        footprint: &BodyFootprint<&Heap>,
        locals: &DenseBitSet<Local>,
    ) -> Cost {
        let mut total = cost!(0);

        for local in locals {
            let Some(size_estimate) = footprint.locals[local].average(
                &[InformationRange::zero(), self.entity_size],
                &[Cardinality::one(), Cardinality::one()],
            ) else {
                return Cost::MAX;
            };

            total = total.saturating_add(size_estimate.as_u32());
        }

        total
    }
}

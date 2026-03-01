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
//! | Any Postgres in loop | Never | — |
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
    Cost, VertexType,
    block_partitioned_vec::BlockPartitionedVec,
    target::{TargetBitSet, TargetId},
    traversal::{TransferCostConfig, TraversalPathBitSet},
};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId, BasicBlockSlice, BasicBlockVec},
        basic_blocks::BasicBlocks,
        local::Local,
        terminator::TerminatorKind,
    },
    pass::analysis::{
        dataflow::{
            TraversalLivenessAnalysis,
            framework::{DataflowAnalysis as _, DataflowResults},
        },
        size_estimation::{BodyFootprint, Cardinality, InformationRange},
    },
};

#[cfg(test)]
mod tests;

/// Transition cost matrix for a single terminator edge.
///
/// Maps each (source, destination) [`TargetId`] pair to either `Some(cost)` if the transition is
/// valid, or `None` if disallowed. Supports indexing with tuple syntax: `matrix[(from, to)]`.
///
/// # Invariants
///
/// - Same-backend transitions (`A → A`) always have cost 0, enforced by [`insert`](Self::insert)
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct TransMatrix {
    matrix: [Option<Cost>; TargetId::VARIANT_COUNT * TargetId::VARIANT_COUNT],
}

impl TransMatrix {
    /// Creates an empty matrix with all transitions disallowed.
    #[must_use]
    pub(crate) const fn new() -> Self {
        Self {
            matrix: [None; TargetId::VARIANT_COUNT * TargetId::VARIANT_COUNT],
        }
    }

    #[inline]
    fn offset(from: TargetId, to: TargetId) -> usize {
        from.as_usize() * TargetId::VARIANT_COUNT + to.as_usize()
    }

    #[inline]
    #[expect(clippy::integer_division, clippy::integer_division_remainder_used)]
    fn from_offset(offset: usize) -> (TargetId, TargetId) {
        let from = TargetId::from_usize(offset / TargetId::VARIANT_COUNT);
        let to = TargetId::from_usize(offset % TargetId::VARIANT_COUNT);
        (from, to)
    }

    /// Returns the cost for transitioning from `from` to `to`, or `None` if disallowed.
    #[inline]
    #[must_use]
    pub(crate) fn get(&self, from: TargetId, to: TargetId) -> Option<Cost> {
        self.matrix[Self::offset(from, to)]
    }

    #[inline]
    #[must_use]
    pub(crate) fn contains(&self, from: TargetId, to: TargetId) -> bool {
        self.matrix[Self::offset(from, to)].is_some()
    }

    /// Inserts a transition with the given cost.
    ///
    /// Same-backend transitions (where `from == to`) are always recorded with cost 0,
    /// regardless of the `cost` argument.
    #[inline]
    pub(crate) fn insert(&mut self, from: TargetId, to: TargetId, mut cost: Cost) {
        if from == to {
            cost = cost!(0);
        }

        self.matrix[Self::offset(from, to)] = Some(cost);
    }

    /// Resets all transitions to disallowed.
    #[inline]
    pub(crate) fn clear(&mut self) {
        self.matrix.fill(None);
    }

    /// Removes all incoming transitions to `target` from other backends.
    ///
    /// Self-loops (`target` → `target`) are preserved.
    #[inline]
    pub(crate) fn remove_incoming(&mut self, target: TargetId) {
        for source in TargetId::all() {
            if source == target {
                continue;
            }

            self.matrix[Self::offset(source, target)] = None;
        }
    }

    #[inline]
    pub(crate) fn keep(&mut self, sources: TargetBitSet, targets: TargetBitSet) {
        for source in TargetId::all() {
            for target in TargetId::all() {
                if !sources.contains(source) || !targets.contains(target) {
                    self.matrix[Self::offset(source, target)] = None;
                }
            }
        }
    }

    /// Removes all transitions both to and from `target`.
    pub(crate) fn remove_all(&mut self, target: TargetId) {
        for other in TargetId::all() {
            self.matrix[Self::offset(other, target)] = None;
            self.matrix[Self::offset(target, other)] = None;
        }
    }

    #[must_use]
    pub(crate) fn iter(
        &self,
    ) -> impl ExactSizeIterator<Item = (TargetId, TargetId, &Option<Cost>)> {
        self.matrix.iter().enumerate().map(|(idx, cost)| {
            let (from, to) = Self::from_offset(idx);

            (from, to, cost)
        })
    }

    pub(crate) fn outgoing(&self, target: TargetId) -> impl Iterator<Item = (TargetId, Cost)> {
        self.iter()
            .filter_map(|(from, to, cost)| cost.map(|cost| (from, to, cost)))
            .filter_map(move |(from, to, cost)| (target == from).then_some((to, cost)))
    }

    pub(crate) fn incoming(&self, target: TargetId) -> impl Iterator<Item = (TargetId, Cost)> {
        self.iter()
            .filter_map(|(from, to, cost)| cost.map(|cost| (from, to, cost)))
            .filter_map(move |(from, to, cost)| (target == to).then_some((from, cost)))
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
#[derive(Debug)]
pub(crate) struct TerminatorCostVec<A: Allocator = Global>(BlockPartitionedVec<TransMatrix, A>);

impl<A: Allocator + Clone> TerminatorCostVec<A> {
    /// Creates a cost vector sized for `blocks`, with all transitions initially disallowed.
    pub(crate) fn new(blocks: &BasicBlocks, alloc: A) -> Self {
        Self(BlockPartitionedVec::new(
            blocks.iter().map(|block| Self::successor_count(block)),
            TransMatrix::new(),
            alloc,
        ))
    }

    #[expect(clippy::cast_possible_truncation)]
    fn successor_count(block: &BasicBlock) -> u32 {
        match &block.terminator.kind {
            TerminatorKind::SwitchInt(switch) => switch.targets.targets().len() as u32,
            TerminatorKind::Goto(_) | TerminatorKind::GraphRead(_) => 1,
            TerminatorKind::Return(_) | TerminatorKind::Unreachable => 0,
        }
    }
}

impl<A: Allocator> TerminatorCostVec<A> {
    pub(crate) const fn len(&self) -> usize {
        self.0.len()
    }

    /// Returns the number of blocks in the partition.
    #[cfg(test)]
    pub(crate) fn block_count(&self) -> usize {
        self.0.block_count()
    }

    /// Returns the transition matrices for all successor edges of `block`.
    pub(crate) fn of(&self, block: BasicBlockId) -> &[TransMatrix] {
        self.0.of(block)
    }

    /// Returns mutable transition matrices for all successor edges of `block`.
    pub(crate) fn of_mut(&mut self, block: BasicBlockId) -> &mut [TransMatrix] {
        self.0.of_mut(block)
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
/// let placement = TerminatorPlacement::new(entity_size, &alloc);
/// let costs = placement.terminator_placement(context, body, footprint, targets);
///
/// // Query transitions for block 0's first successor edge
/// let matrices = costs.of(BasicBlockId::new(0));
/// let can_transition = matrices[0].get(TargetId::Postgres, TargetId::Interpreter);
/// ```
pub(crate) struct TerminatorPlacement<S: Allocator> {
    scratch: S,
    transfer_config: TransferCostConfig,
}

impl<S: Allocator> TerminatorPlacement<S> {
    /// Creates a new placement analyzer.
    ///
    /// The [`TransferCostConfig`] provides size estimates for the variable-cost entity fields
    /// (properties, embeddings, provenance). Fixed-size fields (UUIDs, timestamps, scalars)
    /// use constants derived from the entity schema.
    #[inline]
    #[must_use]
    pub(crate) const fn new_in(transfer_config: TransferCostConfig, scratch: S) -> Self {
        Self {
            scratch,
            transfer_config,
        }
    }

    fn compute_liveness(
        &self,
        body: &Body<'_>,
        vertex: VertexType,
    ) -> BasicBlockVec<(DenseBitSet<Local>, TraversalPathBitSet), &S> {
        let DataflowResults {
            analysis: _,
            entry_states: live_in,
            exit_states: _,
        } = TraversalLivenessAnalysis { vertex }.iterate_to_fixpoint_in(body, &self.scratch);

        live_in
    }

    fn compute_scc<'a>(
        &'a self,
        body: &Body,
    ) -> StronglyConnectedComponents<BasicBlockId, SccId, ComponentSizeMetadata, &'a S> {
        Tarjan::new_with_metadata_in(&body.basic_blocks, ComponentSizeMetadata, &self.scratch).run()
    }

    #[cfg(test)]
    pub(crate) fn terminator_placement<'heap>(
        &self,
        body: &Body<'heap>,
        vertex: VertexType,
        footprint: &BodyFootprint<&'heap Heap>,
        targets: &BasicBlockSlice<TargetBitSet>,
    ) -> TerminatorCostVec<Global> {
        self.terminator_placement_in(body, vertex, footprint, targets, Global)
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
    pub(crate) fn terminator_placement_in<'heap, A: Allocator + Clone>(
        &self,
        body: &Body<'heap>,
        vertex: VertexType,
        footprint: &BodyFootprint<&'heap Heap>,
        targets: &BasicBlockSlice<TargetBitSet>,
        alloc: A,
    ) -> TerminatorCostVec<A> {
        let live_in = self.compute_liveness(body, vertex);
        let scc = self.compute_scc(body);

        let mut output = TerminatorCostVec::new(&body.basic_blocks, alloc);
        let mut required_locals = DenseBitSet::new_empty(body.local_decls.len());

        for (block_id, block) in body.basic_blocks.iter_enumerated() {
            let block_targets = targets[block_id];
            let is_in_loop = *scc.annotation(scc.scc(block_id)) > 1;
            let matrices = output.of_mut(block_id);

            for (edge_index, successor_id) in block.terminator.kind.successor_blocks().enumerate() {
                let is_in_loop = is_in_loop || (successor_id == block_id);

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
    /// The cost has two components:
    /// - **Local cost**: estimated sizes of all non-vertex locals that are live at the successor's
    ///   entry or passed as block parameters.
    /// - **Path cost**: estimated sizes of all live entity field paths, computed from per-path
    ///   transfer sizes rather than the monolithic entity size.
    fn compute_transfer_cost(
        &self,
        required_locals: &mut DenseBitSet<Local>,
        body: &Body,
        footprint: &BodyFootprint<&Heap>,
        live_in: &BasicBlockSlice<(DenseBitSet<Local>, TraversalPathBitSet)>,
        successor: BasicBlockId,
    ) -> Cost {
        let (locals, paths) = &live_in[successor];
        required_locals.clone_from(locals);

        for &param in body.basic_blocks[successor].params {
            required_locals.insert(param);
        }

        let local_cost = self.sum_local_sizes(footprint, required_locals);

        if paths.is_empty() {
            return local_cost;
        }

        let path_range = paths.transfer_size(&self.transfer_config);

        let Some(max) = path_range.inclusive_max() else {
            return Cost::MAX;
        };

        let path_cost = Cost::new_saturating(path_range.min().midpoint(max).as_u32());

        local_cost.saturating_add(path_cost)
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
                &[
                    InformationRange::zero(),
                    self.transfer_config.properties_size,
                ],
                &[Cardinality::one(), Cardinality::one()],
            ) else {
                return Cost::MAX;
            };

            total = total.saturating_add(Cost::new_saturating(size_estimate.as_u32()));
        }

        total
    }
}

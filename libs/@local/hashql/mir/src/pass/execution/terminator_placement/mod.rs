//! Terminator placement analysis for MIR execution planning.
//!
//! Determines valid backend transitions at each terminator edge and assigns transfer costs.
//! While statement placement decides *where* individual statements execute, terminator placement
//! decides *which transitions* between backends are allowed at control flow edges.
//!
//! Each terminator edge gets a [`TransMatrix`] that encodes:
//! - Which (source_target → dest_target) transitions are valid
//! - The cost of each transition (based on data that must be transferred)
//!
//! # Transition Rules
//!
//! - **Same-backend**: Always allowed with zero cost.
//! - **To Interpreter**: Always allowed (universal fallback) with transfer cost.
//! - **From Interpreter to Postgres**: Never allowed (data has left the database).
//! - **In loops**: Postgres transitions disabled (declarative SQL cannot model loops)
//! - **GraphRead**: Only Interpreter → Interpreter (graph operations require runtime)

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
        basic_block::{BasicBlockId, BasicBlockSlice, BasicBlockVec},
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

/// Matrix encoding valid backend transitions and their costs for a single terminator edge.
///
/// For each (source, destination) target pair, stores `Some(cost)` if the transition is valid,
/// or `None` if the transition is not allowed. The matrix is indexed by `TargetId` pairs.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TransMatrix {
    matrix: [Option<Cost>; TargetId::VARIANT_COUNT * TargetId::VARIANT_COUNT],
}

impl TransMatrix {
    pub const fn new() -> Self {
        Self {
            matrix: [None; TargetId::VARIANT_COUNT * TargetId::VARIANT_COUNT],
        }
    }

    #[inline]
    fn offset(&self, from: TargetId, to: TargetId) -> usize {
        from.as_usize() * TargetId::VARIANT_COUNT + to.as_usize()
    }

    pub fn get(&self, from: TargetId, to: TargetId) -> Option<Cost> {
        self.matrix[self.offset(from, to)]
    }

    pub fn get_mut(&mut self, from: TargetId, to: TargetId) -> &mut Option<Cost> {
        let offset = self.offset(from, to);
        &mut self.matrix[offset]
    }

    pub fn insert(&mut self, from: TargetId, to: TargetId, mut cost: Cost) {
        if from == to {
            cost = cost!(0);
        }

        let offset = self.offset(from, to);
        self.matrix[offset] = Some(cost);
    }

    pub fn clear(&mut self) {
        self.matrix.fill(None);
    }

    /// Removes all transitions *to* the given target (except self-loops).
    pub fn remove_incoming(&mut self, target: TargetId) {
        for source in TargetId::all() {
            if source == target {
                continue;
            }
            let offset = self.offset(source, target);
            self.matrix[offset] = None;
        }
    }

    /// Removes all transitions both *to* and *from* the given target.
    pub fn remove_all(&mut self, target: TargetId) {
        for other in TargetId::all() {
            self.matrix[self.offset(other, target)] = None;
            self.matrix[self.offset(target, other)] = None;
        }
    }
}

impl Index<(TargetId, TargetId)> for TransMatrix {
    type Output = Option<Cost>;

    fn index(&self, (from, to): (TargetId, TargetId)) -> &Self::Output {
        &self.matrix[self.offset(from, to)]
    }
}

impl IndexMut<(TargetId, TargetId)> for TransMatrix {
    fn index_mut(&mut self, (from, to): (TargetId, TargetId)) -> &mut Self::Output {
        let offset = self.offset(from, to);
        &mut self.matrix[offset]
    }
}

/// Dense storage for transition matrices across all terminator edges in a body.
///
/// Uses offset-based indexing (like [`StatementCostVec`]) to store a variable number of
/// [`TransMatrix`] entries per block based on successor count:
/// - `Goto` / `GraphRead`: 1 edge
/// - `SwitchInt`: N edges (one per branch)
/// - `Return` / `Unreachable`: 0 edges
///
/// [`StatementCostVec`]: super::cost::StatementCostVec
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

    pub fn new(blocks: &BasicBlocks, alloc: A) -> Self
    where
        A: Clone,
    {
        Self::from_successor_counts(blocks.iter().map(Self::successor_count), alloc)
    }

    fn successor_count(block: &crate::body::basic_block::BasicBlock) -> u32 {
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

/// Metadata for Tarjan SCC that counts nodes per component.
///
/// Used to identify loops: components with more than one node are part of a cycle.
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

struct PopulateEdgeMatrix {
    source_targets: TargetBitSet,
    target_targets: TargetBitSet,

    transfer_cost: Cost,
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

    /// GraphRead requires Interpreter execution (graph operations need runtime).
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

pub struct TerminatorPlacement<A: Allocator> {
    alloc: A,
    entity_size: InformationRange,
}

impl<A: Allocator> TerminatorPlacement<A> {
    pub fn new(alloc: A, entity_size: InformationRange) -> Self {
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

    /// Computes transition matrices for all terminator edges in the body.
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

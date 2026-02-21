//! Placement solver for assigning execution targets to basic blocks.
//!
//! The solver operates on a [`Condensation`] of the CFG into placement regions: trivial
//! single-block regions and cyclic multi-block SCCs. [`CostEstimation`] ranks candidate targets
//! for trivial regions, while [`ConstraintSatisfaction`] handles cyclic ones.
//!
//! The forward pass processes regions in topological order, the backward pass in reverse for
//! refinement. When assignment fails, [`PlacementSolver::rewind`] walks backward to find a region
//! that can change its assignment.
//!
//! Entry point: [`PlacementSolverContext::build_in`] constructs a [`PlacementSolver`], then
//! [`PlacementSolver::run`] executes both passes.

use core::{alloc::Allocator, mem};

use hashql_core::{
    graph::DirectedGraph as _,
    heap::{BumpAllocator, Heap},
    id,
    span::SpanId,
};

use self::{
    condensation::{Condensation, PlacementRegionKind, TrivialPlacementRegion},
    csp::{ConstraintSatisfaction, CyclicPlacementRegion},
    estimate::{CostEstimation, CostEstimationConfig, HeapElement, TargetHeap},
};
use super::error::unsatisfiable_placement;
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice, BasicBlockVec},
    },
    context::MirContext,
    pass::execution::{
        ApproxCost, StatementCostVec,
        target::{TargetArray, TargetBitSet, TargetId},
        terminator_placement::TerminatorCostVec,
    },
};

mod condensation;
mod csp;
mod estimate;
#[cfg(test)]
mod tests;

// Identifies a placement region in the condensation graph.
id::newtype!(pub(crate) struct PlacementRegionId(u32 is 0..=0xFFFF_FF00));

/// Describes which block or region caused placement failure.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum PlacementFailure<'alloc> {
    /// A single block has no feasible target.
    Block(BasicBlockId),
    /// A cyclic region has no consistent assignment. Contains the SCC member blocks for
    /// back edge identification in the diagnostic.
    Cycle(&'alloc [BasicBlockId]),
}

/// Finds the span of the back edge terminator in a cyclic region.
///
/// The back edge is the edge from a higher-numbered block to a lower-numbered block within the
/// SCC — the edge that closes the cycle. Falls back to the first member's terminator if no
/// back edge is found (shouldn't happen in a valid SCC).
fn back_edge_span(body: &Body<'_>, members: &[BasicBlockId]) -> SpanId {
    assert!(!members.is_empty());

    // Find the member whose terminator has a successor that's also a member with a lower ID.
    // That successor edge is the back edge, and its terminator is the source of the cycle.
    for &block in members {
        let terminator = &body.basic_blocks[block].terminator;

        for successor in terminator.kind.successor_blocks() {
            if successor < block && members.contains(&successor) {
                return terminator.span;
            }
        }
    }

    body.basic_blocks[members[0]].terminator.span
}

/// Input data for placement solving.
///
/// Bundles the per-block target domains (`assignment`), per-target statement costs
/// (`statements`), and terminator transition costs (`terminators`).
#[derive(Debug, Copy, Clone)]
pub struct PlacementSolverContext<'ctx, A: Allocator> {
    pub assignment: &'ctx BasicBlockSlice<TargetBitSet>,
    pub statements: &'ctx TargetArray<StatementCostVec<A>>,
    pub terminators: &'ctx TerminatorCostVec<A>,
}

impl<'ctx, A: Allocator> PlacementSolverContext<'ctx, A> {
    /// Constructs a [`PlacementSolver`] from this context.
    ///
    /// Allocates working storage (targets and options slices) and builds the
    /// `Condensation` graph from `body`.
    pub fn build_in<'alloc, S>(
        self,
        body: &Body<'_>,
        alloc: &'alloc S,
    ) -> PlacementSolver<'ctx, 'alloc, A, S>
    where
        S: BumpAllocator,
    {
        // Separate working slices so rewind can restore previous assignments without
        // mutating the input.
        let targets = {
            let uninit = alloc.allocate_slice_uninit(body.basic_blocks.len());
            BasicBlockSlice::from_raw_mut(uninit.write_filled(None))
        };

        let options = {
            let uninit = alloc.allocate_slice_uninit(body.basic_blocks.len());
            BasicBlockSlice::from_raw_mut(uninit.write_filled(TargetHeap::new()))
        };

        let condensation = Condensation::new(body, self.terminators, alloc);

        PlacementSolver {
            data: self,
            condensation,

            options,
            targets,
            alloc,
        }
    }
}

/// Assigns execution targets to basic blocks by solving over the condensation graph.
///
/// Uses a two-pass approach: the forward pass assigns targets in topological order, the backward
/// pass refines them with full boundary context. Rewind-based backtracking recovers from
/// assignment failures in the forward pass.
pub struct PlacementSolver<'ctx, 'alloc, A: Allocator, S: BumpAllocator> {
    data: PlacementSolverContext<'ctx, A>,

    condensation: Condensation<'alloc, S>,

    options: &'alloc mut BasicBlockSlice<TargetHeap>,
    targets: &'alloc mut BasicBlockSlice<Option<HeapElement>>,

    alloc: &'alloc S,
}

impl<'alloc, A: Allocator, S: BumpAllocator> PlacementSolver<'_, 'alloc, A, S> {
    /// Runs the forward and backward passes, returning the chosen [`TargetId`] for each basic
    /// block.
    pub fn run<'heap>(
        &mut self,
        context: &mut MirContext<'_, 'heap>,
        body: &Body<'heap>,
    ) -> BasicBlockVec<TargetId, &'heap Heap> {
        let mut regions = Vec::with_capacity_in(self.condensation.node_count(), self.alloc);
        self.condensation
            .reverse_topological_order()
            .rev()
            .collect_into(&mut regions);

        if let Err(failure) = self.run_forwards_loop(body, &regions) {
            let block_span = match failure {
                PlacementFailure::Block(block) => body.basic_blocks[block].terminator.span,
                PlacementFailure::Cycle(members) => back_edge_span(body, members),
            };

            context
                .diagnostics
                .push(unsatisfiable_placement(body.span, block_span, &failure));
        } else {
            // Only run the backward refinement pass if the forward pass succeeded —
            // there is nothing to refine when blocks remain unassigned.
            self.run_backwards_loop(body, &regions);
        }

        // Collect the final assignments into the output vec. Unassigned blocks (from a
        // failed forward pass) default to the interpreter — the universal fallback target.
        let mut output = BasicBlockVec::with_capacity_in(body.basic_blocks.len(), context.heap);
        for target in &*self.targets {
            output.push(
                target
                    .as_ref()
                    .map_or(TargetId::Interpreter, |elem| elem.target),
            );
        }

        output
    }

    /// Walk backward from `failed` through the assignment stack, looking for a region that can
    /// change its assignment. Returns the index to resume the forward pass from, or `None` if
    /// all possibilities are exhausted.
    fn rewind(
        &mut self,
        body: &Body<'_>,
        regions: &[PlacementRegionId],
        failed: usize,
    ) -> Option<usize> {
        // Walk backward through already-processed regions
        let mut candidate = failed;

        while candidate > 0 {
            candidate -= 1;

            let region_id = regions[candidate];
            let region = &mut self.condensation[region_id];
            let kind = mem::replace(&mut region.kind, PlacementRegionKind::Unassigned);

            match kind {
                kind @ PlacementRegionKind::Trivial(TrivialPlacementRegion { block }) => {
                    if let Some(elem) = self.options[block].pop() {
                        // Found an alternative — apply the new assignment, and resume from the next
                        // region.
                        self.targets[block] = Some(elem);

                        self.condensation[region_id].kind = kind;
                        return Some(candidate + 1);
                    }

                    // This trivial region is also exhausted — undo its assignment and keep
                    // walking back.
                    self.targets[block] = None;
                    self.condensation[region_id].kind = kind;
                }
                PlacementRegionKind::Cyclic(cyclic) => {
                    let mut csp = ConstraintSatisfaction::new(self, region_id, cyclic);

                    if csp.retry(body) {
                        // Found a perturbation — flush the new assignments, and resume.
                        for block in &*csp.region.blocks {
                            csp.solver.targets[block.id] = Some(block.target);
                        }

                        self.condensation[region_id].kind = PlacementRegionKind::Cyclic(csp.region);
                        return Some(candidate + 1);
                    }

                    // All heaps exhausted — undo this region's assignments and keep walking.
                    for &member in csp.region.members {
                        csp.solver.targets[member] = None;
                    }

                    self.condensation[region_id].kind = PlacementRegionKind::Cyclic(csp.region);
                }
                PlacementRegionKind::Unassigned => {
                    unreachable!(
                        "previous iteration has not returned region {region_id:?} into the graph"
                    )
                }
            }
        }

        None // all possibilities exhausted
    }

    /// Checks that all blocks in `regions[start..]` have no assigned target.
    ///
    /// Verifies the forward-pass invariant: at the loop head for index `ptr`, every region in
    /// the suffix `regions[ptr..]` must be unassigned. This holds because assignments only occur
    /// on success (after which `ptr` advances past the region), and [`PlacementSolver::rewind`]
    /// clears every exhausted region it walks through.
    #[cfg(debug_assertions)]
    fn debug_suffix_unassigned(&self, regions: &[PlacementRegionId], start: usize) -> bool {
        regions[start..]
            .iter()
            .all(|&id| match &self.condensation[id].kind {
                PlacementRegionKind::Trivial(TrivialPlacementRegion { block }) => {
                    self.targets[*block].is_none()
                }
                PlacementRegionKind::Cyclic(cyclic) => cyclic
                    .members
                    .iter()
                    .all(|&member| self.targets[member].is_none()),
                PlacementRegionKind::Unassigned => false,
            })
    }

    /// Processes placement regions in topological order, assigning targets greedily.
    ///
    /// Trivial regions use [`CostEstimation`] to pick the best target; cyclic regions use
    /// [`ConstraintSatisfaction`]. Failure triggers [`PlacementSolver::rewind`].
    ///
    /// Returns the [`PlacementFailure`] that describes which block or region caused exhaustion.
    fn run_forwards_loop(
        &mut self,
        body: &Body<'_>,
        regions: &[PlacementRegionId],
    ) -> Result<(), PlacementFailure<'alloc>> {
        debug_assert!(!regions.is_empty(), "at least the start block must exist");
        let mut ptr = 0;

        while ptr < regions.len() {
            #[cfg(debug_assertions)]
            {
                debug_assert!(
                    self.debug_suffix_unassigned(regions, ptr),
                    "forward invariant violated: regions[ptr..] must be unassigned"
                );
            }

            let region_id = regions[ptr];
            let region = &mut self.condensation[region_id];
            let kind = mem::replace(&mut region.kind, PlacementRegionKind::Unassigned);

            let kind = match kind {
                kind @ PlacementRegionKind::Trivial(TrivialPlacementRegion { block }) => {
                    let mut heap = CostEstimation {
                        config: CostEstimationConfig::TRIVIAL,
                        solver: self,
                        determine_target: |block| self.targets[block],
                    }
                    .run(body, region_id, block);

                    let Some(elem) = heap.pop() else {
                        self.condensation[region_id].kind = kind;

                        let Some(rewound) = self.rewind(body, regions, ptr) else {
                            return Err(PlacementFailure::Block(block));
                        };

                        ptr = rewound;
                        continue;
                    };

                    self.targets[block] = Some(elem);
                    self.options[block] = heap;

                    kind
                }
                PlacementRegionKind::Cyclic(cyclic) => {
                    let members = cyclic.members;
                    let mut csp = ConstraintSatisfaction::new(self, region_id, cyclic);

                    if !csp.solve(body) {
                        let region = PlacementRegionKind::Cyclic(csp.region);
                        self.condensation[region_id].kind = region;

                        let Some(rewound) = self.rewind(body, regions, ptr) else {
                            return Err(PlacementFailure::Cycle(members));
                        };

                        ptr = rewound;
                        continue;
                    }

                    for block in &*csp.region.blocks {
                        csp.solver.targets[block.id] = Some(block.target);
                    }

                    PlacementRegionKind::Cyclic(csp.region)
                }
                PlacementRegionKind::Unassigned => {
                    unreachable!(
                        "previous iteration has not returned region {region_id:?} into the graph"
                    )
                }
            };

            self.condensation[region_id].kind = kind;

            ptr += 1;
        }

        Ok(())
    }

    /// Re-evaluates assignments in reverse topological order for refinement.
    ///
    /// Delegates to [`adjust_trivial`](Self::adjust_trivial) and
    /// [`adjust_cyclic`](Self::adjust_cyclic).
    fn run_backwards_loop(&mut self, body: &Body<'_>, regions: &[PlacementRegionId]) {
        debug_assert!(!regions.is_empty(), "at least the start block must exist");
        let mut ptr = regions.len();

        while ptr > 0 {
            ptr -= 1;

            let region_id = regions[ptr];
            let region = &mut self.condensation[region_id];
            let kind = mem::replace(&mut region.kind, PlacementRegionKind::Unassigned);

            let kind = match kind {
                kind @ PlacementRegionKind::Trivial(TrivialPlacementRegion { block }) => {
                    self.adjust_trivial(body, region_id, block);
                    kind
                }
                PlacementRegionKind::Cyclic(cyclic) => self.adjust_cyclic(body, region_id, cyclic),
                PlacementRegionKind::Unassigned => {
                    unreachable!(
                        "previous iteration has not returned region {region_id:?} into the graph"
                    )
                }
            };

            self.condensation[region_id].kind = kind;
        }
    }

    /// Re-evaluates a trivial region's assignment with full boundary context.
    ///
    /// Replaces the current assignment only if the new best cost is strictly lower.
    fn adjust_trivial(
        &mut self,
        body: &Body<'_>,
        region_id: PlacementRegionId,
        block: BasicBlockId,
    ) {
        let estimator = CostEstimation {
            config: CostEstimationConfig::TRIVIAL,
            solver: self,
            determine_target: |block| self.targets[block],
        };
        let prev = estimator
            .estimate(
                body,
                region_id,
                block,
                self.targets[block]
                    .expect("previous iteration must've set it")
                    .target,
            )
            .expect("previous run has verified this, so this should now as well");
        let mut heap = estimator.run(body, region_id, block);

        let Some(elem) = heap.pop() else {
            // Re-estimation (unlikely) found no viable targets — keep the current assignment
            return;
        };

        if prev > elem.cost {
            self.targets[block] = Some(elem);
        }
    }

    /// Re-evaluates a cyclic region's assignment with full boundary context.
    ///
    /// Re-runs [`ConstraintSatisfaction`] and compares the total cost of the old vs new solution,
    /// keeping whichever is cheaper.
    fn adjust_cyclic(
        &mut self,
        body: &Body<'_>,
        region_id: PlacementRegionId,
        cyclic: CyclicPlacementRegion<'alloc>,
    ) -> PlacementRegionKind<'alloc> {
        // Re-run with full boundary context — neighbor assignments may have changed since the
        // forward pass.
        let mut csp = ConstraintSatisfaction::new(self, region_id, cyclic);
        if !csp.solve(body) {
            // New solve found nothing better — keep the forward-pass assignment
            return PlacementRegionKind::Cyclic(csp.region);
        }

        let region = csp.region;

        let prev_estimator = CostEstimation {
            config: CostEstimationConfig::LOOP,
            solver: self,
            determine_target: |block: BasicBlockId| self.targets[block],
        };
        let prev_total_cost: ApproxCost = region
            .members
            .iter()
            .map(|&id| {
                prev_estimator
                    .estimate(
                        body,
                        region_id,
                        id,
                        self.targets[id]
                            .expect("should have assigned in previous iteration")
                            .target,
                    )
                    .expect("previous had a solution, so this one must now as well")
            })
            .sum();

        let next_estimator = CostEstimation {
            config: CostEstimationConfig::LOOP,
            solver: self,
            determine_target: |block: BasicBlockId| {
                // Resolve SCC members from the candidate solution, everything else
                // from committed state.
                if let Some(placement) = region.find_block(block) {
                    Some(placement.target)
                } else {
                    self.targets[block]
                }
            },
        };

        let next_total_cost: ApproxCost = region
            .members
            .iter()
            .map(|&block| {
                let target = region
                    .find_block(block)
                    .expect("every member must appear in blocks")
                    .target
                    .target;

                next_estimator
                    .estimate(body, region_id, block, target)
                    .expect("CSP produced a valid solution")
            })
            .sum();

        if prev_total_cost > next_total_cost {
            for block in &*region.blocks {
                self.targets[block.id] = Some(block.target);
            }
        }

        PlacementRegionKind::Cyclic(region)
    }
}

//! Cost estimation for placement target selection.
//!
//! The estimator computes an approximate cost for assigning a basic block to a given execution
//! target. Cost includes statement execution cost plus transition costs to and from predecessor and
//! successor blocks.
//!
//! Cross-region transitions are weighted by a configurable [`CostEstimationConfig`] to
//! de-emphasize boundary costs relative to intra-region costs. Self-loop edges are skipped because
//! a block's self-transition cost is always zero.
//!
//! When a neighbor's target is unknown, the estimator assumes the neighbor will choose the locally
//! optimal option. Transition costs are counted from both predecessor and successor sides —
//! intentional double-counting that gives each edge proportional influence at join points.
//!
//! The double-counting inflates transition costs relative to statement costs. This is acceptable
//! (and possibly desirable) as long as transitions dominate. If statement costs ever become
//! comparable and the greedy value ordering consistently disagrees with BnB-optimal solutions,
//! consider halving the transition weight here rather than single-counting — single-counting
//! would make source-side blocks blind to downstream target demand.

use core::{alloc::Allocator, cmp};

use hashql_core::{
    graph::{Predecessors as _, Successors as _},
    heap::BumpAllocator,
};

use super::{PlacementRegionId, PlacementSolver, condensation::BoundaryEdge};
use crate::{
    body::{Body, basic_block::BasicBlockId},
    pass::execution::{ApproxCost, Cost, target::TargetId},
};

#[cfg(test)]
mod tests;

/// A candidate target assignment paired with its estimated cost.
#[derive(Debug, Copy, Clone)]
pub(crate) struct HeapElement {
    pub target: TargetId,
    pub cost: ApproxCost,
}

impl HeapElement {
    /// Placeholder element with zero cost, used to initialize [`PlacementBlock`] slots.
    ///
    /// [`PlacementBlock`]: super::csp::PlacementBlock
    pub(crate) const EMPTY: Self = Self {
        target: TargetId::Interpreter,
        cost: ApproxCost::ZERO,
    };
}

impl PartialEq for HeapElement {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}

impl Eq for HeapElement {}

impl PartialOrd for HeapElement {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for HeapElement {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        self.cost.cmp(&other.cost)
    }
}

/// Sorted array of candidate target assignments, ordered by ascending cost.
///
/// Supports insertion (maintaining sorted order), pop (returns lowest-cost), and peek.
#[derive(Debug, Copy, Clone)]
pub(crate) struct TargetHeap {
    targets: [HeapElement; TargetId::VARIANT_COUNT],

    index: u8,
    length: u8,
}

impl TargetHeap {
    const EMPTY: Self = Self {
        targets: [HeapElement {
            target: TargetId::Interpreter,
            cost: ApproxCost::ZERO,
        }; TargetId::VARIANT_COUNT],
        index: 0,
        length: 0,
    };

    /// Creates an empty heap.
    pub(crate) const fn new() -> Self {
        Self::EMPTY
    }

    /// Inserts a candidate and re-sorts to maintain ascending cost order.
    pub(crate) fn insert(&mut self, target: TargetId, cost: ApproxCost) {
        assert!(self.length < TargetId::VARIANT_COUNT_U8);

        let index = self.length as usize;
        self.length += 1;

        self.targets[index] = HeapElement { target, cost };
        self.targets[(self.index as usize)..(self.length as usize)].sort_unstable();
    }

    /// Returns the lowest-cost candidate without removing it.
    pub(crate) const fn peek(&self) -> Option<&HeapElement> {
        if self.index >= self.length {
            return None;
        }

        Some(&self.targets[self.index as usize])
    }

    /// Removes and returns the lowest-cost candidate.
    pub(crate) const fn pop(&mut self) -> Option<HeapElement> {
        if self.index >= self.length {
            return None;
        }

        let element = self.targets[self.index as usize];
        self.index += 1;

        Some(element)
    }

    #[cfg(test)]
    pub(crate) const fn is_empty(&self) -> bool {
        self.index >= self.length
    }

    #[cfg(test)]
    pub(crate) const fn len(&self) -> usize {
        self.length.saturating_sub(self.index) as usize
    }
}

/// Configuration controlling how cross-region transition costs are weighted.
pub(crate) struct CostEstimationConfig {
    boundary_multiplier: f32,
}

impl CostEstimationConfig {
    /// Configuration for cyclic regions: de-emphasizes cross-region transition costs.
    pub(crate) const LOOP: Self = Self {
        boundary_multiplier: 0.5,
    };
    /// Configuration for trivial regions: cross-region costs at full weight.
    pub(crate) const TRIVIAL: Self = Self {
        boundary_multiplier: 1.0,
    };
}

/// Estimates the cost of assigning a basic block to a specific execution target.
///
/// The `determine_target` closure resolves neighbor assignments, allowing the estimator to work
/// with both committed state and speculative CSP assignments.
pub(crate) struct CostEstimation<'ctx, 'parent, 'alloc, F, A: Allocator, S: BumpAllocator> {
    pub config: CostEstimationConfig,
    pub solver: &'ctx PlacementSolver<'parent, 'alloc, A, S>,
    pub determine_target: F,
}

impl<F, A, S> CostEstimation<'_, '_, '_, F, A, S>
where
    F: Fn(BasicBlockId) -> Option<HeapElement>,
    A: Allocator,
    S: BumpAllocator,
{
    /// Computes the transition cost across a single [`BoundaryEdge`].
    ///
    /// - Source known, target unknown: minimizes over the target block's domain.
    /// - Source unknown, target known: minimizes over the source block's domain.
    /// - Both known: direct matrix lookup.
    /// - Both unknown: unreachable (the current block always supplies one side).
    fn transition_cost(
        &self,
        source: Option<TargetId>,
        target: Option<TargetId>,
        edge: &BoundaryEdge,
    ) -> Option<Cost> {
        match (source, target) {
            (Some(source), None) => {
                // Minimize over the target block's domain, weighted by statement + transition cost
                let mut current_minimum = ApproxCost::INF;
                let mut minimum_transition_cost = None;

                for target in &self.solver.data.assignment[edge.target.block] {
                    let Some(cost) = edge.matrix.get(source, target) else {
                        continue;
                    };

                    let mut block_cost =
                        self.solver.data.statements[target].sum_approx(edge.target.block);
                    block_cost += cost;

                    if block_cost < current_minimum {
                        current_minimum = block_cost;
                        minimum_transition_cost = Some(cost);
                    }
                }

                minimum_transition_cost
            }
            (None, Some(target)) => {
                // Minimize over the source block's domain, weighted by statement + transition cost
                let mut current_minimum = ApproxCost::INF;
                let mut minimum_transition_cost = None;

                for source in &self.solver.data.assignment[edge.source.block] {
                    let Some(cost) = edge.matrix.get(source, target) else {
                        continue;
                    };

                    let mut block_cost =
                        self.solver.data.statements[source].sum_approx(edge.source.block);
                    block_cost += cost;

                    if block_cost < current_minimum {
                        current_minimum = block_cost;
                        minimum_transition_cost = Some(cost);
                    }
                }

                minimum_transition_cost
            }
            (Some(source), Some(target)) => edge.matrix.get(source, target),
            (None, None) => {
                unreachable!(
                    "estimate_target always supplies the current block's target; both sides \
                     cannot be None"
                )
            }
        }
    }

    /// Estimates the total cost of placing `block` on `target`.
    fn estimate_target(
        &self,
        body: &Body<'_>,
        region: PlacementRegionId,
        block: BasicBlockId,
        target: TargetId,
    ) -> Option<ApproxCost> {
        // Start with the block's own statement cost, then add transition costs from each
        // predecessor and to each successor. Transitions are counted on both sides (double-counted)
        // so that join edges get proportional influence without frequency data.
        // If a neighbor has no assignment yet, we optimistically assume its best local option.
        // Returns `None` if any assigned neighbor lacks a valid transition to this target.
        let mut cost = self.solver.data.statements[target].sum_approx(block);

        for pred in body.basic_blocks.predecessors(block) {
            if pred == block {
                continue; // self-loop: cost is always 0
            }

            let edges = self
                .solver
                .condensation
                .incoming_edges(region)
                .filter(|edge| edge.source.block == pred && edge.target.block == block);

            let pred_target = (self.determine_target)(pred);

            for edge in edges {
                let Some(trans_cost) =
                    self.transition_cost(pred_target.map(|elem| elem.target), Some(target), edge)
                else {
                    // No valid transition from this predecessor to the candidate target
                    return None;
                };

                let mut trans_cost = trans_cost.as_approx();
                if edge.source.region != edge.target.region {
                    // Cross-region edge — dampen the transition cost
                    trans_cost *= self.config.boundary_multiplier;
                }

                cost += trans_cost;
            }
        }

        for succ in body.basic_blocks.successors(block) {
            if succ == block {
                continue; // self-loop: cost is always 0
            }

            let edges = self
                .solver
                .condensation
                .outgoing_edges(region)
                .filter(|edge| edge.source.block == block && edge.target.block == succ);

            let succ_target = (self.determine_target)(succ);

            for edge in edges {
                let Some(trans_cost) =
                    self.transition_cost(Some(target), succ_target.map(|elem| elem.target), edge)
                else {
                    // No valid transition from the candidate target to this successor
                    return None;
                };

                let mut trans_cost = trans_cost.as_approx();
                if edge.source.region != edge.target.region {
                    // Cross-region edge — dampen the transition cost
                    trans_cost *= self.config.boundary_multiplier;
                }

                cost += trans_cost;
            }
        }

        Some(cost)
    }

    /// Evaluates all candidate targets for `block` and returns them as a sorted [`TargetHeap`].
    pub(crate) fn run(
        &self,
        body: &Body<'_>,
        region: PlacementRegionId,
        block: BasicBlockId,
    ) -> TargetHeap {
        let mut heap = TargetHeap::new();

        for target in &self.solver.data.assignment[block] {
            if let Some(cost) = self.estimate_target(body, region, block, target) {
                heap.insert(target, cost);
            }
        }

        heap
    }

    /// Estimates the cost of a single target assignment for `block`.
    ///
    /// Convenience wrapper around the internal estimation.
    pub(crate) fn estimate(
        &self,
        body: &Body<'_>,
        region: PlacementRegionId,
        block: BasicBlockId,
        target: TargetId,
    ) -> Option<ApproxCost> {
        self.estimate_target(body, region, block, target)
    }
}

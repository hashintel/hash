use core::{alloc::Allocator, cmp};

use hashql_core::{
    graph::{NodeId, Predecessors as _, Successors as _, linked::Edge},
    heap::BumpAllocator,
    id::{HasId as _, Id},
};

use super::{BoundaryEdge, Condense, PlacementRegionId};
use crate::{
    body::{Body, basic_block::BasicBlockId},
    pass::execution::{ApproxCost, Cost, target::TargetId},
};

#[derive(Debug, Copy, Clone)]
pub(crate) struct HeapElement {
    pub target: TargetId,
    pub cost: ApproxCost,
}

impl HeapElement {
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

    pub(crate) const fn new() -> Self {
        Self::EMPTY
    }

    pub(crate) fn insert(&mut self, target: TargetId, cost: ApproxCost) {
        assert!(self.length < TargetId::VARIANT_COUNT_U8);

        let index = self.length as usize;
        self.length += 1;

        self.targets[index] = HeapElement { target, cost };
        self.targets[(self.index as usize)..(self.length as usize)].sort_unstable();
    }

    pub(crate) const fn reset(&mut self) {
        self.length = 0;
        self.index = 0;
    }

    pub(crate) const fn peek(&self) -> Option<&HeapElement> {
        if self.index >= self.length {
            return None;
        }

        Some(&self.targets[self.index as usize])
    }

    pub(crate) const fn pop(&mut self) -> Option<HeapElement> {
        if self.index >= self.length {
            return None;
        }

        let element = self.targets[self.index as usize];
        self.index += 1;

        Some(element)
    }

    pub(crate) const fn is_empty(&self) -> bool {
        self.index >= self.length
    }

    pub(crate) const fn len(&self) -> usize {
        self.length.saturating_sub(self.index) as usize
    }
}

pub(crate) struct CostEstimationConfig {
    boundary_multiplier: f32,
}

impl CostEstimationConfig {
    pub(crate) const LOOP: Self = Self {
        boundary_multiplier: 0.5,
    };
    pub(crate) const TRIVIAL: Self = Self {
        boundary_multiplier: 1.0,
    };
}

pub(crate) struct CostEstimation<'ctx, 'parent, 'alloc, A: Allocator, S: BumpAllocator> {
    pub config: CostEstimationConfig,
    pub condense: &'ctx Condense<'parent, 'alloc, A, S>,
}

impl<A: Allocator, S: BumpAllocator> CostEstimation<'_, '_, '_, A, S> {
    fn transition_cost(
        &self,
        source: Option<TargetId>,
        target: Option<TargetId>,
        edge: &Edge<BoundaryEdge>,
    ) -> Option<Cost> {
        match (source, target) {
            (Some(source), None) => {
                // Find the target for which the transition is the minimum
                let mut current_minimum = ApproxCost::INF;
                let mut minimum_transition_cost = None;

                for target in &self.condense.data.assignment[edge.data.target] {
                    let Some(cost) = edge.data.matrix.get(source, target) else {
                        continue;
                    };

                    let mut block_cost =
                        self.condense.data.statements[target].sum_approx(edge.data.target);
                    block_cost += cost;

                    if block_cost < current_minimum {
                        current_minimum = block_cost;
                        minimum_transition_cost = Some(cost);
                    }
                }

                minimum_transition_cost
            }
            (None, Some(target)) => {
                // Find the source for which the transition is the minimum
                let mut current_minimum = ApproxCost::INF;
                let mut minimum_transition_cost = None;

                for source in &self.condense.data.assignment[edge.data.source] {
                    let Some(cost) = edge.data.matrix.get(source, target) else {
                        continue;
                    };

                    let mut block_cost =
                        self.condense.data.statements[source].sum_approx(edge.data.source);
                    block_cost += cost;

                    if block_cost < current_minimum {
                        current_minimum = block_cost;
                        minimum_transition_cost = Some(cost);
                    }
                }

                minimum_transition_cost
            }
            (Some(source), Some(target)) => edge.data.matrix.get(source, target),
            (None, None) => {
                let mut current_minimum = ApproxCost::INF;
                let mut minimum_transition_cost = None;

                for (source, target, cost) in edge.data.matrix.iter() {
                    let &Some(cost) = cost else {
                        continue;
                    };

                    let mut block_cost =
                        self.condense.data.statements[source].sum_approx(edge.data.source);
                    block_cost +=
                        self.condense.data.statements[target].sum_approx(edge.data.target);
                    block_cost += cost;

                    if block_cost < current_minimum {
                        current_minimum = block_cost;
                        minimum_transition_cost = Some(cost);
                    }
                }

                minimum_transition_cost
            }
        }
    }

    fn estimate_target(
        &self,
        body: &Body<'_>,
        region: PlacementRegionId,
        block: BasicBlockId,
        target: TargetId,
    ) -> Option<ApproxCost> {
        // The total cost of the target is any transition *to it* and the actual execution of the
        // target. For predecessors or successors which do not yet have a cost, we assume that they
        // are going to choose the optimal (local) option, this may not be the actual chosen
        // option, but is a good approximation.
        // In case that any fixed predecessor or successor lacks a transition to the backend we
        // abort.
        // We do **not** include the cost of the actual statement we come from, only the transition.
        // This means that we double count (as both the predecessor and successor are used), but
        // this is required to be able to create a proper decision.
        // Statements outside of the current placement region get a penalty via a multiplier. For
        // scc operations this is 1, whereas inside of a node this may be lower, to account for the
        // fact that the cost inside of a node is more important than the transition cost.
        let mut cost = self.condense.data.statements[target].sum_approx(block);

        for pred in body.basic_blocks.predecessors(block) {
            if pred == block {
                continue; // self-loop: both sides share the same target, cost is always 0
            }

            let edges = self
                .condense
                .graph
                .incoming_edges(NodeId::from_usize(region.as_usize()))
                .filter(|edge| edge.data.source == pred && edge.data.target == block);

            let pred_target = self.condense.targets[pred];

            for edge in edges {
                let Some(trans_cost) =
                    self.transition_cost(pred_target.map(|elem| elem.target), Some(target), edge)
                else {
                    // Transition to this backend is not possible from this predecessor to the
                    // chosen target
                    return None;
                };

                let mut trans_cost = trans_cost.as_approx();
                if edge.source() != edge.target() {
                    // not in the same SCC
                    trans_cost *= self.config.boundary_multiplier;
                }

                cost += trans_cost;
            }
        }

        for succ in body.basic_blocks.successors(block) {
            if succ == block {
                continue; // self-loop: both sides share the same target, cost is always 0
            }

            let edges = self
                .condense
                .graph
                .outgoing_edges(NodeId::from_usize(region.as_usize()))
                .filter(|edge| edge.data.source == block && edge.data.target == succ);

            let succ_target = self.condense.targets[succ];

            for edge in edges {
                let Some(trans_cost) =
                    self.transition_cost(Some(target), succ_target.map(|elem| elem.target), edge)
                else {
                    // Transition to this backend is not possible from this chosen target to the
                    // successor
                    return None;
                };

                let mut trans_cost = trans_cost.as_approx();
                if edge.source() != edge.target() {
                    // not in the same SCC
                    trans_cost *= self.config.boundary_multiplier;
                }

                cost += trans_cost;
            }
        }

        Some(cost)
    }

    pub(crate) fn run(
        &self,
        body: &Body<'_>,
        region: PlacementRegionId,
        block: BasicBlockId,
    ) -> TargetHeap {
        let mut heap = TargetHeap::new();

        for target in &self.condense.data.assignment[block] {
            if let Some(cost) = self.estimate_target(body, region, block, target) {
                heap.insert(target, cost);
            }
        }

        heap
    }
}

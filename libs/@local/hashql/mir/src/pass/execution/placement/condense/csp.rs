use core::alloc::Allocator;
use std::f32;

use hashql_core::{
    graph::{Predecessors as _, Successors as _},
    heap::BumpAllocator,
    id::bit_vec::{BitRelations as _, DenseBitSet},
};

use super::{
    Condense, CondenseData, CyclicPlacementRegion, PlacementRegionId,
    estimate::{HeapElement, TargetHeap},
};
use crate::{
    body::{Body, basic_block::BasicBlockId},
    pass::execution::{
        placement::condense::estimate::{CostEstimation, CostEstimationConfig},
        target::{TargetBitSet, TargetId},
    },
};

#[derive(Debug, Copy, Clone)]
pub(crate) struct PlacementBlock {
    id: BasicBlockId,
    heap: TargetHeap,

    target: HeapElement,
    possible: TargetBitSet,
}

impl PlacementBlock {
    pub(super) const PLACEHOLDER: Self = Self {
        id: BasicBlockId::PLACEHOLDER,
        heap: TargetHeap::new(),

        // The chosen target (undefined if not fixed yet)
        target: HeapElement::EMPTY,
        // The remaining possibilities (in case chosen this is just the same as the chosen target)
        possible: TargetBitSet::new_empty(TargetId::VARIANT_COUNT_U32),
    };
}

pub(crate) struct ConstraintSatisfaction<'ctx, 'parent, 'alloc, A: Allocator, S: BumpAllocator> {
    pub condense: &'ctx mut Condense<'parent, 'alloc, A, S>,

    pub id: PlacementRegionId,
    pub region: CyclicPlacementRegion<'alloc>,

    pub fixed: DenseBitSet<BasicBlockId>,
    pub depth: usize,
}

impl<'alloc, A: Allocator, S: BumpAllocator> ConstraintSatisfaction<'_, '_, 'alloc, A, S> {
    fn seed(&mut self) {
        for (index, &member) in self.region.members.iter().enumerate() {
            self.region.blocks[index] = PlacementBlock {
                id: member,
                heap: TargetHeap::new(),
                target: HeapElement::EMPTY,
                possible: self.condense.data.assignment[member],
            }
        }
    }

    fn mrv(&self, body: &Body<'_>) -> (usize, BasicBlockId) {
        let applicable = &self.region.blocks[self.depth..];

        let mut current_offset = 0;
        let mut current_block = BasicBlockId::PLACEHOLDER;
        let mut current_domain_size = usize::MAX;
        let mut current_unfixed_degree = usize::MAX;

        for (index, block) in applicable.iter().enumerate() {
            // We know that these are *not* fixed
            let domain_size = block.possible.len();

            // Find the amount of neighbours that are currently *not* fixed, only considers internal
            // edges
            // TODO: we're double counting here in case of a SwitchInt, should be fine though? / is
            // correct?
            let unfixed_degree = body
                .basic_blocks
                .predecessors(block.id)
                .chain(body.basic_blocks.successors(block.id))
                .filter(|&neighbour| {
                    !self.fixed.contains(neighbour)
                        && neighbour != block.id
                        && self.region.members.contains(&neighbour)
                })
                .count();

            if domain_size < current_domain_size
                || (domain_size == current_domain_size && unfixed_degree < current_unfixed_degree)
            {
                current_offset = index;
                current_block = block.id;
                current_domain_size = domain_size;
                current_unfixed_degree = unfixed_degree;
            }
        }

        debug_assert!(current_block != BasicBlockId::PLACEHOLDER); // should never happen, we never call when there are no more remaining
        (current_offset, current_block)
    }

    fn narrow_impl(
        data: &CondenseData<'_, A>,
        blocks: &mut [PlacementBlock],
        body: &Body<'_>,
        block: BasicBlockId,
        target: TargetId,
    ) {
        let matrices = data.terminators.of(block);
        let successors = body.basic_blocks.successors(block);
        debug_assert_eq!(successors.len(), matrices.len());

        for (succ, matrix) in successors.zip(matrices) {
            // restrict non-fixed backends to our set of available blocks. We only do this in
            // case that it isn't fixed.
            let Some(remaining) = blocks.iter_mut().find(|block| block.id == succ) else {
                continue; // has already been fixed
            };

            let mut available = TargetBitSet::new_empty(TargetId::VARIANT_COUNT_U32);
            for (outgoing, _) in matrix.outgoing(target) {
                available.insert(outgoing);
            }

            // Ensure that we narrow the set of available backends from the ones that we have
            // received.
            remaining.possible.intersect(&available);
        }
    }

    fn narrow(&mut self, body: &Body<'_>, block: BasicBlockId, target: TargetId) {
        Self::narrow_impl(&self.condense.data, self.region.blocks, body, block, target);
    }

    fn replay_narrowing(&mut self, body: &Body<'_>) {
        // Reset the items after the depth, to the new items
        for block in &mut self.region.blocks[self.depth..] {
            block.possible = self.condense.data.assignment[block.id];
        }

        self.fixed.clear();
        let (fixed, flex) = self.region.blocks.split_at_mut(self.depth);

        for fixed in fixed {
            self.fixed.insert(fixed.id);

            Self::narrow_impl(
                &self.condense.data,
                flex,
                body,
                fixed.id,
                fixed.target.target,
            );
        }
    }

    fn rollback(&mut self, body: &Body<'_>) -> bool {
        // Rollback to a previous version (or terminate in case that we can't find something else)
        // TODO: I think the logic here is wrong
        while self.depth > 0 {
            self.depth -= 1;

            let block = &mut self.region.blocks[self.depth];
            if let Some(heap) = block.heap.pop() {
                block.target = heap;

                self.replay_narrowing(body);
                return true;
            }
        }

        false
    }

    fn run(&mut self, body: &Body<'_>) -> bool {
        let members = self.region.members.len();

        while self.depth < members {
            let (offset, next) = self.mrv(body);
            self.fixed.insert(next);

            // move the block into position
            self.region.blocks.swap(self.depth, self.depth + offset);

            // `CostEstimation` takes the set of availability from inside of the condense. This is
            // fine, because the restriction we set is a by definition a mirror and only used for
            // MRV to work.
            let mut heap = CostEstimation {
                config: CostEstimationConfig::LOOP,
                condense: self.condense,
            }
            .run(body, self.id, next);

            let Some(elem) = heap.pop() else {
                if !self.rollback(body) {
                    return false;
                }

                continue;
            };

            self.narrow(body, next, elem.target);
            self.region.blocks[self.depth].target = elem;
            self.depth += 1;
        }

        for block in &*self.region.blocks {
            self.condense.targets[block.id] = Some(block.target);
        }

        true
    }

    pub(crate) fn solve(&mut self, body: &Body<'_>) -> bool {
        self.seed();

        self.depth = 0;
        self.fixed = DenseBitSet::new_empty(body.basic_blocks.len());

        self.run(body)
    }

    pub(crate) fn next(&mut self, body: &Body<'_>) -> bool {
        // Unlike the trivial backend, we do not fully rollback, instead we check for the target
        // that has the smallest delta, and use that to re-compute the cost of the condense.
        let mut min_diff = f32::INFINITY;
        let mut best_depth = 0;

        for (depth, placement) in self.region.blocks.iter().enumerate() {
            let Some(next) = placement.heap.peek() else {
                continue; // cannot choose an alternative
            };

            let diff = placement.target.cost.delta(next.cost);

            if diff < min_diff {
                min_diff = diff;
                best_depth = depth;
            }
        }

        self.depth = best_depth + 1;

        // We start *after* the best choice we've just chosen
        let block = &mut self.region.blocks[best_depth];
        let next_elem = block.heap.pop().expect("loop just verified it's correct");
        block.target = next_elem;

        self.replay_narrowing(body);

        self.run(body)
    }
}

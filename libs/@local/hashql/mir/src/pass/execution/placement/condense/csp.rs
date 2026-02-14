use std::alloc::Allocator;

use hashql_core::{
    graph::{Predecessors, Successors, linked::Node},
    id::bit_vec::{BitRelations, DenseBitSet},
};

use super::{
    CondenseData, CyclicPlacementRegion, PlacementRegion, PlacementRegionId,
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
        possible: TargetBitSet::new_empty(TargetId::VARIANT_COUNT as u32),
    };
}

struct ConstraintSatisfaction<'ctx, 'alloc, A: Allocator> {
    data: CondenseData<'ctx, A>,

    assignment: &'alloc [PlacementBlock],

    id: PlacementRegionId,
    region: CyclicPlacementRegion<'alloc>,

    fixed: DenseBitSet<BasicBlockId>,
    depth: usize,
}

impl<'alloc, A: Allocator> ConstraintSatisfaction<'_, 'alloc, A> {
    fn seed(&mut self) {
        for (index, &member) in self.region.members.iter().enumerate() {
            self.region.blocks[index] = PlacementBlock {
                id: member,
                heap: TargetHeap::new(),
                target: HeapElement::EMPTY,
                possible: self.data.assignment[member],
            }
        }
    }

    fn mrv(&mut self, body: &Body<'_>) -> (usize, BasicBlockId) {
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

    fn solve(&mut self, body: &Body<'_>, node: &mut Node<PlacementRegion<'alloc>>) {
        let members = self.region.members.len();
        self.seed();

        self.depth = 0;
        self.fixed = DenseBitSet::new_empty(body.basic_blocks.len());

        while self.depth < members {
            let (offset, next) = self.mrv(body);
            self.fixed.insert(next);

            // move the block into position
            self.region.blocks.swap(self.depth, self.depth + offset);

            // TODO: must use the block targets that we have supplied, aka take a closure (Actually
            // do we? I mean does not really matter, because they are the same, we just
            // pre-narrow in our case for MRV to work).
            let mut heap = CostEstimation {
                config: CostEstimationConfig::LOOP,
                condense,
                context,
                region: node,
            }
            .run(body, next);

            let Some(elem) = heap.pop() else {
                todo!(
                    "needs to backtrack, in which case what we're doing after this needs to be \
                     done again. We need to replay *all* that go up to the backtracked point to \
                     be valid."
                );
            };

            // Narrow the set of possible targets, this is not needed for correctness, because cost
            // estimation already does this for us as well, but allows for MRV to work.
            let matrices = self.data.terminators.of(next);
            let successors = body.basic_blocks.successors(next);
            debug_assert_eq!(successors.len(), matrices.len());

            for (succ, matrix) in successors.zip(matrices) {
                let mut available = TargetBitSet::new_empty(TargetId::VARIANT_COUNT as u32);
                for (outgoing, _) in matrix.outgoing(elem.target) {
                    available.insert(outgoing);
                }

                // TODO: find the block in our list of *not yet* placed blocks,
                let Some(remaining) = self.region.blocks[self.depth..]
                    .iter_mut()
                    .find(|block| block.id == succ)
                else {
                    continue; // has already been fixed
                };

                // Ensure that we narrow the set of available backends from the ones that we have
                // received.
                remaining.possible.intersect(&available);
            }

            self.region.blocks[self.depth].target = elem;
            self.depth += 1;
        }

        // TODO: flush the result

        todo!()
    }
}

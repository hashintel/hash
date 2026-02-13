use core::mem;
use std::alloc::Allocator;

use hashql_core::{
    graph::{Predecessors, Successors, linked::Node},
    heap::BumpAllocator,
    id::bit_vec::{BitRelations, DenseBitSet},
};

use super::{
    Condense, CondenseContext, PlacementRegion, PlacementRegionScratch,
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

        // the chosen target (undefined if not fixed yet)
        target: HeapElement::EMPTY,
        // The remaining possibilities (in case chosen this is just the same as the chosen target)
        possible: TargetBitSet::new_empty(TargetId::VARIANT_COUNT as u32),
    };
}

fn seed<'alloc>(
    condense: &Condense<'_, impl Allocator>,
    node: &Node<PlacementRegion<'alloc>>,
    scratch: &mut PlacementRegionScratch,
) {
    for (index, &member) in node.data.members.iter().enumerate() {
        scratch.front[index] = PlacementBlock {
            id: member,
            heap: TargetHeap::new(),
            target: HeapElement::EMPTY,
            possible: condense.targets[member],
        }
    }
}

fn mrv<'alloc>(
    body: &Body<'_>,
    node: &Node<PlacementRegion<'alloc>>,
    PlacementRegionScratch { front, back: _ }: &PlacementRegionScratch<'alloc>,
    fixed: &DenseBitSet<BasicBlockId>,
    depth: usize,
) -> (usize, BasicBlockId) {
    let applicable = &front[depth..];

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
                !fixed.contains(neighbour)
                    && neighbour != block.id
                    && node.data.members.contains(&neighbour)
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

fn solve<'alloc>(
    body: &Body<'_>,
    condense: &Condense<'_, impl Allocator>,
    context: &CondenseContext<'alloc, impl BumpAllocator>,
    node: &mut Node<PlacementRegion<'alloc>>,
) {
    let members = node.data.members.len();
    let mut scratch = node.data.take_scratch();
    seed(condense, node, &mut scratch);

    let mut depth = 0;
    let mut fixed = DenseBitSet::new_empty(body.basic_blocks.len());

    while depth < members {
        let (offset, next) = mrv(body, node, &scratch, &fixed, depth);
        fixed.insert(next);

        // move the block into position
        scratch.front.swap(depth, depth + offset);

        // TODO: must use the block targets that we have supplied, aka take a closure (Actually do
        // we? I mean does not really matter, because they are the same, we just pre-narrow
        // in our case for MRV to work).
        let mut heap = CostEstimation {
            config: CostEstimationConfig::LOOP,
            condense,
            context,
            region: node,
        }
        .run(body, next);

        let Some(elem) = heap.pop() else {
            todo!(
                "needs to backtrack, in which case what we're doing after this needs to be done \
                 again. We need to replay *all* that go up to the backtracked point to be valid."
            );
        };

        // Narrow the set of possible targets, this is not needed for correctness, because cost
        // estimation already does this for us as well, but allows for MRV to work.
        let matrices = condense.terminators.of(next);
        for (succ, matrix) in body.basic_blocks.successors(next).zip(matrices) {
            let mut available = TargetBitSet::new_empty(TargetId::VARIANT_COUNT as u32);
            for (outgoing, _) in matrix.outgoing(elem.target) {
                available.insert(outgoing);
            }

            // TODO: find the block in our list of *not yet* placed blocks,
            let Some(remaining) = scratch.front[depth..]
                .iter_mut()
                .find(|block| block.id == succ)
            else {
                continue; // has already been fixed
            };

            // Ensure that we narrow the set of available backends from the ones that we have
            // received.
            remaining.possible.intersect(&available);
        }

        scratch.front[depth].target = elem;

        depth += 1;
    }

    // TODO: flush the result

    todo!()
}

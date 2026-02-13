use std::alloc::Allocator;

use hashql_core::{
    graph::{Predecessors, Successors, linked::Node},
    heap::BumpAllocator,
    id::bit_vec::DenseBitSet,
};

use super::{
    Condense, CondenseContext, PlacementRegion, PlacementRegionScratch,
    estimate::{HeapElement, TargetHeap},
};
use crate::{
    body::{Body, basic_block::BasicBlockId},
    pass::execution::target::{TargetBitSet, TargetId},
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
) -> Option<BasicBlockId> {
    let applicable = &front[depth..];

    let mut current_block = BasicBlockId::PLACEHOLDER;
    let mut current_domain_size = usize::MAX;
    let mut current_unfixed_degree = usize::MAX;

    for block in applicable {
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
            current_block = block.id;
            current_domain_size = domain_size;
            current_unfixed_degree = unfixed_degree;
        }
    }

    (current_block != BasicBlockId::PLACEHOLDER).then_some(current_block)
}

fn solve<'alloc>(
    condense: &Condense<'_, impl Allocator>,
    context: &mut CondenseContext<'alloc, impl BumpAllocator>,
    node: &mut Node<PlacementRegion<'alloc>>,
) {
    let mut scratch = node.data.take_scratch();
    seed(condense, node, &mut scratch);

    let mut depth = 0;

    todo!()
}

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
    pub id: BasicBlockId,
    heap: TargetHeap,

    pub target: HeapElement,
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

impl<A: Allocator, S: BumpAllocator> ConstraintSatisfaction<'_, '_, '_, A, S> {
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
        let mut current_constraint_degree = 0;

        for (index, block) in applicable.iter().enumerate() {
            let domain_size = block.possible.len();

            // Count constrained neighbors (fixed or boundary), not unfixed ones. Higher means
            // more constrained — spec says highest constraint degree breaks MRV ties.
            let constraint_degree = body
                .basic_blocks
                .predecessors(block.id)
                .chain(body.basic_blocks.successors(block.id))
                .filter(|&neighbour| {
                    neighbour != block.id
                        && (self.fixed.contains(neighbour)
                            || !self.region.members.contains(&neighbour))
                })
                .count();

            if domain_size < current_domain_size
                || (domain_size == current_domain_size
                    && constraint_degree > current_constraint_degree)
            {
                current_offset = index;
                current_block = block.id;
                current_domain_size = domain_size;
                current_constraint_degree = constraint_degree;
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
        // Narrow successors: for edge (block → succ), keep targets t_s where M[(target, t_s)]
        // exists.
        let matrices = data.terminators.of(block);
        let successors = body.basic_blocks.successors(block);
        debug_assert_eq!(successors.len(), matrices.len());

        for (succ, matrix) in successors.zip(matrices) {
            let Some(remaining) = blocks.iter_mut().find(|candidate| candidate.id == succ) else {
                continue; // already fixed
            };

            let mut available = TargetBitSet::new_empty(TargetId::VARIANT_COUNT_U32);
            for (outgoing, _) in matrix.outgoing(target) {
                available.insert(outgoing);
            }

            remaining.possible.intersect(&available);
        }

        // Narrow predecessors: for edge (pred → block), keep targets t_p where M[(t_p, target)]
        // exists. The matrix lives at terminators.of(pred), indexed by pred's successor slot.
        for pred in body.basic_blocks.predecessors(block) {
            let Some(remaining) = blocks.iter_mut().find(|candidate| candidate.id == pred) else {
                continue; // already fixed
            };

            let pred_matrices = data.terminators.of(pred);
            let pred_successors = body.basic_blocks.successors(pred);

            for (succ, matrix) in pred_successors.zip(pred_matrices) {
                if succ != block {
                    continue;
                }

                let mut available = TargetBitSet::new_empty(TargetId::VARIANT_COUNT_U32);
                for (incoming, _) in matrix.incoming(target) {
                    available.insert(incoming);
                }

                remaining.possible.intersect(&available);
            }
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
        while self.depth > 0 {
            self.depth -= 1;

            let block = &mut self.region.blocks[self.depth];
            if let Some(next) = block.heap.pop() {
                block.target = next;

                // depth points at the block we just changed; move past it so
                // replay_narrowing treats it as fixed and propagates its new target.
                self.depth += 1;
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
                determine_target: |block| {
                    if let Some(member) = self
                        .region
                        .blocks
                        .iter()
                        .find(|placement| placement.id == block)
                    {
                        self.fixed.contains(member.id).then_some(member.target)
                    } else {
                        self.condense.targets[block]
                    }
                },
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
            self.region.blocks[self.depth].heap = heap;
            self.depth += 1;
        }

        true
    }

    pub(crate) fn solve(&mut self, body: &Body<'_>) -> bool {
        debug_assert_eq!(self.fixed.domain_size(), body.basic_blocks.len());

        self.seed();

        self.depth = 0;
        self.fixed.clear();

        self.run(body)
    }

    pub(crate) fn next(&mut self, body: &Body<'_>) -> bool {
        debug_assert_eq!(self.fixed.domain_size(), body.basic_blocks.len());

        // Least-delta perturbation: find the member whose next heap alternative has the smallest
        // cost delta from its current assignment, and switch it.
        let mut min_diff = f32::INFINITY;
        let mut best_depth = None;

        for (depth, placement) in self.region.blocks.iter().enumerate() {
            let Some(next) = placement.heap.peek() else {
                continue;
            };

            let diff = placement.target.cost.delta(next.cost);

            if diff < min_diff {
                min_diff = diff;
                best_depth = Some(depth);
            }
        }

        let Some(best_depth) = best_depth else {
            return false; // all heaps exhausted, no perturbation possible
        };

        let block = &mut self.region.blocks[best_depth];
        let next_elem = block.heap.pop().expect("loop just verified peek() is Some");
        block.target = next_elem;

        // Resume after the perturbed block
        self.depth = best_depth + 1;
        self.replay_narrowing(body);

        self.run(body)
    }
}

use core::{alloc::Allocator, cmp, mem};
use std::f32;

use hashql_core::{
    graph::{Predecessors as _, Successors as _},
    heap::BumpAllocator,
    id::bit_vec::{BitRelations as _, DenseBitSet},
};

use super::{
    PlacementContext, PlacementRegionId, PlacementSolver,
    estimate::{HeapElement, TargetHeap},
};
use crate::{
    body::{Body, basic_block::BasicBlockId},
    pass::execution::{
        ApproxCost, Cost,
        placement::solve::estimate::{CostEstimation, CostEstimationConfig},
        target::{TargetBitSet, TargetId},
    },
};

/// Maximum SCC size for branch-and-bound. Larger SCCs fall back to greedy.
const BNB_CUTOFF: usize = 12;
const RETAIN_SOLUTIONS: usize = 3;

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

#[derive(Debug, Clone)]
pub(crate) struct Solution {
    cost: ApproxCost,
    placement: [PlacementBlock; BNB_CUTOFF],
}

impl Solution {
    pub(crate) const fn new() -> Self {
        Self {
            cost: ApproxCost::INF,
            placement: [PlacementBlock::PLACEHOLDER; BNB_CUTOFF],
        }
    }
}

type Solutions = [Solution];

#[derive(Debug)]
pub(crate) struct CyclicPlacementRegion<'alloc> {
    pub members: &'alloc [BasicBlockId],

    pub blocks: &'alloc mut [PlacementBlock],
    pub fixed: DenseBitSet<BasicBlockId>,

    pub solutions: Option<&'alloc mut Solutions>,
}

impl<'alloc> CyclicPlacementRegion<'alloc> {
    pub(crate) fn find_block(&self, block: BasicBlockId) -> Option<&PlacementBlock> {
        self.blocks.iter().find(|placement| placement.id == block)
    }
}

pub(crate) struct ConstraintSatisfaction<'ctx, 'parent, 'alloc, A: Allocator, S: BumpAllocator> {
    pub solver: &'ctx mut PlacementSolver<'parent, 'alloc, A, S>,

    pub id: PlacementRegionId,
    pub region: CyclicPlacementRegion<'alloc>,

    depth: usize,

    // Branch-and-bound state (only used when members.len() <= BNB_CUTOFF)
    cost_deltas: [ApproxCost; BNB_CUTOFF],
    cost_so_far: ApproxCost,
}

impl<'ctx, 'parent, 'alloc, A: Allocator, S: BumpAllocator>
    ConstraintSatisfaction<'ctx, 'parent, 'alloc, A, S>
{
    pub(crate) const fn new(
        solver: &'ctx mut PlacementSolver<'parent, 'alloc, A, S>,
        id: PlacementRegionId,
        region: CyclicPlacementRegion<'alloc>,
    ) -> Self {
        Self {
            solver,
            id,
            region,
            depth: 0,
            cost_deltas: [ApproxCost::ZERO; BNB_CUTOFF],
            cost_so_far: ApproxCost::ZERO,
        }
    }

    fn seed(&mut self) {
        for (index, &member) in self.region.members.iter().enumerate() {
            self.region.blocks[index] = PlacementBlock {
                id: member,
                heap: TargetHeap::new(),
                target: HeapElement::EMPTY,
                possible: self.solver.data.assignment[member],
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
                        && (self.region.fixed.contains(neighbour)
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
        data: &PlacementContext<'_, A>,
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
        Self::narrow_impl(&self.solver.data, self.region.blocks, body, block, target);
    }

    fn replay_narrowing(&mut self, body: &Body<'_>) {
        // Reset the items after the depth, to the new items
        for block in &mut self.region.blocks[self.depth..] {
            block.possible = self.solver.data.assignment[block.id];
        }

        self.region.fixed.clear();
        let (fixed, flex) = self.region.blocks.split_at_mut(self.depth);

        for fixed in fixed {
            self.region.fixed.insert(fixed.id);

            Self::narrow_impl(&self.solver.data, flex, body, fixed.id, fixed.target.target);
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
            self.region.fixed.insert(next);

            // move the block into position
            self.region.blocks.swap(self.depth, self.depth + offset);

            // `CostEstimation` takes the set of availability from inside of the condense. This is
            // fine, because the restriction we set is a by definition a mirror and only used for
            // MRV to work.
            let mut heap = CostEstimation {
                config: CostEstimationConfig::LOOP,
                solver: self.solver,
                determine_target: |block| {
                    if let Some(member) = self.region.find_block(block) {
                        self.region
                            .fixed
                            .contains(member.id)
                            .then_some(member.target)
                    } else {
                        self.solver.targets[block]
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

    fn assignment_cost(
        &self,
        body: &Body<'_>,
        block: BasicBlockId,
        target: TargetId,
    ) -> ApproxCost {
        let estimator = CostEstimation {
            config: CostEstimationConfig::LOOP,
            solver: self.solver,
            determine_target: |block| {
                self.region.find_block(block).map_or_else(
                    || self.solver.targets[block],
                    |member| {
                        self.region
                            .fixed
                            .contains(member.id)
                            .then_some(member.target)
                    },
                )
            },
        };

        estimator
            .estimate(body, self.id, block, target)
            .unwrap_or(ApproxCost::INF)
    }

    fn lower_bound(&self, body: &Body<'_>) -> ApproxCost {
        let unfixed = &self.region.blocks[self.depth..];
        let mut bound = ApproxCost::ZERO;

        // Per-unassigned-block: minimum statement cost over remaining domain
        for block in unfixed {
            let mut min_stmt = ApproxCost::INF;

            for target in &block.possible {
                min_stmt = cmp::min(
                    min_stmt,
                    self.solver.data.statements[target].sum_approx(block.id),
                );
            }

            if min_stmt < ApproxCost::INF {
                bound += min_stmt;
            }
        }

        // Per-unassigned-edge: minimum valid transition cost over compatible domain pairs.
        // An edge is "unassigned" if at least one endpoint is unfixed.
        for block in unfixed {
            let matrices = self.solver.data.terminators.of(block.id);
            let successors = body.basic_blocks.successors(block.id);
            debug_assert_eq!(matrices.len(), successors.len());

            for (succ, matrix) in successors.zip(matrices) {
                if succ == block.id {
                    continue; // self-loop
                }

                // Find the successor's domain — either from the unfixed set or it's fixed
                let succ_domain: Option<TargetBitSet> = unfixed
                    .iter()
                    .find(|placement| placement.id == succ)
                    .map(|placement| placement.possible);

                #[expect(clippy::option_if_let_else, reason = "readability")]
                let min_trans = if let Some(succ_possible) = succ_domain {
                    // Both endpoints involve an unfixed block — min over all compatible pairs
                    block
                        .possible
                        .iter()
                        .flat_map(|source_target| matrix.outgoing(source_target))
                        .filter_map(|(dest_target, cost)| {
                            succ_possible
                                .contains(dest_target)
                                .then_some(cost.as_approx())
                        })
                        .min()
                        .unwrap_or(ApproxCost::INF)
                } else {
                    // Successor is fixed (or external) — min over block's domain
                    let succ_target = self
                        .region
                        .find_block(succ)
                        .and_then(|placement| {
                            self.region
                                .fixed
                                .contains(placement.id)
                                .then_some(placement.target.target)
                        })
                        .or_else(|| self.solver.targets[succ].map(|elem| elem.target));

                    if let Some(succ_target) = succ_target {
                        block
                            .possible
                            .iter()
                            .filter_map(|source_target| matrix.get(source_target, succ_target))
                            .map(Cost::as_approx)
                            .min()
                            .unwrap_or(ApproxCost::INF)
                    } else {
                        ApproxCost::INF
                    }
                };

                if min_trans < ApproxCost::INF {
                    bound += min_trans;
                }
            }
        }

        bound
    }

    fn run_bnb(&mut self, body: &Body<'_>, solutions: &mut Solutions) {
        let members = self.region.members.len();

        if self.depth == members {
            // Complete assignment — check if it improves best
            let total = self.cost_so_far;

            // Move anything out by one, from the position, and shift our element in.
            // TODO: this won't work
            if let Some(needle) = solutions.iter().position(|solution| solution.cost > total) {
                let mut placement = [PlacementBlock::PLACEHOLDER; BNB_CUTOFF];
                placement[..members].copy_from_slice(&*self.region.blocks);

                let _ = solutions[needle..].shift_right([Solution {
                    cost: total,
                    placement,
                }]);
            }

            return;
        }

        let (offset, next) = self.mrv(body);
        self.region.fixed.insert(next);
        self.region.blocks.swap(self.depth, self.depth + offset);

        let mut heap = CostEstimation {
            config: CostEstimationConfig::LOOP,
            solver: self.solver,
            determine_target: |block| {
                if let Some(member) = self.region.find_block(block) {
                    self.region
                        .fixed
                        .contains(member.id)
                        .then_some(member.target)
                } else {
                    self.solver.targets[block]
                }
            },
        }
        .run(body, self.id, next);
        self.region.blocks[self.depth].heap = heap;

        // Save state for restoration
        let saved_depth = self.depth;
        let mut saved_domains = [TargetBitSet::new_empty(TargetId::VARIANT_COUNT_U32); BNB_CUTOFF];
        for (index, block) in self.region.blocks[self.depth..].iter().enumerate() {
            saved_domains[index] = block.possible;
        }

        while let Some(elem) = self.region.blocks[self.depth].heap.pop() {
            let delta = self.assignment_cost(body, next, elem.target);
            if delta == ApproxCost::INF {
                continue;
            }

            // Apply assignment
            self.region.blocks[self.depth].target = elem;
            self.depth = saved_depth + 1;
            self.cost_deltas[saved_depth] = delta;
            self.cost_so_far += delta;

            // Forward-check: narrow domains
            Self::narrow_impl(
                &self.solver.data,
                &mut self.region.blocks[self.depth..],
                body,
                next,
                elem.target,
            );

            // Check if any domain emptied
            let feasible = self.region.blocks[self.depth..]
                .iter()
                .all(|block| !block.possible.is_empty());

            if feasible {
                // Pruning check
                let lb = self.lower_bound(body);

                let best_cost = solutions[0].cost;
                if self.cost_so_far + lb < best_cost {
                    self.run_bnb(body, solutions);
                }
            }

            // Restore cost to what it was before this assignment
            self.cost_so_far = {
                let mut restored = ApproxCost::ZERO;
                for index in 0..saved_depth {
                    restored += self.cost_deltas[index];
                }
                restored
            };

            // Restore domains
            self.depth = saved_depth;
            for (index, block) in self.region.blocks[self.depth..].iter_mut().enumerate() {
                block.possible = saved_domains[index];
            }
        }

        // Undo MRV swap and fixed-set insertion
        self.region.blocks.swap(self.depth, self.depth + offset);
        self.region.fixed.remove(next);
    }

    fn apply_solution(&mut self, solution: Solution) {
        let members = self.region.members.len();
        self.region
            .blocks
            .copy_from_slice(&solution.placement[..members]);
        self.depth = members;

        for block in &mut *self.region.blocks {
            self.region.fixed.insert(block.id);
        }
    }

    pub(crate) fn solve(&mut self, body: &Body<'_>) -> bool {
        debug_assert_eq!(self.region.fixed.domain_size(), body.basic_blocks.len());

        self.seed();

        self.depth = 0;
        self.region.fixed.clear();

        if self.region.members.len() > BNB_CUTOFF {
            return self.run(body);
        }

        self.cost_so_far = ApproxCost::ZERO;

        let solutions = self
            .solver
            .alloc
            .allocate_slice_uninit(RETAIN_SOLUTIONS)
            .write_filled(Solution::new());

        self.run_bnb(body, solutions);

        let solution = mem::replace(&mut solutions[0], Solution::new());
        solutions.rotate_left(1); // add the next solution to the front

        if solution.cost.as_f32().is_infinite() {
            return false;
        }

        self.region.solutions = Some(solutions);
        self.apply_solution(solution);
        true
    }

    pub(crate) fn retry(&mut self, body: &Body<'_>) -> bool {
        debug_assert_eq!(self.region.fixed.domain_size(), body.basic_blocks.len());

        if let Some(solutions) = self.region.solutions.as_mut()
            && solutions[0].cost.as_f32().is_finite()
        {
            let solution = mem::replace(&mut solutions[0], Solution::new());
            solutions.rotate_left(1);

            self.apply_solution(solution);
            return true;
        }

        // We have evaluated all the solutions, and none of the top K are feasible, therefore we go
        // back to greedy search.

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

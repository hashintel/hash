//! Constraint satisfaction for cyclic placement regions.
//!
//! The CSP solver assigns execution targets to blocks within a multi-block SCC. Two strategies are
//! available:
//!
//! - **Branch-and-bound (`BnB`)** for SCCs with ≤[`BNB_CUTOFF`] blocks, retaining the top
//!   [`RETAIN_SOLUTIONS`] best solutions. On retry, precomputed solutions are tried first before
//!   falling back to least-delta perturbation + greedy.
//! - **Greedy with backtracking** for larger SCCs.
//!
//! Block ordering uses the MRV (minimum remaining values) heuristic, with highest constraint degree
//! as tie-breaker. Forward checking narrows domains bidirectionally after each assignment.

use core::{alloc::Allocator, cmp, mem};
use std::f32;

use hashql_core::{
    graph::{Predecessors as _, Successors as _},
    heap::BumpAllocator,
    id::bit_vec::{BitRelations as _, DenseBitSet},
};

use super::{
    PlacementRegionId, PlacementSolver, PlacementSolverContext,
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

#[cfg(test)]
mod tests;

/// Maximum SCC size for branch-and-bound. Larger SCCs fall back to greedy.
const BNB_CUTOFF: usize = 12;
/// Number of ranked solutions retained by branch-and-bound search.
const RETAIN_SOLUTIONS: usize = 3;

/// A basic block's state during CSP solving.
///
/// Tracks the block's ID, chosen target, remaining candidates ([`TargetHeap`]), and narrowed
/// domain of possible targets.
#[derive(Debug, Copy, Clone)]
pub(crate) struct PlacementBlock {
    /// The basic block this state belongs to.
    pub id: BasicBlockId,
    /// Remaining candidate targets, ordered by estimated cost.
    heap: TargetHeap,

    /// The currently chosen target (undefined if not yet fixed).
    pub target: HeapElement,
    /// The narrowed domain of still-possible targets.
    possible: TargetBitSet,
}

impl PlacementBlock {
    /// Sentinel value used to initialize block arrays before [`ConstraintSatisfaction::seed`].
    pub(super) const PLACEHOLDER: Self = Self {
        id: BasicBlockId::PLACEHOLDER,
        heap: TargetHeap::new(),
        target: HeapElement::EMPTY,
        possible: TargetBitSet::new_empty(TargetId::VARIANT_COUNT_U32),
    };
}

/// A complete assignment found by branch-and-bound search.
///
/// Stores the total cost and a snapshot of all [`PlacementBlock`] assignments.
#[derive(Debug, Clone)]
pub(crate) struct Solution {
    cost: ApproxCost,
    placement: [PlacementBlock; BNB_CUTOFF],
}

impl Solution {
    /// Creates a placeholder solution with infinite cost.
    pub(crate) const fn new() -> Self {
        Self {
            cost: ApproxCost::INF,
            placement: [PlacementBlock::PLACEHOLDER; BNB_CUTOFF],
        }
    }
}

type Solutions = [Solution];

/// State of a cyclic (multi-block SCC) placement region.
///
/// `members` is the canonical member list borrowed from the condensation. `blocks` is the mutable
/// working array reordered by MRV during search. `fixed` tracks which blocks have been assigned,
/// and `solutions` holds precomputed `BnB` results for [`ConstraintSatisfaction::retry`].
#[derive(Debug)]
pub(crate) struct CyclicPlacementRegion<'alloc> {
    pub members: &'alloc [BasicBlockId],

    pub blocks: &'alloc mut [PlacementBlock],
    pub fixed: DenseBitSet<BasicBlockId>,

    pub solutions: Option<&'alloc mut Solutions>,
}

impl CyclicPlacementRegion<'_> {
    /// Finds the [`PlacementBlock`] for `block` in the working array.
    // Linear scan over `blocks`. Fine for typical SCC sizes (3–6 blocks, rarely >12). If
    // profiling shows this matters, a `BasicBlockId → index` side-table would give O(1) lookup
    // at the cost of maintaining it across MRV swaps, rollbacks, and solution restoration.
    pub(crate) fn find_block(&self, block: BasicBlockId) -> Option<&PlacementBlock> {
        self.blocks.iter().find(|placement| placement.id == block)
    }
}

/// CSP solver for assigning targets within a cyclic placement region.
///
/// Borrows the parent [`PlacementSolver`] for cost estimation and target resolution.
pub(crate) struct ConstraintSatisfaction<'ctx, 'parent, 'alloc, A: Allocator, S: BumpAllocator> {
    pub solver: &'ctx mut PlacementSolver<'parent, 'alloc, A, S>,

    pub id: PlacementRegionId,
    pub region: CyclicPlacementRegion<'alloc>,

    pub depth: usize,

    // Branch-and-bound state (only used when members.len() <= BNB_CUTOFF)
    cost_deltas: [ApproxCost; BNB_CUTOFF],
    cost_so_far: ApproxCost,
}

impl<'ctx, 'parent, 'alloc, A: Allocator, S: BumpAllocator>
    ConstraintSatisfaction<'ctx, 'parent, 'alloc, A, S>
{
    /// Creates a new CSP solver for the given cyclic `region`.
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

    /// Initializes the working block array from the global domain assignments.
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

    /// Selects the next unassigned block using the MRV heuristic.
    ///
    /// Ties are broken by highest constraint degree (count of fixed + boundary neighbors).
    fn mrv(&self, body: &Body<'_>) -> (usize, BasicBlockId) {
        let applicable = &self.region.blocks[self.depth..];

        let mut current_offset = 0;
        let mut current_block = BasicBlockId::PLACEHOLDER;
        let mut current_domain_size = usize::MAX;
        let mut current_constraint_degree = 0;

        for (index, block) in applicable.iter().enumerate() {
            let domain_size = block.possible.len();

            // Count constrained neighbors (fixed or external to the SCC). Higher constraint
            // degree breaks MRV ties — picks the most constrained block first.
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

        debug_assert!(
            current_block != BasicBlockId::PLACEHOLDER,
            "mrv called with no unassigned blocks remaining"
        );
        (current_offset, current_block)
    }

    /// Narrows domains of unfixed blocks after assigning `block` to `target`.
    ///
    /// Bidirectional: restricts both successor and predecessor domains based on transition matrix
    /// compatibility.
    // This propagates from a single assigned block outward — natural for per-assignment narrowing,
    // but suboptimal when `replay_narrowing` calls it for every fixed block in the prefix. An
    // inverted approach (iterate unfixed blocks, check which neighbors are fixed via O(1) bitset
    // lookup) would reduce replay from O(|fixed| · D · |unfixed|) to O(|unfixed| · D), at the
    // cost of a separate code path that can't share with per-assignment narrowing.
    fn narrow_impl(
        data: &PlacementSolverContext<'_, A>,
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
                continue;
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
                continue;
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

    /// Instance method wrapper for [`narrow_impl`](Self::narrow_impl).
    fn narrow(&mut self, body: &Body<'_>, block: BasicBlockId, target: TargetId) {
        Self::narrow_impl(
            &self.solver.data,
            &mut self.region.blocks[self.depth..],
            body,
            block,
            target,
        );
    }

    /// Resets unfixed block domains and replays all narrowing from the fixed prefix.
    ///
    /// Used after rollback or perturbation to restore a consistent state.
    fn replay_narrowing(&mut self, body: &Body<'_>) {
        // Reset unfixed domains to their original AC-3 state
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

    /// Backtracks through the assignment stack looking for an alternative.
    ///
    /// Pops the next candidate from each block's heap, walking backward until one succeeds or all
    /// are exhausted.
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

    /// Assigns targets greedily using MRV ordering with backtracking.
    ///
    /// Uses [`CostEstimation`] to rank candidates and forward checking (narrowing) after each
    /// assignment.
    fn run_greedy(&mut self, body: &Body<'_>) -> bool {
        let members = self.region.members.len();

        while self.depth < members {
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

            let Some(elem) = heap.pop() else {
                if !self.rollback(body) {
                    return false;
                }

                continue;
            };

            self.region.blocks[self.depth].target = elem;
            self.region.blocks[self.depth].heap = heap;

            self.depth += 1;
            self.narrow(body, next, elem.target);
        }

        true
    }

    /// Estimates the cost of assigning `block` to `target` within this SCC.
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

    /// Computes a lower bound on the cost of completing the current partial assignment.
    ///
    /// Sums `min(statement_cost)` and `min(transition_cost)` independently over unfixed blocks.
    /// Used for BnB pruning: a branch is skipped when `cost_so_far + lower_bound ≥ worst_retained`.
    ///
    /// This is *not* redundant with [`CostEstimation`] despite operating on the same data.
    /// [`CostEstimation::estimate`] computes a per-block heuristic that jointly optimizes
    /// `statement + transition` costs and double-counts edges (both predecessor and successor
    /// sides) for join-point influence. This method instead:
    ///
    /// - **Independently minimizes** statement and transition costs (`min(stmt) + min(trans) ≤
    ///   min(stmt + trans)`), producing a weaker but valid lower bound.
    /// - **Single-counts edges** — only outgoing edges from each unfixed block — to avoid inflating
    ///   the bound when both endpoints are unfixed.
    /// - **Omits boundary dampening** — the bound should be optimistic, not weighted.
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

    /// Recursive branch-and-bound search over the assignment tree.
    ///
    /// Uses MRV ordering, forward checking, and lower-bound pruning against the worst retained
    /// solution.
    fn run_branch(&mut self, body: &Body<'_>, solutions: &mut Solutions) {
        let members = self.region.members.len();

        if self.depth == members {
            // Complete assignment — check if it improves best
            let total = self.cost_so_far;

            // Insert into the ranked solutions list, shifting worse solutions down
            if let Some(needle) = solutions.iter().position(|solution| solution.cost > total) {
                let mut placement = [PlacementBlock::PLACEHOLDER; BNB_CUTOFF];
                placement[..members].copy_from_slice(&*self.region.blocks);

                solutions[needle..].rotate_right(1);
                solutions[needle] = Solution {
                    cost: total,
                    placement,
                };
            }

            return;
        }

        let (offset, next) = self.mrv(body);
        self.region.fixed.insert(next);
        self.region.blocks.swap(self.depth, self.depth + offset);

        let heap = CostEstimation {
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
            if delta.is_infinite() {
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

                let worst_retained = solutions[RETAIN_SOLUTIONS - 1].cost;
                if self.cost_so_far + lb < worst_retained {
                    self.run_branch(body, solutions);
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

    /// Applies a precomputed [`Solution`] to the region's working state.
    fn apply_solution(&mut self, solution: &Solution) {
        let members = self.region.members.len();
        self.region
            .blocks
            .copy_from_slice(&solution.placement[..members]);
        self.depth = members;

        for block in &mut *self.region.blocks {
            self.region.fixed.insert(block.id);
        }
    }

    /// Solves the CSP for this cyclic region.
    ///
    /// Chooses `BnB` for small SCCs (≤ [`BNB_CUTOFF`]) and greedy for larger ones.
    pub(crate) fn solve(&mut self, body: &Body<'_>) -> bool {
        debug_assert_eq!(self.region.fixed.domain_size(), body.basic_blocks.len());

        self.seed();

        self.depth = 0;
        self.region.fixed.clear();

        if self.region.members.len() > BNB_CUTOFF {
            return self.run_greedy(body);
        }

        self.cost_so_far = ApproxCost::ZERO;

        let solutions = if let Some(solutions) = self.region.solutions.take() {
            // Re-use the existing allocation from a previous solve
            solutions.fill(Solution::new());
            solutions
        } else {
            self.solver
                .alloc
                .allocate_slice_uninit(RETAIN_SOLUTIONS)
                .write_filled(Solution::new())
        };

        self.run_branch(body, solutions);

        let solution = mem::replace(&mut solutions[0], Solution::new());
        solutions.rotate_left(1); // promote the next-best solution to the front

        if solution.cost.is_infinite() {
            return false;
        }

        self.region.solutions = Some(solutions);
        self.apply_solution(&solution);
        true
    }

    /// Attempts an alternative assignment after a previous solution was rejected.
    ///
    /// First tries precomputed `BnB` solutions, then falls back to least-delta perturbation
    /// (swapping the block whose next heap alternative has the smallest cost delta) followed by
    /// greedy search.
    pub(crate) fn retry(&mut self, body: &Body<'_>) -> bool {
        debug_assert_eq!(self.region.fixed.domain_size(), body.basic_blocks.len());

        if let Some(solutions) = self.region.solutions.as_mut()
            && solutions[0].cost.is_finite()
        {
            let solution = mem::replace(&mut solutions[0], Solution::new());
            solutions.rotate_left(1);

            self.apply_solution(&solution);
            return true;
        }

        // All precomputed solutions exhausted — fall back to least-delta perturbation:
        // find the block whose next heap alternative has the smallest cost delta and switch it.
        let mut min_diff = f32::INFINITY;
        let mut best_depth = None;

        for (depth, placement) in self.region.blocks.iter().enumerate() {
            let Some(next) = placement.heap.peek() else {
                continue;
            };

            let diff = placement.target.cost.abs_diff(next.cost);

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

        self.run_greedy(body)
    }
}

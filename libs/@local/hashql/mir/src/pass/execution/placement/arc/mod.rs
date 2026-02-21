//! Arc consistency pruning for placement determination (AC-3).
//!
//! This module implements Phase 1 of the placement determination algorithm: narrowing per-block
//! [`TargetBitSet`] domains by enforcing arc consistency over the CFG's transition constraints.
//!
//! # Background
//!
//! The placement problem is modelled as a constraint satisfaction problem (CSP):
//!
//! - **Variables**: basic blocks, each assigned an execution target.
//! - **Domains**: the [`TargetBitSet`] for each block — which targets can execute it.
//! - **Constraints**: for each CFG edge, a [`TransMatrix`] encodes which (source, dest) target
//!   pairs admit a valid transition. These are *symmetric* binary constraints: an edge between
//!   blocks A and B constrains both A's and B's domains, regardless of edge direction.
//!
//! Arc consistency (AC-3) is a fixpoint algorithm that prunes values from variable domains that
//! have no *support*: a value `t_x` in `D(x)` is unsupported if there is no `t_y` in `D(y)`
//! such that the constraint between x and y is satisfied for `(t_x, t_y)`. Removing unsupported
//! values reduces domains monotonically until a fixpoint is reached.
//!
//! # Algorithm
//!
//! A worklist of directed arcs `(x, y)` is maintained. Each arc represents the question "does
//! every value in `D(x)` have support in `D(y)`?" For each CFG edge, both arc directions are
//! seeded: `(u, v)` and `(v, u)`.
//!
//! When an arc `(x, y)` is processed:
//! 1. For each `t_x` in `D(x)`, check whether any `t_y` in `D(y)` satisfies *all* constraints
//!    between x and y. If not, remove `t_x` from `D(x)`.
//! 2. If `D(x)` changed, re-enqueue all arcs `(z, x)` where `z ≠ y` and z is adjacent to x.
//!
//! The constraint between x and y is symmetric but the [`TransMatrix`] is directional: a CFG edge
//! `u → v` stores `M[(t_u, t_v)]`. When checking support for arc `(x, y)`:
//! - CFG edges `x → y` contribute `M[(t_x, t_y)]`
//! - CFG edges `y → x` contribute `M[(t_y, t_x)]`
//!
//! When multiple CFG edges exist between the same pair (e.g. `SwitchInt` with duplicate targets),
//! a supporting `t_y` must satisfy *all* of them simultaneously.
//!
//! After the fixpoint, [`TransMatrix`] entries are pruned to match the narrowed domains.
//!
//! # Complexity
//!
//! Each arc is re-examined at most O(K) times, since each re-enqueue is caused by a domain
//! shrinking, and domains shrink at most K times. Total complexity is O(E · K²) where E is the
//! number of CFG edges and K is the number of execution targets.
//!
//! # Invariants
//!
//! - The Interpreter target must be present in every block's domain and every edge's
//!   [`TransMatrix`] must have a valid `(Interpreter, Interpreter)` transition. This guarantees
//!   that domains never empty. A `debug_assert` fires if this invariant is violated.
//! - Domains only shrink, never grow. The algorithm terminates.
//!
//! [`TransMatrix`]: crate::pass::execution::terminator_placement::TransMatrix

#[cfg(test)]
mod tests;

use core::alloc::Allocator;

use hashql_core::{
    graph::{Predecessors as _, Successors as _},
    id::bit_vec::BitMatrix,
};

use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice},
    },
    pass::execution::{target::TargetBitSet, terminator_placement::TerminatorCostVec},
};

/// Deduplicated worklist of directed arcs `(x, y)`.
///
/// Each arc appears at most once in the queue. The membership set tracks which arcs are currently
/// enqueued, preventing redundant re-examination.
struct PairWorkQueue<A: Allocator> {
    queue: Vec<(BasicBlockId, BasicBlockId), A>,
    set: BitMatrix<BasicBlockId, BasicBlockId, A>,
}

impl<A: Allocator> PairWorkQueue<A> {
    fn new_in(domain_size: usize, alloc: A) -> Self
    where
        A: Clone,
    {
        Self {
            queue: Vec::with_capacity_in(domain_size * 2, alloc.clone()),
            set: BitMatrix::new_in(domain_size, domain_size, alloc),
        }
    }

    fn enqueue(&mut self, source: BasicBlockId, target: BasicBlockId) -> bool {
        if !self.set.insert(source, target) {
            return false;
        }

        self.queue.push((source, target));
        true
    }

    fn dequeue(&mut self) -> Option<(BasicBlockId, BasicBlockId)> {
        let item = self.queue.pop()?;
        self.set.remove(item.0, item.1);

        Some(item)
    }
}

/// AC-3 arc consistency enforcer over per-block target domains.
///
/// Operates on mutable [`TargetBitSet`] domains and [`TerminatorCostVec`] transition matrices.
/// After [`run_in`](Self::run_in), every surviving target in a block's domain has at least one
/// compatible transition partner across each incident CFG edge, and the matrices are pruned to
/// match the narrowed domains.
pub struct ArcConsistency<'ctx, A: Allocator> {
    pub blocks: &'ctx mut BasicBlockSlice<TargetBitSet>,
    pub terminators: &'ctx mut TerminatorCostVec<A>,
}

impl<A: Allocator> ArcConsistency<'_, A> {
    /// Revises `D(x)` with respect to `D(y)`: removes targets from x that have no support in y.
    ///
    /// A target `t_x` has support if there exists some `t_y` in `D(y)` satisfying every
    /// constraint between x and y. Constraints come from CFG edges in either direction:
    /// edges `x → y` require `M[(t_x, t_y)]` valid, edges `y → x` require `M[(t_y, t_x)]`.
    fn reduce(&mut self, body: &Body<'_>, x: BasicBlockId, y: BasicBlockId) -> bool {
        let mut changed = false;

        for t_x in &self.blocks[x] {
            let has_support = self.blocks[y].iter().any(|t_y| {
                let x_matrices = self.terminators.of(x);
                let y_matrices = self.terminators.of(y);

                let forward_ok = body.basic_blocks[x]
                    .terminator
                    .kind
                    .successor_blocks()
                    .enumerate()
                    .filter_map(|(index, successor)| (successor == y).then_some(index))
                    .all(|index| x_matrices[index].contains(t_x, t_y));

                let reverse_ok = body.basic_blocks[y]
                    .terminator
                    .kind
                    .successor_blocks()
                    .enumerate()
                    .filter_map(|(index, successor)| (successor == x).then_some(index))
                    .all(|index| y_matrices[index].contains(t_y, t_x));

                forward_ok && reverse_ok
            });

            if !has_support {
                self.blocks[x].remove(t_x);
                changed = true;
            }
        }

        changed
    }

    /// Enforces arc consistency over all CFG edges, then prunes the transition matrices.
    pub fn run_in<B: Allocator + Clone>(&mut self, body: &Body<'_>, alloc: B) {
        let mut queue = PairWorkQueue::new_in(body.basic_blocks.len(), alloc);

        // Seed: for each CFG edge, enqueue both arc directions.
        for (target, pred) in body.basic_blocks.all_predecessors().iter_enumerated() {
            for &source in pred {
                queue.enqueue(source, target);
                queue.enqueue(target, source);
            }
        }

        while let Some((x, target)) = queue.dequeue() {
            if !self.reduce(body, x, target) {
                continue;
            }

            debug_assert!(
                !self.blocks[x].is_empty(),
                "AC-3: block {x:?} domain emptied — Interpreter guarantee violated"
            );

            // D(x) shrank — re-enqueue all other arcs incident to x: { (z, x) | z ≠ y }
            for successor in body.basic_blocks.successors(x) {
                if successor == target {
                    continue;
                }

                queue.enqueue(successor, x);
            }

            for predecessor in body.basic_blocks.predecessors(x) {
                if predecessor == target {
                    continue;
                }

                queue.enqueue(predecessor, x);
            }
        }

        // Prune transition matrices to match the narrowed domains.
        for (source, source_block) in body.basic_blocks.iter_enumerated() {
            let matrices = self.terminators.of_mut(source);
            for (index, target) in source_block.terminator.kind.successor_blocks().enumerate() {
                matrices[index].keep(self.blocks[source], self.blocks[target]);
            }
        }
    }
}

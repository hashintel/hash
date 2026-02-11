#[cfg(test)]
mod tests;

use core::{alloc::Allocator, cmp};

use hashql_core::{
    graph::{Predecessors as _, Successors as _},
    id::bit_vec::BitMatrix,
};

use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice},
    },
    pass::execution::{
        StatementCostVec, target::TargetBitSet, terminator_placement::TerminatorCostVec,
    },
};

struct PairWorkQueue<A: Allocator> {
    queue: Vec<(BasicBlockId, BasicBlockId), A>,
    set: BitMatrix<BasicBlockId, BasicBlockId>,
}

impl<A: Allocator> PairWorkQueue<A> {
    fn new_in(domain_size: usize, alloc: A) -> Self {
        Self {
            queue: Vec::with_capacity_in(domain_size * 2, alloc),
            set: BitMatrix::new(domain_size, domain_size),
        }
    }

    fn enqueue(&mut self, source: BasicBlockId, target: BasicBlockId) -> bool {
        let [source, target] = cmp::minmax(source, target); // canonical ordering

        if !self.set.insert(source, target) {
            return false;
        }

        self.queue.push((source, target));
        true
    }

    fn dequeue(&mut self) -> Option<(BasicBlockId, BasicBlockId)> {
        let item = self.queue.pop()?;

        // TODO: allow actual removal
        // self.set.remove(item.0, item.1);

        Some(item)
    }
}

pub(super) struct PlacementContext<'ctx, A: Allocator> {
    blocks: &'ctx mut BasicBlockSlice<TargetBitSet>,
    statements: &'ctx StatementCostVec<A>,
    terminators: &'ctx mut TerminatorCostVec<A>,
}

fn arc_reduce<'heap, A: Allocator>(
    body: &Body<'heap>,
    ctx: &mut PlacementContext<'_, A>,
    x: BasicBlockId,
    y: BasicBlockId,
) -> bool {
    // for each vx in D(x):
    //   find a value vy in D(y) such that vx and vy satisfy the constraint R2(x, y)
    //   if there is no such vy { D(x) := D(x) - vx; changed := true }
    //
    // The constraint between x and y may come from CFG edges in either direction:
    //  - forward edges x → y: M[(t_x, t_y)] must be valid
    //  - reverse edges y → x: M[(t_y, t_x)] must be valid
    // A supporting t_y must satisfy *all* edges simultaneously.
    let mut changed = false;

    for t_x in &ctx.blocks[x] {
        let has_support = ctx.blocks[y].iter().any(|t_y| {
            let x_matrices = ctx.terminators.of(x);
            let y_matrices = ctx.terminators.of(y);

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
            ctx.blocks[x].remove(t_x);
            changed = true;
        }
    }

    changed
}

pub(super) fn arc_consistency<'heap, A: Allocator, B: Allocator>(
    body: &Body<'heap>,
    mut ctx: PlacementContext<'_, A>,
    alloc: &B,
) {
    // our set of variables are all basic blocks
    // our domains are the basic block targets
    // we do not have unary constraints, but we have binary constraints. Our solve binary constraint
    // is: trans(x, y)
    let mut queue = PairWorkQueue::new_in(body.basic_blocks.len(), alloc);

    // worklist := { (x, y) | there exists a relation R2(x, y) or a relation R2(y, x) }

    for (target, pred) in body.basic_blocks.all_predecessors().iter_enumerated() {
        for &source in pred {
            queue.enqueue(source, target);
            queue.enqueue(target, source);
        }
    }

    while let Some((source, target)) = queue.dequeue() {
        if !arc_reduce(body, &mut ctx, source, target) {
            continue;
        }

        debug_assert!(
            !ctx.blocks[source].is_empty(),
            "AC-3: block {source:?} domain emptied — Interpreter guarantee violated"
        );

        // notify everyone "around" us
        for successor in body.basic_blocks.successors(source) {
            if successor == target {
                continue;
            }

            // (z, x) there exists a relation R2(x, z)
            queue.enqueue(successor, source);
        }

        for predecessor in body.basic_blocks.predecessors(source) {
            if predecessor == target {
                continue;
            }

            // (z, x) there exists a relation R2(z, x)
            queue.enqueue(predecessor, source);
        }
    }

    // We must now prune the matrices
    for (source, source_block) in body.basic_blocks.iter_enumerated() {
        let matrices = ctx.terminators.of_mut(source);
        for (index, target) in source_block.terminator.kind.successor_blocks().enumerate() {
            matrices[index].keep(ctx.blocks[source], ctx.blocks[target]);
        }
    }
}

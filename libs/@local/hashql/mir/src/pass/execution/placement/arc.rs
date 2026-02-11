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

struct PlacementContext<'ctx, A: Allocator> {
    blocks: &'ctx mut BasicBlockSlice<TargetBitSet>,
    statements: &'ctx StatementCostVec<A>,
    terminators: &'ctx mut TerminatorCostVec<A>,
}

fn arc_reduce<'heap, A: Allocator>(
    body: &Body<'heap>,
    ctx: &mut PlacementContext<'_, A>,
    source: BasicBlockId,
    target: BasicBlockId,
) -> bool {
    // for each vx in D(x):
    //  find a value vy in D(y) such that vx and vy satisfy the constraint satisfy the constraint
    // R2(x, y)  if there is no such vy { D(x) := D(x) - vx; changed := true }
    let mut changed = false;

    // for must see if for *every* edge between source and target the relationship holds with
    // *any* backend on the other side, and that backend *must* be the same
    let source_edges = ctx.terminators.of(source);

    // We can just intersect with the targets to get the thing we want.
    let applicable_matrices = body.basic_blocks[source]
        .terminator
        .kind
        .successor_blocks()
        .enumerate()
        .filter_map(|(index, terminator_target)| (terminator_target == target).then_some(index));

    // For each source_backend, find if there is *any* target backend (inside of the set) that is
    // part of *every* matrix.
    for source_backend in &ctx.blocks[source] {
        let has_backend = ctx.blocks[target].iter().any(|target_backend| {
            applicable_matrices
                .clone()
                .all(|matrix| source_edges[matrix].contains(source_backend, target_backend))
        });

        if !has_backend {
            ctx.blocks[source].remove(source_backend);
            changed = true;
        }
    }

    changed
}

// Implementation of AC-3
fn arc_consistency<'heap, A: Allocator, B: Allocator>(
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
        }
    }

    while let Some((source, target)) = queue.dequeue() {
        if !arc_reduce(body, &mut ctx, source, target) {
            continue;
        }

        // notify everyone "around" use
        for successor in body.basic_blocks.successors(source) {
            if successor == target {
                continue;
            }

            queue.enqueue(source, successor);
        }

        for predecessor in body.basic_blocks.predecessors(target) {
            if predecessor == source {
                continue;
            }

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

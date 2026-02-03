use core::{alloc::Allocator, convert::Infallible, mem, num::NonZero};
use std::alloc::Global;

use hashql_core::{
    heap::Heap,
    id::{Id as _, bit_vec::FiniteBitSet},
    intern::Interned,
    span::SpanId,
};

use super::{
    Cost, StatementCostVec,
    target::{TargetBitSet, TargetId},
};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlock, BasicBlockId, BasicBlockSlice, BasicBlockVec},
        location::Location,
        terminator::{Goto, Target, Terminator, TerminatorKind},
    },
    context::MirContext,
    visit::{VisitorMut, r#mut::filter},
};

#[expect(clippy::cast_possible_truncation)]
fn supported(costs: &[&[Option<Cost>]; TargetId::TOTAL], index: usize) -> TargetBitSet {
    let mut output = FiniteBitSet::new_empty(TargetId::TOTAL as u32);

    for (cost_index, cost) in costs.iter().enumerate() {
        output.set(TargetId::new(cost_index as u8), cost[index].is_some());
    }

    output
}

// The first phase is determining the number of regions that are needed, once done we can offset the
// new statements. Why? Because this allows us to not shuffle anything around and keeps the order of
// statements intact.
#[expect(unsafe_code, clippy::cast_possible_truncation)]
fn count_regions<A: Allocator, B: Allocator>(
    body: &Body<'_>,
    statement_costs: &[StatementCostVec<A>; TargetId::TOTAL],
    alloc: B,
) -> BasicBlockVec<NonZero<usize>, B> {
    // By default, each region is one block (that doesn't need to be split)
    let mut regions = BasicBlockVec::from_elem_in(
        // SAFETY: 1 is not 0
        unsafe { NonZero::new_unchecked(1) },
        body.basic_blocks.len(),
        alloc,
    );

    for (id, block) in body.basic_blocks.iter_enumerated() {
        let costs = statement_costs.each_ref().map(|costs| costs.of(id));

        if block.statements.len() < 2 {
            // There's no splitting required
            continue;
        }

        let mut total = 0;
        let mut current: TargetBitSet = FiniteBitSet::new_empty(TargetId::TOTAL as u32);

        for stmt_index in 0..block.statements.len() {
            let next = supported(&costs, stmt_index);

            // We must ensure that we always increment the total in the first iteration. In the
            // Regelfall, this never happens, but in case the MIR is malformed and we cannot place
            // the statement in any region we must still ensure that the code here is correct in
            // having a minimum of one region.
            if next != current || stmt_index == 0 {
                total += 1;
                current = next;
            }
        }

        // SAFETY: There is no way for total to be zero, the above loop always runs, due to early
        // termination if there are 0-1 statements, meaning that the increment in `total += 1` is
        // triggered, leading to a valid NonZero value.
        regions[id] = unsafe { NonZero::new_unchecked(total) };
    }

    regions
}

struct RemapBasicBlockId<'ctx> {
    ids: &'ctx BasicBlockSlice<BasicBlockId>,
}

impl<'heap> VisitorMut<'heap> for RemapBasicBlockId<'_> {
    type Filter = filter::Shallow;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn visit_basic_block_id(
        &mut self,
        _: Location,
        basic_block_id: &mut BasicBlockId,
    ) -> Self::Result<()> {
        *basic_block_id = self.ids[*basic_block_id];
        Ok(())
    }
}

#[expect(clippy::cast_possible_truncation)]
fn offset_basic_blocks<'heap, A: Allocator + Clone, B: Allocator + Clone>(
    context: &MirContext<'_, 'heap>,
    body: &mut Body<'heap>,
    regions: &BasicBlockSlice<NonZero<usize>>,
    statement_costs: &mut [StatementCostVec<A>; TargetId::TOTAL],
    alloc: B,
) -> BasicBlockVec<TargetBitSet, A> {
    debug_assert!(
        !body.basic_blocks.is_empty(),
        "MIR body must have at least one basic block"
    );

    let mut length = BasicBlockId::START;
    let mut indices =
        BasicBlockVec::from_elem_in(BasicBlockId::MIN, body.basic_blocks.len(), alloc);

    for (id, regions) in regions.iter_enumerated() {
        indices[id] = length;
        length.increment_by(regions.get());
    }

    let mut targets = BasicBlockVec::from_elem_in(
        FiniteBitSet::new_empty(TargetId::TOTAL as u32),
        length.as_usize(),
        statement_costs[0].allocator().clone(),
    );

    // We now need to remap all the basic blocks to their new ids
    Ok(()) = RemapBasicBlockId { ids: &indices }.visit_body(body);

    // We now resize the basic blocks with new empty blocks, these blocks for now are completely
    // uninitialized. This will change
    body.basic_blocks
        .as_mut()
        .fill_until(length.minus(1), || BasicBlock {
            params: Interned::empty(),
            statements: Vec::new_in(context.heap),
            terminator: Terminator::unreachable(SpanId::SYNTHETIC),
        });

    // We now go through all the blocks, and move them from their old location to their new one. We
    // do this in reverse as to not overwrite anything.
    for (old, &new) in indices.iter_enumerated().rev() {
        body.basic_blocks.as_mut().swap(old, new);
    }

    // We now split these basic blocks into regions, and operate on said regions, to do so we first
    // push the length to our scratch vector to be able properly index into the ranges.
    indices.push(length);
    let mut index = BasicBlockId::START;
    for &[start_id, end_id] in indices.windows() {
        let region = &mut body.basic_blocks.as_mut()[start_id..end_id];
        debug_assert_eq!(region.len(), regions[index].get());

        let costs = statement_costs.each_ref().map(|cost| cost.of(index));

        if region.len() < 2 {
            debug_assert_eq!(region.len(), 1);

            // Unlike other region blocks, these may be empty. In that case we just mark them as
            // supported.
            if costs[0].is_empty() {
                targets[start_id].insert_range(TargetId::MIN..=TargetId::LAST);
            } else {
                targets[start_id] = supported(&costs, 0);
            }

            index.increment_by(1);
            // We only have a single block inside the region, so no need to split it.
            continue;
        }

        // First we take a look at the terminator. We move the terminator of the first block to the
        // last block, and then connect them via gotos.
        let [first, .., last] = region else {
            unreachable!()
        };
        // As we expand the first terminator, we first take the span of the first blocks terminator,
        // which is going to be the span for all other terminators.
        let terminator_span = first.terminator.span;
        mem::swap(&mut first.terminator, &mut last.terminator);

        // We now connect each block to the next one via a goto
        let [leading @ .., _] = region else {
            unreachable!()
        };

        for (offset, block) in leading.iter_mut().enumerate() {
            let next = start_id.plus(offset + 1);
            block.terminator = Terminator {
                span: terminator_span,
                kind: TerminatorKind::Goto(Goto {
                    target: Target::block(next),
                }),
            }
        }

        // The terminators have been successfully expanded. We now split the actual contents into
        // the regions. We do this from the *back*, as that allows us to split the contents without
        // moving everything around n times.

        let [start, rest @ ..] = region else {
            unreachable!()
        };
        let mut rest = rest;

        let mut current = supported(&costs, start.statements.len() - 1);
        let mut ptr = start.statements.len() - 1;

        // Split into the individual regions.
        let mut runs = 0;
        loop {
            let [remaining @ .., recipient] = rest else {
                break;
            };
            while supported(&costs, ptr) == current {
                ptr -= 1;
            }

            // Set the current target to the current recipient block (+ 1 because exclusive bounds)
            targets[end_id.minus(runs + 1)] = current;

            // We now have a region of statements, split at the terminator (which is currently *out
            // of* range)
            let statements = start.statements.split_off(ptr + 1);

            // We know there are non-zero statements in the region.
            assert!(!statements.is_empty());
            current = supported(&costs, ptr);

            recipient.statements = statements;
            rest = remaining;
            runs += 1;
        }
        debug_assert_eq!(runs, regions[index].get() - 1);

        // We know that the runs is non-empty, set the supported matrix for the first block
        targets[start_id] = current;

        index.increment_by(1);
    }

    // We must now reprime the cost vec with our new indices
    for cost in statement_costs.iter_mut() {
        cost.remap(&body.basic_blocks);
    }

    // Now that it's offset, we can take this to split up the regions (TODO)

    // We then offset properly, which means if there are more than 1 region we remove the
    // terminator, add it to the last and then create a chain of blocks with GOTO.
    // Once done we split the statements, similarly to the algorithm already outlined.
    // While doing so we note for each basic block it's affinity aka execution targets it supports.
    targets
}

pub struct BasicBlockSplitting<A: Allocator> {
    alloc: A,
}

impl BasicBlockSplitting<Global> {
    #[must_use]
    pub const fn new() -> Self {
        Self { alloc: Global }
    }
}

impl<A: Allocator> BasicBlockSplitting<A> {
    pub const fn new_in(alloc: A) -> Self {
        Self { alloc }
    }

    pub fn split<'heap>(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &mut Body<'heap>,
        statement_costs: &mut [StatementCostVec<&'heap Heap>; TargetId::TOTAL],
    ) -> BasicBlockVec<TargetBitSet, &'heap Heap>
    where
        A: Clone,
    {
        let regions = count_regions(body, statement_costs, self.alloc.clone());

        offset_basic_blocks(context, body, &regions, statement_costs, self.alloc.clone())
    }
}

impl Default for BasicBlockSplitting<Global> {
    fn default() -> Self {
        Self::new()
    }
}

use core::num::NonZero;
use std::alloc::Allocator;

use hashql_core::id::bit_vec::FiniteBitSet;

use super::{StatementCostVec, target::TargetId};
use crate::body::{
    Body,
    basic_block::{BasicBlockId, BasicBlockSlice, BasicBlockVec},
};

// The first phase is determining the number of regions that are needed, once done we can offset the
// new statements. Why? Because this allows us to not shuffle anything around and keeps the order of
// statements intact.
#[expect(unsafe_code)]
fn count_regions<'heap, A: Allocator, B: Allocator>(
    body: &Body<'heap>,
    costs: &[StatementCostVec<A>; TargetId::TOTAL],
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
        let costs = costs.each_ref().map(|costs| costs.of(id));

        if block.statements.len() < 2 {
            // There's no splitting required
            continue;
        }

        let mut total = 0;
        let mut current = FiniteBitSet::<u32>::new_empty();

        for stmt_index in 0..block.statements.len() {
            let mut next = FiniteBitSet::<u32>::new_empty();
            for (cost_index, cost) in costs.iter().enumerate() {
                next.set(cost_index as u32, cost[stmt_index].is_some());
            }

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

fn offset_basic_blocks<'heap>(body: &mut Body<'heap>, regions: &BasicBlockSlice<usize>) {
    // TODO: create a vec of offsets (which we track), once done, we ensure that

    todo!()
}

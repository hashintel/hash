//! Dead block elimination pass.
//!
//! This pass removes unreachable basic blocks from the control-flow graph and compacts the
//! remaining blocks to eliminate gaps in the ID space. Unlike [`CfgSimplify`] which marks
//! unreachable blocks with [`TerminatorKind::Unreachable`], this pass physically removes them.
//!
//! # Algorithm
//!
//! 1. **Reachability analysis**: Collect all blocks reachable from the entry via reverse postorder
//!    traversal
//! 2. **Build remapping table**: Assign new contiguous IDs to reachable blocks, preserving relative
//!    order
//! 3. **Update terminators**: Rewrite all [`BasicBlockId`] references to use the new IDs
//! 4. **Compact**: Partition reachable blocks to the front and truncate
//!
//! # Usage
//!
//! This pass is run internally by [`CfgSimplify`]. It should not typically be run standalone.
//!
//! [`CfgSimplify`]: super::cfg_simplify::CfgSimplify
//! [`SsaRepair`]: super::ssa_repair::SsaRepair
//! [`TerminatorKind::Unreachable`]: crate::body::terminator::TerminatorKind::Unreachable

#[cfg(test)]
mod tests;

use core::{alloc::Allocator, convert::Infallible};

use hashql_core::{collections::fast_hash_set_with_capacity_in, id::Id as _};

use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice, BasicBlockVec},
        location::Location,
    },
    context::MirContext,
    intern::Interner,
    pass::TransformPass,
    visit::{VisitorMut, r#mut::filter},
};

/// Dead block elimination pass.
///
/// Removes unreachable blocks and compacts the block ID space.
pub struct DeadBlockElimination<A: Allocator> {
    alloc: A,
}

impl<A: Allocator> DeadBlockElimination<A> {
    /// Creates a new dead block elimination pass.
    #[must_use]
    pub const fn new_in(alloc: A) -> Self {
        Self { alloc }
    }
}

impl<'env, 'heap, A: Allocator> TransformPass<'env, 'heap> for DeadBlockElimination<A> {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) {
        let mut reachable = fast_hash_set_with_capacity_in(
            body.basic_blocks.reverse_postorder().len(),
            &self.alloc,
        );

        // Step 1: Collect reachable blocks
        #[expect(unsafe_code)]
        for &block in body.basic_blocks.reverse_postorder() {
            // SAFETY: The values are guaranteed to be present at most once.
            unsafe {
                reachable.insert_unique_unchecked(block);
            }
        }

        // Early exit if all blocks are reachable
        if reachable.len() == body.basic_blocks.len() {
            return;
        }

        // Step 2: Build the remapping table
        // Iterate in order to preserve relative positions
        let mut remap = BasicBlockVec::new_in(&self.alloc);
        let mut new_id = BasicBlockId::new(0);

        for old_id in body.basic_blocks.ids() {
            if !reachable.contains(&old_id) {
                continue;
            }

            remap.insert(old_id, new_id);
            new_id.increment_by(1);
        }

        // Step 3: Update all terminator targets in reachable blocks
        let mut visitor = UpdateTerminator {
            remap: &remap,
            interner: context.interner,
        };
        Ok(()) = visitor.visit_body_preserving_cfg(body);

        // Step 4: Compact the vector by retaining only reachable blocks.
        //
        // This is an in-place partition using two cursors:
        // - `write_index`: next position to place a reachable block
        // - `read_index`: current block being examined
        //
        // Invariant: all blocks before `write_index` are reachable and in their final position.
        //
        // When we encounter a reachable block at `read_index`:
        // - If `write_index == read_index`, the block is already in place
        // - Otherwise, swap it into position (the unreachable block at `write_index` moves to
        //   `read_index`, but we don't care since it will be truncated)
        //
        // Example: blocks [R, U, R, U, R] (R=reachable, U=unreachable)
        //   read=0, write=0: R is reachable, already in place, write=1.
        //   read=1, write=1: U is unreachable, skip.
        //   read=2, write=1: R is reachable, swap(1,2) -> [R, R, U, U, R], write=2.
        //   read=3, write=2: U is unreachable, skip.
        //   read=4, write=2: R is reachable, swap(2,4) -> [R, R, R, U, U], write=3.
        //   truncate to 3 -> [R, R, R]
        let mut write_index = BasicBlockId::new(0);
        let reachable_count = BasicBlockId::from_usize(reachable.len());

        for read_index in body.basic_blocks.ids() {
            if write_index == reachable_count {
                // All reachable blocks are in place; remaining blocks are unreachable
                break;
            }

            if !reachable.contains(&read_index) {
                continue;
            }

            body.basic_blocks
                .as_mut_preserving_cfg()
                .swap(write_index, read_index);

            write_index.increment_by(1);
        }

        body.basic_blocks
            .as_mut_preserving_cfg()
            .truncate(write_index);
    }
}

/// Visitor that rewrites [`BasicBlockId`] references using a remapping table.
struct UpdateTerminator<'slice, 'env, 'heap> {
    interner: &'env Interner<'heap>,
    remap: &'slice BasicBlockSlice<Option<BasicBlockId>>,
}

impl<'heap> VisitorMut<'heap> for UpdateTerminator<'_, '_, 'heap> {
    type Filter = filter::Deep;
    type Residual = Result<Infallible, !>;
    type Result<T>
        = Result<T, !>
    where
        T: 'heap;

    fn interner(&self) -> &Interner<'heap> {
        self.interner
    }

    fn visit_basic_block_id(
        &mut self,
        _: Location,
        basic_block_id: &mut BasicBlockId,
    ) -> Self::Result<()> {
        // Everything that points to an unreachable block would be in an unreachable region,
        // therefore we can safely ignore them.
        if let Some(&remap) = self.remap.lookup(*basic_block_id) {
            *basic_block_id = remap;
        }

        Ok(())
    }
}

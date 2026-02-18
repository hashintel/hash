//! Fuses MIR [`BasicBlock`]s that were split by [`BasicBlockSplitting`] and assigned to the same
//! execution target.
//!
//! After placement determines a concrete [`TargetId`] for each block, adjacent blocks connected
//! by [`Goto`] chains that share the same target can be merged back into a single block. This
//! reduces the number of blocks the downstream consumer must handle.
//!
//! A block B is fusable into its predecessor A when:
//! - B is not the entry block
//! - A terminates with an unconditional [`Goto`] to B
//! - The [`Goto`] carries no arguments and B has no block parameters
//! - B has exactly one predecessor (A)
//! - A and B share the same [`TargetId`]
//!
//! Use [`BasicBlockFusion`] to run the pass on a [`Body`].
//!
//! [`BasicBlockSplitting`]: super::splitting::BasicBlockSplitting
//! [`Goto`]: crate::body::terminator::Goto

use alloc::alloc::Global;
use core::{alloc::Allocator, convert::Infallible, mem};

use hashql_core::{graph::Predecessors as _, heap::Heap, id::Id as _};

use super::target::TargetId;
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice, BasicBlockVec},
        location::Location,
        terminator::TerminatorKind,
    },
    visit::{VisitorMut, r#mut::filter},
};

#[cfg(test)]
mod tests;

/// Determines whether `block_id` can be fused into its predecessor, and if so returns the
/// predecessor's [`BasicBlockId`].
///
/// A block is fusable when:
/// - It is not the entry block
/// - It has exactly one predecessor
/// - That predecessor terminates with an unconditional [`Goto`] to this block
/// - The [`Goto`] carries no arguments (and hence the block has no parameters)
/// - Both blocks share the same [`TargetId`]
fn fusable_into(
    body: &Body<'_>,
    targets: &BasicBlockSlice<TargetId>,
    block_id: BasicBlockId,
) -> Option<BasicBlockId> {
    if block_id == BasicBlockId::START {
        return None;
    }

    let mut predecessors = body.basic_blocks.predecessors(block_id);
    if predecessors.len() != 1 {
        return None;
    }

    if !body.basic_blocks[block_id].params.is_empty() {
        return None;
    }

    let predecessor_id = predecessors
        .next()
        .expect("length was checked to be exactly 1");

    let TerminatorKind::Goto(goto) = &body.basic_blocks[predecessor_id].terminator.kind else {
        return None;
    };

    // Goto edges introduced by splitting never carry arguments. A non-empty argument list would
    // mean the edge passes values that cannot be inlined by simple statement concatenation.
    if !goto.target.args.is_empty() {
        return None;
    }

    if targets[predecessor_id] != targets[block_id] {
        return None;
    }

    Some(predecessor_id)
}

/// Visitor that rewrites [`BasicBlockId`]s through a remapping table.
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

/// Fuses adjacent same-target blocks in-place, compacting both `body` and `targets`.
///
/// The algorithm has three phases:
///
/// 1. **Head resolution** — Walk blocks in reverse postorder. For each fusable block, record which
///    "head" block absorbs it. Chains collapse transitively: if B fuses into A and C fuses into B,
///    then C also fuses into A.
///
/// 2. **Statement merging** — Walk blocks in reverse postorder again. For each fused block, append
///    its statements to its head and take its terminator.
///
/// 3. **Compaction** — Build a remap table that assigns contiguous new IDs to surviving (head)
///    blocks, rewrite all [`BasicBlockId`] references, then permute blocks into their final
///    positions and truncate.
fn fuse_blocks<'heap, A: Allocator, S: Allocator + Clone>(
    scratch: S,
    body: &mut Body<'heap>,
    targets: &mut BasicBlockVec<TargetId, A>,
) {
    let reverse_postorder = body
        .basic_blocks
        .reverse_postorder()
        .to_vec_in(scratch.clone());

    // Phase 1: head resolution.
    //
    // `head[block]` is the surviving block that absorbs `block`. Blocks that are not fused have
    // `head[block] == block`. Reverse postorder guarantees that a block's dominator (and hence
    // its Goto predecessor in a split chain) is visited before the block itself, so
    // `head[predecessor]` is already resolved when we process `block`.
    let mut head = BasicBlockVec::from_fn_in(body.basic_blocks.len(), |id| id, scratch.clone());

    for &block_id in &reverse_postorder {
        let Some(predecessor) = fusable_into(body, targets, block_id) else {
            continue;
        };

        head[block_id] = head[predecessor];
    }

    // Phase 2: statement merging.
    //
    // Reverse postorder visits A before B before C in a chain, so A accumulates statements in
    // the correct order. The terminator swap propagates each tail's terminator up to the head:
    // after processing B, the head has B's terminator (Goto→C); after processing C, the head
    // has C's terminator (e.g. Return).
    for &block_id in &reverse_postorder {
        let block_head = head[block_id];
        if block_head == block_id {
            continue;
        }

        let blocks = body.basic_blocks.as_mut();
        let [head_block, tail_block] = blocks.get_disjoint_mut([block_head, block_id]).expect(
            "head and block_id are distinct because the head == block_id case was skipped above",
        );

        head_block.statements.append(&mut tail_block.statements);
        mem::swap(&mut head_block.terminator, &mut tail_block.terminator);
    }

    // Phase 3: compaction.
    //
    // Assign contiguous new IDs to surviving blocks. Fused blocks inherit their head's new ID.
    let mut remap =
        BasicBlockVec::from_elem_in(BasicBlockId::START, body.basic_blocks.len(), scratch);
    let mut write_ptr = BasicBlockId::START;

    for block_id in body.basic_blocks.ids() {
        if head[block_id] == block_id {
            remap[block_id] = write_ptr;
            write_ptr.increment_by(1);
        }
    }

    for block_id in body.basic_blocks.ids() {
        if head[block_id] != block_id {
            remap[block_id] = remap[head[block_id]];
        }
    }

    let new_len = write_ptr;

    // Rewrite all BasicBlockId references before moving blocks.
    Ok(()) = RemapBasicBlockId { ids: &remap }.visit_body(body);

    // Move surviving blocks into their final positions. Because we iterate in numeric order
    // and `new_id <= old_id` for every surviving block, each destination slot either held a
    // dead block originally or was vacated by an earlier swap.
    for old_id in body.basic_blocks.ids() {
        if head[old_id] != old_id {
            continue;
        }

        let new_id = remap[old_id];
        if new_id != old_id {
            body.basic_blocks.as_mut().swap(old_id, new_id);
            targets.swap(old_id, new_id);
        }
    }

    body.basic_blocks.as_mut().truncate(new_len);
    targets.truncate(new_len);
}

/// Fuses adjacent MIR [`BasicBlock`]s that share the same execution target.
///
/// After [`BasicBlockSplitting`] partitions blocks by target affinity and the placement solver
/// assigns concrete targets, some adjacent blocks end up on the same backend. This pass merges
/// them back together, reducing the block count for downstream consumers.
///
/// [`BasicBlockSplitting`]: super::splitting::BasicBlockSplitting
pub struct BasicBlockFusion<A: Allocator> {
    alloc: A,
}

impl BasicBlockFusion<Global> {
    /// Creates a new pass using the global allocator.
    #[must_use]
    pub const fn new() -> Self {
        Self::new_in(Global)
    }
}

impl<A: Allocator> BasicBlockFusion<A> {
    /// Creates a new pass using the provided allocator.
    pub const fn new_in(alloc: A) -> Self {
        Self { alloc }
    }

    /// Fuses blocks in `body` that share the same target assignment.
    ///
    /// Modifies both `body` and `targets` in place. The `targets` vec is compacted to match
    /// the new block layout.
    pub fn fuse<'heap>(
        &self,
        body: &mut Body<'heap>,
        targets: &mut BasicBlockVec<TargetId, &'heap Heap>,
    ) where
        A: Clone,
    {
        debug_assert_eq!(
            body.basic_blocks.len(),
            targets.len(),
            "target vec length must match basic block count"
        );

        fuse_blocks(self.alloc.clone(), body, targets);
    }
}

impl Default for BasicBlockFusion<Global> {
    fn default() -> Self {
        Self::new()
    }
}

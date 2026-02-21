//! Groups connected basic blocks that share the same execution target into islands.
//!
//! After the placement solver assigns a concrete [`TargetId`] to each block, adjacent blocks
//! connected in the CFG that share the same target form a logical *island* — a maximal connected
//! component within the same-target subgraph.
//!
//! [`IslandPlacement`] discovers these components using a union-find algorithm and returns a
//! collection of [`Island`]s, each containing the set of [`BasicBlockId`]s that belong to it.

use alloc::alloc::Global;
use core::alloc::Allocator;

use hashql_core::{
    graph::Successors as _,
    id::{self, bit_vec::DenseBitSet},
};

use super::target::TargetId;
use crate::body::{
    Body,
    basic_block::{BasicBlockId, BasicBlockSlice, BasicBlockUnionFind, BasicBlockVec},
};

#[cfg(test)]
mod tests;

id::newtype!(
    /// Identifies an [`Island`] within the [`IslandVec`] produced by [`IslandPlacement`].
    ///
    /// # Value Range
    ///
    /// The value space is restricted to `0..=0xFFFF_FF00`, reserving the last 256
    /// values for niche optimizations in `Option<IslandId>` and similar types.
    pub struct IslandId(u32 is 0..=0xFFFF_FF00)
);
id::newtype_collections!(pub type Island* from IslandId);

/// A maximal connected component of basic blocks that share the same execution target.
///
/// Each island holds a dense bitset over [`BasicBlockId`]s, providing O(1) membership
/// queries and efficient iteration over its blocks.
#[derive(Debug)]
pub struct Island {
    target: TargetId,
    members: DenseBitSet<BasicBlockId>,
}

impl Island {
    /// Returns the execution target shared by all blocks in this island.
    #[inline]
    #[must_use]
    pub const fn target(&self) -> TargetId {
        self.target
    }

    /// Returns `true` if `block` belongs to this island.
    #[inline]
    #[must_use]
    pub fn contains(&self, block: BasicBlockId) -> bool {
        self.members.contains(block)
    }

    /// Returns the number of basic blocks in this island.
    #[inline]
    #[must_use]
    pub fn count(&self) -> usize {
        self.members.count()
    }

    /// Returns `true` if this island contains no blocks.
    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.members.is_empty()
    }

    /// Iterates over the [`BasicBlockId`]s in this island in ascending order.
    #[inline]
    pub fn iter(&self) -> impl Iterator<Item = BasicBlockId> + '_ {
        self.members.iter()
    }
}

/// Discovers islands in a [`Body`] given per-block target assignments.
///
/// Two blocks belong to the same island when they are connected in the CFG (directly or
/// transitively through same-target successors) and share the same [`TargetId`]. The pass
/// uses a union-find to identify these components in nearly linear time.
pub struct IslandPlacement<A: Allocator> {
    scratch: A,
}

impl IslandPlacement<Global> {
    /// Creates a new pass using the global allocator for scratch space.
    #[must_use]
    pub const fn new() -> Self {
        Self::new_in(Global)
    }
}

impl Default for IslandPlacement<Global> {
    fn default() -> Self {
        Self::new()
    }
}

impl<S: Allocator + Clone> IslandPlacement<S> {
    /// Creates a new pass using the provided allocator for scratch space.
    pub const fn new_in(scratch: S) -> Self {
        Self { scratch }
    }

    /// Discovers islands in `body` given per-block `targets`.
    ///
    /// Returns an [`IslandVec`] where each [`Island`] contains the set of blocks that form
    /// a connected same-target component. The output is allocated with `alloc`.
    pub fn run<A>(
        &self,
        body: &Body<'_>,
        targets: &BasicBlockSlice<TargetId>,
        alloc: A,
    ) -> IslandVec<Island, A>
    where
        A: Allocator,
    {
        let mut union = BasicBlockUnionFind::new_in(body.basic_blocks.len(), self.scratch.clone());

        for bb in body.basic_blocks.ids() {
            for succ in body.basic_blocks.successors(bb) {
                if targets[bb] == targets[succ] {
                    union.unify(bb, succ);
                }
            }
        }

        let mut assignments =
            BasicBlockVec::from_domain_in(None, &body.basic_blocks, self.scratch.clone());
        let mut islands = IslandVec::new_in(alloc);

        for bb in body.basic_blocks.ids() {
            let root = union.find(bb);

            let index = *assignments.get_or_insert_with(root, || {
                islands.push(Island {
                    target: targets[root],
                    members: DenseBitSet::new_empty(body.basic_blocks.len()),
                })
            });

            islands[index].members.insert(bb);
        }

        islands
    }
}

//! The quad file stores quadtree topology over the base delivery order.
//!
//! Layout version 1 is **mutable**: change the layout to fit what the pipeline needs and increment
//! [`Version`] when you do. The pinned parse rejects bytes of every other version, which is the
//! intended failure mode. A fresh generation replaces the files a layout change strands.
//!
//! Each node is one tile of the bucket-cut schedule: the node at depth `z` stores the `(start,
//! length)` run of its own-bucket points (bucket `z + span_log2` inside the node's cell, buckets
//! `0..=span_log2` for the root) in the base delivery order of the generation's row-aligned
//! columns. A binary search over the morton file rebuilds the runs. The file stores this derived
//! state so node records are total and serving does no searches. Together the runs partition the
//! base order. Every point belongs to exactly one node's run, the tile that first delivers it. No
//! per-node point-cloud files exist. A node's points are slices of the flat columns.
//!
//! Beside the topology each node stores its subtree point count (every point whose key lies in the
//! node's cell, whatever its bucket) and its direct-type set, the union of per-point direct type
//! ids over the subtree. One shared id array plus per-node fenceposts store the sets, each sorted
//! ascending. Closures are never materialized. The type graph is the authority for inheritance.
//!
//! The node table, the fenceposts, and the id array are all derived from one cut of one generation
//! and are meaningless apart, so they form one combined file. The regions:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTQUAD`                                |
//! | 8      | 4    | layout version, `u32` = 1                       |
//! | 12     | 8    | node count `N`, `u64`                           |
//! | 20     | 8    | type-id entry count `T`, `u64`                  |
//! | 28     | 4068 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | node table: `N` records of 32 bytes             |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | type-set fenceposts: `N + 1` `u64` entry counts |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | type ids: `u32[T]`, node-major, ascending       |
//! |        |      | within each node's set                          |
//! ```
//!
//! Node record ([`Node`]):
//!
//! ```text
//! | offset | size | field                                           |
//! |--------|------|-------------------------------------------------|
//! | 0      | 16   | children, `u32` node indexes; `u32::MAX` = none |
//! | 16     | 8    | own-bucket run start, `u64` base position       |
//! | 24     | 4    | own-bucket run length, `u32`                    |
//! | 28     | 4    | point count of the subtree, `u32`               |
//! ```
//!
//! The root is node 0 and covers the whole wire frame: the fixed `[-1, 1]` square of the
//! frame-normalization contract, which is why no bounds field exists - the manifest records the
//! world frame, and a bounds copy here could only contradict it. Children are in Morton child
//! order, the key order of `MortonCell::children`: child `i` holds the quadrant whose next axis
//! bits are `x = i & 1`, `y = i >> 1`, so a traversal consumes the two-bit digits of a cell's key
//! prefix directly. (Version 0 named the quadrants by compass, which presumed a `y`-axis
//! orientation the format does not own.)
//!
//! Node `n`'s type set is `ids[posts[n]..posts[n + 1]]` and the last fencepost is the entry count
//! `T`, mirrored in the header because the length equation needs the region sizes before the open
//! path views any region. Opening validates the header, the length equation
//! ([`FileHeader::expected_file_len`]), the fencepost rules (anchored at zero, non-decreasing,
//! closing at `T`), and the child rules (below the node count, pointing deeper in the table - the
//! writer emits depth-first pre-order), so traversals and set slices never re-check. Within-set
//! ascending order is the writer's contract, asserted before the bytes exist and then trusted the
//! way every merge trusts its sorted inputs. Both variable regions start on 4096-byte boundaries,
//! so the whole-file-mapping alignment guarantee of the array format applies unchanged: map the
//! whole file and slice, never mmap at a file offset.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the fields are little endian, while the magic discriminant stores native endian, so \
              a cross-endian reader fails loudly at the magic instead of misreading fields"
)]

use core::{fmt, ops::Range};

use zerocopy::{LE, U32, U64, Unalign};

pub(crate) mod read;
pub(crate) mod write;

#[cfg(test)]
mod tests;

use crate::file::region::{PAGE, header::header, padded_size};

// The single variant makes the derive validate the discriminant, so parsing admits exactly the
// pinned magic value.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(u64)]
enum FileHeaderMagicInner {
    Quad = u64::from_le_bytes(*b"SALTQUAD"),
}

/// The `SALTQUAD` magic. Byte-level construction admits no other value.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct FileHeaderMagic(FileHeaderMagicInner);

impl FileHeaderMagic {
    /// The only value.
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Quad);
}

/// A layout version this module implements.
///
/// Byte-level construction admits no other value. Increment on any layout change.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(u32)]
pub(crate) enum Version {
    V1 = 1,
}

/// One quadtree node with child links, the own-bucket run, and the subtree point count.
///
/// The `u32::MAX` sentinel marks an absent child, so [`Node::new`] rejects it as an index and every
/// other bit pattern denotes a child node. The run is a range of base delivery positions: the
/// node's own-bucket points, sliced from the flat base-ordered columns.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
#[repr(C)]
pub(crate) struct Node {
    /// Child node indexes in Morton child order.
    ///
    /// `u32::MAX` marks no child.
    children: [U32<LE>; 4],
    /// First base position of the own-bucket run.
    start: U64<LE>,
    /// Length of the own-bucket run.
    length: U32<LE>,
    /// Points in this node's subtree.
    points: U32<LE>,
}

impl Node {
    /// The absent-child sentinel.
    pub(crate) const NO_CHILD: u32 = u32::MAX;

    /// Creates a node record.
    ///
    /// `children` are node indexes in Morton child order, [`None`] for absent quadrants;
    /// `start..start + length` is the own-bucket run in base delivery positions; `points` counts
    /// the whole subtree.
    ///
    /// # Panics
    ///
    /// This panics when a child index is the `u32::MAX` sentinel, which no node table this size can
    /// contain.
    #[must_use]
    pub(crate) const fn new(
        children: [Option<u32>; 4],
        start: u64,
        length: u32,
        points: u32,
    ) -> Self {
        let mut wire = [U32::new(Self::NO_CHILD); 4];
        let mut quadrant = 0;
        while quadrant < 4 {
            if let Some(child) = children[quadrant] {
                assert!(
                    child != Self::NO_CHILD,
                    "the absent-child sentinel is not a node index",
                );
                wire[quadrant] = U32::new(child);
            }
            quadrant += 1;
        }

        Self {
            children: wire,
            start: U64::new(start),
            length: U32::new(length),
            points: U32::new(points),
        }
    }

    /// Returns the child node index of one quadrant, [`None`] when the quadrant has no node.
    ///
    /// # Panics
    ///
    /// This panics when `quadrant` is not below 4.
    #[inline]
    #[must_use]
    pub(crate) const fn child(&self, quadrant: usize) -> Option<u32> {
        match self.children[quadrant].get() {
            Self::NO_CHILD => None,
            child => Some(child),
        }
    }

    /// Returns the four child node indexes in Morton child order.
    #[inline]
    #[must_use]
    pub(crate) const fn children(&self) -> [Option<u32>; 4] {
        [self.child(0), self.child(1), self.child(2), self.child(3)]
    }

    /// Returns the own-bucket run.
    ///
    /// Base delivery positions of the points this node's tile delivers first.
    #[inline]
    #[must_use]
    pub(crate) const fn run(&self) -> Range<u64> {
        let start = self.start.get();
        start..start + self.length.get() as u64
    }

    /// Returns the subtree point count.
    ///
    /// Every point whose key lies in the node's cell, whatever its bucket.
    #[inline]
    #[must_use]
    pub(crate) const fn points(&self) -> u32 {
        self.points.get()
    }

    /// Returns whether the node has no children.
    #[inline]
    #[must_use]
    pub(crate) const fn is_leaf(&self) -> bool {
        matches!(self.children(), [None, None, None, None])
    }
}

/// The per-node direct-type sets, stored as one shared id array segmented by node fenceposts.
///
/// Fencepost `n` is where node `n`'s set begins and the last fencepost is the total entry count, so
/// node `n`'s set is `ids[posts[n]..posts[n + 1]]`. Posts anchor at zero and never decrease, and
/// every set is strictly ascending, all by construction, so the writer streams the regions without
/// further checks.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TypeSets {
    posts: Box<[u64]>,
    ids: Box<[u32]>,
}

impl TypeSets {
    /// Concatenates per-node sets, accumulating the fenceposts.
    ///
    /// # Panics
    ///
    /// This panics when a set is not strictly ascending - a producer bug the format cannot
    /// represent, caught before any bytes exist.
    #[must_use]
    pub(crate) fn from_sets(sets: &[Vec<u32>]) -> Self {
        let mut posts = Vec::with_capacity(sets.len() + 1);
        let mut ids = Vec::new();

        posts.push(0);
        for (node, set) in sets.iter().enumerate() {
            assert!(
                set.is_sorted_by(|previous, next| previous < next),
                "node {node}'s type set must ascend strictly",
            );
            ids.extend_from_slice(set);
            posts.push(ids.len() as u64);
        }

        Self {
            posts: posts.into_boxed_slice(),
            ids: ids.into_boxed_slice(),
        }
    }

    /// Returns the number of nodes the sets cover.
    #[inline]
    #[must_use]
    pub(crate) const fn node_count(&self) -> usize {
        self.posts.len() - 1
    }

    /// Borrows the fenceposts: `node_count + 1` entry counts.
    #[inline]
    #[must_use]
    pub(crate) const fn posts(&self) -> &[u64] {
        &self.posts
    }

    /// Borrows the shared id array.
    #[inline]
    #[must_use]
    pub(crate) const fn ids(&self) -> &[u32] {
        &self.ids
    }

    /// Borrows one node's set, ascending.
    ///
    /// # Panics
    ///
    /// This panics when `node` is at or beyond the node count.
    #[must_use]
    pub(crate) fn set(&self, node: usize) -> &[u32] {
        let start = usize::try_from(self.posts[node]).expect("resident sets fit the address space");
        let end =
            usize::try_from(self.posts[node + 1]).expect("resident sets fit the address space");
        &self.ids[start..end]
    }
}

/// The header of a quad file.
#[derive(
    Copy,
    Clone,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
#[repr(C)]
pub(crate) struct FileHeader {
    magic: Unalign<FileHeaderMagic>,
    version: Unalign<Version>,
    nodes: U64<LE>,
    type_ids: U64<LE>,
}

header!(FileHeader);

impl FileHeader {
    /// Creates a header for `nodes` records over `type_ids` type-id entries.
    #[must_use]
    pub(crate) const fn new(nodes: u64, type_ids: u64) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V1),
            nodes: U64::new(nodes),
            type_ids: U64::new(type_ids),
        }
    }

    /// Returns the node count.
    #[inline]
    #[must_use]
    pub(crate) const fn nodes(&self) -> u64 {
        self.nodes.get()
    }

    /// Returns the type-id entry count: the value the last fencepost must close at.
    #[inline]
    #[must_use]
    pub(crate) const fn type_ids(&self) -> u64 {
        self.type_ids.get()
    }

    /// Returns the offset of the type-set fencepost region.
    ///
    /// The node table sits between the header and this offset, zero padded to the boundary. Returns
    /// `None` when the geometry overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) const fn posts_offset(&self) -> Option<u64> {
        PAGE.checked_add(padded_size(self.nodes.get(), size_of::<Node>() as u64)?)
    }

    /// Returns the offset of the type-id region.
    ///
    /// The fencepost region sits between [`Self::posts_offset`] and this offset, zero padded to the
    /// boundary. Returns `None` when the geometry overflows `u64`, in which case no real file
    /// matches the header.
    #[must_use]
    pub(crate) const fn ids_offset(&self) -> Option<u64> {
        let posts = padded_size(self.nodes.get().checked_add(1)?, size_of::<u64>() as u64)?;
        self.posts_offset()?.checked_add(posts)
    }

    /// Returns the exact file length the header describes.
    ///
    /// The open path rejects a file whose length differs from this value. Returns `None` when the
    /// geometry overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) const fn expected_file_len(&self) -> Option<u64> {
        let ids = self.type_ids.get().checked_mul(size_of::<u32>() as u64)?;
        self.ids_offset()?.checked_add(ids)
    }
}

// Manual impl instead of a derive: `Unalign`'s `Debug` goes through
// `Deref` and would demand `Unaligned` of the pinned enums; `get` only
// needs `Copy`. No equality on purpose: callers compare the observable
// they mean.
impl fmt::Debug for FileHeader {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("FileHeader")
            .field("magic", &self.magic.get())
            .field("version", &self.version.get())
            .field("nodes", &self.nodes)
            .field("type_ids", &self.type_ids)
            .finish_non_exhaustive()
    }
}

const _: () = assert!(size_of::<Node>() == 32);

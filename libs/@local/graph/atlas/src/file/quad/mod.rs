//! The quad file: quadtree topology over point-cloud files.
//!
//! Layout version 0 is **mutable**: change the layout freely to fit what
//! the pipeline needs and increment [`Version`] when you do. The pinned
//! parse rejects bytes of other versions, which is the intended failure
//! mode; no migration or compatibility machinery exists on purpose until
//! the format stabilizes.
//!
//! A pointmap is this file plus one point-cloud array file per leaf. The
//! topology holds what a traversal needs - child links, per-node point
//! counts, and the identifier of each node's cloud file - so updates stay
//! local: adding or removing a node writes the affected cloud files and
//! one new quad file, and touches nothing else. Clouds are referenced by
//! identifier, never by offset, and revised clouds get fresh identifiers,
//! so served files stay immutable and cacheable forever.
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTQUAD`                                |
//! | 8      | 4    | layout version, `u32` = 0                       |
//! | 12     | 8    | node count `N`, `u64`                           |
//! | 20     | 8    | total point count, `u64`                        |
//! | 28     | 16   | root bounds, `f32` min x, min y, max x, max y   |
//! | 44     | 4052 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | node table: `N` records of 32 bytes             |
//! ```
//!
//! Node record ([`Node`]):
//!
//! ```text
//! | offset | size | field                                           |
//! |--------|------|-------------------------------------------------|
//! | 0      | 16   | children, `u32` node indexes; `u32::MAX` = none |
//! | 16     | 8    | point-cloud identifier, `u64`; `u64::MAX` = none|
//! | 24     | 4    | point count of the subtree, `u32`               |
//! | 28     | 4    | reserved, zero                                  |
//! ```
//!
//! The root is node 0; children order is the quadrant order north-west,
//! north-east, south-west, south-east, and each child's bounds are its
//! quadrant of the parent's. Sentinels make every bit pattern meaningful,
//! so the only structural rules are the reader's bounds checks: child
//! indexes below the node count and the file length equation
//! ([`FileHeader::expected_file_len`]). The node table starts at a
//! 4096-byte boundary, so the whole-file-mapping alignment guarantee of
//! the array format applies unchanged: map the whole file and slice,
//! never mmap at a file offset.
// Known V0 -> V1 change (PLAN.md "Serving contract requirements"): a per-node type-closure
// region - a shared sorted type-id array plus per-node (offset, len) into it - powering the
// coloredTypeIds/coloredTypeIdsIndex tile contract. Variable-length per node, so it becomes a
// third region rather than node-record fields.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the magic is pinned to the same canonical little-endian bytes on every platform"
)]

use core::fmt;

use zerocopy::{F32, LE, U32, U64, Unalign};

#[cfg(test)]
mod tests;

// not pretty, but allows us to pin a specific version, required for the derive
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

/// A layout version this module implements. Byte-level construction
/// admits no other value; increment on any layout change.
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
    V0 = 0,
}

/// One quadtree node.
///
/// Sentinels keep every bit pattern meaningful: `u32::MAX` children are
/// absent and a `u64::MAX` cloud means the node has no point-cloud file.
/// The reader's traversal checks child indexes against the node count.
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
#[repr(C)]
pub(crate) struct Node {
    /// Child node indexes in quadrant order; `u32::MAX` marks no child.
    pub children: [U32<LE>; 4],
    /// The node's point-cloud file identifier; `u64::MAX` marks none.
    pub cloud: U64<LE>,
    /// Points in this node's subtree.
    pub points: U32<LE>,
    /// Reserved; writers emit zero.
    pub reserved: [u8; 4],
}

impl Node {
    /// The absent-child sentinel.
    pub(crate) const NO_CHILD: u32 = u32::MAX;
    /// The absent-cloud sentinel.
    pub(crate) const NO_CLOUD: u64 = u64::MAX;
}

/// The 4096-byte header of a quad file.
#[derive(
    Copy,
    Clone,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct FileHeader {
    magic: Unalign<FileHeaderMagic>,
    version: Unalign<Version>,
    nodes: U64<LE>,
    points: U64<LE>,
    bounds: [F32<LE>; 4],
    padding: [u8; Self::PADDING],
}

impl FileHeader {
    const PADDING: usize = 4052;
    /// Size of the header, and the offset of the node table.
    pub(crate) const SIZE: usize = 4096;

    /// Creates a header.
    ///
    /// `bounds` is the root's bounding box as min x, min y, max x, max y.
    #[must_use]
    pub(crate) const fn new(nodes: u64, points: u64, bounds: [f32; 4]) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V0),
            nodes: U64::new(nodes),
            points: U64::new(points),
            bounds: [
                F32::new(bounds[0]),
                F32::new(bounds[1]),
                F32::new(bounds[2]),
                F32::new(bounds[3]),
            ],
            padding: [0; Self::PADDING],
        }
    }

    /// Returns the node count.
    #[inline]
    #[must_use]
    pub(crate) const fn nodes(&self) -> u64 {
        self.nodes.get()
    }

    /// Returns the total point count.
    #[inline]
    #[must_use]
    pub(crate) const fn points(&self) -> u64 {
        self.points.get()
    }

    /// Returns the root bounds as min x, min y, max x, max y.
    #[inline]
    #[must_use]
    pub(crate) const fn bounds(&self) -> [f32; 4] {
        [
            self.bounds[0].get(),
            self.bounds[1].get(),
            self.bounds[2].get(),
            self.bounds[3].get(),
        ]
    }

    /// Returns the exact file length the header describes.
    ///
    /// A file whose length differs from this value is rejected. Returns
    /// `None` when the geometry overflows `u64`, in which case no real
    /// file matches the header.
    #[must_use]
    pub(crate) fn expected_file_len(&self) -> Option<u64> {
        let table = self.nodes.get().checked_mul(size_of::<Node>() as u64)?;
        (Self::SIZE as u64).checked_add(table)
    }
}

// Manual impl instead of a derive: `Unalign`'s `Debug` goes through
// `Deref` and would demand `Unaligned` of the pinned enums; `get` only
// needs `Copy`. No equality on purpose: callers compare the observable
// they mean.
impl fmt::Debug for FileHeader {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("FileHeader")
            .field("magic", &self.magic.get())
            .field("version", &self.version.get())
            .field("nodes", &self.nodes)
            .field("points", &self.points)
            .field("bounds", &self.bounds)
            .finish_non_exhaustive()
    }
}

const _: () = {
    assert!(size_of::<FileHeader>() == FileHeader::SIZE);
    assert!(size_of::<Node>() == 32);
};

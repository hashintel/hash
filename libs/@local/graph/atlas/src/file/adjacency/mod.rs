//! The adjacency file: per-node incident edge lists over one shared
//! value array.
//!
//! Layout version 0 is **mutable**: change the layout freely to fit what
//! the pipeline needs and increment [`Version`] when you do. The pinned
//! parse rejects bytes of other versions, which is the intended failure
//! mode; no migration or compatibility machinery exists on purpose until
//! the format stabilizes.
//!
//! This is a combined file: the fenceposts delimit ranges of the value
//! array, meaningless without it, and always read with it, so both live
//! in one file and cannot fall out of sync. The regions:
//!
//! ```text
//! | offset | size       | region                                     |
//! |--------|------------|--------------------------------------------|
//! | 0      | 8          | magic `SALTADJC`                           |
//! | 8      | 4          | layout version, `u32` = 0                  |
//! | 12     | 4          | value width `W`, `u32` in {4, 8}           |
//! | 16     | 8          | node row count `N`, `u64`                  |
//! | 24     | 8          | edge row count `E`, `u64`                  |
//! | 32     | 4064       | padding; writers emit zero, readers ignore |
//! | 4096   | (2N+1) * 8 | fenceposts, `u64`; zero padding to the     |
//! |        |            | next 4096-byte boundary                    |
//! | ...    | 2E * W     | values: edge row ids at width `W`          |
//! ```
//!
//! Node row `i` owns two adjacent value runs: its outgoing edges at
//! `fenceposts[2i] .. fenceposts[2i + 1]` and its incoming edges at
//! `fenceposts[2i + 1] .. fenceposts[2i + 2]`, so one fencepost column
//! serves both directions and the whole incident slice
//! `fenceposts[2i] .. fenceposts[2i + 2]` is contiguous for free. Every
//! edge occupies exactly one outgoing and one incoming slot - a
//! self-loop occupies both slots of its one endpoint - so the value
//! array holds exactly `2E` entries.
//!
//! The value width is pinned in the header: writers pick the narrowest
//! width whose ids cover the edge count, so the format itself imposes no
//! edge-count ceiling. All region offsets derive from `N`, `E`, and `W`
//! with checked arithmetic ([`FileHeader::expected_file_len`]); a header
//! whose geometry overflows matches no real file. Every region starts on
//! a 4096-byte boundary, so the whole-file-mapping alignment guarantee
//! of the array format applies unchanged: map the whole file and slice,
//! never mmap at a file offset.
//!
//! [`read::AdjacencyFile`] opens a file under these rules and hands out
//! the raw typed regions; [`write::write_lists`] streams them into
//! place. The format owns geometry alone - the list invariants
//! (fencepost coverage, ascending runs, the exactly-once slot rule) are
//! `salt::adjacency`'s artifact contract, validated where the domain
//! type lives.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the magic is pinned to the same canonical little-endian bytes on every platform"
)]

use core::fmt;

use zerocopy::{LE, U64, Unalign};

pub(crate) mod read;
#[cfg(test)]
mod tests;
pub(crate) mod write;

/// Size of one page-aligned region unit, and of the header.
const PAGE: u64 = FileHeader::SIZE as u64;

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
    Adjacency = u64::from_le_bytes(*b"SALTADJC"),
}

/// The `SALTADJC` magic. Byte-level construction admits no other value.
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
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Adjacency);
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

/// The byte width of one value-array entry. Byte-level construction
/// admits no other value.
///
/// Writers pick [`for_edges`](Self::for_edges): the narrowest width
/// whose ids cover the edge count, so small corpora pay four bytes per
/// slot while the format itself imposes no edge-count ceiling.
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
pub(crate) enum EdgeWidth {
    /// Four-byte edge row ids.
    U32 = 4,
    /// Eight-byte edge row ids.
    U64 = 8,
}

impl EdgeWidth {
    /// Returns the width in bytes.
    #[inline]
    #[must_use]
    pub(crate) const fn bytes(self) -> u64 {
        self as u64
    }

    /// Returns the narrowest width representing every edge row id below
    /// `edges`.
    #[inline]
    #[must_use]
    pub(crate) const fn for_edges(edges: u64) -> Self {
        if edges > u32::MAX as u64 {
            Self::U64
        } else {
            Self::U32
        }
    }
}

/// The 4096-byte header of an adjacency file.
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
    width: Unalign<EdgeWidth>,
    nodes: U64<LE>,
    edges: U64<LE>,
    padding: [u8; Self::PADDING],
}

impl FileHeader {
    const PADDING: usize = 4064;
    /// Size of the header, and the offset of the fencepost region.
    pub(crate) const SIZE: usize = 4096;

    /// Creates a header for `nodes` node rows over `edges` edge rows at
    /// value width `width`.
    #[must_use]
    pub(crate) const fn new(nodes: u64, edges: u64, width: EdgeWidth) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V0),
            width: Unalign::new(width),
            nodes: U64::new(nodes),
            edges: U64::new(edges),
            padding: [0; Self::PADDING],
        }
    }

    /// Returns the node row count `N`.
    #[inline]
    #[must_use]
    pub(crate) const fn nodes(&self) -> u64 {
        self.nodes.get()
    }

    /// Returns the edge row count `E`.
    #[inline]
    #[must_use]
    pub(crate) const fn edges(&self) -> u64 {
        self.edges.get()
    }

    /// Returns the value width `W`.
    #[inline]
    #[must_use]
    pub(crate) fn width(&self) -> EdgeWidth {
        self.width.get()
    }

    /// Returns the fencepost count `2N + 1`.
    ///
    /// Returns `None` when the count overflows `u64`, in which case no
    /// real file matches the header.
    #[must_use]
    pub(crate) const fn fencepost_count(&self) -> Option<u64> {
        let Some(doubled) = self.nodes().checked_mul(2) else {
            return None;
        };
        doubled.checked_add(1)
    }

    /// Returns the offset of the values region.
    ///
    /// The fencepost region sits between the header and this offset,
    /// zero padded to the boundary. Returns `None` when the geometry
    /// overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn values_offset(&self) -> Option<u64> {
        let fencepost_bytes = self
            .fencepost_count()?
            .checked_mul(size_of::<U64<LE>>() as u64)?;
        let padded = fencepost_bytes.checked_next_multiple_of(PAGE)?;
        PAGE.checked_add(padded)
    }

    /// Returns the exact file length the header describes.
    ///
    /// A file whose length differs from this value is rejected. Returns
    /// `None` when the geometry overflows `u64`, in which case no real
    /// file matches the header.
    #[must_use]
    pub(crate) fn expected_file_len(&self) -> Option<u64> {
        let value_bytes = self
            .edges()
            .checked_mul(2)?
            .checked_mul(self.width().bytes())?;
        self.values_offset()?.checked_add(value_bytes)
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
            .field("width", &self.width.get())
            .field("nodes", &self.nodes)
            .field("edges", &self.edges)
            .finish_non_exhaustive()
    }
}

const _: () = assert!(size_of::<FileHeader>() == FileHeader::SIZE);

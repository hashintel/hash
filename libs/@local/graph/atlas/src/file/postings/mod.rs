//! The postings file.
//!
//! Per-type membership over the base delivery order, and the type graph's direct parent edges.
//!
//! Layout version 0 is mutable. Change the layout to fit what the pipeline needs and increment
//! [`Version`] when you do. The pinned parse rejects bytes of other versions, which is the intended
//! failure mode. No migration or compatibility machinery exists on purpose until the format
//! stabilizes.
//!
//! For every ontology row the file stores which base delivery positions carry that type directly.
//! Each type stores that membership either as a sorted position list or as a dense bitmap over all
//! `N` positions. The flags region records each type's representation; the fenceposts delimit each
//! type's run of the shared entries array either way. Beside the membership sits the type graph:
//! each type's direct parent rows, the authority every descendant expansion derives from - per-row
//! or per-type closures are never materialized.
//!
//! The membership, the flags, and the parent edges all describe one ontology-row domain of one
//! generation and are meaningless apart, so they form one combined file. Every region a lookup or
//! the closure build touches first - flags, fenceposts, parents - sits in the leading pages; the
//! entries array is the bulk data behind them. The regions:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTPOST`                                |
//! | 8      | 4    | layout version, `u32` = 0                       |
//! | 12     | 8    | type count `T`, `u64`                           |
//! | 20     | 8    | point count `N`, `u64`                          |
//! | 28     | 8    | membership entry count `M`, `u64`               |
//! | 36     | 8    | parent edge count `P`, `u64`                    |
//! | 44     | 4052 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | representation flags: `ceil(T/64)` `u64` words, |
//! |        |      | LSB-first; bit `t` set = type `t` is dense      |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | membership fenceposts: `T + 1` `u64` entry      |
//! |        |      | counts; zero padding to the next boundary       |
//! | ...    |      | parent fenceposts: `T + 1` `u64` entry counts   |
//! |        |      | zero padding to the next boundary               |
//! | ...    |      | parent ids: `u64[P]`, type-major, ascending     |
//! |        |      | within each type's list                         |
//! |        |      | zero padding to the next boundary               |
//! | ...    |      | membership entries: `u32[M]`, type-major        |
//! ```
//!
//! Type `t`'s membership run is `entries[posts[t]..posts[t + 1]]`: a list type's run holds its base
//! positions sorted ascending; a dense type's run holds `ceil(N/32)` bitmap words, LSB-first
//! (position `p` is bit `p & 31` of word `p >> 5`). Its parent list is
//! `parent_ids[parent_posts[t]..parent_posts[t + 1]]`, direct parents only, ascending. The header
//! repeats both last fenceposts as `M` and `P` because the length equation needs the region sizes
//! before the first region read.
//!
//! The format owns geometry alone - the header parse and the file length equation
//! ([`FileHeader::expected_file_len`]). The membership and parent contracts (fencepost coverage,
//! ascending lists, dense run lengths and tail bits, domains) are the postings artifact contract,
//! validated where the domain type lives. Every region starts on a 4096-byte boundary, so the
//! whole-file-mapping alignment guarantee of the array format applies unchanged: map the whole file
//! and slice, never mmap at a file offset.
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

use crate::file::region::{PAGE, padded_size};

// The shared page is the header's size; the offset chain and the
// write path both count regions from one header page.
const _: () = assert!(FileHeader::SIZE as u64 == PAGE);

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
    Postings = u64::from_le_bytes(*b"SALTPOST"),
}

/// The `SALTPOST` magic. Byte-level construction admits no other value.
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
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Postings);
}

/// A layout version this module implements.
///
/// Byte-level construction admits no other value. Increment this version on any layout change.
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

/// The 4096-byte header of a postings file.
#[derive(
    Copy,
    Clone,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub struct FileHeader {
    magic: Unalign<FileHeaderMagic>,
    version: Unalign<Version>,
    types: U64<LE>,
    points: U64<LE>,
    entries: U64<LE>,
    parent_edges: U64<LE>,
    padding: [u8; Self::PADDING],
}

impl FileHeader {
    const PADDING: usize = 4052;
    /// Size of the header, and the offset of the flags region.
    pub(crate) const SIZE: usize = 4096;

    /// Creates a header for `types` ontology rows over `points` base positions, with `entries`
    /// membership entries and `parent_edges` parent ids.
    #[must_use]
    pub(crate) const fn new(types: u64, points: u64, entries: u64, parent_edges: u64) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V0),
            types: U64::new(types),
            points: U64::new(points),
            entries: U64::new(entries),
            parent_edges: U64::new(parent_edges),
            padding: [0; Self::PADDING],
        }
    }

    /// Returns the type count `T`.
    #[inline]
    #[must_use]
    pub(crate) const fn types(&self) -> u64 {
        self.types.get()
    }

    /// Returns the point count `N`.
    ///
    /// The base positions a dense bitmap covers and a list entry must stay below.
    #[inline]
    #[must_use]
    pub(crate) const fn points(&self) -> u64 {
        self.points.get()
    }

    /// Returns the membership entry count `M`.
    ///
    /// The value the last membership fencepost must close at.
    #[inline]
    #[must_use]
    pub(crate) const fn entries(&self) -> u64 {
        self.entries.get()
    }

    /// Returns the parent edge count `P`: the value the last parent fencepost must close at.
    #[inline]
    #[must_use]
    pub(crate) const fn parent_edges(&self) -> u64 {
        self.parent_edges.get()
    }

    /// Returns the flags word count `ceil(T/64)`.
    #[inline]
    #[must_use]
    pub(crate) const fn flags_words(&self) -> u64 {
        self.types.get().div_ceil(u64::BITS as u64)
    }

    /// Returns the fencepost count `T + 1` of both fencepost regions.
    ///
    /// Returns `None` when the count overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn fencepost_count(&self) -> Option<u64> {
        self.types.get().checked_add(1)
    }

    /// Returns the offset of the membership fencepost region.
    ///
    /// The flags region sits between the header and this offset, zero padded to the boundary.
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn membership_posts_offset(&self) -> Option<u64> {
        PAGE.checked_add(padded_size(self.flags_words(), size_of::<u64>() as u64)?)
    }

    /// Returns the offset of the parent fencepost region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn parent_posts_offset(&self) -> Option<u64> {
        self.membership_posts_offset()?
            .checked_add(self.padded_posts_bytes()?)
    }

    /// Returns the offset of the parent id region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn parent_ids_offset(&self) -> Option<u64> {
        self.parent_posts_offset()?
            .checked_add(self.padded_posts_bytes()?)
    }

    /// Returns the offset of the membership entries region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn entries_offset(&self) -> Option<u64> {
        let ids = padded_size(self.parent_edges.get(), size_of::<u64>() as u64)?;
        self.parent_ids_offset()?.checked_add(ids)
    }

    /// Returns the exact file length the header describes.
    ///
    /// The open path rejects a file whose length differs from this value. Returns `None` when the
    /// geometry overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) const fn expected_file_len(&self) -> Option<u64> {
        let entries = self.entries.get().checked_mul(size_of::<u32>() as u64)?;
        self.entries_offset()?.checked_add(entries)
    }

    /// Returns the padded byte size of one fencepost region.
    const fn padded_posts_bytes(&self) -> Option<u64> {
        padded_size(self.fencepost_count()?, size_of::<U64<LE>>() as u64)
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
            .field("types", &self.types)
            .field("points", &self.points)
            .field("entries", &self.entries)
            .field("parent_edges", &self.parent_edges)
            .finish_non_exhaustive()
    }
}

const _: () = assert!(size_of::<FileHeader>() == FileHeader::SIZE);

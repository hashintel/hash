//! The morton file: a page index in front of sorted morton codes.
//!
//! Layout version 0 is **mutable**: change the layout freely to fit what
//! the pipeline needs and increment [`Version`] when you do. The pinned
//! parse rejects bytes of other versions, which is the intended failure
//! mode; no migration or compatibility machinery exists on purpose until
//! the format stabilizes.
//!
//! This is the archetype of a combined file: the index is derived from
//! the code array, meaningless without it, and always read with it, so
//! both live in one file and cannot fall out of sync. The regions:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTMRTN`                                |
//! | 8      | 4    | layout version, `u32` = 0                       |
//! | 12     | 4    | index stride, `u32`, codes per index key        |
//! | 16     | 8    | code count `N`, `u64`                           |
//! | 24     | 4072 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | index: `u64` keys, one per stride of codes      |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | codes: `u64[N]`, ascending                      |
//! ```
//!
//! Key `i` of the index is code `i * stride`, so a lookup binary-searches
//! the index to pick one stride of codes and binary-searches within it:
//! two faulted pages instead of `log2(N)` scattered ones. All region
//! offsets derive from the stride and count with checked arithmetic
//! ([`FileHeader::codes_offset`], [`FileHeader::expected_file_len`]); a
//! header whose geometry overflows, or whose stride is zero, matches no
//! real file. Both regions start on 4096-byte boundaries, so the
//! whole-file-mapping alignment guarantee of the array format applies
//! unchanged: map the whole file and slice, never mmap at a file offset.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the magic is pinned to the same canonical little-endian bytes on every platform"
)]

use core::fmt;

use zerocopy::{LE, U32, U64, Unalign};

#[cfg(test)]
mod tests;

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
    Morton = u64::from_le_bytes(*b"SALTMRTN"),
}

/// The `SALTMRTN` magic. Byte-level construction admits no other value.
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
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Morton);
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

/// The 4096-byte header of a morton file.
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
    stride: U32<LE>,
    count: U64<LE>,
    padding: [u8; Self::PADDING],
}

impl FileHeader {
    const PADDING: usize = 4072;
    /// Size of the header, and the offset of the index region.
    pub(crate) const SIZE: usize = 4096;

    /// Creates a header for `count` codes indexed every `stride` codes.
    #[must_use]
    pub(crate) const fn new(stride: u32, count: u64) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V0),
            stride: U32::new(stride),
            count: U64::new(count),
            padding: [0; Self::PADDING],
        }
    }

    /// Returns the number of codes per index key.
    #[inline]
    #[must_use]
    pub(crate) const fn stride(&self) -> u32 {
        self.stride.get()
    }

    /// Returns the number of codes.
    #[inline]
    #[must_use]
    pub(crate) const fn count(&self) -> u64 {
        self.count.get()
    }

    /// Returns the number of index keys.
    ///
    /// Returns `None` for a zero stride, which matches no real file.
    #[must_use]
    pub(crate) const fn index_keys(&self) -> Option<u64> {
        match u64::from(self.stride.get()) {
            0 => None,
            stride => Some(self.count.get().div_ceil(stride)),
        }
    }

    /// Returns the offset of the code region.
    ///
    /// The index region sits between the header and this offset, zero
    /// padded to the boundary. Returns `None` when the geometry overflows
    /// `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn codes_offset(&self) -> Option<u64> {
        let index_bytes = self.index_keys()?.checked_mul(size_of::<u64>() as u64)?;
        let padded = index_bytes.checked_next_multiple_of(PAGE)?;
        PAGE.checked_add(padded)
    }

    /// Returns the exact file length the header describes.
    ///
    /// A file whose length differs from this value is rejected. Returns
    /// `None` when the geometry overflows `u64`, in which case no real
    /// file matches the header.
    #[must_use]
    pub(crate) fn expected_file_len(&self) -> Option<u64> {
        let code_bytes = self.count.get().checked_mul(size_of::<u64>() as u64)?;
        self.codes_offset()?.checked_add(code_bytes)
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
            .field("stride", &self.stride)
            .field("count", &self.count)
            .finish_non_exhaustive()
    }
}

const _: () = assert!(size_of::<FileHeader>() == FileHeader::SIZE);

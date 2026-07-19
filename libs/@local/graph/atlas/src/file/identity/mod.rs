//! The identity file: a row-ordered id column and its sorted lookup
//! pairs.
//!
//! Layout version 0 is **mutable**: change the layout freely to fit what
//! the pipeline needs and increment [`Version`] when you do. The pinned
//! parse rejects bytes of other versions, which is the intended failure
//! mode; no migration or compatibility machinery exists on purpose until
//! the format stabilizes.
//!
//! One file binds a row domain (nodes, edges, or ontology types) to its
//! source identifiers, in both directions: `row -> id` is indexing into the id
//! column, and `id -> row` is binary search over the sorted pairs, with
//! an index prelude in front so a cold lookup faults two pages instead
//! of `log2(N)` scattered ones. Ids are opaque `K`-byte strings; the
//! pair order is the order of those bytes, since source identifiers
//! carry no other one. This is a combined file: the pairs and the index
//! are derived from the id column, meaningless without it, and always
//! read with it. The regions:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTIDNT`                                |
//! | 8      | 4    | layout version, `u32` = 0                       |
//! | 12     | 4    | key width `K`, `u32`, bytes per id              |
//! | 16     | 8    | row count `N`, `u64`                            |
//! | 24     | 4    | index stride, `u32`, pairs per index key        |
//! | 28     | 4068 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | ids: `[u8; K][N]` in row order;                 |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | index: `[u8; K]` keys, one per stride of pairs; |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | pairs: `([u8; K], u64)[N]` (id, row), ascending |
//! |        |      | by id bytes                                     |
//! ```
//!
//! Key `i` of the index is the id of pair `i * stride`, so a lookup
//! binary-searches the index to pick one stride of pairs and
//! binary-searches within it. All region offsets derive from `K`,
//! `N`, and the stride with checked arithmetic
//! ([`FileHeader::expected_file_len`]); a header whose geometry
//! overflows, or whose width or stride is zero, matches no real file.
//! Every region starts on a 4096-byte boundary, so the
//! whole-file-mapping alignment guarantee of the array format applies
//! unchanged: map the whole file and slice, never mmap at a file
//! offset.
//!
//! [`read::IdentityFile`] opens a file under these rules and hands out
//! the raw byte regions; [`write::write_regions`] streams them into
//! place. The format owns geometry alone - the table's domain
//! invariants (strictly ascending pair ids, rows inside the domain,
//! pair agreement with the column, index agreement with the pairs) are
//! `salt::fit::prepare::identity`'s contract, validated where the
//! typed table lives.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the magic is pinned to the same canonical little-endian bytes on every platform"
)]

use core::fmt;

use zerocopy::{LE, U32, U64, Unalign};

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
    Identity = u64::from_le_bytes(*b"SALTIDNT"),
}

/// The `SALTIDNT` magic. Byte-level construction admits no other value.
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
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Identity);
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

/// The 4096-byte header of an identity file.
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
    key_width: U32<LE>,
    rows: U64<LE>,
    stride: U32<LE>,
    padding: [u8; Self::PADDING],
}

impl FileHeader {
    const PADDING: usize = 4068;
    /// Size of the header, and the offset of the ids region.
    pub(crate) const SIZE: usize = 4096;

    /// Creates a header for `rows` ids of `key_width` bytes, indexed
    /// every `stride` pairs.
    #[must_use]
    pub(crate) const fn new(key_width: u32, rows: u64, stride: u32) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V0),
            key_width: U32::new(key_width),
            rows: U64::new(rows),
            stride: U32::new(stride),
            padding: [0; Self::PADDING],
        }
    }

    /// Returns the id width `K`, in bytes.
    #[inline]
    #[must_use]
    pub(crate) const fn key_width(&self) -> u32 {
        self.key_width.get()
    }

    /// Returns the row count `N`.
    #[inline]
    #[must_use]
    pub(crate) const fn rows(&self) -> u64 {
        self.rows.get()
    }

    /// Returns the index stride: pairs per index key.
    #[inline]
    #[must_use]
    pub(crate) const fn stride(&self) -> u32 {
        self.stride.get()
    }

    /// Returns the byte size of one lookup pair.
    #[inline]
    #[must_use]
    pub(crate) const fn pair_size(&self) -> u64 {
        self.key_width() as u64 + size_of::<u64>() as u64
    }

    /// Returns the number of index keys the pairs region needs.
    ///
    /// Returns `None` when the stride is zero, in which case no real
    /// file matches the header.
    #[must_use]
    pub(crate) const fn index_keys(&self) -> Option<u64> {
        if self.stride() == 0 {
            return None;
        }

        Some(self.rows().div_ceil(self.stride() as u64))
    }

    /// Returns the offset of the index region.
    ///
    /// The ids region sits between the header and this offset, zero
    /// padded to the boundary. Returns `None` when the geometry
    /// overflows `u64` or the width is zero, in which case no real file
    /// matches the header.
    #[must_use]
    pub(crate) fn index_offset(&self) -> Option<u64> {
        if self.key_width() == 0 {
            return None;
        }

        let id_bytes = self.rows().checked_mul(u64::from(self.key_width()))?;
        let padded = id_bytes.checked_next_multiple_of(PAGE)?;
        PAGE.checked_add(padded)
    }

    /// Returns the offset of the pairs region.
    ///
    /// Returns `None` when the geometry overflows `u64` or the width or
    /// stride is zero, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn pairs_offset(&self) -> Option<u64> {
        let index_bytes = self
            .index_keys()?
            .checked_mul(u64::from(self.key_width()))?;
        let padded = index_bytes.checked_next_multiple_of(PAGE)?;
        self.index_offset()?.checked_add(padded)
    }

    /// Returns the exact file length the header describes.
    ///
    /// A file whose length differs from this value is rejected. Returns
    /// `None` when the geometry overflows `u64` or the width or stride
    /// is zero, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn expected_file_len(&self) -> Option<u64> {
        let pair_bytes = self.rows().checked_mul(self.pair_size())?;
        self.pairs_offset()?.checked_add(pair_bytes)
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
            .field("key_width", &self.key_width)
            .field("rows", &self.rows)
            .field("stride", &self.stride)
            .finish_non_exhaustive()
    }
}

const _: () = assert!(size_of::<FileHeader>() == FileHeader::SIZE);

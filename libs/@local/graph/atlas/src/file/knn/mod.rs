//! The k-nearest-neighbour file: neighbour columns and their distances.
//!
//! Layout version 0 is **mutable**: change the layout freely to fit what
//! the pipeline needs and increment [`Version`] when you do. The pinned
//! parse rejects bytes of other versions, which is the intended failure
//! mode; no migration or compatibility machinery exists on purpose until
//! the format stabilizes.
//!
//! This is a combined file: the distance region is entry-aligned with
//! the column region, meaningless without it, and always read with it,
//! so both live in one file and cannot fall out of sync. The regions:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTKNNG`                                |
//! | 8      | 4    | layout version, `u32` = 0                       |
//! | 12     | 8    | node rows `N`, `u64`                            |
//! | 20     | 8    | neighbours per row `k`, `u64`                   |
//! | 28     | 4068 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | columns: `u32[N, k]`, row-major, each row's     |
//! |        |      | neighbour rows ascending;                       |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | distances: `f32[N, k]`, row-major, entry `i` of |
//! |        |      | a row belonging to column entry `i`             |
//! ```
//!
//! All region offsets derive from the two shape fields with checked
//! arithmetic ([`FileHeader::distances_offset`],
//! [`FileHeader::expected_file_len`]); a header whose geometry overflows
//! matches no real file. Both regions start on 4096-byte boundaries, so
//! the whole-file-mapping alignment guarantee of the array format
//! applies unchanged: map the whole file and slice, never mmap at a
//! file offset.
//!
//! [`KnnFile`] opens a file under these rules and hands out the typed
//! regions.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the magic is pinned to the same canonical little-endian bytes on every platform"
)]

use core::fmt;

use zerocopy::{LE, U64, Unalign};

pub(crate) use self::read::KnnFile;

pub(crate) mod read;
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
    Knn = u64::from_le_bytes(*b"SALTKNNG"),
}

/// The `SALTKNNG` magic. Byte-level construction admits no other value.
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
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Knn);
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

/// The 4096-byte header of a k-nearest-neighbour file.
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
    rows: U64<LE>,
    neighbours: U64<LE>,
    padding: [u8; Self::PADDING],
}

impl FileHeader {
    const PADDING: usize = 4068;
    /// Size of the header, and the offset of the column region.
    pub(crate) const SIZE: usize = 4096;

    /// Creates a header for `rows` rows of `neighbours` entries each.
    #[must_use]
    pub(crate) const fn new(rows: u64, neighbours: u64) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V0),
            rows: U64::new(rows),
            neighbours: U64::new(neighbours),
            padding: [0; Self::PADDING],
        }
    }

    /// Returns the number of node rows.
    #[inline]
    #[must_use]
    pub(crate) const fn rows(&self) -> u64 {
        self.rows.get()
    }

    /// Returns the number of neighbours per row.
    #[inline]
    #[must_use]
    pub(crate) const fn neighbours(&self) -> u64 {
        self.neighbours.get()
    }

    /// Returns the number of entries each region stores.
    ///
    /// Returns `None` when the count overflows `u64`, in which case no
    /// real file matches the header.
    #[must_use]
    pub(crate) const fn entries(&self) -> Option<u64> {
        self.rows.get().checked_mul(self.neighbours.get())
    }

    /// Returns the zero padding between the column and distance regions.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case
    /// no real file matches the header.
    #[must_use]
    pub(crate) fn columns_padding(&self) -> Option<u64> {
        let column_bytes = self.entries()?.checked_mul(size_of::<u32>() as u64)?;
        let padded = column_bytes.checked_next_multiple_of(PAGE)?;
        Some(padded - column_bytes)
    }

    /// Returns the offset of the distance region.
    ///
    /// The column region sits between the header and this offset, zero
    /// padded to the boundary. Returns `None` when the geometry
    /// overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn distances_offset(&self) -> Option<u64> {
        let column_bytes = self.entries()?.checked_mul(size_of::<u32>() as u64)?;
        let padded = column_bytes.checked_next_multiple_of(PAGE)?;
        PAGE.checked_add(padded)
    }

    /// Returns the exact file length the header describes.
    ///
    /// A file whose length differs from this value is rejected. Returns
    /// `None` when the geometry overflows `u64`, in which case no real
    /// file matches the header.
    #[must_use]
    pub(crate) fn expected_file_len(&self) -> Option<u64> {
        let distance_bytes = self.entries()?.checked_mul(size_of::<f32>() as u64)?;
        self.distances_offset()?.checked_add(distance_bytes)
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
            .field("rows", &self.rows)
            .field("neighbours", &self.neighbours)
            .finish_non_exhaustive()
    }
}

const _: () = assert!(size_of::<FileHeader>() == FileHeader::SIZE);

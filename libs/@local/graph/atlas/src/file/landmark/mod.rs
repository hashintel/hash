//! A landmark file stores the selected rows, the assignment, and the coordinates.
//!
//! Layout version 0 is mutable: change the layout to fit what the pipeline needs and
//! increment [`Version`] when you do. The pinned parse rejects bytes of other versions, which is
//! the intended failure mode; no migration or compatibility machinery exists on purpose until the
//! format stabilizes.
//!
//! The assignment and the coordinates are both keyed by the selection's ordinal order and mean
//! nothing without it. All three regions live in one file and therefore cannot fall out of sync.
//! The regions:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTLNDM`                                |
//! | 8      | 4    | layout version, `u32` = 0                       |
//! | 12     | 4    | padding; writers emit zero, readers ignore      |
//! | 16     | 8    | landmark count `M`, `u64`                       |
//! | 24     | 8    | corpus row count `N`, `u64`                     |
//! | 32     | 4064 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | rows: `u64[M]` selected node rows, ascending;   |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | assignment: `u32[N]` landmark ordinals in       |
//! |        |      | node-row order;                                 |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | coordinates: `f32[M, 2]` layout positions in    |
//! |        |      | ordinal order                                   |
//! ```
//!
//! Position `i` of the rows region defines landmark ordinal `i`: the assignment's entries index it,
//! and row `i` of the coordinates region is its position. All region offsets derive from `M` and
//! `N` with checked arithmetic ([`FileHeader::expected_file_len`]); a header whose geometry
//! overflows matches no real file. Every region starts on a 4096-byte boundary, so the
//! whole-file-mapping alignment guarantee of the array format applies unchanged. A reader maps the
//! whole file and slices it rather than mmapping at a file offset.
//!
//! [`read::LandmarkFile`] opens a file under these rules and hands out the raw typed regions, and
//! [`write::write_regions`] streams them into place. The format owns geometry alone. The skeleton's
//! domain invariants (ascending rows, ordinals below `M`, finite coordinates) are
//! `salt::landmark`'s artifact contract, validated where the domain types live.
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
    Landmark = u64::from_le_bytes(*b"SALTLNDM"),
}

/// The `SALTLNDM` magic. Byte-level construction admits no other value.
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
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Landmark);
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

/// The 4096-byte header of a landmark file.
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
    /// Alignment filler so the counts sit on natural boundaries.
    reserved: U32<LE>,
    landmarks: U64<LE>,
    rows: U64<LE>,
    padding: [u8; Self::PADDING],
}

impl FileHeader {
    const PADDING: usize = 4064;
    /// Size of the header, and the offset of the rows region.
    pub(crate) const SIZE: usize = 4096;

    /// Creates a header for `landmarks` selected out of `rows`.
    #[must_use]
    pub(crate) const fn new(landmarks: u64, rows: u64) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V0),
            reserved: U32::new(0),
            landmarks: U64::new(landmarks),
            rows: U64::new(rows),
            padding: [0; Self::PADDING],
        }
    }

    /// Returns the landmark count `M`.
    #[inline]
    #[must_use]
    pub(crate) const fn landmarks(&self) -> u64 {
        self.landmarks.get()
    }

    /// Returns the corpus row count `N`.
    #[inline]
    #[must_use]
    pub(crate) const fn rows(&self) -> u64 {
        self.rows.get()
    }

    /// Returns the offset of the assignment region.
    ///
    /// The rows region sits between the header and this offset, zero padded to the boundary.
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn assignment_offset(&self) -> Option<u64> {
        PAGE.checked_add(padded_size(self.landmarks(), size_of::<u64>() as u64)?)
    }

    /// Returns the offset of the coordinates region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn coordinates_offset(&self) -> Option<u64> {
        let assignment = padded_size(self.rows(), size_of::<u32>() as u64)?;
        self.assignment_offset()?.checked_add(assignment)
    }

    /// Returns the exact file length the header describes.
    ///
    /// Opening rejects a file whose length differs from this value. Returns `None` when the
    /// geometry overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) const fn expected_file_len(&self) -> Option<u64> {
        let coordinate_bytes = self.landmarks().checked_mul(2 * size_of::<f32>() as u64)?;
        self.coordinates_offset()?.checked_add(coordinate_bytes)
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
            .field("landmarks", &self.landmarks)
            .field("rows", &self.rows)
            .finish_non_exhaustive()
    }
}

const _: () = assert!(size_of::<FileHeader>() == FileHeader::SIZE);

//! Directory geometry: preamble extensions and entry segments.
//!
//! Segments carry no type tags; position defines them. Segment 0 is the
//! preamble, the next `directory_len` segments are preamble extensions
//! holding the content mapping, and the remaining header segments are
//! directory segments holding entries, grouped into one consecutive run
//! per content id in mapping order. The inline data region starts at the
//! first 4096-byte boundary after the last directory segment, an offset
//! that is fully determined by `directory_len` and the mapping lengths.

use zerocopy::{LE, U32, U128};

use super::{entry::DirectoryEntry, preamble::SEGMENT_BYTES};
use crate::integrity::Checksum;

/// The content id of the container itself: sections of this content live
/// in the inline data region.
pub(crate) const INLINE_CONTENT_ID: u128 = 0;
/// The content id marking provisioned spare capacity in the mapping.
pub(crate) const VACANT_CONTENT_ID: u128 = u128::MAX;

/// One content mapping record.
///
/// Records appear in the order of the directory segment runs they
/// describe; the prefix sum of `length` locates every run. `length` counts
/// directory segments. The record whose content id is
/// [`VACANT_CONTENT_ID`] describes provisioned spare segments and is only
/// valid as the final record.
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
)]
#[repr(C)]
pub(crate) struct ContentMapping {
    pub content_id: U128<LE>,
    pub length: U32<LE>,
    pub _reserved: [u8; 4],
}

/// A preamble extension segment holding content mapping records.
///
/// Occupied records form a prefix; the remaining records are zero. The
/// record count is not stored: a zero content id with zero length is
/// unoccupied, and [`INLINE_CONTENT_ID`] never needs a record of length
/// zero. The checksum covers every preceding byte of the segment.
#[derive(
    Debug,
    PartialEq,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct PreambleExtension {
    pub mappings: [ContentMapping; Self::MAPPING_COUNT],
    pub _reserved: [u8; 8],
    pub checksum: Checksum,
}

impl PreambleExtension {
    /// Content mapping records per extension segment.
    pub(crate) const MAPPING_COUNT: usize =
        (SEGMENT_BYTES - Checksum::SIZE as usize - 8) / size_of::<ContentMapping>();
}

/// A directory segment holding entries of one content's run.
///
/// Occupied entries form a prefix, strictly ascending by section id across
/// the whole run; the remaining slots are vacant. The checksum covers
/// every preceding byte of the segment and is written together with the
/// entries, so every segment checksum is valid at all times.
#[derive(
    Debug,
    PartialEq,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct DirectorySegment {
    pub entries: [DirectoryEntry; Self::ENTRY_COUNT],
    pub _reserved: [u8; 120],
    pub checksum: Checksum,
}

impl DirectorySegment {
    /// Directory entries per segment.
    pub(crate) const ENTRY_COUNT: usize =
        (SEGMENT_BYTES - Checksum::SIZE as usize - 120) / size_of::<DirectoryEntry>();
}

const _: () = {
    assert!(size_of::<ContentMapping>() == 24);
    assert!(PreambleExtension::MAPPING_COUNT == 170);
    assert!(size_of::<PreambleExtension>() == SEGMENT_BYTES);
    assert!(DirectorySegment::ENTRY_COUNT == 31);
    assert!(size_of::<DirectorySegment>() == SEGMENT_BYTES);
};

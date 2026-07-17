//! Directory entries: one section of one content per entry.
//!
//! Section ids are unique per container, not per content; the mapping in
//! the preamble extensions decides which content (and therefore which
//! file) an entry's offsets index into. The section type stays a raw
//! integer at this layer because unknown types must remain representable:
//! readers skip or reject them per the entry flags, they do not fail to
//! parse.

use zerocopy::{LE, U16, U32, U64};

use super::flags::EntryFlags;
use crate::integrity::Checksum;

/// The section id marking a vacant entry slot.
pub(crate) const VACANT_SECTION_ID: u32 = u32::MAX;

/// Size of the typed metadata tail of an entry.
pub(crate) const METADATA_BYTES: usize = 96;

/// Section type of a UTF-8 JSON document.
pub(crate) const SECTION_TYPE_DOCUMENT: u16 = 0x0001;
/// Section type of uninterpreted bytes, including alignment padding.
pub(crate) const SECTION_TYPE_OPAQUE: u16 = 0x0002;
/// Section type of a scalar array typed by its entry metadata.
pub(crate) const SECTION_TYPE_SCALAR_ARRAY: u16 = 0x0003;
/// Section type of `.quad` quadtree topology.
pub(crate) const SECTION_TYPE_QUAD_TREE: u16 = 0x0004;
/// Section type of point-cloud data for one quadtree node.
pub(crate) const SECTION_TYPE_POINT_CLOUD: u16 = 0x0005;

/// One directory entry.
///
/// A vacant slot has section id [`VACANT_SECTION_ID`] and every other byte
/// zero. For occupied slots, `start..end` is a nonempty half-open byte
/// range into the owning content's bytes, the checksum is the CRC-64/NVME
/// of exactly those payload bytes (entry integrity itself comes from the
/// segment checksum), and the metadata layout is fixed by the section
/// type, with bytes past the type's layout zero.
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
pub(crate) struct DirectoryEntry {
    pub section_id: U32<LE>,
    pub section_type: U16<LE>,
    pub flags: EntryFlags,
    pub start: U64<LE>,
    pub end: U64<LE>,
    pub metadata: [u8; METADATA_BYTES],
    pub checksum: Checksum,
}

/// The metadata tail of a [`SECTION_TYPE_SCALAR_ARRAY`] entry.
///
/// The rank is in `1..=8`, dimensions past the rank are zero, and the
/// product of the first `rank` dimensions times the scalar width equals
/// the entry's `end - start`.
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
pub(crate) struct ScalarArrayMetadata {
    pub scalar: U16<LE>,
    pub rank: U16<LE>,
    pub _reserved: [u8; 4],
    pub shape: [U64<LE>; 8],
}

const _: () = {
    assert!(size_of::<DirectoryEntry>() == 128);
    assert!(size_of::<ScalarArrayMetadata>() <= METADATA_BYTES);
};

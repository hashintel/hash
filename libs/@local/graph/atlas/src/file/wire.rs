//! Raw wire images of the `.salt` layout.
//!
//! The definitions here fix sizes, field order, and endianness, and nothing
//! else: every bit pattern is representable. Structural validation is out of
//! scope; the validated counterparts live in [`header`], [`section`], and
//! [`entry`]. The normative layout is documented on [`crate::file`].
//!
//! [`header`]: super::header
//! [`section`]: super::section
//! [`entry`]: super::entry
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use zerocopy::byteorder::little_endian::{U16, U32, U64, U128};

/// Size of one header-region segment.
pub(crate) const SEGMENT_BYTES: usize = 4096;
/// Size of the CRC-64/XZ trailer closing a header-region segment.
pub(crate) const SEGMENT_CRC_BYTES: usize = 8;
/// Payload bytes of a header-region segment, covered by its trailing CRC.
pub(crate) const SEGMENT_PAYLOAD_BYTES: usize = SEGMENT_BYTES - SEGMENT_CRC_BYTES;

/// Magic bytes opening a `.salt` container.
pub(crate) const SALT_MAGIC: &[u8; 4] = b"SALT";
/// Magic bytes opening a `.quad` quadtree.
pub(crate) const QUAD_MAGIC: &[u8; 4] = b"QUAD";
/// The `.salt` layout version this module implements.
pub(crate) const SALT_VERSION: u32 = 1;

/// Size of the fixed fields at the start of segment 0.
pub(crate) const HEADER_FIXED_BYTES: usize = 32;
/// Size of one directory entry slot.
pub(crate) const ENTRY_BYTES: usize = 128;
/// Size of the typed metadata tail of a directory entry.
pub(crate) const ENTRY_METADATA_BYTES: usize = 80;
/// Directory entry slots stored in each directory segment.
pub(crate) const ENTRIES_PER_SEGMENT: usize = SEGMENT_PAYLOAD_BYTES / ENTRY_BYTES;
/// Maximum directory segments in one container.
pub(crate) const MAX_DIRECTORY_SEGMENTS: u32 = 0x4000;
/// Required alignment for inline section payload starts.
pub(crate) const SECTION_ALIGNMENT: u64 = 4096;
/// Maximum scalar array rank.
pub(crate) const MAX_ARRAY_RANK: usize = 8;

/// The reserved content id addressing container-owned structures.
pub(crate) const CONTAINER_CONTENT_ID: u128 = 0;
/// The reserved content id marking a vacant directory slot.
pub(crate) const VACANT_CONTENT_ID: u128 = u128::MAX;

/// Header flag marking a sealed, immutable container.
pub(crate) const HEADER_FLAG_SEALED: u32 = 1 << 0;

/// Section type of a UTF-8 JSON document.
pub(crate) const SECTION_TYPE_DOCUMENT: u16 = 0x0001;
/// Section type of uninterpreted bytes, including alignment padding.
pub(crate) const SECTION_TYPE_OPAQUE: u16 = 0x0002;
/// Section type of a scalar array typed by its entry metadata.
pub(crate) const SECTION_TYPE_SCALAR_ARRAY: u16 = 0x0003;
/// Section type of the blob lookup index.
pub(crate) const SECTION_TYPE_INDEX: u16 = 0x0004;
/// Section type of `.quad` quadtree topology.
pub(crate) const SECTION_TYPE_QUAD_TREE: u16 = 0x0005;
/// Section type of point-cloud data for one quadtree node.
pub(crate) const SECTION_TYPE_POINT_CLOUD: u16 = 0x0006;

/// Entry flag marking a section stored in the blob's outline file.
pub(crate) const ENTRY_FLAG_OUTLINE: u16 = 1 << 0;
/// Entry flag forcing readers to reject the container when the section type
/// is unknown.
pub(crate) const ENTRY_FLAG_MUST_UNDERSTAND: u16 = 1 << 1;

/// Returns whether every byte is zero.
#[inline]
#[must_use]
pub(crate) fn all_zero(bytes: &[u8]) -> bool {
    bytes.iter().all(|&byte| byte == 0)
}

// Raw wire image: every bit pattern is representable, so `FromBytes` is
// sound. Structural validation happens against the parsed copy, never at
// construction.
/// The fixed fields of segment 0 in a `.salt` container.
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
pub(crate) struct WireSaltHeader {
    pub magic: [u8; 4],
    pub version: U32,
    pub flags: U32,
    pub directory_segments: U32,
    pub entry_count: U64,
    pub total_bytes: U64,
}

// Raw wire image: every bit pattern is representable, so `FromBytes` is
// sound. Structural validation happens against the parsed copy, never at
// construction.
/// One directory entry locating and typing a section of a blob.
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
pub(crate) struct WireSaltEntry {
    pub content_id: U128,
    pub section_id: U32,
    pub section_type: U16,
    pub flags: U16,
    pub start: U64,
    pub end: U64,
    pub payload_crc: U64,
    pub metadata: [u8; ENTRY_METADATA_BYTES],
}

// Raw wire image: every bit pattern is representable, so `FromBytes` is
// sound. Structural validation happens against the parsed copy, never at
// construction.
/// The metadata tail of a scalar array entry.
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
pub(crate) struct WireScalarArrayMetadata {
    pub scalar: U16,
    pub rank: U16,
    pub reserved: U32,
    pub shape: [U64; MAX_ARRAY_RANK],
}

// Raw wire image: every bit pattern is representable, so `FromBytes` is
// sound. Structural validation happens against the parsed copy, never at
// construction.
/// One record of the blob lookup index, mapping a content id to its run of
/// directory slots.
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
pub(crate) struct WireIndexRecord {
    pub content_id: U128,
    pub first_slot: U32,
    pub slot_count: U32,
}

const _: () = {
    assert!(size_of::<WireSaltHeader>() == HEADER_FIXED_BYTES);
    assert!(size_of::<WireSaltEntry>() == ENTRY_BYTES);
    assert!(size_of::<WireScalarArrayMetadata>() <= ENTRY_METADATA_BYTES);
    assert!(size_of::<WireIndexRecord>() == 24);
    assert!(ENTRIES_PER_SEGMENT == 31);
    assert!(ENTRIES_PER_SEGMENT * ENTRY_BYTES <= SEGMENT_PAYLOAD_BYTES);
};

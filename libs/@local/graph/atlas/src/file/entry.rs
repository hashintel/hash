//! Validated directory slots, entries, and index records.
//!
//! [`Slot::decode`] is the single entrance for directory bytes: it yields a
//! vacant marker, a typed [`Entry`], or a skippable [`UnknownEntry`], and
//! rejects everything else. [`Entry`] values encode back to canonical wire
//! images, so a writer holding one cannot produce an invalid slot.

use core::num::NonZero;

use zerocopy::{
    IntoBytes as _,
    byteorder::little_endian::{U16, U32, U64, U128},
};

use super::{
    section::SectionKind,
    wire::{
        self, ENTRY_FLAG_MUST_UNDERSTAND, ENTRY_FLAG_OUTLINE, SECTION_ALIGNMENT, WireIndexRecord,
        WireSaltEntry,
    },
};

/// Size of one blob lookup index record.
const INDEX_RECORD_BYTES: u64 = size_of::<WireIndexRecord>() as u64;

// No zerocopy derives: byte-level construction would bypass the reserved
// values.
/// A writer-assigned blob identifier.
///
/// Values exclude the reserved container id (zero) and the vacant-slot
/// sentinel (`u128::MAX`).
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct ContentId(u128);

impl ContentId {
    /// Creates a content id, rejecting the two reserved values.
    #[must_use]
    pub(crate) const fn new(value: u128) -> Option<Self> {
        match value {
            wire::CONTAINER_CONTENT_ID | wire::VACANT_CONTENT_ID => None,
            _ => Some(Self(value)),
        }
    }

    /// Returns the persisted value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> u128 {
        self.0
    }
}

/// Where a blob's payload bytes live.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Placement {
    /// In the container's data region.
    Inline,
    /// In the blob's derived-name outline file.
    Outline,
}

// No zerocopy derives: byte-level construction would bypass the ordering
// invariant.
/// A nonempty half-open section byte range.
///
/// The start is strictly below the end, so [`SectionRange::len`] is total
/// and nonzero.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct SectionRange {
    start: u64,
    end: u64,
}

impl SectionRange {
    /// Creates a range, requiring `start < end`.
    #[must_use]
    pub(crate) const fn new(start: u64, end: u64) -> Option<Self> {
        if start < end {
            Some(Self { start, end })
        } else {
            None
        }
    }

    /// Returns the inclusive start offset.
    #[inline]
    #[must_use]
    pub(crate) const fn start(self) -> u64 {
        self.start
    }

    /// Returns the exclusive end offset.
    #[inline]
    #[must_use]
    pub(crate) const fn end(self) -> u64 {
        self.end
    }

    /// Returns the payload length in bytes.
    #[inline]
    #[must_use]
    pub(crate) const fn len(self) -> u64 {
        self.end - self.start
    }
}

// No zerocopy derives: byte-level construction would bypass the alignment
// and record-size invariants.
/// The validated directory entry of the blob lookup index.
///
/// The payload is inline at a [`SECTION_ALIGNMENT`]-aligned start and holds
/// a whole number of index records.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct IndexEntry {
    range: SectionRange,
    payload_crc: u64,
}

impl IndexEntry {
    /// Creates the index entry.
    ///
    /// Returns `None` when the start is not [`SECTION_ALIGNMENT`]-aligned
    /// or the length is not a multiple of the index record size.
    #[must_use]
    pub(crate) const fn new(range: SectionRange, payload_crc: u64) -> Option<Self> {
        if !range.start().is_multiple_of(SECTION_ALIGNMENT)
            || !range.len().is_multiple_of(INDEX_RECORD_BYTES)
        {
            return None;
        }
        Some(Self { range, payload_crc })
    }

    /// Returns the payload range.
    #[inline]
    #[must_use]
    pub(crate) const fn range(&self) -> SectionRange {
        self.range
    }

    /// Returns the payload checksum.
    #[inline]
    #[must_use]
    pub(crate) const fn payload_crc(&self) -> u64 {
        self.payload_crc
    }
}

// No zerocopy derives: byte-level construction would bypass the cross-field
// invariants.
/// A validated directory entry of one blob section.
///
/// Inline payloads start [`SECTION_ALIGNMENT`]-aligned, and a scalar
/// array's range length equals its layout's byte length.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct BlobEntry {
    content_id: ContentId,
    section_id: u32,
    kind: SectionKind,
    placement: Placement,
    must_understand: bool,
    range: SectionRange,
    payload_crc: u64,
}

impl BlobEntry {
    /// Creates a blob section entry.
    ///
    /// Returns `None` when an inline start is not
    /// [`SECTION_ALIGNMENT`]-aligned or a scalar array's byte length does
    /// not equal the range length.
    #[must_use]
    pub(crate) fn new(
        content_id: ContentId,
        section_id: u32,
        kind: SectionKind,
        placement: Placement,
        must_understand: bool,
        range: SectionRange,
        payload_crc: u64,
    ) -> Option<Self> {
        if placement == Placement::Inline && !range.start().is_multiple_of(SECTION_ALIGNMENT) {
            return None;
        }
        if let SectionKind::ScalarArray(layout) = &kind
            && layout.byte_length() != range.len()
        {
            return None;
        }
        Some(Self {
            content_id,
            section_id,
            kind,
            placement,
            must_understand,
            range,
            payload_crc,
        })
    }

    /// Returns the owning blob's content id.
    #[inline]
    #[must_use]
    pub(crate) const fn content_id(&self) -> ContentId {
        self.content_id
    }

    /// Returns the section id within the blob.
    #[inline]
    #[must_use]
    pub(crate) const fn section_id(&self) -> u32 {
        self.section_id
    }

    /// Borrows the section kind.
    #[inline]
    #[must_use]
    pub(crate) const fn kind(&self) -> &SectionKind {
        &self.kind
    }

    /// Returns where the payload lives.
    #[inline]
    #[must_use]
    pub(crate) const fn placement(&self) -> Placement {
        self.placement
    }

    /// Returns whether readers must understand the section type.
    #[inline]
    #[must_use]
    pub(crate) const fn must_understand(&self) -> bool {
        self.must_understand
    }

    /// Returns the payload range.
    #[inline]
    #[must_use]
    pub(crate) const fn range(&self) -> SectionRange {
        self.range
    }

    /// Returns the payload checksum.
    #[inline]
    #[must_use]
    pub(crate) const fn payload_crc(&self) -> u64 {
        self.payload_crc
    }
}

/// A structurally valid entry whose section type this version does not
/// define.
///
/// The frame (flags, range, checksum) validated; the metadata cannot be, so
/// unknown entries are read-only: they carry what a skipping reader needs
/// and cannot be re-encoded. A reader rejects the container when
/// `must_understand` is set.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct UnknownEntry {
    /// The raw content id, which later versions may draw from any range.
    pub content_id: u128,
    /// The section id within the owning blob.
    pub section_id: u32,
    /// The unrecognized section type value.
    pub type_code: u16,
    /// Whether readers must understand the section type.
    pub must_understand: bool,
    /// Where the payload lives.
    pub placement: Placement,
    /// The payload range.
    pub range: SectionRange,
    /// The payload checksum.
    pub payload_crc: u64,
}

/// A validated occupied directory entry.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Entry {
    /// The blob lookup index.
    Index(IndexEntry),
    /// One blob section.
    Blob(BlobEntry),
}

impl Entry {
    /// Encodes the canonical wire image.
    #[must_use]
    pub(crate) fn encode(&self) -> WireSaltEntry {
        match self {
            Self::Index(index) => WireSaltEntry {
                content_id: wire::CONTAINER_CONTENT_ID.into(),
                section_id: 0.into(),
                section_type: wire::SECTION_TYPE_INDEX.into(),
                flags: 0.into(),
                start: index.range().start().into(),
                end: index.range().end().into(),
                payload_crc: index.payload_crc().into(),
                metadata: [0; wire::ENTRY_METADATA_BYTES],
            },
            Self::Blob(blob) => {
                let mut flags = 0;
                if blob.placement() == Placement::Outline {
                    flags |= ENTRY_FLAG_OUTLINE;
                }
                if blob.must_understand() {
                    flags |= ENTRY_FLAG_MUST_UNDERSTAND;
                }
                WireSaltEntry {
                    content_id: blob.content_id().get().into(),
                    section_id: blob.section_id().into(),
                    section_type: blob.kind().type_code().into(),
                    flags: flags.into(),
                    start: blob.range().start().into(),
                    end: blob.range().end().into(),
                    payload_crc: blob.payload_crc().into(),
                    metadata: blob.kind().encode_metadata(),
                }
            }
        }
    }
}

/// A decoded directory slot.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Slot {
    /// A never-written slot.
    Vacant,
    /// An occupied slot with a known section type.
    Entry(Entry),
    /// An occupied slot with an unrecognized section type.
    Unknown(UnknownEntry),
}

impl Slot {
    /// Encodes the canonical vacant slot image.
    #[must_use]
    pub(crate) const fn vacant_wire() -> WireSaltEntry {
        WireSaltEntry {
            content_id: U128::new(wire::VACANT_CONTENT_ID),
            section_id: U32::new(0),
            section_type: U16::new(0),
            flags: U16::new(0),
            start: U64::new(0),
            end: U64::new(0),
            payload_crc: U64::new(0),
            metadata: [0; wire::ENTRY_METADATA_BYTES],
        }
    }

    /// Decodes one directory slot.
    ///
    /// Returns `None` when the slot violates any structural rule: a vacant
    /// sentinel with nonzero trailing bytes, a zero section type, unknown
    /// flag bits, an empty or inverted range, a misplaced or malformed
    /// index entry, reserved content ids on blob sections, or metadata that
    /// disagrees with a known section type.
    #[must_use]
    pub(crate) fn decode(raw: &WireSaltEntry) -> Option<Self> {
        let raw_id = raw.content_id.get();
        if raw_id == wire::VACANT_CONTENT_ID {
            return wire::all_zero(&raw.as_bytes()[16..]).then_some(Self::Vacant);
        }

        let type_code = raw.section_type.get();
        if type_code == 0 {
            return None;
        }
        let flags = raw.flags.get();
        if flags & !(ENTRY_FLAG_OUTLINE | ENTRY_FLAG_MUST_UNDERSTAND) != 0 {
            return None;
        }
        let placement = if flags & ENTRY_FLAG_OUTLINE == 0 {
            Placement::Inline
        } else {
            Placement::Outline
        };
        let must_understand = flags & ENTRY_FLAG_MUST_UNDERSTAND != 0;
        let range = SectionRange::new(raw.start.get(), raw.end.get())?;
        let payload_crc = raw.payload_crc.get();

        if type_code == wire::SECTION_TYPE_INDEX {
            if raw_id != wire::CONTAINER_CONTENT_ID
                || raw.section_id.get() != 0
                || flags != 0
                || !wire::all_zero(&raw.metadata)
            {
                return None;
            }
            return Some(Self::Entry(Entry::Index(IndexEntry::new(
                range,
                payload_crc,
            )?)));
        }

        if SectionKind::is_blob_type(type_code) {
            let kind = SectionKind::decode(type_code, &raw.metadata)?;
            let content_id = ContentId::new(raw_id)?;
            let blob = BlobEntry::new(
                content_id,
                raw.section_id.get(),
                kind,
                placement,
                must_understand,
                range,
                payload_crc,
            )?;
            return Some(Self::Entry(Entry::Blob(blob)));
        }

        Some(Self::Unknown(UnknownEntry {
            content_id: raw_id,
            section_id: raw.section_id.get(),
            type_code,
            must_understand,
            placement,
            range,
            payload_crc,
        }))
    }
}

/// One blob lookup index record.
///
/// The first slot is nonzero because slot 0 holds the index itself.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct IndexRecord {
    pub content_id: ContentId,
    pub first_slot: NonZero<u32>,
    pub slot_count: NonZero<u32>,
}

impl IndexRecord {
    /// Decodes a persisted index record.
    #[must_use]
    pub(crate) fn decode(raw: &WireIndexRecord) -> Option<Self> {
        Some(Self {
            content_id: ContentId::new(raw.content_id.get())?,
            first_slot: NonZero::new(raw.first_slot.get())?,
            slot_count: NonZero::new(raw.slot_count.get())?,
        })
    }

    /// Encodes the canonical wire image.
    #[must_use]
    pub(crate) const fn encode(&self) -> WireIndexRecord {
        WireIndexRecord {
            content_id: U128::new(self.content_id.get()),
            first_slot: U32::new(self.first_slot.get()),
            slot_count: U32::new(self.slot_count.get()),
        }
    }
}

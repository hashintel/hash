//! Validated directory slots and entries.
//!
//! [`Slot::decode`] is the single entrance for directory slot bytes: it
//! yields a vacant marker, a typed [`Entry`], or a skippable
//! [`UnknownEntry`], and rejects everything else. [`Entry`] values encode
//! back to canonical wire images.
//!
//! Whether an entry's offsets index the inline data region or a blob file
//! is a property of the run's content, stated in the mapping; entries
//! cannot see it, so inline alignment is validated by the container codec.

use zerocopy::{IntoBytes as _, U16, U32, U64};

use super::section::SectionKind;
use crate::{
    file::ll::{
        entry::{DirectoryEntry, METADATA_BYTES, VACANT_SECTION_ID},
        flags::{EntryFlag, EntryFlags},
    },
    integrity::Checksum,
};

// No zerocopy derives: byte-level construction would bypass the reserved
// sentinel.
/// A validated section identifier, unique per store.
///
/// Values exclude the vacant-slot sentinel (`u32::MAX`).
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct SectionId(u32);

impl SectionId {
    /// Creates a section id, rejecting the vacant sentinel.
    #[must_use]
    pub(crate) const fn new(value: u32) -> Option<Self> {
        match value {
            VACANT_SECTION_ID => None,
            _ => Some(Self(value)),
        }
    }

    /// Returns the persisted value.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> u32 {
        self.0
    }
}

// No zerocopy derives: byte-level construction would bypass the ordering
// invariant.
/// A nonempty half-open byte range into a content's bytes.
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

// No zerocopy derives: byte-level construction would bypass the cross-field
// invariants.
/// A validated directory entry.
///
/// A scalar array's range length equals its layout's byte length.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Entry {
    section_id: SectionId,
    kind: SectionKind,
    validation_required: bool,
    volatile: bool,
    range: SectionRange,
    checksum: Checksum,
}

impl Entry {
    /// Creates an entry.
    ///
    /// Returns `None` when a scalar array's byte length does not equal the
    /// range length.
    #[must_use]
    pub(crate) fn new(
        section_id: SectionId,
        kind: SectionKind,
        validation_required: bool,
        volatile: bool,
        range: SectionRange,
        checksum: Checksum,
    ) -> Option<Self> {
        if let SectionKind::ScalarArray(layout) = &kind
            && layout.byte_length() != range.len()
        {
            return None;
        }
        Some(Self {
            section_id,
            kind,
            validation_required,
            volatile,
            range,
            checksum,
        })
    }

    /// Returns the section id.
    #[inline]
    #[must_use]
    pub(crate) const fn section_id(&self) -> SectionId {
        self.section_id
    }

    /// Borrows the section kind.
    #[inline]
    #[must_use]
    pub(crate) const fn kind(&self) -> &SectionKind {
        &self.kind
    }

    /// Returns whether the payload must be validated at open.
    #[inline]
    #[must_use]
    pub(crate) const fn validation_required(&self) -> bool {
        self.validation_required
    }

    /// Returns whether the entry tolerates loss on validation failure.
    #[inline]
    #[must_use]
    pub(crate) const fn volatile(&self) -> bool {
        self.volatile
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
    pub(crate) const fn checksum(&self) -> Checksum {
        self.checksum
    }

    /// Encodes the canonical wire image.
    #[must_use]
    pub(crate) fn encode(&self) -> DirectoryEntry {
        let mut flags = EntryFlags::new();
        if self.validation_required {
            flags.insert(EntryFlag::ValidationRequired);
        }
        if self.volatile {
            flags.insert(EntryFlag::Volatile);
        }
        DirectoryEntry {
            section_id: self.section_id.get().into(),
            section_type: self.kind.type_code().into(),
            flags,
            start: self.range.start().into(),
            end: self.range.end().into(),
            metadata: self.kind.encode_metadata(),
            checksum: self.checksum,
        }
    }
}

/// A structurally valid entry whose section type this version does not
/// define.
///
/// The frame (flags, range, checksum) is validated; the metadata cannot
/// be, so unknown entries are read-only carriers for the skip-or-reject
/// decision and cannot be re-encoded. A reader rejects the container when
/// `validation_required` is set and the entry is not `volatile`; a
/// volatile unknown entry is dropped.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct UnknownEntry {
    /// The section id.
    pub section_id: SectionId,
    /// The unrecognized section type value.
    pub type_code: u16,
    /// Whether the payload must be validated at open.
    pub validation_required: bool,
    /// Whether the entry tolerates loss on validation failure.
    pub volatile: bool,
    /// The payload range.
    pub range: SectionRange,
    /// The payload checksum.
    pub checksum: Checksum,
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
    pub(crate) const fn vacant_wire() -> DirectoryEntry {
        DirectoryEntry {
            section_id: U32::new(VACANT_SECTION_ID),
            section_type: U16::new(0),
            flags: EntryFlags::new(),
            start: U64::new(0),
            end: U64::new(0),
            metadata: [0; METADATA_BYTES],
            checksum: Checksum::from_bytes([0; 8]),
        }
    }

    /// Decodes one directory slot.
    ///
    /// Returns `None` when the slot violates any structural rule: a vacant
    /// sentinel with nonzero trailing bytes, a zero section type, unknown
    /// flag bits, an empty or inverted range, or metadata that disagrees
    /// with a known section type.
    #[must_use]
    pub(crate) fn decode(raw: &DirectoryEntry) -> Option<Self> {
        if raw.section_id.get() == VACANT_SECTION_ID {
            let trailing_zero = raw.as_bytes()[4..].iter().all(|&byte| byte == 0);
            return trailing_zero.then_some(Self::Vacant);
        }
        let section_id =
            SectionId::new(raw.section_id.get()).expect("vacant sentinel is handled above");

        let type_code = raw.section_type.get();
        if type_code == 0 || raw.flags.unknown() != 0 {
            return None;
        }
        let validation_required = raw.flags.contains(EntryFlag::ValidationRequired);
        let volatile = raw.flags.contains(EntryFlag::Volatile);
        let range = SectionRange::new(raw.start.get(), raw.end.get())?;

        if SectionKind::is_known(type_code) {
            let kind = SectionKind::decode(type_code, &raw.metadata)?;
            let entry = Entry::new(
                section_id,
                kind,
                validation_required,
                volatile,
                range,
                raw.checksum,
            )?;
            return Some(Self::Entry(entry));
        }

        Some(Self::Unknown(UnknownEntry {
            section_id,
            type_code,
            validation_required,
            volatile,
            range,
            checksum: raw.checksum,
        }))
    }
}

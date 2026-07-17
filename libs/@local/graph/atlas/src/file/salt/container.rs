//! Validated content mapping records and the container preamble.
//!
//! [`Container::decode`] verifies the preamble's own checksum, so a typed
//! container value certifies an untorn root of trust; encoding computes the
//! checksum, so writers cannot emit a preamble that fails its own frame.

use core::num::NonZero;

use zerocopy::{IntoBytes as _, U32, U128, Unalign};

use crate::{
    file::ll::{
        preamble::{SEGMENT_BYTES, SaltPreamble},
        salt::{SaltFlag, SaltFlags, SaltHeader, SaltMagic, SaltVersion},
        segment::{ContentMapping, INLINE_CONTENT_ID, VACANT_CONTENT_ID},
    },
    integrity::{Checksum, Crc64, Update as _},
};

// No zerocopy derives: byte-level construction would bypass the reserved
// sentinels.
/// A validated blob file identifier.
///
/// Values exclude the inline content id (zero) and the spare marker
/// (`u128::MAX`).
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct BlobId(u128);

impl BlobId {
    /// Creates a blob file id, rejecting the two reserved values.
    #[must_use]
    pub(crate) const fn new(value: u128) -> Option<Self> {
        match value {
            INLINE_CONTENT_ID | VACANT_CONTENT_ID => None,
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

/// What a mapping record's directory segments belong to.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum MappingTarget {
    /// The container's inline data region.
    Inline,
    /// One blob file.
    Blob(BlobId),
    /// Provisioned spare segments, valid only as the final record.
    Spare,
}

impl MappingTarget {
    /// Returns the persisted content id.
    #[inline]
    #[must_use]
    pub(crate) const fn to_wire(self) -> u128 {
        match self {
            Self::Inline => INLINE_CONTENT_ID,
            Self::Blob(id) => id.get(),
            Self::Spare => VACANT_CONTENT_ID,
        }
    }
}

/// A validated content mapping record: one run of directory segments.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct MappingRecord {
    pub target: MappingTarget,
    pub segments: NonZero<u32>,
}

/// A decoded content mapping record slot.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum MappingSlot {
    /// An unoccupied record.
    Unoccupied,
    /// An occupied record.
    Record(MappingRecord),
}

impl MappingSlot {
    /// Decodes one mapping record slot.
    ///
    /// Returns `None` when the record violates any structural rule: a
    /// nonzero reserved field, or a named content with a zero run length.
    #[must_use]
    pub(crate) fn decode(raw: &ContentMapping) -> Option<Self> {
        if raw.reserved != [0; 4] {
            return None;
        }
        let content_id = raw.content_id.get();
        let Some(segments) = NonZero::new(raw.length.get()) else {
            // An unoccupied record is all-zero; a zero-length run for a
            // named content is invalid.
            return (content_id == 0).then_some(Self::Unoccupied);
        };

        let target = match content_id {
            INLINE_CONTENT_ID => MappingTarget::Inline,
            VACANT_CONTENT_ID => MappingTarget::Spare,
            id => MappingTarget::Blob(BlobId::new(id).expect("reserved ids are handled above")),
        };
        Some(Self::Record(MappingRecord { target, segments }))
    }

    /// Encodes the canonical wire image.
    #[must_use]
    pub(crate) const fn encode(&self) -> ContentMapping {
        let (content_id, length) = match self {
            Self::Unoccupied => (0, 0),
            Self::Record(record) => (record.target.to_wire(), record.segments.get()),
        };
        ContentMapping {
            content_id: U128::new(content_id),
            length: U32::new(length),
            reserved: [0; 4],
        }
    }
}

/// The lifecycle state of a container.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ContainerState {
    /// A work in progress: counts are unrecorded.
    Unsealed,
    /// Immutable: counts are authoritative.
    Sealed {
        /// The number of occupied directory entries.
        entry_count: u64,
        /// The exact container file length in bytes.
        container_len: u64,
    },
}

// No zerocopy derives: byte-level construction would bypass the geometry
// invariants and the checksum discipline.
/// A validated container preamble.
///
/// The extension count is nonzero, and a sealed container's length covers
/// at least the preamble and its extensions.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Container {
    extensions: NonZero<u32>,
    state: ContainerState,
}

impl Container {
    /// Creates a container preamble.
    ///
    /// Returns `None` when a sealed container's length is shorter than its
    /// preamble and extensions.
    #[must_use]
    pub(crate) const fn new(extensions: NonZero<u32>, state: ContainerState) -> Option<Self> {
        if let ContainerState::Sealed { container_len, .. } = state
            && container_len < (extensions.get() as u64 + 1) * SEGMENT_BYTES as u64
        {
            return None;
        }
        Some(Self { extensions, state })
    }

    /// Returns the preamble extension count.
    #[inline]
    #[must_use]
    pub(crate) const fn extensions(&self) -> NonZero<u32> {
        self.extensions
    }

    /// Returns the lifecycle state.
    #[inline]
    #[must_use]
    pub(crate) const fn state(&self) -> ContainerState {
        self.state
    }

    /// Decodes and verifies a preamble.
    ///
    /// The magic and version are already pinned by the wire type; this
    /// additionally rejects unknown flag bits, a zero extension count,
    /// nonzero reserved bytes, unsealed counters that are not zero, a
    /// sealed length shorter than the header region, and a segment
    /// checksum that does not match the preamble's bytes.
    #[must_use]
    pub(crate) fn decode(raw: &SaltPreamble) -> Option<Self> {
        if checksum(raw.as_bytes()) != raw.checksum {
            return None;
        }
        let flags = raw.variant.get().flags;
        if flags.unknown() != 0 || raw.reserved != [0; 4056] {
            return None;
        }

        let extensions = NonZero::new(raw.directory_len.get())?;
        let entry_count = raw.total_entry_count.get();
        let container_len = raw.container_len.get();
        let state = if flags.contains(SaltFlag::Sealed) {
            ContainerState::Sealed {
                entry_count,
                container_len,
            }
        } else {
            if entry_count != 0 || container_len != 0 {
                return None;
            }
            ContainerState::Unsealed
        };
        Self::new(extensions, state)
    }

    /// Encodes the canonical wire image, including its checksum.
    #[must_use]
    pub(crate) fn encode(&self) -> SaltPreamble {
        let mut flags = SaltFlags::new();
        let (entry_count, container_len) = match self.state {
            ContainerState::Unsealed => (0, 0),
            ContainerState::Sealed {
                entry_count,
                container_len,
            } => {
                flags.insert(SaltFlag::Sealed);
                (entry_count, container_len)
            }
        };
        let mut raw = SaltPreamble {
            variant: Unalign::new(SaltHeader {
                magic: SaltMagic::MAGIC,
                version: SaltVersion::V1,
                flags,
            }),
            directory_len: self.extensions.get().into(),
            total_entry_count: entry_count.into(),
            container_len: container_len.into(),
            reserved: [0; 4056],
            checksum: Checksum::from_bytes([0; 8]),
        };
        raw.checksum = checksum(raw.as_bytes());
        raw
    }
}

/// Computes the trailing checksum of a header-region segment.
fn checksum(segment: &[u8]) -> Checksum {
    let mut crc = Crc64::new();
    crc.update(&segment[..SEGMENT_BYTES - Checksum::SIZE as usize]);
    crc.finalize()
}

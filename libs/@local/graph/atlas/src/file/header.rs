//! Validated container fixed headers.

use core::num::NonZero;

use zerocopy::byteorder::little_endian::{U32, U64};

use super::wire::{
    self, ENTRIES_PER_SEGMENT, HEADER_FLAG_SEALED, MAX_DIRECTORY_SEGMENTS, SEGMENT_BYTES,
    WireSaltHeader,
};

/// The lifecycle state of a container.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ContainerState {
    /// A work in progress: counts are unrecorded and directory-segment
    /// checksums are zero.
    Unsealed,
    /// Immutable: counts are authoritative and every checksum is written.
    Sealed {
        /// The number of occupied directory slots.
        entry_count: u64,
        /// The exact container file length in bytes.
        total_bytes: u64,
    },
}

// No zerocopy derives: byte-level construction would bypass the capacity
// and length invariants.
/// A validated fixed header.
///
/// The directory segment count is within the format cap, and a sealed
/// header's counts fit its own geometry: the entry count is at most the
/// directory capacity and the total length covers at least the header
/// region.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Header {
    directory_segments: NonZero<u32>,
    state: ContainerState,
}

impl Header {
    /// Creates a header.
    ///
    /// Returns `None` when the directory exceeds
    /// [`MAX_DIRECTORY_SEGMENTS`], a sealed entry count exceeds the
    /// directory capacity, or a sealed total length is shorter than the
    /// header region.
    #[must_use]
    pub(crate) const fn new(
        directory_segments: NonZero<u32>,
        state: ContainerState,
    ) -> Option<Self> {
        if directory_segments.get() > MAX_DIRECTORY_SEGMENTS {
            return None;
        }
        if let ContainerState::Sealed {
            entry_count,
            total_bytes,
        } = state
        {
            let segments = NonZero::<u64>::from(directory_segments).get();
            if entry_count > segments * ENTRIES_PER_SEGMENT as u64 {
                return None;
            }
            if total_bytes < (segments + 1) * SEGMENT_BYTES as u64 {
                return None;
            }
        }
        Some(Self {
            directory_segments,
            state,
        })
    }

    /// Returns the directory segment count.
    #[inline]
    #[must_use]
    pub(crate) const fn directory_segments(&self) -> NonZero<u32> {
        self.directory_segments
    }

    /// Returns the number of directory entry slots.
    #[inline]
    #[must_use]
    pub(crate) const fn slot_capacity(&self) -> u64 {
        u64::from(self.directory_segments.get()) * ENTRIES_PER_SEGMENT as u64
    }

    /// Returns the lifecycle state.
    #[inline]
    #[must_use]
    pub(crate) const fn state(&self) -> ContainerState {
        self.state
    }

    /// Decodes a persisted fixed header.
    ///
    /// Returns `None` for a wrong magic or version, unknown flag bits, a
    /// zero or over-cap directory segment count, an unsealed header with
    /// nonzero counts, or a sealed header whose counts violate its
    /// geometry.
    #[must_use]
    pub(crate) fn decode(raw: &WireSaltHeader) -> Option<Self> {
        if raw.magic != *wire::SALT_MAGIC || raw.version.get() != wire::SALT_VERSION {
            return None;
        }
        let flags = raw.flags.get();
        if flags & !HEADER_FLAG_SEALED != 0 {
            return None;
        }

        let directory_segments = NonZero::new(raw.directory_segments.get())?;
        let entry_count = raw.entry_count.get();
        let total_bytes = raw.total_bytes.get();
        let state = if flags & HEADER_FLAG_SEALED == 0 {
            if entry_count != 0 || total_bytes != 0 {
                return None;
            }
            ContainerState::Unsealed
        } else {
            ContainerState::Sealed {
                entry_count,
                total_bytes,
            }
        };
        Self::new(directory_segments, state)
    }

    /// Encodes the canonical wire image.
    #[must_use]
    pub(crate) const fn encode(&self) -> WireSaltHeader {
        let (flags, entry_count, total_bytes) = match self.state {
            ContainerState::Unsealed => (0, 0, 0),
            ContainerState::Sealed {
                entry_count,
                total_bytes,
            } => (HEADER_FLAG_SEALED, entry_count, total_bytes),
        };
        WireSaltHeader {
            magic: *wire::SALT_MAGIC,
            version: U32::new(wire::SALT_VERSION),
            flags: U32::new(flags),
            directory_segments: U32::new(self.directory_segments.get()),
            entry_count: U64::new(entry_count),
            total_bytes: U64::new(total_bytes),
        }
    }
}

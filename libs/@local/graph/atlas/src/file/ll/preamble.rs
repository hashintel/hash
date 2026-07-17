//! The first segment of a container.
//!
//! A [`Preamble`] is generic over its identity prefix so every container
//! format shares one geometry: `.salt` uses [`SaltPreamble`] and `.quad`
//! will instantiate its own variant. The identity prefix is a
//! [`zerocopy::TryFromBytes`] type, so reading a preamble for the wrong
//! format or an unsupported version fails at the byte level.

use core::fmt;

use zerocopy::{LE, U32, U64, Unalign};

use super::salt::SaltHeader;
use crate::integrity::Checksum;

/// Size of every segment in the header region.
pub(crate) const SEGMENT_BYTES: usize = 4096;

/// The first 4096 bytes of a container.
///
/// `directory_len` is the number of preamble extension segments that follow
/// segment 0; it is fixed when the container is created. The two counters
/// are authoritative only in a sealed container and zero while unsealed:
/// `total_entry_count` is the number of occupied directory entries and
/// `container_len` the exact file length. The checksum covers every
/// preceding byte of the segment.
#[derive(
    zerocopy::TryFromBytes, zerocopy::IntoBytes, zerocopy::Immutable, zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct Preamble<T> {
    // `Unalign` erases the variant's alignment so the zerocopy derives can
    // prove padding-freedom for any `T`; concrete variants are align-4 at
    // offset 0, so reads through `Unalign::get` compile to plain loads.
    pub variant: Unalign<T>,
    pub directory_len: U32<LE>,
    pub total_entry_count: U64<LE>,
    pub container_len: U64<LE>,
    pub reserved: [u8; 4056],
    pub checksum: Checksum,
}

// Manual impls instead of derives: `Unalign`'s `Debug`/`PartialEq` go
// through `Deref` and would demand `T: Unaligned`; `get` only needs `Copy`.
impl<T: Copy + fmt::Debug> fmt::Debug for Preamble<T> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Preamble")
            .field("variant", &self.variant.get())
            .field("directory_len", &self.directory_len)
            .field("total_entry_count", &self.total_entry_count)
            .field("container_len", &self.container_len)
            .field("checksum", &self.checksum)
            .finish_non_exhaustive()
    }
}

impl<T: Copy + PartialEq> PartialEq for Preamble<T> {
    fn eq(&self, other: &Self) -> bool {
        self.variant.get() == other.variant.get()
            && self.directory_len == other.directory_len
            && self.total_entry_count == other.total_entry_count
            && self.container_len == other.container_len
            && self.reserved == other.reserved
            && self.checksum == other.checksum
    }
}

pub(crate) type SaltPreamble = Preamble<SaltHeader>;

const _: () = {
    assert!(size_of::<SaltPreamble>() == SEGMENT_BYTES);
};

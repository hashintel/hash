// new identity version <- WIP, me just doing silly things

// Each of them is built the same, first: the header
use zerocopy::{LE, U32, U64, Unalign};

use crate::file::region::PAGE;

// The shared page is the header's size; the offset chain and the
// write path both count regions from one header page.
const _: () = assert!(size_of::<FileHeader>() as u64 == PAGE);

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
    Identity = u64::from_le_bytes(*b"SALTIDNT"),
}

/// The `SALTIDNT` magic. Byte-level construction admits no other value.
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
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Identity);
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

/// The 4096-byte header of an identity file.
#[derive(
    Copy,
    Clone,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub struct PartialFileHeader {
    magic: Unalign<FileHeaderMagic>,
    version: Unalign<Version>,
    key_width: U32<LE>,
    rows: U64<LE>,
    stride: U32<LE>,
}

#[derive(
    Copy,
    Clone,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub struct FileHeader {
    header: PartialFileHeader,
    padding: [u8; (PAGE as usize) - size_of::<PartialFileHeader>()],
}

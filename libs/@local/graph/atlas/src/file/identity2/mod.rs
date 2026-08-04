// new identity version <- WIP, me just doing silly things

mod read;
mod write;

// Each of them is built the same, first: the header
use core::fmt;

use zerocopy::{LE, U64, Unalign};

use super::region::header::header;
use crate::dataset::{ArchivedEntityId, ArchivedOntologyTypeUuid};

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
    V1 = 1,
}

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
#[repr(u16)]
pub(crate) enum Kind {
    Ontology = 0,
    Nodes = 1,
    Edges = 2,
}

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
#[repr(u16)]
pub(crate) enum KeyKind {
    OntologyTypeUuid = 0x00_00,
    EntityId = 0x00_01,
    U8Le = 0x01_00,
    U16Le = 0x01_01,
    U64Le = 0x01_02,
}

impl KeyKind {
    pub(crate) const fn width(self) -> usize {
        match self {
            Self::OntologyTypeUuid => size_of::<ArchivedOntologyTypeUuid>(),
            Self::EntityId => size_of::<ArchivedEntityId>(),
            Self::U8Le => size_of::<u8>(),
            Self::U16Le => size_of::<u16>(),
            Self::U64Le => size_of::<u64>(),
        }
    }
}

// 0..8: "SALTIDNT"
// 8..12: (layout version) 1
// 12..14: (kind) 0=ontology 1=nodes 2=edges
// 14..18: row count `N`
// 18..20: key type
// 20..22: key width (<- i wonder if this is really needed)
// ..4096: [reserved]
// first page:
// 4096..A: [key width] * N <- mapping of row index to key
// next_multiple_of(A, 4096)..B: [fst of key bytes to index]
// depending on kind:
// kind = 0:
// next_multiple_of(B, 4096)..C: [offset u64, length u64] * N (offset into icon table)
// kind = 1,2:
// next_multiple_of(B, 4096)..C: [offset u64, length u64] * N (offset into label table)
//
// trailer:
// next_multiple_of(C, 4096)..: [binary data] <- string data trailer
/// The 4096-byte header of an identity file.
#[derive(
    Copy,
    Clone,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
#[repr(C)]
pub(crate) struct FileHeader {
    magic: Unalign<FileHeaderMagic>,
    version: Unalign<Version>,
    kind: Unalign<Kind>,
    rows: U64<LE>,
    key_kind: Unalign<KeyKind>,
}

impl FileHeader {
    pub(crate) const fn new(kind: Kind, rows: u64, key_kind: KeyKind) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V1),
            kind: Unalign::new(kind),
            rows: U64::new(rows),
            key_kind: Unalign::new(key_kind),
        }
    }
}

header!(FileHeader);

impl fmt::Debug for FileHeader {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        // TODO: actually finish this
        fmt.debug_struct("FileHeader").finish_non_exhaustive()
    }
}

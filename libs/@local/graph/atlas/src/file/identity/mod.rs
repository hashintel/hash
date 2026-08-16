//! An identity file binds a row domain to its source identifiers and their display bytes.
//!
//! Layout version 3 is mutable: change the layout to fit what the pipeline needs and increment
//! [`Version`] when you do. The pinned parse rejects bytes of every other version, which is the
//! intended failure mode. A fresh generation replaces the files a layout change strands.
//!
//! One file covers one row domain (nodes, edges, or ontology types). It binds each row to its
//! source identifier in both directions and carries one display payload per row: legend bytes
//! for nodes and edges, icon bytes for ontology types. `row → key` is indexing into the key column,
//! `key → row` is one lookup in the index, and `row → payload` is indexing into the span table
//! and slicing the payload region. Keys are opaque fixed-width byte strings whose width `K` the
//! [`KeyKind`] declares. The regions:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTIDNT`                                |
//! | 8      | 4    | layout version, `u32` = 3                       |
//! | 12     | 4    | machine information, [`Machine`]                |
//! | 16     | 2    | file kind, `u16`, what the payload means        |
//! | 18     | 2    | key kind, `u16`, the key type and width `K`     |
//! | 20     | 8    | row count `N`, `u64`                            |
//! | 28     | 8    | index size `F`, `u64`, exact index bytes        |
//! | 36     | 8    | payload size `P`, `u64`, exact payload bytes    |
//! | 44     | 4052 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | keys: `[u8; K][N]` in row order;                |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | index: `F` bytes, an fst map of key bytes → row |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | spans: `(offset u64, length u64)[N]` in row     |
//! |        |      | order, payload-relative;                        |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | payload: `P` bytes the spans carve              |
//! ```
//!
//! The index region holds an [`fst::Map`] in the fst crate's own versioned format, mapping each
//! key's bytes to its row. Its byte size depends on the keys themselves, so the header records it
//! exactly. The header records the payload size the same way, because interning deduplicates the
//! payload region and its size depends on the values. All region offsets derive from the header
//! fields with checked arithmetic ([`FileHeader::expected_file_len`]); a header whose geometry
//! overflows matches no real file. Every key kind is at least one byte wide, so a parsed header
//! never describes zero-width keys. Every region starts on a 4096-byte boundary, so the
//! whole-file-mapping alignment guarantee of the array format applies unchanged. A reader maps
//! the whole file and slices it rather than mmapping at a file offset.
//!
//! [`read::IdentityFile`] opens a file under these rules and hands out the regions, and
//! [`write::write_regions`] streams them into place. The format owns geometry alone. The table's
//! domain invariants (index agreement with the key column, spans lying inside the payload) are
//! the typed table's contract, validated where the typed table lives. The header's machine
//! information ([`Machine`]) records the writing machine. Every multi-byte field pins
//! little-endian, so the file reads exactly on either byte order and opening compares nothing
//! against the host.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the fields are little endian, while the magic discriminant stores native endian, so \
              a cross-endian reader fails loudly at the magic instead of misreading fields"
)]

use core::fmt;

use hashql_core::id::Id;
use zerocopy::{LE, U16, U64, Unalign};

use super::region::{header::header, machine::Machine};
use crate::{
    file::region::{ByteStable, PAGE, padded_size},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
};

pub(crate) mod read;
#[cfg(test)]
mod tests;
pub(crate) mod write;

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
    V3 = 3,
}

/// The row domain an identity file covers.
///
/// The kind decides what the payload region holds: icon bytes for [`Ontology`](Self::Ontology)
/// files, legend bytes for [`Nodes`](Self::Nodes) and [`Edges`](Self::Edges) files.
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
pub enum Kind {
    /// Ontology types: the payload holds icons.
    Ontology = 0,
    /// Nodes: the payload holds labels.
    Nodes = 1,
    /// Edges: the payload holds labels.
    Edges = 2,
}

impl fmt::Display for Kind {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(match self {
            Self::Ontology => "ontology",
            Self::Nodes => "nodes",
            Self::Edges => "edges",
        })
    }
}

/// The type and width of an identity file's keys.
///
/// A key is opaque at this layer. The kind pins its width and the [`Key`] type it reads back as,
/// and byte order is the only order keys carry.
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
pub enum KeyKind {
    /// An [`ArchivedOntologyTypeUuid`].
    OntologyTypeUuid = 0x00_00,
    /// An [`ArchivedEntityId`].
    EntityId = 0x00_01,
    /// A `u8`.
    U8Le = 0x01_00,
    /// A [`U16<LE>`].
    U16Le = 0x01_01,
    /// A [`U64<LE>`].
    U64Le = 0x01_02,
}

impl KeyKind {
    /// Returns the key width `K`, in bytes.
    pub(crate) const fn width(self) -> usize {
        match self {
            Self::OntologyTypeUuid => size_of::<ArchivedOntologyTypeUuid>(),
            Self::EntityId => size_of::<ArchivedEntityId>(),
            Self::U8Le => size_of::<u8>(),
            Self::U16Le => size_of::<U16<LE>>(),
            Self::U64Le => size_of::<U64<LE>>(),
        }
    }
}

impl fmt::Display for KeyKind {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(match self {
            Self::OntologyTypeUuid => "ontology-type-uuid",
            Self::EntityId => "entity-id",
            Self::U8Le => "u8",
            Self::U16Le => "u16-le",
            Self::U64Le => "u64-le",
        })
    }
}

/// A type an identity file's keys read back as.
///
/// The implementation pins the [`KeyKind`] the header persists. The kind's declared width equals
/// the type's size, so a key region reads back as a slice of this type at any alignment.
pub(crate) trait Key: ByteStable {
    /// The persisted key kind.
    const KIND: KeyKind;

    /// The typed view of this key's display payload.
    ///
    /// A row's payload enters the file as the value's raw bytes. Opening a typed table casts
    /// every span once, validating on the way, and readback trusts that validation. Each
    /// payload type defines its own empty value, which is what a row without a display value
    /// carries. The header pins [`KIND`](Self::KIND) but not the payload type, so two `Key`
    /// impls sharing a kind may cast one file's payloads differently. The open-time casts
    /// validate per impl, so a mismatched open fails loudly instead of misreading bytes.
    type Payload: zerocopy::IntoBytes
        + zerocopy::Immutable
        + zerocopy::KnownLayout
        + zerocopy::TryFromBytes
        + ToOwned
        + ?Sized;
}

/// A row identity type an identity file's rows belong to.
///
/// The implementation pins the [`Kind`] the header persists, so a file reopens only under the
/// row type that wrote it.
pub(crate) trait Row: Id {
    /// The persisted row domain.
    const KIND: Kind;
}

impl Row for OntologyRowId {
    const KIND: Kind = Kind::Ontology;
}

impl Row for NodeRowId {
    const KIND: Kind = Kind::Nodes;
}

impl Row for EdgeRowId {
    const KIND: Kind = Kind::Edges;
}

/// One row's slice of the payload region.
///
/// Offset and length are payload-relative byte counts. Rows carrying equal payload bytes may
/// share one span, so equality of spans never distinguishes rows.
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
    zerocopy::Unaligned,
)]
#[repr(C)]
pub(crate) struct PayloadSpan {
    offset: U64<LE>,
    length: U64<LE>,
}

impl PayloadSpan {
    /// Creates a span of `length` bytes at the payload-relative `offset`.
    #[must_use]
    pub(crate) const fn new(offset: u64, length: u64) -> Self {
        Self {
            offset: U64::new(offset),
            length: U64::new(length),
        }
    }

    /// Returns the payload-relative byte offset.
    #[inline]
    #[must_use]
    pub(crate) const fn offset(&self) -> u64 {
        self.offset.get()
    }

    /// Returns the byte length.
    #[inline]
    #[must_use]
    pub(crate) const fn length(&self) -> u64 {
        self.length.get()
    }
}

/// The header of an identity file.
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
    machine: Machine,
    kind: Unalign<Kind>,
    key_kind: Unalign<KeyKind>,
    rows: U64<LE>,
    index_bytes: U64<LE>,
    payload_bytes: U64<LE>,
}

header!(FileHeader, FileHeaderMagic, Version::V3);

impl FileHeader {
    /// Creates a header for `rows` keys of `key_kind`, an `index_bytes`-byte index, and a
    /// `payload_bytes`-byte payload.
    #[must_use]
    pub(crate) const fn new(
        kind: Kind,
        key_kind: KeyKind,
        rows: u64,
        index_bytes: u64,
        payload_bytes: u64,
    ) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V3),
            machine: Machine::current(),
            kind: Unalign::new(kind),
            key_kind: Unalign::new(key_kind),
            rows: U64::new(rows),
            index_bytes: U64::new(index_bytes),
            payload_bytes: U64::new(payload_bytes),
        }
    }

    /// Returns the row domain the file covers.
    #[inline]
    #[must_use]
    pub(crate) fn kind(&self) -> Kind {
        self.kind.get()
    }

    /// Returns the key kind: the key type and width `K`.
    #[inline]
    #[must_use]
    pub(crate) fn key_kind(&self) -> KeyKind {
        self.key_kind.get()
    }

    /// Returns the row count `N`.
    #[inline]
    #[must_use]
    pub(crate) const fn rows(&self) -> u64 {
        self.rows.get()
    }

    /// Returns the exact byte size `F` of the index region.
    #[inline]
    #[must_use]
    pub(crate) const fn index_bytes(&self) -> u64 {
        self.index_bytes.get()
    }

    /// Returns the exact byte size `P` of the payload region.
    #[inline]
    #[must_use]
    pub(crate) const fn payload_bytes(&self) -> u64 {
        self.payload_bytes.get()
    }

    /// Returns the offset of the index region.
    ///
    /// The key column sits between the header and this offset, zero padded to the boundary.
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) fn index_offset(&self) -> Option<u64> {
        PAGE.checked_add(padded_size(self.rows(), self.key_kind().width() as u64)?)
    }

    /// Returns the offset of the span table.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) fn spans_offset(&self) -> Option<u64> {
        self.index_offset()?
            .checked_add(padded_size(self.index_bytes(), 1)?)
    }

    /// Returns the offset of the payload region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) fn payload_offset(&self) -> Option<u64> {
        self.spans_offset()?
            .checked_add(padded_size(self.rows(), size_of::<PayloadSpan>() as u64)?)
    }

    /// Returns the exact file length the header describes.
    ///
    /// Opening rejects a file whose length differs from this value. Returns `None` when the
    /// geometry overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn expected_file_len(&self) -> Option<u64> {
        self.payload_offset()?.checked_add(self.payload_bytes())
    }
}

// Manual impl instead of a derive: `Unalign`'s `Debug` goes through
// `Deref` and would demand `Unaligned` of the pinned enums; `get` only
// needs `Copy`. No equality on purpose: callers compare the observable
// they mean.
impl fmt::Debug for FileHeader {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("FileHeader")
            .field("magic", &self.magic.get())
            .field("version", &self.version.get())
            .field("machine", &self.machine)
            .field("kind", &self.kind.get())
            .field("key_kind", &self.key_kind.get())
            .field("rows", &self.rows)
            .field("index_bytes", &self.index_bytes)
            .field("payload_bytes", &self.payload_bytes)
            .finish_non_exhaustive()
    }
}

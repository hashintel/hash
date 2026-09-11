//! The attraction file format for relation groups over a flat edge array.
//!
//! Layout version 2 is mutable. Change the layout to fit what the pipeline needs and increment
//! [`Version`] when you do. The pinned parse rejects bytes of every other version, which is the
//! intended failure mode. A fresh generation replaces the files a layout change strands.
//!
//! The group records delimit ranges of the edge array and have no meaning without it, so one
//! combined file holds both regions and they cannot fall out of sync. The regions:
//!
//! ```text
//! | offset | size   | region                                        |
//! |--------|--------|-----------------------------------------------|
//! | 0      | 8      | magic `SALTATRC`                              |
//! | 8      | 4      | layout version, `u32` = 2                     |
//! | 12     | 4      | machine information, [`Machine`]              |
//! | 16     | 2      | node row kind, `u16`                          |
//! | 18     | 2      | edge row kind, `u16`                          |
//! | 20     | 8      | group count `G`, `u64`                        |
//! | 28     | 8      | edge count `E`, `u64`                         |
//! | 36     | 8      | corpus row count `N`, `u64`                   |
//! | 44     | 4052   | padding; writers emit zero, readers ignore    |
//! | 4096   | G · 32 | groups: [`GroupRecord`] per relation group;   |
//! |        |        | zero padding to the next 4096-byte boundary   |
//! | ...    | E · 48 | edges: [`EdgeRecord`] in group-major order    |
//! ```
//!
//! Group `i` owns the edge rows `edge_offset[i] .. edge_offset[i + 1]`, with the final group
//! ending at `E`. Edge records within one group keep the order the index defines; consumers
//! address edges by `(group, offset)` and never re-sort. Records store the crate's row ids in
//! their persisted little-endian form and their float quantities in the writer's native order
//! behind validated scalar types, so a mapped region reads back typed rows with no conversion on
//! either side. The header pins who may read those records. Its machine information ([`Machine`])
//! records the writer's byte order, which opening verifies against the reader's, and its kind
//! fields persist
//! the [`NodeRow`] and [`EdgeRow`] implementations that wrote the file, which opening validates
//! against the requested types: a file reopens only on the byte order and under the row types
//! that wrote it. A row domain's kind value is zero exactly when it is its slot's founding
//! domain, so zero is each slot's default. All region offsets derive from `G` and `E` with
//! checked arithmetic ([`FileHeader::expected_file_len`]), and a header whose geometry overflows
//! matches no real file.
//! Every region starts on a 4096-byte boundary, so the whole-file-mapping alignment guarantee of
//! the array format applies unchanged. Map the whole file and slice, never mmap at a file offset.
//!
//! [`read::AttractionFile`] opens a file under these rules and hands out the raw typed regions;
//! [`write::write_records`] streams them into place. The records' field domains validate as the
//! bytes parse, so an open file never serves a weight, confidence or normalization outside its
//! type's range. The index's ordering invariants (ascending relations, contiguous non-empty
//! ranges, in-group edge order) and the score-provenance bits are `salt::relation`'s artifact
//! contract, validated where the domain types live.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the id and count fields are little endian, while the magic discriminant stores \
              native endian, so a cross-endian reader fails loudly at the magic instead of \
              misreading fields"
)]

use core::fmt;

use zerocopy::{LE, U32, U64, Unalign};

pub(crate) mod read;
#[cfg(test)]
mod tests;
pub(crate) mod write;

use hashql_core::id::Id;

use super::region::machine::Machine;
use crate::{
    file::region::{ByteStable, PAGE, header::header, padded_size},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::{NonNegative, PositiveUnitFraction, UnitFraction},
};

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
    Attraction = u64::from_le_bytes(*b"SALTATRC"),
}

/// The `SALTATRC` magic. Byte-level construction admits no other value.
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
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Attraction);
}

/// A layout version this module implements.
///
/// Byte-level construction admits no other value. Increment this on any layout change.
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
    V2 = 2,
}

/// The row domain of an attraction file's endpoint columns.
///
/// Byte-level construction admits only declared kinds, so a header naming an unminted domain
/// fails the parse. A domain joining this slot mints the next value.
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
pub(crate) enum NodeKind {
    /// Corpus node rows.
    NodeRowId = 0,
}

impl fmt::Display for NodeKind {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(match self {
            Self::NodeRowId => "NodeRowId",
        })
    }
}

/// The row domain of an attraction file's edge column.
///
/// Byte-level construction admits only declared kinds, so a header naming an unminted domain
/// fails the parse. A domain joining this slot mints the next value.
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
pub(crate) enum EdgeKind {
    /// Corpus edge rows.
    EdgeRowId = 0,
}

impl fmt::Display for EdgeKind {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(match self {
            Self::EdgeRowId => "EdgeRowId",
        })
    }
}

/// A row type an edge record's source and target columns carry.
///
/// The implementation pins the [`NodeKind`] the header persists, so a file reopens only under
/// the node type that wrote it.
pub(crate) trait NodeRow: Id + ByteStable {
    /// The persisted node row kind.
    const KIND: NodeKind;
}

impl NodeRow for NodeRowId {
    const KIND: NodeKind = NodeKind::NodeRowId;
}

/// A row type an edge record's edge column carries.
///
/// The implementation pins the [`EdgeKind`] the header persists, so a file reopens only under
/// the edge type that wrote it.
pub(crate) trait EdgeRow: Id + ByteStable {
    /// The persisted edge row kind.
    const KIND: EdgeKind;
}

impl EdgeRow for EdgeRowId {
    const KIND: EdgeKind = EdgeKind::EdgeRowId;
}

/// A relation group's identity, shared weights, and edge range.
///
/// The range starts at [`edge_offset`](Self::edge_offset) and ends at the next group's, or at
/// the file's edge count for the final group.
// The weight fields carry their domains in their types, so the parse refuses an out-of-domain
// value. The row id and the offset are unconstrained primitive encodings, and the mapped bridge
// validates the domain rules over them (ordering, ranges) rather than the record.
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct GroupRecord {
    relation: OntologyRowId,
    edge_offset: U64<LE>,
    coincident: NonNegative,
    proximal: NonNegative,
    strength: NonNegative,
    /// Alignment filler; writers emit zero, readers ignore.
    reserved: U32<LE>,
}

impl GroupRecord {
    /// Creates a group record.
    ///
    /// `edge_offset` is the position of the group's first edge record in the edge region. The
    /// class weights and the strength multiplier carry their domains in their types, so the
    /// record holds no value its fields refuse.
    #[must_use]
    pub(crate) const fn new(
        relation: OntologyRowId,
        edge_offset: u64,
        coincident: NonNegative,
        proximal: NonNegative,
        strength: NonNegative,
    ) -> Self {
        Self {
            relation,
            edge_offset: U64::new(edge_offset),
            coincident,
            proximal,
            strength,
            reserved: U32::new(0),
        }
    }

    /// Returns the relation's ontology row.
    #[inline]
    #[must_use]
    pub(crate) const fn relation(&self) -> OntologyRowId {
        self.relation
    }

    /// Returns the position of the group's first edge record.
    #[inline]
    #[must_use]
    pub(crate) const fn edge_offset(&self) -> u64 {
        self.edge_offset.get()
    }

    /// Returns the Coincident class weight `κ_C · p*_C`.
    #[inline]
    #[must_use]
    pub(crate) const fn coincident(&self) -> NonNegative {
        self.coincident
    }

    /// Returns the Proximal class weight `p*_P`.
    #[inline]
    #[must_use]
    pub(crate) const fn proximal(&self) -> NonNegative {
        self.proximal
    }

    /// Returns the frozen strength multiplier `h`.
    #[inline]
    #[must_use]
    pub(crate) const fn strength(&self) -> NonNegative {
        self.strength
    }
}

/// One force-bearing link instance.
///
/// `N` is the endpoint row domain and `E` the edge row domain, pinned by the file header's kind
/// fields.
// `FromBytes` is sound here. The row ids and every scalar are unconstrained primitive encodings,
// and the mapped bridge validates the domain rules over them (row domain, score ranges, in-group
// order) rather than the record.
#[derive(
    Copy,
    Clone,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct EdgeRecord<N, E> {
    edge: E,
    source: N,
    target: N,
    confidence: Unalign<UnitFraction>,
    normalization: Unalign<PositiveUnitFraction>,
    scored: u8,
    /// Alignment filler; writers emit zero, readers ignore.
    reserved: [u8; 7],
}

impl<N, E> EdgeRecord<N, E>
where
    N: NodeRow,
    E: EdgeRow,
{
    /// Creates an edge record.
    ///
    /// `confidence` and `normalization` carry their domains in their types. The `scored`
    /// provenance bits enter verbatim: the record constrains them nowhere, and the mapped bridge
    /// validates them at its own open.
    #[must_use]
    pub(crate) const fn new(
        edge: E,
        source: N,
        target: N,
        confidence: UnitFraction,
        normalization: PositiveUnitFraction,
        scored: u8,
    ) -> Self {
        Self {
            edge,
            source,
            target,
            confidence: Unalign::new(confidence),
            normalization: Unalign::new(normalization),
            scored,
            reserved: [0; 7],
        }
    }

    /// Returns the edge row the instance came from.
    #[inline]
    #[must_use]
    pub(crate) const fn edge(&self) -> E {
        self.edge
    }

    /// Returns the endpoint row the link points from.
    #[inline]
    #[must_use]
    pub(crate) const fn source(&self) -> N {
        self.source
    }

    /// Returns the endpoint row the link points to.
    #[inline]
    #[must_use]
    pub(crate) const fn target(&self) -> N {
        self.target
    }

    /// Returns the effective confidence `c`.
    #[inline]
    #[must_use]
    pub(crate) fn confidence(&self) -> UnitFraction {
        self.confidence.get()
    }

    /// Returns the degree normalization `ν`.
    #[inline]
    #[must_use]
    pub(crate) fn normalization(&self) -> PositiveUnitFraction {
        self.normalization.get()
    }

    /// Returns the score provenance bits: link, source, and target presence in the three lowest
    /// bits.
    #[inline]
    #[must_use]
    pub(crate) const fn scored(&self) -> u8 {
        self.scored
    }
}

impl<N: fmt::Debug, E: fmt::Debug> fmt::Debug for EdgeRecord<N, E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("EdgeRecord")
            .field("edge", &self.edge)
            .field("source", &self.source)
            .field("target", &self.target)
            .field("confidence", &self.confidence.get())
            .field("normalization", &self.normalization.get())
            .field("scored", &self.scored)
            .field("reserved", &self.reserved)
            .finish()
    }
}

/// The header of an attraction file.
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
    node_kind: Unalign<NodeKind>,
    edge_kind: Unalign<EdgeKind>,
    groups: U64<LE>,
    edges: U64<LE>,
    rows: U64<LE>,
}

header!(FileHeader, FileHeaderMagic, Version::V2);

impl FileHeader {
    /// Creates an attraction file header.
    ///
    /// The header records `groups` relation groups over `edges` edge records spanning `rows`
    /// corpus rows, with the kind fields naming the row domains the edge records carry.
    #[must_use]
    pub(crate) const fn new(
        node_kind: NodeKind,
        edge_kind: EdgeKind,
        groups: u64,
        edges: u64,
        rows: u64,
    ) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V2),
            machine: Machine::current(),
            node_kind: Unalign::new(node_kind),
            edge_kind: Unalign::new(edge_kind),
            groups: U64::new(groups),
            edges: U64::new(edges),
            rows: U64::new(rows),
        }
    }

    /// Returns the endpoint row domain of the edge records' source and target columns.
    #[inline]
    #[must_use]
    pub(crate) fn node_kind(&self) -> NodeKind {
        self.node_kind.get()
    }

    /// Returns the edge row domain of the edge records' edge column.
    #[inline]
    #[must_use]
    pub(crate) fn edge_kind(&self) -> EdgeKind {
        self.edge_kind.get()
    }

    /// Returns the group count `G`.
    #[inline]
    #[must_use]
    pub(crate) const fn groups(&self) -> u64 {
        self.groups.get()
    }

    /// Returns the edge count `E`.
    #[inline]
    #[must_use]
    pub(crate) const fn edges(&self) -> u64 {
        self.edges.get()
    }

    /// Returns the corpus row count `N` the edges index into.
    #[inline]
    #[must_use]
    pub(crate) const fn rows(&self) -> u64 {
        self.rows.get()
    }

    /// Returns the offset of the edges region.
    ///
    /// The groups region sits between the header and this offset, zero padded to the boundary.
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn edges_offset(&self) -> Option<u64> {
        PAGE.checked_add(padded_size(self.groups(), size_of::<GroupRecord>() as u64)?)
    }

    /// Returns the exact file length the header describes.
    ///
    /// The edge record width follows the row domains, so the caller instantiates it:
    /// `edge_record_bytes` is the size of [`EdgeRecord`] at the domain types the kind fields
    /// name. The open path rejects a file whose length differs from this value. Returns `None`
    /// when the geometry overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) const fn expected_file_len(&self, edge_record_bytes: u64) -> Option<u64> {
        let edge_bytes = self.edges().checked_mul(edge_record_bytes)?;
        self.edges_offset()?.checked_add(edge_bytes)
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
            .field("node_kind", &self.node_kind.get())
            .field("edge_kind", &self.edge_kind.get())
            .field("groups", &self.groups)
            .field("edges", &self.edges)
            .field("rows", &self.rows)
            .finish_non_exhaustive()
    }
}

const _: () = assert!(size_of::<GroupRecord>() == 32);
const _: () = assert!(size_of::<EdgeRecord<NodeRowId, EdgeRowId>>() == 48);

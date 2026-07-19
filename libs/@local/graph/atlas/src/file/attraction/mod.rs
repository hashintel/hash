//! The attraction file: relation groups over a flat edge array.
//!
//! Layout version 0 is **mutable**: change the layout freely to fit what
//! the pipeline needs and increment [`Version`] when you do. The pinned
//! parse rejects bytes of other versions, which is the intended failure
//! mode; no migration or compatibility machinery exists on purpose until
//! the format stabilizes.
//!
//! This is a combined file: the group records delimit ranges of the edge
//! array, meaningless without it, and always read with it, so both live
//! in one file and cannot fall out of sync. The regions:
//!
//! ```text
//! | offset | size   | region                                        |
//! |--------|--------|-----------------------------------------------|
//! | 0      | 8      | magic `SALTATRC`                              |
//! | 8      | 4      | layout version, `u32` = 0                     |
//! | 12     | 4      | padding; writers emit zero, readers ignore    |
//! | 16     | 8      | group count `G`, `u64`                        |
//! | 24     | 8      | edge count `E`, `u64`                         |
//! | 32     | 8      | corpus row count `N`, `u64`                   |
//! | 40     | 4056   | padding; writers emit zero, readers ignore    |
//! | 4096   | G * 32 | groups: [`GroupRecord`] per relation group;   |
//! |        |        | zero padding to the next 4096-byte boundary   |
//! | ...    | E * 40 | edges: [`EdgeRecord`] in group-major order    |
//! ```
//!
//! Group `i` owns the edge rows `first_edge[i] .. first_edge[i + 1]`,
//! with the final group ending at `E`. Edge records within one group
//! keep the order the index defines; consumers address edges by
//! `(group, offset)` and never re-sort. All region offsets derive from
//! `G` and `E` with checked arithmetic
//! ([`FileHeader::expected_file_len`]); a header whose geometry
//! overflows matches no real file. Every region starts on a 4096-byte
//! boundary, so the whole-file-mapping alignment guarantee of the array
//! format applies unchanged: map the whole file and slice, never mmap
//! at a file offset.
//!
//! [`read::AttractionFile`] opens a file under these rules and hands
//! out the raw typed regions; [`write::write_records`] streams them
//! into place. The format owns geometry alone - the index's domain
//! invariants (ascending relations, contiguous non-empty ranges, weight
//! and score domains, in-group edge order) are `salt::relation`'s
//! artifact contract, validated where the domain types live.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the magic is pinned to the same canonical little-endian bytes on every platform"
)]

use core::fmt;

use zerocopy::{F32, LE, U32, U64, Unalign};

pub(crate) mod read;
#[cfg(test)]
mod tests;
pub(crate) mod write;

/// Size of one page-aligned region unit, and of the header.
const PAGE: u64 = FileHeader::SIZE as u64;

// not pretty, but allows us to pin a specific version, required for the derive
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

/// A layout version this module implements. Byte-level construction
/// admits no other value; increment on any layout change.
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

/// One relation group: identity, shared weights, and its edge range.
///
/// The range starts at `first_edge` and ends at the next group's
/// `first_edge`, or at the file's edge count for the final group.
// `FromBytes` is sound here: every field is an unconstrained primitive
// encoding, and the domain rules over them (ordering, ranges, weight
// domains) are validated by the mapped bridge, not the record.
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct GroupRecord {
    /// The relation's ontology row.
    pub relation: U64<LE>,
    /// The position of the group's first edge record.
    pub first_edge: U64<LE>,
    /// The Coincident class weight `kappa_C * p*_C`.
    pub coincident: F32<LE>,
    /// The Proximal class weight `p*_P`.
    pub proximal: F32<LE>,
    /// The frozen strength multiplier `h`.
    pub strength: F32<LE>,
    /// Alignment filler; writers emit zero, readers ignore.
    pub reserved: U32<LE>,
}

/// One force-bearing link instance.
// `FromBytes` is sound here: every field is an unconstrained primitive
// encoding, and the domain rules over them (row domain, score ranges,
// in-group order) are validated by the mapped bridge, not the record.
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct EdgeRecord {
    /// The edge row the instance was read from.
    pub edge: U64<LE>,
    /// The node row the link points from.
    pub source: U64<LE>,
    /// The node row the link points to.
    pub target: U64<LE>,
    /// The effective confidence `c`.
    pub confidence: F32<LE>,
    /// The degree normalization `nu`.
    pub degree_normalization: F32<LE>,
    /// Score provenance bits: link, source, and target presence in the
    /// three lowest bits.
    pub scored: U32<LE>,
    /// Alignment filler; writers emit zero, readers ignore.
    pub reserved: U32<LE>,
}

/// The 4096-byte header of an attraction file.
#[derive(
    Copy,
    Clone,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct FileHeader {
    magic: Unalign<FileHeaderMagic>,
    version: Unalign<Version>,
    /// Alignment filler so the counts sit on natural boundaries.
    reserved: U32<LE>,
    groups: U64<LE>,
    edges: U64<LE>,
    rows: U64<LE>,
    padding: [u8; Self::PADDING],
}

impl FileHeader {
    const PADDING: usize = 4056;
    /// Size of the header, and the offset of the groups region.
    pub(crate) const SIZE: usize = 4096;

    /// Creates a header for `groups` relation groups over `edges` edge
    /// records spanning `rows` corpus rows.
    #[must_use]
    pub(crate) const fn new(groups: u64, edges: u64, rows: u64) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V0),
            reserved: U32::new(0),
            groups: U64::new(groups),
            edges: U64::new(edges),
            rows: U64::new(rows),
            padding: [0; Self::PADDING],
        }
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
    /// The groups region sits between the header and this offset, zero
    /// padded to the boundary. Returns `None` when the geometry
    /// overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn edges_offset(&self) -> Option<u64> {
        let group_bytes = self.groups().checked_mul(size_of::<GroupRecord>() as u64)?;
        let padded = group_bytes.checked_next_multiple_of(PAGE)?;
        PAGE.checked_add(padded)
    }

    /// Returns the exact file length the header describes.
    ///
    /// A file whose length differs from this value is rejected. Returns
    /// `None` when the geometry overflows `u64`, in which case no real
    /// file matches the header.
    #[must_use]
    pub(crate) fn expected_file_len(&self) -> Option<u64> {
        let edge_bytes = self.edges().checked_mul(size_of::<EdgeRecord>() as u64)?;
        self.edges_offset()?.checked_add(edge_bytes)
    }
}

// Manual impl instead of a derive: `Unalign`'s `Debug` goes through
// `Deref` and would demand `Unaligned` of the pinned enums; `get` only
// needs `Copy`. No equality on purpose: callers compare the observable
// they mean.
impl fmt::Debug for FileHeader {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("FileHeader")
            .field("magic", &self.magic.get())
            .field("version", &self.version.get())
            .field("groups", &self.groups)
            .field("edges", &self.edges)
            .field("rows", &self.rows)
            .finish_non_exhaustive()
    }
}

const _: () = assert!(size_of::<FileHeader>() == FileHeader::SIZE);
const _: () = assert!(size_of::<GroupRecord>() == 32);
const _: () = assert!(size_of::<EdgeRecord>() == 40);

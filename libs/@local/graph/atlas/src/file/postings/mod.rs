//! The postings file.
//!
//! Per-type membership over the base delivery order, and the type graph's direct parent edges.
//!
//! Layout version 0 is mutable. Change the layout to fit what the pipeline needs and increment
//! [`Version`] when you do. The pinned parse rejects bytes of every other version, which is the
//! intended failure mode. A fresh generation replaces the files a layout change strands.
//!
//! For every ontology row the file stores which base delivery positions carry that type directly.
//! Each type stores that membership either as a sorted position list or as a dense bit set over
//! all `N` positions. Each representation lives in its own region and speaks one vocabulary: the
//! list region is one `BasePosition` array delimited by fenceposts, the dense region is a sequence
//! of self-describing bit set frames, and the flags set records which store serves each type. No
//! region's bytes change meaning under another region's discriminator, which is what the previous
//! layout's fused entries region did and what its unit bugs grew from. Beside the membership sits
//! its transpose, the direct map - one fencepost-delimited run per position naming the ontology
//! rows that position carries directly, so a position-scoped read answers without scanning any
//! type's membership. Beside both sits the type graph - each type's direct parent rows, the
//! authority every descendant expansion derives from. Per-row and per-type closures are never
//! materialized.
//!
//! The membership, the direct map, the flags, and the parent edges all describe one ontology-row
//! domain of one generation and are meaningless apart, so they form one combined file. Every
//! region a lookup or the closure build touches first - flags, fenceposts, parents - sits in the
//! leading pages. The direct map, the dense sets, and the list entries are the bulk data behind
//! them. The regions:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTPOST`                                |
//! | 8      | 4    | layout version, `u32` = 0                       |
//! | 12     | 8    | type count `T`, `u64`                           |
//! | 20     | 8    | point count `N`, `u64`                          |
//! | 28     | 8    | list entry count `L`, `u64`                     |
//! | 36     | 8    | dense set count `D`, `u64`                      |
//! | 44     | 8    | parent edge count `P`, `u64`                    |
//! | 52     | 8    | direct entry count `M`, `u64`                   |
//! | 60     | 4036 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | representation flags: one bit set frame over    |
//! |        |      | the type domain, bit `t` set = type `t` dense;  |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | list fenceposts: `T + 1` `u64` entry counts;    |
//! |        |      | dense types hold empty runs; zero padding to    |
//! |        |      | the next boundary                               |
//! | ...    |      | parent fenceposts: `T + 1` `u64` id counts;     |
//! |        |      | zero padding to the next boundary               |
//! | ...    |      | parent ids: `OntologyRowId[P]`, type-major,     |
//! |        |      | ascending within each type's list; zero padding |
//! |        |      | to the next boundary                            |
//! | ...    |      | direct fenceposts: `N + 1` `u64` id counts;     |
//! |        |      | zero padding to the next boundary               |
//! | ...    |      | direct ids: `OntologyRowId[M]`, position-major, |
//! |        |      | ascending within each position's run; zero      |
//! |        |      | padding to the next boundary                    |
//! | ...    |      | dense sets: an 8-byte point-domain header, then |
//! |        |      | `D` bit set frames over the point domain,       |
//! |        |      | ascending type order, each exactly              |
//! |        |      | `total_byte_len(N)` bytes; zero padding to the  |
//! |        |      | next boundary                                   |
//! | ...    |      | list entries: `BasePosition[L]`, type-major     |
//! ```
//!
//! A list type `t`'s membership run is `list_entries[posts[t]..posts[t + 1]]`, its base positions
//! sorted ascending. A dense type's run in the list region is empty. A dense type's membership is
//! the `k`-th frame of the dense region, where `k` is the number of dense types before it in type
//! order - the region opens with its own domain header restating `N`, which keeps it
//! self-describing when `D` is zero, and every frame covers that same domain, so the frames form
//! an array at stride `total_byte_len(N)` with no fenceposts of their own. A type's parent list is
//! `parent_ids[parent_posts[t]..parent_posts[t + 1]]`, direct parents only, ascending. A
//! position's direct types are `direct_ids[direct_posts[p]..direct_posts[p + 1]]`, ascending: the
//! membership transposed, so every position-type pair appears once in each direction. The header
//! repeats the region populations (`L`, `D`, `P`, `M`) because the length equation needs the
//! region sizes before the first region read.
//!
//! The format owns geometry alone - the header parse, the file length equation
//! ([`FileHeader::expected_file_len`]), and the bit set frames, whose own domain counts restate
//! `T` (flags) and `N` (the dense region's header and each dense set) and are checked against the
//! header once at open, together with the flag population restating `D`. The membership, direct
//! map, and parent contracts (fencepost coverage, ascending lists, empty list runs for dense
//! types, domains, the pair count tying the two membership directions) are the postings artifact
//! contract, validated where the domain type lives. Every region starts on a
//! 4096-byte boundary, so the whole-file-mapping alignment guarantee of the array format applies
//! unchanged: map the whole file and slice, never mmap at a file offset.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the fields are little endian, while the magic discriminant stores native endian, so \
              a cross-endian reader fails loudly at the magic instead of misreading fields"
)]

use core::fmt;

use zerocopy::{LE, U64, Unalign};

pub(crate) mod read;
#[cfg(test)]
mod tests;
pub(crate) mod write;

use crate::{
    bitset::{DenseBitSlice, DenseBitSliceArray},
    file::region::{PAGE, header::header, padded_size},
    identity::{BasePosition, OntologyRowId},
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
    Postings = u64::from_le_bytes(*b"SALTPOST"),
}

/// The `SALTPOST` magic. Byte-level construction admits no other value.
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
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Postings);
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

/// The header of a postings file.
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
    types: U64<LE>,
    points: U64<LE>,
    list_entries: U64<LE>,
    dense_types: U64<LE>,
    parent_edges: U64<LE>,
    direct_entries: U64<LE>,
}

header!(FileHeader);

impl FileHeader {
    /// Creates a header for `types` ontology rows over `points` base positions, with
    /// `list_entries` list positions, `dense_types` dense sets, `parent_edges` parent ids, and
    /// `direct_entries` direct ids.
    #[must_use]
    pub(crate) const fn new(
        types: u64,
        points: u64,
        list_entries: u64,
        dense_types: u64,
        parent_edges: u64,
        direct_entries: u64,
    ) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V0),
            types: U64::new(types),
            points: U64::new(points),
            list_entries: U64::new(list_entries),
            dense_types: U64::new(dense_types),
            parent_edges: U64::new(parent_edges),
            direct_entries: U64::new(direct_entries),
        }
    }

    /// Returns the type count `T`.
    #[inline]
    #[must_use]
    pub(crate) const fn types(&self) -> u64 {
        self.types.get()
    }

    /// Returns the point count `N`.
    ///
    /// The domain every dense set covers and every list entry must stay below.
    #[inline]
    #[must_use]
    pub(crate) const fn points(&self) -> u64 {
        self.points.get()
    }

    /// Returns the list entry count `L`: the value the last list fencepost must close at.
    #[inline]
    #[must_use]
    pub(crate) const fn list_entries(&self) -> u64 {
        self.list_entries.get()
    }

    /// Returns the dense set count `D`: the flag population the open path checks.
    #[inline]
    #[must_use]
    pub(crate) const fn dense_types(&self) -> u64 {
        self.dense_types.get()
    }

    /// Returns the parent edge count `P`: the value the last parent fencepost must close at.
    #[inline]
    #[must_use]
    pub(crate) const fn parent_edges(&self) -> u64 {
        self.parent_edges.get()
    }

    /// Returns the direct entry count `M`: the value the last direct fencepost must close at.
    #[inline]
    #[must_use]
    pub(crate) const fn direct_entries(&self) -> u64 {
        self.direct_entries.get()
    }

    /// Returns the fencepost count `T + 1` of both type-domain fencepost regions.
    ///
    /// Returns `None` when the count overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn fencepost_count(&self) -> Option<u64> {
        self.types.get().checked_add(1)
    }

    /// Returns the fencepost count `N + 1` of the direct fencepost region.
    ///
    /// Returns `None` when the count overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn direct_fencepost_count(&self) -> Option<u64> {
        self.points.get().checked_add(1)
    }

    /// Returns the exact byte size of the dense region - its domain header, then one frame per
    /// dense type.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn dense_sets_len(&self) -> Option<u64> {
        DenseBitSliceArray::<BasePosition>::total_byte_len(
            self.points.get(),
            self.dense_types.get(),
        )
    }

    /// Returns the offset of the list fencepost region.
    ///
    /// The flags frame sits between the header and this offset, zero padded to the boundary.
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn list_posts_offset(&self) -> Option<u64> {
        let flags = DenseBitSlice::<OntologyRowId>::total_byte_len(self.types.get());
        PAGE.checked_add(padded_size(flags, 1)?)
    }

    /// Returns the offset of the parent fencepost region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn parent_posts_offset(&self) -> Option<u64> {
        self.list_posts_offset()?
            .checked_add(self.padded_posts_bytes()?)
    }

    /// Returns the offset of the parent id region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn parent_ids_offset(&self) -> Option<u64> {
        self.parent_posts_offset()?
            .checked_add(self.padded_posts_bytes()?)
    }

    /// Returns the offset of the direct fencepost region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn direct_posts_offset(&self) -> Option<u64> {
        let ids = padded_size(self.parent_edges.get(), size_of::<OntologyRowId>() as u64)?;
        self.parent_ids_offset()?.checked_add(ids)
    }

    /// Returns the offset of the direct id region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn direct_ids_offset(&self) -> Option<u64> {
        let posts = padded_size(self.direct_fencepost_count()?, size_of::<U64<LE>>() as u64)?;
        self.direct_posts_offset()?.checked_add(posts)
    }

    /// Returns the offset of the dense set region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn dense_sets_offset(&self) -> Option<u64> {
        let ids = padded_size(self.direct_entries.get(), size_of::<OntologyRowId>() as u64)?;
        self.direct_ids_offset()?.checked_add(ids)
    }

    /// Returns the offset of the list entry region.
    ///
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn list_entries_offset(&self) -> Option<u64> {
        let dense = padded_size(self.dense_sets_len()?, 1)?;
        self.dense_sets_offset()?.checked_add(dense)
    }

    /// Returns the exact file length the header describes.
    ///
    /// The open path rejects a file whose length differs from this value. Returns `None` when the
    /// geometry overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) const fn expected_file_len(&self) -> Option<u64> {
        let entries = self
            .list_entries
            .get()
            .checked_mul(size_of::<BasePosition>() as u64)?;
        self.list_entries_offset()?.checked_add(entries)
    }

    /// Returns the padded byte size of one fencepost region.
    const fn padded_posts_bytes(&self) -> Option<u64> {
        padded_size(self.fencepost_count()?, size_of::<U64<LE>>() as u64)
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
            .field("types", &self.types)
            .field("points", &self.points)
            .field("list_entries", &self.list_entries)
            .field("dense_types", &self.dense_types)
            .field("parent_edges", &self.parent_edges)
            .field("direct_entries", &self.direct_entries)
            .finish_non_exhaustive()
    }
}

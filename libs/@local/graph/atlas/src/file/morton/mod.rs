//! The morton file: bucket fenceposts and a page index in front of the
//! delivery-ordered morton codes.
//!
//! Layout version 1 is **mutable**: change the layout freely to fit what
//! the pipeline needs and increment [`Version`] when you do. The pinned
//! parse rejects bytes of other versions, which is the intended failure
//! mode; no migration or compatibility machinery exists on purpose until
//! the format stabilizes.
//!
//! The codes are in the base delivery order: bucket-major, ascending
//! within each bucket segment. Nothing about that column is
//! interpretable on its own - a binary search is valid only inside one
//! segment, and the page index samples across segment boundaries - so
//! the segment fenceposts live in the header, and index, fenceposts,
//! and codes form one combined file that cannot fall out of sync. The
//! regions:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTMRTN`                                |
//! | 8      | 4    | layout version, `u32` = 1                       |
//! | 12     | 4    | index stride, `u32`, codes per index key        |
//! | 16     | 272  | bucket fenceposts, 34 `u64` positions           |
//! | 288    | 3808 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | index: `u64` keys, one per stride of codes      |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | codes: `u64[N]`, bucket-major, ascending within |
//! |        |      | each bucket segment                             |
//! ```
//!
//! Fencepost `b` is the position where bucket `b`'s codes begin, so
//! segment `b` is `codes[posts[b]..posts[b + 1]]` and the last
//! fencepost is the code count `N` - the header stores no separate
//! count to contradict. [`Fenceposts`] carries the two structural
//! rules (anchored at zero, non-decreasing) as a validated type, so an
//! open file always slices without checks.
//!
//! Key `i` of the index is code `i * stride`. A lookup clamps to one
//! segment, binary-searches the index keys sampled inside it to pick
//! one stride of codes, and binary-searches within that stride: two
//! faulted pages instead of `log2(N)` scattered ones. All region
//! offsets derive from the stride and the last fencepost with checked
//! arithmetic ([`FileHeader::codes_offset`],
//! [`FileHeader::expected_file_len`]); a header whose geometry
//! overflows, or whose stride is zero, matches no real file. Both
//! regions start on 4096-byte boundaries, so the whole-file-mapping
//! alignment guarantee of the array format applies unchanged: map the
//! whole file and slice, never mmap at a file offset.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the magic is pinned to the same canonical little-endian bytes on every platform"
)]

use core::{fmt, ops::Range};

use zerocopy::{LE, U32, U64, Unalign};

use crate::morton::Depth;

pub(crate) mod read;
pub(crate) mod write;

#[cfg(test)]
mod tests;

use crate::file::region::{PAGE, padded_size};

// The shared page is the header's size; the offset chain and the
// write path both count regions from one header page.
const _: () = assert!(FileHeader::SIZE as u64 == PAGE);

/// A fencepost breaks the two structural rules: posts anchor at zero
/// and never decrease.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct FencepostViolation {
    /// The offending fencepost: index 0 is not zero, or the post at
    /// this index is smaller than its predecessor.
    pub index: u8,
}

impl fmt::Display for FencepostViolation {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.index {
            0 => write!(fmt, "fencepost 0 must anchor the first segment at zero"),
            index => write!(fmt, "fencepost {index} is smaller than its predecessor"),
        }
    }
}

impl core::error::Error for FencepostViolation {}

/// The bucket segmentation of the code column: one position per
/// segment boundary.
///
/// Fencepost `b` is where bucket `b`'s codes begin and the last
/// fencepost is the total code count, so segment `b` is the range
/// `posts[b]..posts[b + 1]`. Every value is anchored at zero and
/// non-decreasing by construction, so segment ranges always slice a
/// column of [`count`](Self::count) elements without further checks.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Fenceposts([u64; Self::POSTS]);

impl Fenceposts {
    /// One segment per bucket the cascade can assign: every depth from
    /// the whole domain to a fully pinned key.
    pub(crate) const POSTS: usize = Self::SEGMENTS + 1;
    /// One more fencepost than segments, closing the last range.
    pub(crate) const SEGMENTS: usize = Depth::MAX.get() as usize + 1;

    /// Wraps a fencepost array.
    ///
    /// # Errors
    ///
    /// Returns the first [`FencepostViolation`]: a first post other
    /// than zero, or a post smaller than its predecessor.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the loop index is bounded by the 34 fenceposts"
    )]
    pub(crate) const fn new(posts: &[u64; Self::POSTS]) -> Result<Self, FencepostViolation> {
        if posts[0] != 0 {
            return Err(FencepostViolation { index: 0 });
        }

        let mut index = 1;
        while index < Self::POSTS {
            if posts[index] < posts[index - 1] {
                return Err(FencepostViolation { index: index as u8 });
            }
            index += 1;
        }

        Ok(Self(*posts))
    }

    /// Accumulates per-segment lengths into fenceposts.
    ///
    /// The result is anchored and non-decreasing by construction.
    /// Returns [`None`] when the running total overflows `u64`, in
    /// which case no real column matches the lengths.
    pub(crate) const fn from_lengths(lengths: &[u64; Self::SEGMENTS]) -> Option<Self> {
        let mut posts = [0_u64; Self::POSTS];

        let mut index = 0;
        while index < Self::SEGMENTS {
            let Some(next) = posts[index].checked_add(lengths[index]) else {
                return None;
            };
            posts[index + 1] = next;
            index += 1;
        }

        Some(Self(posts))
    }

    /// Returns the total code count: the last fencepost.
    #[inline]
    #[must_use]
    pub(crate) const fn count(&self) -> u64 {
        self.0[Self::POSTS - 1]
    }

    /// Returns bucket `bucket`'s position range in the code column.
    #[inline]
    #[must_use]
    pub(crate) const fn segment(&self, bucket: Depth) -> Range<u64> {
        let index = bucket.get() as usize;
        self.0[index]..self.0[index + 1]
    }

    /// Returns the per-segment lengths: the bucket histogram.
    #[must_use]
    pub(crate) const fn lengths(&self) -> [u64; Self::SEGMENTS] {
        let mut lengths = [0_u64; Self::SEGMENTS];

        let mut index = 0;
        while index < Self::SEGMENTS {
            lengths[index] = self.0[index + 1] - self.0[index];
            index += 1;
        }

        lengths
    }

    /// Borrows the raw fencepost positions.
    #[inline]
    #[must_use]
    pub(crate) const fn posts(&self) -> &[u64; Self::POSTS] {
        &self.0
    }
}

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
    Morton = u64::from_le_bytes(*b"SALTMRTN"),
}

/// The `SALTMRTN` magic. Byte-level construction admits no other value.
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
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Morton);
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
    V1 = 1,
}

/// The 4096-byte header of a morton file.
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
    magic: Unalign<FileHeaderMagic>,
    version: Unalign<Version>,
    stride: U32<LE>,
    fenceposts: [U64<LE>; Fenceposts::POSTS],
    padding: [u8; Self::PADDING],
}

impl FileHeader {
    const PADDING: usize = 3808;
    /// Size of the header, and the offset of the index region.
    pub(crate) const SIZE: usize = 4096;

    /// Creates a header for `fenceposts`-segmented codes indexed every
    /// `stride` codes.
    #[must_use]
    pub(crate) const fn new(stride: u32, fenceposts: &Fenceposts) -> Self {
        let posts = fenceposts.posts();
        let mut wire = [U64::new(0); Fenceposts::POSTS];
        let mut index = 0;
        while index < Fenceposts::POSTS {
            wire[index] = U64::new(posts[index]);
            index += 1;
        }

        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V1),
            stride: U32::new(stride),
            fenceposts: wire,
            padding: [0; Self::PADDING],
        }
    }

    /// Returns the number of codes per index key.
    #[inline]
    #[must_use]
    pub(crate) const fn stride(&self) -> u32 {
        self.stride.get()
    }

    /// Returns the number of codes: the last fencepost.
    #[inline]
    #[must_use]
    pub(crate) const fn count(&self) -> u64 {
        self.fenceposts[Fenceposts::POSTS - 1].get()
    }

    /// Returns the raw fencepost positions, unvalidated.
    ///
    /// The header parse pins magic and version only; the fencepost
    /// rules are [`Fenceposts::new`]'s to check when a file opens.
    #[must_use]
    pub(crate) const fn posts(&self) -> [u64; Fenceposts::POSTS] {
        let mut posts = [0_u64; Fenceposts::POSTS];
        let mut index = 0;
        while index < Fenceposts::POSTS {
            posts[index] = self.fenceposts[index].get();
            index += 1;
        }

        posts
    }

    /// Returns the number of index keys.
    ///
    /// Returns `None` for a zero stride, which matches no real file.
    #[must_use]
    pub(crate) const fn index_keys(&self) -> Option<u64> {
        match u64::from(self.stride.get()) {
            0 => None,
            stride => Some(self.count().div_ceil(stride)),
        }
    }

    /// Returns the offset of the code region.
    ///
    /// The index region sits between the header and this offset, zero
    /// padded to the boundary. Returns `None` when the geometry overflows
    /// `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn codes_offset(&self) -> Option<u64> {
        PAGE.checked_add(padded_size(self.index_keys()?, size_of::<u64>() as u64)?)
    }

    /// Returns the exact file length the header describes.
    ///
    /// A file whose length differs from this value is rejected. Returns
    /// `None` when the geometry overflows `u64`, in which case no real
    /// file matches the header.
    #[must_use]
    pub(crate) fn expected_file_len(&self) -> Option<u64> {
        let code_bytes = self.count().checked_mul(size_of::<u64>() as u64)?;
        self.codes_offset()?.checked_add(code_bytes)
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
            .field("stride", &self.stride)
            .field("fenceposts", &self.fenceposts)
            .finish_non_exhaustive()
    }
}

const _: () = assert!(size_of::<FileHeader>() == FileHeader::SIZE);

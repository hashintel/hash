//! The morton file.
//!
//! Bucket fenceposts and a page index in front of the delivery-ordered morton codes.
//!
//! Layout version 2 is **mutable**. Change the layout to fit what the pipeline needs and increment
//! [`Version`] when you do. The pinned parse rejects bytes of every other version, which is the
//! intended failure mode. A fresh generation replaces the files a layout change strands.
//!
//! The codes are in the base delivery order: bucket-major, ascending within each bucket segment.
//! Nothing about that column is interpretable on its own. A binary search is valid only inside one
//! segment, and the page index samples across segment boundaries, so the segment fenceposts live in
//! the header. Index, fenceposts, and codes form one combined file that cannot fall out of sync.
//! The regions:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTMRTN`                                |
//! | 8      | 4    | layout version, `u32` = 2                       |
//! | 12     | 4    | machine information, [`Machine`]                |
//! | 16     | 4    | index stride, `u32`, codes per index key        |
//! | 20     | 272  | bucket fenceposts, 34 `u64` positions           |
//! | 292    | 3804 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | index: `u64` keys, one per stride of codes      |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | codes: `u64[N]`, bucket-major, ascending within |
//! |        |      | each bucket segment                             |
//! ```
//!
//! Fencepost `b` is the position where bucket `b`'s codes begin, so segment `b` is
//! `codes[posts[b]..posts[b + 1]]` and the last fencepost is the code count `N` - the header stores
//! no separate count to contradict. [`Fenceposts`] carries the two structural rules (anchored at
//! zero, non-decreasing) as a validated type, so an open file always slices without checks.
//!
//! Key `i` of the index is code `i · stride`. A lookup clamps to one segment, binary-searches the
//! index keys sampled inside it to pick one stride of codes, and binary-searches within that
//! stride: two faulted pages instead of `log2(N)` scattered ones. All region offsets derive from
//! the stride and the last fencepost with checked arithmetic ([`FileHeader::codes_offset`],
//! [`FileHeader::expected_file_len`]); a header whose geometry overflows, or whose stride is zero,
//! matches no real file. The header's machine information ([`Machine`]) records the writing
//! machine. Every multi-byte field pins little-endian, so the file reads exactly on either byte
//! order and opening compares nothing against the host. Both regions start on 4096-byte
//! boundaries, so the whole-file-mapping alignment guarantee of the array format applies
//! unchanged: map the whole file and slice, never mmap at a file offset.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the fields are little endian, while the magic discriminant stores native endian, so \
              a cross-endian reader fails loudly at the magic instead of misreading fields"
)]

use core::{fmt, marker::PhantomData, ops::Range};

use hashql_core::id::Id;
use zerocopy::{LE, U32, U64, Unalign};

use crate::morton::Depth;

pub(crate) mod read;
pub(crate) mod write;

#[cfg(test)]
mod tests;

use crate::file::region::{PAGE, header::header, machine::Machine, padded_size};

/// A fencepost breaks a structural rule of the segmentation.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum FencepostError {
    /// The first post is not zero.
    Anchor,
    /// The post at this index is smaller than its predecessor.
    Order {
        /// The offending fencepost.
        index: u8,
    },
}

impl fmt::Display for FencepostError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Anchor => write!(fmt, "fencepost 0 must anchor the first segment at zero"),
            Self::Order { index } => {
                write!(fmt, "fencepost {index} is smaller than its predecessor")
            }
        }
    }
}

impl core::error::Error for FencepostError {}

/// One more fencepost than segments, closing the last range.
pub(crate) const POSTS: usize = SEGMENTS + 1;
/// One segment per bucket the cascade can assign.
///
/// Every depth from the whole domain to a fully pinned key.
pub(crate) const SEGMENTS: usize = Depth::MAX.get() as usize + 1;

/// The bucket segmentation of a position column: one boundary value per segment edge.
///
/// Fencepost `b` is where bucket `b`'s positions begin and the last fencepost is the total count,
/// so segment `b` is the range `posts[b]..posts[b + 1]` in the column's position domain `I`.
/// Construction validates the structural rules - posts anchor at zero and never decrease - while
/// the width of the position domain is `I`'s own law, checked by `I`'s conversion inside each typed
/// accessor. The interior keeps the persisted `U64<LE>` words: a header's fencepost region
/// reinterprets as a validated borrow ([`try_from_ref`]) and the file writer reads the same words
/// back.
///
/// [`try_from_ref`]: Self::try_from_ref
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(transparent)]
pub(crate) struct Fenceposts<I>([U64<LE>; POSTS], PhantomData<fn(&I)>);

impl<I> Fenceposts<I> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "fencepost indices are bounded by the 34 posts"
    )]
    const fn validate(posts: &[U64<LE>; POSTS]) -> Result<(), FencepostError> {
        if posts[0].get() != 0 {
            return Err(FencepostError::Anchor);
        }

        let mut index = 1;
        while index < POSTS {
            if posts[index].get() < posts[index - 1].get() {
                return Err(FencepostError::Order { index: index as u8 });
            }

            index += 1;
        }

        Ok(())
    }

    /// Views a fencepost array as a validated segmentation.
    ///
    /// The borrow is the witness: `#[repr(transparent)]` makes the array's bytes the value, so a
    /// persisted region validates in place without a copy.
    ///
    /// # Errors
    ///
    /// Returns the first [`FencepostError`]: a first post other than zero, or a post smaller than
    /// its predecessor.
    pub(crate) const fn try_from_ref(posts: &[U64<LE>; POSTS]) -> Result<&Self, FencepostError> {
        Self::validate(posts)?;

        let ptr = &raw const *posts;
        // SAFETY: `Self` is `#[repr(transparent)]` over `[U64<LE>; POSTS]`, so the cast
        // reinterprets the array as the wrapper without changing layout, and `validate` upheld the
        // type's structural rules.
        Ok(unsafe { &*ptr.cast::<Self>() })
    }

    /// Wraps a fencepost array.
    ///
    /// # Errors
    ///
    /// Returns the first [`FencepostError`]: a first post other than zero, or a post smaller than
    /// its predecessor.
    #[expect(
        clippy::large_types_passed_by_value,
        reason = "the constructor stores the array; by value states the transfer and moves the \
                  272 bytes once"
    )]
    pub(crate) const fn new(posts: [U64<LE>; POSTS]) -> Result<Self, FencepostError> {
        Self::validate(&posts)?;

        Ok(Self(posts, PhantomData))
    }

    const fn into_raw(self) -> [U64<LE>; POSTS] {
        self.0
    }

    const fn as_raw(&self) -> &[U64<LE>; POSTS] {
        &self.0
    }

    /// Accumulates per-segment lengths into fenceposts.
    ///
    /// By construction the result anchors at zero and never decreases. Returns [`None`] when the
    /// running total overflows the persisted `u64` form, in which case no writable column matches
    /// the lengths.
    pub(crate) const fn from_lengths(lengths: &[u64; SEGMENTS]) -> Option<Self> {
        let mut posts = [0_u64; POSTS];

        let mut index = 0;
        while index < SEGMENTS {
            let Some(next) = posts[index].checked_add(lengths[index]) else {
                return None;
            };

            posts[index + 1] = next;
            index += 1;
        }

        Some(Self(posts.map(U64::new), PhantomData))
    }

    /// Returns the total count: the last fencepost.
    #[inline]
    #[must_use]
    pub(crate) const fn count(&self) -> u64 {
        self.0[POSTS - 1].get()
    }
}

impl<I: Id> Fenceposts<I> {
    /// Returns the post at `index` in the position domain.
    fn post(&self, index: usize) -> I {
        I::from_u64(self.0[index].get())
    }

    /// Returns the exclusive upper bound of the position domain: one past the last position.
    #[inline]
    #[must_use]
    pub(crate) fn bound(&self) -> I {
        self.post(POSTS - 1)
    }

    /// Returns bucket `bucket`'s position range in the column.
    #[inline]
    #[must_use]
    pub(crate) fn segment(&self, bucket: Depth) -> Range<I> {
        let index = bucket.get() as usize;
        self.post(index)..self.post(index + 1)
    }

    /// Returns every bucket's position range, bucket-ascending.
    #[must_use]
    pub(crate) fn segments(&self) -> [Range<I>; SEGMENTS] {
        core::array::from_fn(|index| self.post(index)..self.post(index + 1))
    }

    /// Returns the per-segment lengths: the bucket histogram.
    #[must_use]
    pub(crate) fn lengths(&self) -> [u64; SEGMENTS] {
        let mut lengths = [0_u64; SEGMENTS];

        for (index, length) in lengths.iter_mut().enumerate() {
            *length = self.0[index + 1].get() - self.0[index].get();
        }

        lengths
    }
}

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

/// A layout version this module implements.
///
/// Byte-level construction admits no other value. Increment on any layout change.
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

/// The 4096-byte header of a morton file.
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
    stride: U32<LE>,
    fenceposts: [U64<LE>; POSTS],
}

header!(FileHeader, FileHeaderMagic, Version::V2);

impl FileHeader {
    /// Creates a header for `fenceposts`-segmented codes indexed every `stride` codes.
    #[must_use]
    pub(crate) const fn new<I>(stride: u32, fenceposts: Fenceposts<I>) -> Self {
        let posts = fenceposts.into_raw();

        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V2),
            machine: Machine::current(),
            stride: U32::new(stride),
            fenceposts: posts,
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
        self.fenceposts[POSTS - 1].get()
    }

    /// Views the header's fenceposts, validated.
    ///
    /// The header parse pins magic and version only, so this accessor checks the structural rules
    /// at the first read of the posts as a segmentation.
    ///
    /// # Errors
    ///
    /// Returns the first [`FencepostError`] when the posts break a structural rule.
    pub(crate) const fn posts<I: Id>(&self) -> Result<&Fenceposts<I>, FencepostError> {
        Fenceposts::try_from_ref(&self.fenceposts)
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
    /// The index region sits between the header and this offset, zero padded to the boundary.
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) const fn codes_offset(&self) -> Option<u64> {
        PAGE.checked_add(padded_size(self.index_keys()?, size_of::<u64>() as u64)?)
    }

    /// Returns the exact file length the header describes.
    ///
    /// The open path rejects a file whose length differs from this value. Returns `None` when the
    /// geometry overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) const fn expected_file_len(&self) -> Option<u64> {
        let code_bytes = self.count().checked_mul(size_of::<u64>() as u64)?;
        self.codes_offset()?.checked_add(code_bytes)
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
            .field("stride", &self.stride)
            .field("fenceposts", &self.fenceposts)
            .finish_non_exhaustive()
    }
}

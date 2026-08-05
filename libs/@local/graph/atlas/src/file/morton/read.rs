//! Opened morton files.

use core::{error::Error, fmt, ops::Range};
use std::path::Path;

use hashql_core::id::{Id as _, IdSlice};
use zerocopy::{FromBytes as _, LE, U64};

use super::{FencepostError, Fenceposts, FileHeader};
use crate::{
    file::region::{
        PAGE,
        header::{HeaderError, HeaderMap},
    },
    identity::BasePosition,
    morton::{Depth, MortonCell, MortonKey},
};

/// Opening a morton file failed.
#[derive(Debug)]
pub enum OpenMortonError {
    /// Reading the header page failed.
    Header(HeaderError),
    /// The header's fenceposts break a structural rule.
    Fenceposts(FencepostError),
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes.
        ///
        /// [`None`] when the shape's byte length overflows `u64` or its stride is zero, in which
        /// case it matches no real file.
        expected: Option<u64>,
        actual: u64,
    },
}

impl fmt::Display for OpenMortonError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header(error) => write!(fmt, "the morton file's header page: {error}"),
            Self::Fenceposts(violation) => {
                write!(fmt, "the header's fenceposts are malformed: {violation}")
            }
            Self::Length {
                expected: Some(expected),
                actual,
            } => write!(
                fmt,
                "the file holds {actual} bytes where the header describes {expected}",
            ),
            Self::Length {
                expected: None,
                actual,
            } => write!(
                fmt,
                "the file holds {actual} bytes where the header's byte length overflows",
            ),
        }
    }
}

impl Error for OpenMortonError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Header(error) => Some(error),
            Self::Fenceposts(violation) => Some(violation),
            Self::Length { .. } => None,
        }
    }
}

/// A morton file mapped read-only into memory.
///
/// Opening parses the header, then validates its fenceposts and the length equation, so an open
/// file's segment ranges always slice its code column without further checks. Codes within each
/// segment are non-decreasing by the writer's contract (the cascade sort produces them; publish
/// verifies coverage); the searches here assume it the way every binary search assumes a sorted
/// slice.
///
/// [`run`](Self::run) is the serving query: the contiguous positions of one bucket's codes inside
/// one tile cell, found by two index-accelerated searches that fault two pages instead of `log2(N)`
/// scattered ones.
#[derive(Debug)]
pub(crate) struct MortonFile {
    map: HeaderMap<FileHeader>,
    fenceposts: Fenceposts<BasePosition>,
}

impl MortonFile {
    /// Opens and maps the morton file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenMortonError::Header`] when the header page cannot be read,
    /// [`OpenMortonError::Fenceposts`] when the header's fenceposts break a structural rule, and
    /// [`OpenMortonError::Length`] when the file length contradicts the header's geometry.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenMortonError> {
        let map = HeaderMap::<FileHeader>::open(path).map_err(OpenMortonError::Header)?;
        let header = map.header();

        // `posts` validates the header's array and returns it as a borrowed `Fenceposts` witness.
        // Copying it once here keeps the segmentation reachable without re-running that validation
        // on every query, which is what an accessor borrowing from the header page would cost.
        // 272 bytes once per open.
        let fenceposts = *header.posts().map_err(OpenMortonError::Fenceposts)?;

        let expected = header.expected_file_len();
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenMortonError::Length { expected, actual });
        }

        Ok(Self { map, fenceposts })
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    fn header(&self) -> &FileHeader {
        self.map.header()
    }

    /// Borrows the bucket fenceposts.
    #[inline]
    #[must_use]
    pub(crate) const fn fenceposts(&self) -> &Fenceposts<BasePosition> {
        &self.fenceposts
    }

    /// Returns the number of codes.
    #[inline]
    #[must_use]
    pub(crate) const fn count(&self) -> u64 {
        self.fenceposts.count()
    }

    /// Returns the bucket owning one base position: the segment the position falls in.
    ///
    /// # Panics
    ///
    /// This panics when `position` is at or beyond [`count`](Self::count).
    #[must_use]
    pub(crate) fn bucket_of(&self, position: BasePosition) -> Depth {
        let position = position.as_u64();
        assert!(
            position < self.count(),
            "position {position} lies beyond the {} codes",
            self.count(),
        );

        // The first fencepost beyond the position closes its segment;
        // empty segments share posts and never win the search.
        let segment = self
            .fenceposts
            .as_raw()
            .partition_point(|&post| post.get() <= position);
        #[expect(
            clippy::cast_possible_truncation,
            reason = "fencepost indices are bounded by the 34 posts"
        )]
        Depth::new(segment as u8 - 1).expect("every segment index names a valid depth")
    }

    /// Views the index keys: one key per stride of codes.
    #[must_use]
    fn index_keys(&self) -> &[U64<LE>] {
        let keys = self
            .header()
            .index_keys()
            .expect("open validated the stride");
        // The offsets and products in the region reads repeat checked
        // computations open already accepted, so none of them can
        // overflow here.
        let bytes = self.map.map().region(PAGE, keys * size_of::<u64>() as u64);
        <[U64<LE>]>::ref_from_bytes(bytes).unwrap_or_else(|_| {
            unreachable!(
                "the region is a whole number of byte-order integers, which tolerate any alignment"
            )
        })
    }

    /// Views the code column in base delivery order.
    #[must_use]
    pub(crate) fn codes(&self) -> &IdSlice<BasePosition, U64<LE>> {
        IdSlice::from_raw(self.code_words())
    }

    /// Views the code region's raw words.
    ///
    /// The file-index machinery addresses this region in its own stride arithmetic, which speaks
    /// word offsets rather than base positions.
    fn code_words(&self) -> &[U64<LE>] {
        let bytes = self.map.map().region(
            self.header()
                .codes_offset()
                .expect("open validated the geometry"),
            self.count() * size_of::<u64>() as u64,
        );
        <[U64<LE>]>::ref_from_bytes(bytes).unwrap_or_else(|_| {
            unreachable!(
                "the region is a whole number of byte-order integers, which tolerate any alignment"
            )
        })
    }

    /// Returns the positions of `bucket`'s codes inside `cell`.
    ///
    /// One contiguous run of the base delivery order.
    ///
    /// Two index-accelerated searches constrained to the bucket's segment find the run. An empty
    /// range means the bucket has no point in the cell.
    #[must_use]
    pub(crate) fn run(&self, bucket: Depth, cell: MortonCell) -> Range<BasePosition> {
        let segment = self.fenceposts.segment(bucket);
        let search = segment.start.as_u64()..segment.end.as_u64();
        let min = cell.min_key().to_bits();
        let max = cell.max_key().to_bits();

        let start = self.partition_point(search.clone(), |code| code < min);
        // The cell's maximum key is inclusive (and `u64::MAX` at the
        // root), so the run closes at the first code beyond it rather
        // than at a lower bound of `max + 1`.
        let end = self.partition_point(start..search.end, |code| code <= max);

        // In bounds of the fencepost domain the constructor validated.
        BasePosition::from_u64(start)..BasePosition::from_u64(end)
    }

    /// Returns the code at one base position.
    ///
    /// # Panics
    ///
    /// This panics when `position` is at or beyond [`count`](Self::count).
    #[must_use]
    pub(crate) fn code(&self, position: BasePosition) -> MortonKey {
        MortonKey::from_bits(self.codes()[position].get())
    }

    /// Finds the first position in `range` whose code fails `pred`.
    ///
    /// `pred` must be monotone over the range's codes: true for a prefix, false for the rest. Every
    /// threshold predicate over non-decreasing codes has that shape. The index narrows the search
    /// to one final window of at most `stride` codes. Sampled index keys inside the range locate
    /// that window from one faulted index page that stays hot across queries. The window search
    /// then faults one code page.
    fn partition_point(&self, range: Range<u64>, pred: impl Fn(u64) -> bool) -> u64 {
        let stride = u64::from(self.header().stride());

        // Index keys sampled inside the range: positions `i · stride`
        // with `range.start ≤ i · stride < range.end`.
        let first = range.start.div_ceil(stride);
        let last = range.end.div_ceil(stride);

        let index = self.index_keys();
        let sampled = &index[usize::try_from(first)
            .expect("a mapped position fits the address space")
            ..usize::try_from(last).expect("a mapped position fits the address space")];
        let partition = first + sampled.partition_point(|key| pred(key.get())) as u64;

        // Every interval of `stride` positions contains a sampled one,
        // so the window between the last true sample (or the range
        // start) and the first false sample (or the range end) spans
        // at most one stride.
        let window_start = if partition == first {
            range.start
        } else {
            (partition - 1) * stride + 1
        };
        let window_end = if partition == last {
            range.end
        } else {
            partition * stride
        };

        let window = &self.code_words()[usize::try_from(window_start)
            .expect("a mapped position fits the address space")
            ..usize::try_from(window_end).expect("a mapped position fits the address space")];
        window_start + window.partition_point(|code| pred(code.get())) as u64
    }
}

//! Opened morton files.

use core::{error::Error, fmt, ops::Range};
use std::{fs::File, io, path::Path};

use memmap2::Mmap;
use zerocopy::{
    FromBytes as _, LE, TryFromBytes as _, U64,
    error::{ConvertError, ValidityError},
};

use super::{FencepostViolation, Fenceposts, FileHeader};
use crate::morton::{Depth, MortonCell, MortonKey};

/// Opening a morton file failed.
#[derive(Debug)]
pub enum OpenMortonError {
    /// The file could not be opened or mapped.
    Io(io::Error),
    /// The file is shorter than one header.
    Undersized { actual: u64 },
    /// The leading bytes are not a header this module speaks.
    Header(ValidityError<(), FileHeader>),
    /// The header's fenceposts break a structural rule.
    Fenceposts(FencepostViolation),
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes; [`None`] when the shape's
        /// byte length overflows `u64` or its stride is zero, in which
        /// case it matches no real file.
        expected: Option<u64>,
        actual: u64,
    },
}

impl fmt::Display for OpenMortonError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(fmt, "the morton file could not be read: {error}"),
            Self::Undersized { actual } => write!(
                fmt,
                "the file holds {actual} bytes, fewer than the {}-byte header",
                FileHeader::SIZE,
            ),
            Self::Header(error) => write!(
                fmt,
                "the leading bytes are not a morton-file header: {error}",
            ),
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
            Self::Io(error) => Some(error),
            Self::Header(error) => Some(error),
            Self::Fenceposts(violation) => Some(violation),
            Self::Undersized { .. } | Self::Length { .. } => None,
        }
    }
}

/// A morton file mapped read-only into memory.
///
/// Opening parses the header, validates the fenceposts, and checks the
/// length equation, so an open file's segment ranges always slice its
/// code column without further checks. Codes within each segment are
/// non-decreasing by the writer's contract (the cascade sort produces
/// them; publish verifies coverage); the searches here assume it the
/// way every binary search assumes its slice is sorted.
///
/// [`run`](Self::run) is the serving query: the contiguous positions
/// of one bucket's codes inside one tile cell, found by two
/// index-accelerated searches that fault two pages instead of
/// `log2(N)` scattered ones.
#[derive(Debug)]
pub(crate) struct MortonFile {
    map: Mmap,
    fenceposts: Fenceposts,
}

impl MortonFile {
    /// Opens and maps the morton file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenMortonError::Io`] when the file cannot be opened
    /// or mapped, [`OpenMortonError::Header`] when its leading bytes
    /// are not a header this module speaks,
    /// [`OpenMortonError::Fenceposts`] when the header's fenceposts
    /// break a structural rule, and [`OpenMortonError::Length`] when
    /// the file length contradicts the header's geometry.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenMortonError> {
        let file = File::open(path).map_err(OpenMortonError::Io)?;
        // SAFETY: published artifact files are immutable (the `crate::file`
        // publish contract: temporary path, rename into place, never
        // rewritten), so the mapped bytes cannot change beneath the borrow.
        let map = unsafe { Mmap::map(&file) }.map_err(OpenMortonError::Io)?;

        let Some(bytes) = map.get(..FileHeader::SIZE) else {
            return Err(OpenMortonError::Undersized {
                actual: map.len() as u64,
            });
        };
        let header = match FileHeader::try_read_from_bytes(bytes) {
            Ok(header) => header,
            Err(ConvertError::Validity(error)) => {
                return Err(OpenMortonError::Header(error.map_src(|_| ())));
            }
            Err(ConvertError::Size(_)) => {
                unreachable!("the slice is exactly one header long")
            }
        };

        // The 34 posts are copied out of the mapping rather than viewed:
        // `Fenceposts` carries the structural rules as a type invariant a
        // raw `U64<LE>` view cannot, and the copy keeps `bucket_of`'s
        // partition search on native integers instead of `.get()` per
        // probe. 272 bytes once per open buys both.
        let fenceposts = Fenceposts::new(&header.posts()).map_err(OpenMortonError::Fenceposts)?;

        let expected = header.expected_file_len();
        let actual = map.len() as u64;
        if expected != Some(actual) {
            return Err(OpenMortonError::Length { expected, actual });
        }

        Ok(Self { map, fenceposts })
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    fn header(&self) -> &FileHeader {
        let ptr = self.map.as_ptr().cast::<FileHeader>();

        // SAFETY: The map is valid for the lifetime of the file, immutable, and the constructor
        // validated that the map is large enough to contain the header and that its bytes parse
        // as one, so the deref target is a valid `FileHeader`.
        unsafe { &*ptr }
    }

    /// Borrows the bucket fenceposts.
    #[inline]
    #[must_use]
    pub(crate) const fn fenceposts(&self) -> &Fenceposts {
        &self.fenceposts
    }

    /// Returns the number of codes.
    #[inline]
    #[must_use]
    pub(crate) const fn count(&self) -> u64 {
        self.fenceposts.count()
    }

    /// Returns the bucket owning one base position: the segment the
    /// position falls in.
    ///
    /// # Panics
    ///
    /// Panics when `position` is at or beyond [`count`](Self::count).
    #[must_use]
    pub(crate) fn bucket_of(&self, position: u64) -> Depth {
        assert!(
            position < self.count(),
            "position {position} lies beyond the {} codes",
            self.count(),
        );

        // The first fencepost beyond the position closes its segment;
        // empty segments share posts and never win the search.
        let segment = self
            .fenceposts
            .posts()
            .partition_point(|&post| post <= position);
        #[expect(
            clippy::cast_possible_truncation,
            reason = "fencepost indices are bounded by the 34 posts"
        )]
        Depth::new(segment as u8 - 1).expect("every segment index names a valid depth")
    }

    /// Carves one region out of the mapping.
    fn region(&self, offset: u64, len: u64) -> &[u8] {
        // The offsets and products repeat checked computations open
        // already accepted, so none of them can overflow here.
        let offset = usize::try_from(offset).expect("a mapped offset fits the address space");
        let len = usize::try_from(len).expect("a mapped region fits the address space");
        &self.map[offset..offset + len]
    }

    /// Views the index keys: one key per stride of codes.
    #[must_use]
    fn index_keys(&self) -> &[U64<LE>] {
        let keys = self
            .header()
            .index_keys()
            .expect("open validated the stride");
        let bytes = self.region(FileHeader::SIZE as u64, keys * size_of::<u64>() as u64);
        <[U64<LE>]>::ref_from_bytes(bytes).expect("byte-order integers tolerate any alignment")
    }

    /// Views the code column in base delivery order.
    #[must_use]
    pub(crate) fn codes(&self) -> &[U64<LE>] {
        let bytes = self.region(
            self.header()
                .codes_offset()
                .expect("open validated the geometry"),
            self.count() * size_of::<u64>() as u64,
        );
        <[U64<LE>]>::ref_from_bytes(bytes).expect("byte-order integers tolerate any alignment")
    }

    /// Returns the positions of `bucket`'s codes inside `cell`: one
    /// contiguous run of the base delivery order.
    ///
    /// The run is found by two index-accelerated searches constrained
    /// to the bucket's segment. An empty range means the bucket has no
    /// point in the cell.
    #[must_use]
    pub(crate) fn run(&self, bucket: Depth, cell: MortonCell) -> Range<u64> {
        let segment = self.fenceposts.segment(bucket);
        let min = cell.min_key().to_bits();
        let max = cell.max_key().to_bits();

        let start = self.partition_point(segment.clone(), |code| code < min);
        // The cell's maximum key is inclusive (and `u64::MAX` at the
        // root), so the run closes at the first code beyond it rather
        // than at a lower bound of `max + 1`.
        let end = self.partition_point(start..segment.end, |code| code <= max);

        start..end
    }

    /// Returns the code at one base position.
    ///
    /// # Panics
    ///
    /// Panics when `position` is at or beyond [`count`](Self::count).
    #[must_use]
    pub(crate) fn code(&self, position: u64) -> MortonKey {
        let position = usize::try_from(position).expect("a mapped position fits the address space");
        MortonKey::from_bits(self.codes()[position].get())
    }

    /// Finds the first position in `range` whose code fails `pred`.
    ///
    /// `pred` must be monotone over the range's codes - true for a
    /// prefix, false for the rest - which every threshold predicate
    /// over non-decreasing codes is. The index narrows the search to
    /// one final window of at most `stride` codes: sampled index keys
    /// inside the range locate the window (one faulted index page,
    /// itself hot across queries), and the window search faults one
    /// code page.
    fn partition_point(&self, range: Range<u64>, pred: impl Fn(u64) -> bool) -> u64 {
        let stride = u64::from(self.header().stride());

        // Index keys sampled inside the range: positions `i * stride`
        // with `range.start <= i * stride < range.end`.
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

        let window = &self.codes()[usize::try_from(window_start)
            .expect("a mapped position fits the address space")
            ..usize::try_from(window_end).expect("a mapped position fits the address space")];
        window_start + window.partition_point(|code| pred(code.get())) as u64
    }
}

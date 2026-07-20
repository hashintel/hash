//! Opened adjacency files.

use core::{error::Error, fmt, ops::Range};
use std::{fs::File, io, path::Path};

use memmap2::Mmap;
use zerocopy::{
    FromBytes as _, TryFromBytes as _,
    error::{ConvertError, ValidityError},
};

use super::{EdgeWidth, FileHeader};

/// Opening an adjacency file failed.
#[derive(Debug)]
pub enum OpenAdjacencyError {
    /// The file could not be opened or mapped.
    Io(io::Error),
    /// The file is shorter than one header.
    Undersized { actual: u64 },
    /// The leading bytes are not a header this module speaks.
    Header(ValidityError<(), FileHeader>),
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes; [`None`] when the header's
        /// geometry overflows `u64`, in which case it matches no real
        /// file.
        expected: Option<u64>,
        actual: u64,
    },
}

impl fmt::Display for OpenAdjacencyError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(fmt, "the adjacency file could not be read: {error}"),
            Self::Undersized { actual } => write!(
                fmt,
                "the file holds {actual} bytes, fewer than the {}-byte header",
                FileHeader::SIZE,
            ),
            Self::Header(error) => write!(
                fmt,
                "the leading bytes are not an adjacency file header: {error}",
            ),
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
                "the file holds {actual} bytes where the header describes no adjacency",
            ),
        }
    }
}

impl Error for OpenAdjacencyError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Header(error) => Some(error),
            Self::Undersized { .. } | Self::Length { .. } => None,
        }
    }
}

/// The value array of an opened adjacency file, at the width its header
/// pins.
///
/// Both arms hold edge row ids; [`get`](Self::get) and
/// [`iter`](Self::iter) widen to `u64`, so consumers indexing single
/// slots never match on the width themselves.
#[derive(Debug, Copy, Clone)]
pub(crate) enum EdgeValues<'map> {
    /// Four-byte edge row ids.
    U32(&'map [u32]),
    /// Eight-byte edge row ids.
    U64(&'map [u64]),
}

impl EdgeValues<'_> {
    /// Returns the number of value slots.
    #[inline]
    #[must_use]
    pub(crate) const fn len(&self) -> usize {
        match self {
            Self::U32(values) => values.len(),
            Self::U64(values) => values.len(),
        }
    }

    /// Returns whether the array holds no slots.
    #[inline]
    #[must_use]
    pub(crate) const fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Returns the edge row id in slot `index`.
    ///
    /// # Panics
    ///
    /// Panics when `index` is at or beyond [`len`](Self::len), like a
    /// slice.
    #[inline]
    #[must_use]
    pub(crate) const fn get(&self, index: usize) -> u64 {
        match self {
            Self::U32(values) => values[index] as u64,
            Self::U64(values) => values[index],
        }
    }

    /// Narrows the array to `range`, keeping the width.
    ///
    /// # Panics
    ///
    /// Panics when `range` escapes [`len`](Self::len), like a slice.
    #[inline]
    #[must_use]
    pub(crate) const fn slice(&self, range: Range<usize>) -> Self {
        match self {
            Self::U32(values) => Self::U32(&values[range]),
            Self::U64(values) => Self::U64(&values[range]),
        }
    }

    /// Iterates the edge row ids in slot order.
    pub(crate) fn iter(self) -> impl ExactSizeIterator<Item = u64> {
        (0..self.len()).map(move |index| self.get(index))
    }
}

/// An adjacency file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural
/// rule, so an open file always describes its own regions exactly. The
/// regions are borrowed straight from the whole-file mapping and start
/// 4096-byte aligned: aligned for every scalar and SIMD width. The
/// accessors expose geometry alone; the list invariants are
/// `salt::adjacency`'s artifact contract.
#[derive(Debug)]
pub(crate) struct AdjacencyFile {
    map: Mmap,
}

impl AdjacencyFile {
    /// Opens and maps the adjacency file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenAdjacencyError::Io`] when the file cannot be
    /// opened or mapped, [`OpenAdjacencyError::Header`] when its
    /// leading bytes are not a header this module speaks, and
    /// [`OpenAdjacencyError::Length`] when the file length contradicts
    /// the header's geometry.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenAdjacencyError> {
        let file = File::open(path).map_err(OpenAdjacencyError::Io)?;
        // SAFETY: published artifact files are immutable (the `crate::file`
        // publish contract: temporary path, rename into place, never
        // rewritten), so the mapped bytes cannot change beneath the borrow.
        let map = unsafe { Mmap::map(&file) }.map_err(OpenAdjacencyError::Io)?;

        let Some(bytes) = map.get(..FileHeader::SIZE) else {
            return Err(OpenAdjacencyError::Undersized {
                actual: map.len() as u64,
            });
        };

        let header = match FileHeader::try_read_from_bytes(bytes) {
            Ok(header) => header,
            Err(ConvertError::Validity(error)) => {
                return Err(OpenAdjacencyError::Header(error.map_src(|_| ())));
            }
            Err(ConvertError::Size(_)) => {
                unreachable!("the slice is exactly one header long")
            }
        };

        let expected = header.expected_file_len();
        let actual = map.len() as u64;
        if expected != Some(actual) {
            return Err(OpenAdjacencyError::Length { expected, actual });
        }

        Ok(Self { map })
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

    /// Returns the node row count `N`.
    #[inline]
    #[must_use]
    pub(crate) fn nodes(&self) -> u64 {
        self.header().nodes()
    }

    /// Returns the edge row count `E`.
    #[inline]
    #[must_use]
    pub(crate) fn edges(&self) -> u64 {
        self.header().edges()
    }

    /// Carves one region out of the mapping.
    fn region(&self, offset: u64, len: u64) -> &[u8] {
        // The offsets and products repeat checked computations open
        // already accepted, so none of them can overflow here.
        let offset = usize::try_from(offset).expect("a mapped offset fits the address space");
        let len = usize::try_from(len).expect("a mapped region fits the address space");

        &self.map[offset..offset + len]
    }

    /// Views the `2N + 1` fenceposts.
    ///
    /// Fencepost `2i` starts node row `i`'s outgoing run, `2i + 1` its
    /// incoming run, and `2i + 2` ends it.
    #[must_use]
    pub(crate) fn fenceposts(&self) -> &[u64] {
        let bytes = self.region(
            FileHeader::SIZE as u64,
            self.header()
                .fencepost_count()
                .expect("open validated the geometry")
                * size_of::<u64>() as u64,
        );

        <[u64]>::ref_from_bytes(bytes).expect("open validated the region size and alignment")
    }

    /// Views the `2E` value slots at the header's width.
    #[must_use]
    pub(crate) fn values(&self) -> EdgeValues<'_> {
        let offset = self
            .header()
            .values_offset()
            .expect("open validated the geometry");
        let slots = self.header().edges() * 2;

        match self.header().width() {
            EdgeWidth::U32 => {
                let bytes = self.region(offset, slots * size_of::<u32>() as u64);
                EdgeValues::U32(
                    <[u32]>::ref_from_bytes(bytes)
                        .expect("open validated the region size and alignment"),
                )
            }
            EdgeWidth::U64 => {
                let bytes = self.region(offset, slots * size_of::<u64>() as u64);
                EdgeValues::U64(
                    <[u64]>::ref_from_bytes(bytes)
                        .expect("open validated the region size and alignment"),
                )
            }
        }
    }
}

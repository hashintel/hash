//! Opened k-nearest-neighbour files.

use core::{error::Error, fmt};
use std::{fs::File, io, path::Path};

use memmap2::Mmap;
use zerocopy::{
    FromBytes as _, TryFromBytes as _,
    error::{ConvertError, ValidityError},
};

use super::FileHeader;

/// Opening a k-nearest-neighbour file failed.
#[derive(Debug)]
pub(crate) enum OpenKnnError {
    /// The file could not be opened or mapped.
    Io(io::Error),
    /// The file is shorter than one header.
    Undersized { actual: u64 },
    /// The leading bytes are not a header this module speaks.
    Header(ValidityError<(), FileHeader>),
    /// The file length contradicts the header's shape.
    Length {
        /// The length the header describes; [`None`] when the header's
        /// geometry overflows `u64` and matches no real file.
        expected: Option<u64>,
        actual: u64,
    },
}

impl fmt::Display for OpenKnnError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(fmt, "the k-NN file could not be read: {error}"),
            Self::Undersized { actual } => write!(
                fmt,
                "the file holds {actual} bytes, fewer than the {}-byte header",
                FileHeader::SIZE,
            ),
            Self::Header(error) => {
                write!(fmt, "the leading bytes are not a k-NN file header: {error}")
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
                "the file holds {actual} bytes where the header's geometry overflows",
            ),
        }
    }
}

impl Error for OpenKnnError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Header(error) => Some(error),
            Self::Undersized { .. } | Self::Length { .. } => None,
        }
    }
}

/// A k-nearest-neighbour file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural
/// rule, so an open file always describes its own regions exactly and
/// the typed accessors never fail. Both regions are borrowed straight
/// from the whole-file mapping and start 4096-byte aligned: aligned for
/// every scalar and SIMD width.
#[derive(Debug)]
pub(crate) struct KnnFile {
    map: Mmap,
}

impl KnnFile {
    /// Opens and maps the k-nearest-neighbour file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenKnnError::Io`] when the file cannot be opened or
    /// mapped, [`OpenKnnError::Header`] when its leading bytes are not
    /// a header this module speaks, and [`OpenKnnError::Length`] when
    /// the file length contradicts the header's shape.
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenKnnError> {
        let file = File::open(path).map_err(OpenKnnError::Io)?;
        // SAFETY: published artifact files are immutable (the `crate::file`
        // publish contract: temporary path, rename into place, never
        // rewritten), so the mapped bytes cannot change beneath the borrow.
        let map = unsafe { Mmap::map(&file) }.map_err(OpenKnnError::Io)?;

        let Some(bytes) = map.get(..FileHeader::SIZE) else {
            return Err(OpenKnnError::Undersized {
                actual: map.len() as u64,
            });
        };
        let header = match FileHeader::try_read_from_bytes(bytes) {
            Ok(header) => header,
            Err(ConvertError::Validity(error)) => {
                return Err(OpenKnnError::Header(error.map_src(|_| ())));
            }
            Err(ConvertError::Size(_)) => {
                unreachable!("the slice is exactly one header long")
            }
        };

        let expected = header.expected_file_len();
        let actual = map.len() as u64;
        if expected != Some(actual) {
            return Err(OpenKnnError::Length { expected, actual });
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

    /// Returns the number of node rows.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> u64 {
        self.header().rows()
    }

    /// Returns the number of neighbours per row.
    #[inline]
    #[must_use]
    pub(crate) fn neighbours(&self) -> u64 {
        self.header().neighbours()
    }

    /// Borrows the `u32[N, k]` column region, 4096-byte aligned.
    ///
    /// Entry `row * k + i` is the `i`-th neighbour of `row`, ascending
    /// within each row.
    #[must_use]
    pub(crate) fn columns(&self) -> &[u32] {
        let entries = self
            .header()
            .entries()
            .expect("open validated the geometry");
        let bytes = usize::try_from(entries * size_of::<u32>() as u64)
            .expect("a mapped region fits the address space");

        <[u32]>::ref_from_bytes(&self.map[FileHeader::SIZE..FileHeader::SIZE + bytes])
            .expect("open validated the region's size and the mapping its alignment")
    }

    /// Borrows the `f32[N, k]` distance region, 4096-byte aligned.
    ///
    /// Entry for entry aligned with [`columns`](Self::columns).
    #[must_use]
    pub(crate) fn distances(&self) -> &[f32] {
        let offset = self
            .header()
            .distances_offset()
            .expect("open validated the geometry");
        let offset = usize::try_from(offset).expect("a mapped region fits the address space");

        <[f32]>::ref_from_bytes(&self.map[offset..])
            .expect("open validated the region's size and the mapping its alignment")
    }
}

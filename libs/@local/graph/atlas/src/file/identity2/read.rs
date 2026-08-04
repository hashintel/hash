//! Opened identity files.

use core::{error::Error, fmt};
use std::path::Path;

use zerocopy::FromBytes as _;

use super::{FileHeader, KeyKind, Kind, PayloadSpan};
use crate::file::region::{
    PAGE,
    header::{HeaderError, HeaderMap},
};

/// Opening an identity file failed.
#[derive(Debug)]
pub(crate) enum OpenIdentityError {
    /// Reading the header page failed.
    Header(HeaderError),
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes.
        ///
        /// [`None`] when the header's geometry overflows `u64`, in which case it matches no real
        /// file.
        expected: Option<u64>,
        actual: u64,
    },
    /// The index region is not an fst map.
    Index(fst::Error),
}

impl fmt::Display for OpenIdentityError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header(error) => write!(fmt, "the identity file's header page: {error}"),
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
                "the file holds {actual} bytes where the header describes no table",
            ),
            Self::Index(error) => write!(fmt, "the identity file's index region: {error}"),
        }
    }
}

impl Error for OpenIdentityError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Header(error) => Some(error),
            Self::Length { .. } => None,
            Self::Index(error) => Some(error),
        }
    }
}

/// An identity file mapped read-only into memory.
///
/// Opening parses the header, checks the file length against the header's geometry, and parses
/// the index region, so an open file always describes its own regions exactly. Every region
/// borrows straight from the whole-file mapping and starts 4096-byte aligned. Keys are opaque
/// `K`-byte strings at this layer and the payload is opaque bytes, so both come out raw; the
/// typed table over them, and its domain invariants, are the typed table's contract, validated
/// where the typed table lives.
#[derive(Debug)]
pub(crate) struct IdentityFile {
    map: HeaderMap<FileHeader>,
}

impl IdentityFile {
    /// Opens and maps the identity file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenIdentityError::Header`] when the header page cannot be read,
    /// [`OpenIdentityError::Length`] when the file length contradicts the header's geometry, and
    /// [`OpenIdentityError::Index`] when the index region is not an fst map.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenIdentityError> {
        let map = HeaderMap::<FileHeader>::open(path).map_err(OpenIdentityError::Header)?;

        let expected = map.header().expected_file_len();
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenIdentityError::Length { expected, actual });
        }

        let file = Self { map };
        // Parsing validates the index bytes once, so the accessor's reparse cannot fail later.
        fst::Map::new(file.index_region()).map_err(OpenIdentityError::Index)?;

        Ok(file)
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    fn header(&self) -> &FileHeader {
        self.map.header()
    }

    /// Returns the row domain the file covers.
    #[inline]
    #[must_use]
    pub(crate) fn kind(&self) -> Kind {
        self.header().kind()
    }

    /// Returns the key kind: the key type and width `K`.
    #[inline]
    #[must_use]
    pub(crate) fn key_kind(&self) -> KeyKind {
        self.header().key_kind()
    }

    /// Returns the row count `N`.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> u64 {
        self.header().rows()
    }

    /// Views the key column: `N` keys of `K` bytes, in row order.
    #[must_use]
    pub(crate) fn keys(&self) -> &[u8] {
        // The offsets and products in the region reads repeat checked
        // computations open already accepted, so none of them can
        // overflow here.
        self.map
            .map()
            .region(PAGE, self.rows() * self.header().key_kind().width() as u64)
    }

    /// Views the raw index region: `F` bytes of fst map.
    fn index_region(&self) -> &[u8] {
        self.map.map().region(
            self.header()
                .index_offset()
                .expect("open validated the geometry"),
            self.header().index_bytes(),
        )
    }

    /// Views the index: a map from each key's bytes to its row.
    #[must_use]
    pub(crate) fn index(&self) -> fst::Map<&[u8]> {
        fst::Map::new(self.index_region()).expect("open validated the index")
    }

    /// Views the span table: one payload-relative span per row, in row order.
    #[must_use]
    pub(crate) fn spans(&self) -> &[PayloadSpan] {
        let bytes = self.map.map().region(
            self.header()
                .spans_offset()
                .expect("open validated the geometry"),
            self.rows() * size_of::<PayloadSpan>() as u64,
        );
        <[PayloadSpan]>::ref_from_bytes(bytes)
            .expect("open validated the region size and the span is unaligned")
    }

    /// Views the payload region: `P` bytes the spans carve.
    #[must_use]
    pub(crate) fn payload(&self) -> &[u8] {
        self.map.map().region(
            self.header()
                .payload_offset()
                .expect("open validated the geometry"),
            self.header().payload_bytes(),
        )
    }
}

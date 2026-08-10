//! Opened attraction files.

use core::{error::Error, fmt};
use std::path::Path;

use zerocopy::FromBytes as _;

use super::{EdgeRecord, FileHeader, GroupRecord};
use crate::file::region::{
    PAGE,
    header::{HeaderError, HeaderMap},
};

/// Opening an attraction file failed.
#[derive(Debug)]
pub enum OpenAttractionError {
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
}

impl fmt::Display for OpenAttractionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header(error) => write!(fmt, "the attraction file's header page: {error}"),
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
                "the file holds {actual} bytes where the header describes no index",
            ),
        }
    }
}

impl Error for OpenAttractionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Header(error) => Some(error),
            Self::Length { .. } => None,
        }
    }
}

/// An attraction file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural rule, so an open file always
/// describes its own regions exactly. The regions borrow straight from the whole-file mapping and
/// start 4096-byte aligned: aligned for every scalar and SIMD width. The accessors expose geometry
/// alone. The index's domain invariants are `salt::relation`'s artifact contract.
#[derive(Debug)]
pub(crate) struct AttractionFile {
    map: HeaderMap<FileHeader>,
}

impl AttractionFile {
    /// Opens and maps the attraction file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenAttractionError::Header`] when the header page cannot be read, and
    /// [`OpenAttractionError::Length`] when the file length contradicts the header's geometry.
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenAttractionError> {
        let map = HeaderMap::<FileHeader>::open(path).map_err(OpenAttractionError::Header)?;

        let expected = map.header().expected_file_len();
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenAttractionError::Length { expected, actual });
        }

        Ok(Self { map })
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    fn header(&self) -> &FileHeader {
        self.map.header()
    }

    /// Returns the corpus row count `N` the edges index into.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> u64 {
        self.header().rows()
    }

    /// Views the relation groups, in file order.
    #[must_use]
    pub(crate) fn groups(&self) -> &[GroupRecord] {
        // The offsets and products in the region reads repeat checked
        // computations open already accepted, so none of them can
        // overflow here.
        let bytes = self.map.map().region(
            PAGE,
            self.header().groups() * size_of::<GroupRecord>() as u64,
        );

        <[GroupRecord]>::ref_from_bytes(bytes).expect("open validated the region size")
    }

    /// Views the edge records, in group-major order.
    #[must_use]
    pub(crate) fn edges(&self) -> &[EdgeRecord] {
        let bytes = self.map.map().region(
            self.header()
                .edges_offset()
                .expect("open validated the geometry"),
            self.header().edges() * size_of::<EdgeRecord>() as u64,
        );

        <[EdgeRecord]>::ref_from_bytes(bytes).expect("open validated the region size")
    }
}

//! Opened landmark files.

use core::{error::Error, fmt};
use std::path::Path;

use zerocopy::{FromBytes as _, LE, U32, U64};

use super::FileHeader;
use crate::{
    file::region::{
        PAGE,
        header::{HeaderError, HeaderMap},
    },
    math::Vec2,
};

/// Opening a landmark file failed.
#[derive(Debug)]
pub enum OpenLandmarkError {
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

impl fmt::Display for OpenLandmarkError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header(error) => write!(fmt, "the landmark file's header page: {error}"),
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
                "the file holds {actual} bytes where the header describes no skeleton",
            ),
        }
    }
}

impl Error for OpenLandmarkError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Header(error) => Some(error),
            Self::Length { .. } => None,
        }
    }
}

/// A landmark file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural rule, so an open file always
/// describes its own regions exactly. Every region borrows straight from the whole-file mapping and
/// starts 4096-byte aligned: aligned for every scalar and SIMD width. The accessors expose geometry
/// alone. The skeleton's domain invariants are `salt::landmark`'s artifact contract.
#[derive(Debug)]
pub(crate) struct LandmarkFile {
    map: HeaderMap<FileHeader>,
}

impl LandmarkFile {
    /// Opens and maps the landmark file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenLandmarkError::Header`] when the header page cannot be read, and
    /// [`OpenLandmarkError::Length`] when the file length contradicts the header's geometry.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenLandmarkError> {
        let map = HeaderMap::<FileHeader>::open(path).map_err(OpenLandmarkError::Header)?;

        let expected = map.header().expected_file_len();
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenLandmarkError::Length { expected, actual });
        }

        Ok(Self { map })
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    fn header(&self) -> &FileHeader {
        self.map.header()
    }

    /// Returns the landmark count `M`.
    #[inline]
    #[must_use]
    pub(crate) fn landmarks(&self) -> u64 {
        self.header().landmarks()
    }

    /// Returns the corpus row count `N`.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> u64 {
        self.header().rows()
    }

    /// Views the selected node rows, in ordinal order.
    #[must_use]
    pub(crate) fn selected_rows(&self) -> &[U64<LE>] {
        // The offsets and products in the region reads repeat checked
        // computations open already accepted, so none of them can
        // overflow here.
        let bytes = self
            .map
            .map()
            .region(PAGE, self.landmarks() * size_of::<u64>() as u64);
        <[U64<LE>]>::ref_from_bytes(bytes).expect("open validated the region size")
    }

    /// Views the landmark ordinals, in node-row order.
    #[must_use]
    pub(crate) fn assignment(&self) -> &[U32<LE>] {
        let bytes = self.map.map().region(
            self.header()
                .assignment_offset()
                .expect("open validated the geometry"),
            self.rows() * size_of::<u32>() as u64,
        );
        <[U32<LE>]>::ref_from_bytes(bytes).expect("open validated the region size")
    }

    /// Views the layout coordinates, in ordinal order.
    #[must_use]
    pub(crate) fn coordinates(&self) -> &[Vec2] {
        let bytes = self.map.map().region(
            self.header()
                .coordinates_offset()
                .expect("open validated the geometry"),
            self.landmarks() * (2 * size_of::<f32>() as u64),
        );

        <[Vec2]>::ref_from_bytes(bytes)
            .expect("open validated the region size and the mapping its alignment")
    }
}

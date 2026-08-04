//! Opened classifier files.

use core::{error::Error, fmt};
use std::path::Path;

use zerocopy::FromBytes as _;

use super::{CLASSES, FileHeader};
use crate::file::region::{
    PAGE,
    header::{HeaderError, HeaderMap},
};

/// Opening a classifier file failed.
#[derive(Debug)]
pub enum OpenClassifierError {
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

impl fmt::Display for OpenClassifierError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header(error) => write!(fmt, "the classifier file's header page: {error}"),
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
                "the file holds {actual} bytes where the header describes no model",
            ),
        }
    }
}

impl Error for OpenClassifierError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Header(error) => Some(error),
            Self::Length { .. } => None,
        }
    }
}

/// A classifier file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural rule, so an open file always
/// describes its own regions exactly. The regions borrow straight from the whole-file mapping and
/// start 4096-byte aligned: aligned for every scalar and SIMD width. The accessors expose geometry
/// alone. The model's domain invariants are `salt::policy::classifier`'s artifact contract.
#[derive(Debug)]
pub(crate) struct ClassifierFile {
    map: HeaderMap<FileHeader>,
}

impl ClassifierFile {
    /// Opens and maps the classifier file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenClassifierError::Header`] when the header page cannot be read, and
    /// [`OpenClassifierError::Length`] when the file length contradicts the header's geometry.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenClassifierError> {
        let map = HeaderMap::<FileHeader>::open(path).map_err(OpenClassifierError::Header)?;

        let expected = map.header().expected_file_len();
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenClassifierError::Length { expected, actual });
        }

        Ok(Self { map })
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    fn header(&self) -> &FileHeader {
        self.map.header()
    }

    /// Returns the embedding dimension `D`.
    #[inline]
    #[must_use]
    pub(crate) fn dimension(&self) -> u64 {
        self.header().dimension()
    }

    /// Returns the calibration temperature verbatim.
    #[inline]
    #[must_use]
    pub(crate) fn temperature(&self) -> f64 {
        self.header().temperature()
    }

    /// Returns the intercepts verbatim, in class order.
    #[inline]
    #[must_use]
    pub(crate) fn intercepts(&self) -> [f64; CLASSES] {
        self.header().intercepts()
    }

    /// Returns the byte size of one `f64[D]` region.
    fn vector_bytes(&self) -> u64 {
        self.dimension() * size_of::<f64>() as u64
    }

    /// Views the coefficient rows, flat in class order.
    ///
    /// Row `c` spans components `c * D..(c + 1) * D`.
    #[must_use]
    pub(crate) fn coefficients(&self) -> &[f64] {
        // The offsets and products in the region reads repeat checked
        // computations open already accepted, so none of them can
        // overflow here.
        let bytes = self
            .map
            .map()
            .region(PAGE, CLASSES as u64 * self.vector_bytes());
        <[f64]>::ref_from_bytes(bytes)
            .expect("open validated the region size and the mapping its alignment")
    }

    /// Views the applicability training mean.
    #[must_use]
    pub(crate) fn mean(&self) -> &[f64] {
        let bytes = self.map.map().region(
            self.header()
                .mean_offset()
                .expect("open validated the geometry"),
            self.vector_bytes(),
        );
        <[f64]>::ref_from_bytes(bytes)
            .expect("open validated the region size and the mapping its alignment")
    }

    /// Views the applicability inverse scales.
    #[must_use]
    pub(crate) fn inverse_scales(&self) -> &[f64] {
        let bytes = self.map.map().region(
            self.header()
                .inverse_scales_offset()
                .expect("open validated the geometry"),
            self.vector_bytes(),
        );
        <[f64]>::ref_from_bytes(bytes)
            .expect("open validated the region size and the mapping its alignment")
    }

    /// Views the training distances.
    #[must_use]
    pub(crate) fn distances(&self) -> &[f64] {
        let bytes = self.map.map().region(
            self.header()
                .distances_offset()
                .expect("open validated the geometry"),
            self.header().distance_count() * size_of::<f64>() as u64,
        );
        <[f64]>::ref_from_bytes(bytes)
            .expect("open validated the region size and the mapping its alignment")
    }
}

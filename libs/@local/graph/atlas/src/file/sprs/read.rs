//! Opened sparse matrix files.

use core::{error::Error, fmt};
use std::path::Path;

use sprs::{CsMatViewI, errors::StructureError};
use zerocopy::FromBytes as _;

use super::{FileHeader, IndexVariant, SprsIndex, SprsValue, StorageVariant, ValueTag};
use crate::file::region::{
    PAGE,
    header::{HeaderError, HeaderMap},
};

/// Opening a sparse matrix file failed.
// pub: rides `OpenAtlasError`'s public adjacency variant.
#[derive(Debug)]
pub enum OpenSprsError {
    /// Reading the header page failed.
    Header(HeaderError),
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes.
        ///
        /// [`None`] when the header's geometry overflows `u64` or its shape is not a matrix, in
        /// which case it matches no real file.
        expected: Option<u64>,
        actual: u64,
    },
}

impl fmt::Display for OpenSprsError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header(error) => write!(fmt, "the sparse matrix file's header page: {error}"),
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
                "the file holds {actual} bytes where the header describes no matrix",
            ),
        }
    }
}

impl Error for OpenSprsError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Header(error) => Some(error),
            Self::Length { .. } => None,
        }
    }
}

/// Viewing an opened file's matrix failed.
// pub: rides `InvalidAdjacencyFile`'s public matrix variant.
#[derive(Debug)]
pub enum SprsMatrixError {
    /// The file stores different element types than the requested ones.
    Elements {
        value: ValueTag,
        value_width: u64,
        index: IndexVariant,
        iptr: IndexVariant,
    },
    /// The matrix does not fit the address space.
    TooLarge,
    /// The regions violate the compressed-row structure.
    Structure(StructureError),
}

impl fmt::Display for SprsMatrixError {
    #[expect(
        clippy::use_debug,
        reason = "the variant names are the format's own element vocabulary"
    )]
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Elements {
                value,
                value_width,
                index,
                iptr,
            } => write!(
                fmt,
                "the file stores {value_width}-byte {value:?} values under {index:?} indices and \
                 {iptr:?} row pointers",
            ),
            Self::TooLarge => fmt.write_str("the matrix does not fit the address space"),
            Self::Structure(error) => write!(
                fmt,
                "the regions violate the compressed-row structure: {error}",
            ),
        }
    }
}

impl Error for SprsMatrixError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Structure(error) => Some(error),
            Self::Elements { .. } | Self::TooLarge => None,
        }
    }
}

/// A sparse matrix file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural rule, so an open file always
/// describes its own regions exactly. The regions borrow straight from the whole-file mapping and
/// start on a 4096-byte boundary, an alignment that suits every scalar and SIMD width.
#[derive(Debug)]
pub(crate) struct SprsFile {
    map: HeaderMap<FileHeader>,
}

impl SprsFile {
    /// Opens and maps the sparse matrix file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenSprsError::Header`] when the header page cannot be read, and
    /// [`OpenSprsError::Length`] when the file length contradicts the header's geometry.
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenSprsError> {
        let map = HeaderMap::<FileHeader>::open(path).map_err(OpenSprsError::Header)?;

        let expected = map.header().expected_file_len();
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenSprsError::Length { expected, actual });
        }

        Ok(Self { map })
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    fn header(&self) -> &FileHeader {
        self.map.header()
    }

    /// Returns the value type tag.
    #[inline]
    #[must_use]
    pub(crate) fn value(&self) -> ValueTag {
        self.header().value()
    }

    /// Returns the value entry width in bytes.
    #[inline]
    #[must_use]
    pub(crate) fn value_width(&self) -> u64 {
        self.header().value_width()
    }

    /// Returns the column-index element type.
    #[inline]
    #[must_use]
    pub(crate) fn index(&self) -> IndexVariant {
        self.header().index()
    }

    /// Returns the pointer element type.
    #[inline]
    #[must_use]
    pub(crate) fn iptr(&self) -> IndexVariant {
        self.header().iptr()
    }

    /// Returns the compressed dimension.
    #[inline]
    #[must_use]
    pub(crate) fn order(&self) -> StorageVariant {
        self.header().order()
    }

    /// Returns the `(rows, columns)` shape.
    #[inline]
    #[must_use]
    pub(crate) fn matrix_shape(&self) -> (u64, u64) {
        self.header()
            .matrix_shape()
            .expect("open validated the geometry, which requires a rank-2 shape")
    }

    /// Returns the number of stored entries.
    #[inline]
    #[must_use]
    pub(crate) fn nnz(&self) -> u64 {
        self.header().nnz()
    }

    /// Views the matrix at its described element types.
    ///
    /// The view exists exactly for the element combination the header describes
    /// ([`value`](Self::value) tag and [`value_width`](Self::value_width) both,
    /// [`index`](Self::index), [`iptr`](Self::iptr)), so a region is never read at the wrong width.
    /// An [`Opaque`](ValueTag::Opaque) value carries no identity beyond its width, which is that
    /// tag's documented contract. A [`Unit`](ValueTag::Unit) matrix stores no value bytes. Its `()`
    /// entries materialize at the recorded entry count, so the structure-only view drives sparse
    /// algorithms like any other. Every call re-checks the compressed-row structure, which costs
    /// one pass over the entries. Reuse the view within a stage rather than calling again.
    ///
    /// # Errors
    ///
    /// Returns an error when the requested element types differ from the described ones, the matrix
    /// exceeds the address space, or the regions violate the compressed-row structure.
    pub(crate) fn matrix<N, I, Iptr>(&self) -> Result<CsMatViewI<'_, N, I, Iptr>, SprsMatrixError>
    where
        N: SprsValue,
        I: SprsIndex,
        Iptr: SprsIndex,
    {
        let header = self.header();
        if (N::TAG, size_of::<N>() as u64, I::VARIANT, Iptr::VARIANT)
            != (
                header.value(),
                header.value_width(),
                header.index(),
                header.iptr(),
            )
        {
            return Err(SprsMatrixError::Elements {
                value: header.value(),
                value_width: header.value_width(),
                index: header.index(),
                iptr: header.iptr(),
            });
        }

        let (row_count, column_count) = self.matrix_shape();
        let rows = usize::try_from(row_count)
            .ok()
            .ok_or(SprsMatrixError::TooLarge)?;
        let columns = usize::try_from(column_count)
            .ok()
            .ok_or(SprsMatrixError::TooLarge)?;

        // The offsets and products below repeat checked computations
        // open already accepted, so none of them can overflow here.
        let region = |offset: u64, len: u64| self.map.map().region(offset, len);
        let entries = header.nnz();
        let outer = header.outer_count().expect("open validated the geometry");
        let indptr = region(PAGE, (outer + 1) * Iptr::VARIANT.width());
        let indices = region(
            header
                .indices_offset()
                .expect("open validated the geometry"),
            entries * I::VARIANT.width(),
        );
        let values = region(
            header.values_offset().expect("open validated the geometry"),
            entries * size_of::<N>() as u64,
        );

        let expect = "open validated the region sizes and the mapping their alignment";
        let indptr = <[Iptr]>::ref_from_bytes(indptr).expect(expect);
        let indices = <[I]>::ref_from_bytes(indices).expect(expect);
        let values = N::view_region(
            values,
            usize::try_from(entries)
                .expect("the index region maps, so the entry count fits the address space"),
        );
        match header.order() {
            StorageVariant::Csr => CsMatViewI::try_new((rows, columns), indptr, indices, values),
            StorageVariant::Csc => {
                CsMatViewI::try_new_csc((rows, columns), indptr, indices, values)
            }
        }
        .map_err(|(_, _, _, error)| SprsMatrixError::Structure(error))
    }

    /// Views the pointer region at its described element type.
    ///
    /// The compressed structure is not re-checked.
    ///
    /// The element check is [`matrix`](Self::matrix)'s; the structural contract stays that
    /// accessor's to validate, so callers hold a successful [`matrix`](Self::matrix) call over this
    /// file before reading regions directly.
    ///
    /// # Errors
    ///
    /// Returns an error when the file stores a different pointer element type than the requested
    /// one.
    pub(crate) fn indptr<Iptr>(&self) -> Result<&[Iptr], SprsMatrixError>
    where
        Iptr: SprsIndex,
    {
        let header = self.header();
        if Iptr::VARIANT != header.iptr() {
            return Err(self.elements());
        }

        let outer = header.outer_count().expect("open validated the geometry");
        let bytes = self
            .map
            .map()
            .region(PAGE, (outer + 1) * Iptr::VARIANT.width());
        Ok(<[Iptr]>::ref_from_bytes(bytes)
            .expect("open validated the region sizes and the mapping their alignment"))
    }

    /// Views the index region at its described element type.
    ///
    /// The compressed structure is not re-checked.
    ///
    /// The element check is [`matrix`](Self::matrix)'s; the structural contract stays that
    /// accessor's to validate, so callers hold a successful [`matrix`](Self::matrix) call over this
    /// file before reading regions directly.
    ///
    /// # Errors
    ///
    /// Returns an error when the file stores a different index element type than the requested one.
    pub(crate) fn indices<I>(&self) -> Result<&[I], SprsMatrixError>
    where
        I: SprsIndex,
    {
        let header = self.header();
        if I::VARIANT != header.index() {
            return Err(self.elements());
        }

        let bytes = self.map.map().region(
            header
                .indices_offset()
                .expect("open validated the geometry"),
            header.nnz() * I::VARIANT.width(),
        );
        Ok(<[I]>::ref_from_bytes(bytes)
            .expect("open validated the region sizes and the mapping their alignment"))
    }

    /// Builds the element-mismatch error over the described types.
    fn elements(&self) -> SprsMatrixError {
        let header = self.header();
        SprsMatrixError::Elements {
            value: header.value(),
            value_width: header.value_width(),
            index: header.index(),
            iptr: header.iptr(),
        }
    }
}

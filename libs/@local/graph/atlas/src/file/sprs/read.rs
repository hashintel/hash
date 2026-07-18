//! Opened sparse matrix files.

use core::{error::Error, fmt};
use std::{fs::File, io, path::Path};

use memmap2::Mmap;
use sprs::{CsMatViewI, errors::StructureError};
use zerocopy::{
    FromBytes as _, TryFromBytes as _,
    error::{ConvertError, ValidityError},
};

use super::{ArrayVariant, FileHeader, IndexVariant, SprsIndex, SprsValue, StorageVariant};

/// Opening a sparse matrix file failed.
#[derive(Debug)]
pub(crate) enum OpenSprsError {
    /// The file could not be opened or mapped.
    Io(io::Error),
    /// The file is shorter than one header.
    Undersized { actual: u64 },
    /// The leading bytes are not a header this module speaks.
    Header(ValidityError<(), FileHeader>),
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes; [`None`] when the header's
        /// geometry overflows `u64` or its shape is not a matrix, in
        /// which case it matches no real file.
        expected: Option<u64>,
        actual: u64,
    },
}

impl fmt::Display for OpenSprsError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(fmt, "the sparse matrix file could not be read: {error}"),
            Self::Undersized { actual } => write!(
                fmt,
                "the file holds {actual} bytes, fewer than the {}-byte header",
                FileHeader::SIZE,
            ),
            Self::Header(error) => write!(
                fmt,
                "the leading bytes are not a sparse matrix file header: {error}",
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
                "the file holds {actual} bytes where the header describes no matrix",
            ),
        }
    }
}

impl Error for OpenSprsError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Header(error) => Some(error),
            Self::Undersized { .. } | Self::Length { .. } => None,
        }
    }
}

/// Viewing an opened file's matrix failed.
#[derive(Debug)]
pub(crate) enum SprsMatrixError {
    /// The file stores different element types than the requested ones.
    Elements {
        value: ArrayVariant,
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
            Self::Elements { value, index, iptr } => write!(
                fmt,
                "the file stores {value:?} values under {index:?} indices and {iptr:?} row \
                 pointers",
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
/// Opening parses the header and checks the format's single structural
/// rule, so an open file always describes its own regions exactly. The
/// regions are borrowed straight from the whole-file mapping and start
/// 4096-byte aligned: aligned for every scalar and SIMD width.
#[derive(Debug)]
pub(crate) struct SprsFile {
    map: Mmap,
}

impl SprsFile {
    /// Opens and maps the sparse matrix file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenSprsError::Io`] when the file cannot be opened or
    /// mapped, [`OpenSprsError::Header`] when its leading bytes are not
    /// a header this module speaks, and [`OpenSprsError::Length`] when
    /// the file length contradicts the header's geometry.
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenSprsError> {
        let file = File::open(path).map_err(OpenSprsError::Io)?;
        // SAFETY: published artifact files are immutable (the `crate::file`
        // publish contract: temporary path, rename into place, never
        // rewritten), so the mapped bytes cannot change beneath the borrow.
        let map = unsafe { Mmap::map(&file) }.map_err(OpenSprsError::Io)?;

        let Some(bytes) = map.get(..FileHeader::SIZE) else {
            return Err(OpenSprsError::Undersized {
                actual: map.len() as u64,
            });
        };
        let header = match FileHeader::try_read_from_bytes(bytes) {
            Ok(header) => header,
            Err(ConvertError::Validity(error)) => {
                return Err(OpenSprsError::Header(error.map_src(|_| ())));
            }
            Err(ConvertError::Size(_)) => {
                unreachable!("the slice is exactly one header long")
            }
        };

        let expected = header.expected_file_len();
        let actual = map.len() as u64;
        if expected != Some(actual) {
            return Err(OpenSprsError::Length { expected, actual });
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

    /// Returns the value element type.
    #[inline]
    #[must_use]
    pub(crate) fn value(&self) -> ArrayVariant {
        self.header().value()
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
    /// The view exists exactly for the element combination the header
    /// describes ([`value`](Self::value), [`index`](Self::index),
    /// [`iptr`](Self::iptr)), so a region is never read at the wrong
    /// width. Every call re-checks the compressed-row structure, which
    /// costs one pass over the entries; callers hold on to the view
    /// within a stage.
    ///
    /// # Errors
    ///
    /// Returns an error when the requested element types differ from
    /// the described ones, the matrix exceeds the address space, or the
    /// regions violate the compressed-row structure.
    pub(crate) fn matrix<N, I, Iptr>(&self) -> Result<CsMatViewI<'_, N, I, Iptr>, SprsMatrixError>
    where
        N: SprsValue,
        I: SprsIndex,
        Iptr: SprsIndex,
    {
        let header = self.header();
        if (N::VARIANT, I::VARIANT, Iptr::VARIANT)
            != (header.value(), header.index(), header.iptr())
        {
            return Err(SprsMatrixError::Elements {
                value: header.value(),
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
        let region = |offset: u64, len: u64| {
            let offset = usize::try_from(offset).expect("a mapped offset fits the address space");
            let len = usize::try_from(len).expect("a mapped region fits the address space");
            &self.map[offset..offset + len]
        };
        let entries = header.nnz();
        let outer = header.outer_count().expect("open validated the geometry");
        let indptr = region(FileHeader::SIZE as u64, (outer + 1) * Iptr::VARIANT.width());
        let indices = region(
            header
                .indices_offset()
                .expect("open validated the geometry"),
            entries * I::VARIANT.width(),
        );
        let values = region(
            header.values_offset().expect("open validated the geometry"),
            entries * N::VARIANT.width(),
        );

        let expect = "open validated the region sizes and the mapping their alignment";
        let indptr = <[Iptr]>::ref_from_bytes(indptr).expect(expect);
        let indices = <[I]>::ref_from_bytes(indices).expect(expect);
        let values = <[N]>::ref_from_bytes(values).expect(expect);
        match header.order() {
            StorageVariant::Csr => CsMatViewI::try_new((rows, columns), indptr, indices, values),
            StorageVariant::Csc => {
                CsMatViewI::try_new_csc((rows, columns), indptr, indices, values)
            }
        }
        .map_err(|(_, _, _, error)| SprsMatrixError::Structure(error))
    }
}

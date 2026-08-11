//! The k-NN table's published form: one sparse matrix file and its mapped reader.
//!
//! A [`Knn`] table publishes as one [`crate::file::sprs`] file holding its
//! [`KnnMatrix`](super::table::KnnMatrix) verbatim. [`KnnArchive`] reopens the file over a
//! whole-file mapping and validates the table invariants once, so later pipeline stages read the
//! table without holding it on the heap.

use core::{error::Error, fmt, marker::PhantomData};
use std::io;

use hashql_core::id::Id;

use super::table::{Knn, KnnValidationError, KnnView, validate};
use crate::{
    file::{
        WriteInto,
        sprs::{
            read::{SprsFile, SprsMatrixError},
            write::{WriteSprsError, write_matrix},
        },
    },
    integrity::{Sha256, Sha256Digest, Writer},
};

impl<N> WriteInto for Knn<N>
where
    N: Id,
{
    type Error = io::Error;

    /// Writes the table as a sparse matrix file.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the repository records for the
    /// published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };
        write_matrix(&self.matrix(), &mut writer).map_err(|error| match error {
            WriteSprsError::Io(error) => error,
            // A validated table is row-compressed, unsliced, and at
            // least 2 x 2, so no non-IO write failure exists for it.
            error @ (WriteSprsError::Sliced | WriteSprsError::ZeroDimension { .. }) => {
                unreachable!("a validated table is writable: {error}")
            }
        })?;

        Ok(writer.accumulator.finalize())
    }
}

/// An opened sparse matrix file does not hold a valid k-NN table.
#[derive(Debug)]
pub(crate) enum InvalidKnnFile {
    /// The file does not hold the table's matrix layout.
    Matrix(SprsMatrixError),
    /// The matrix violates a [`Knn`] invariant.
    Invalid(KnnValidationError),
}

impl From<KnnValidationError> for InvalidKnnFile {
    fn from(invalid: KnnValidationError) -> Self {
        Self::Invalid(invalid)
    }
}

impl fmt::Display for InvalidKnnFile {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Matrix(error) => write!(fmt, "the file does not hold a k-NN matrix: {error}"),
            Self::Invalid(invalid) => invalid.fmt(fmt),
        }
    }
}

impl Error for InvalidKnnFile {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Matrix(error) => Some(error),
            Self::Invalid(invalid) => Some(invalid),
        }
    }
}

/// A published k-NN table opened over its mapped file.
///
/// Construction checks the table invariants once, so an open table only serves valid views; the
/// matrix regions stay in the page cache under memory pressure and off the heap. Each
/// [`view`](Self::view) re-checks the compressed-row structure ([`SprsFile::matrix`]'s contract),
/// so stages call it once and hold the view.
#[derive(Debug)]
pub(crate) struct KnnArchive<N> {
    file: SprsFile,
    _marker: PhantomData<N>,
}

impl<N> KnnArchive<N>
where
    N: Id,
{
    /// Opens the table over its mapped file.
    ///
    /// # Errors
    ///
    /// Returns an error when the file does not hold the table's matrix layout or the matrix
    /// violates a [`Knn`] invariant.
    pub(crate) fn new(file: SprsFile) -> Result<Self, InvalidKnnFile> {
        let matrix = file.matrix().map_err(InvalidKnnFile::Matrix)?;
        validate(matrix)?;

        Ok(Self {
            file,
            _marker: PhantomData,
        })
    }

    /// Borrows the validated table.
    #[must_use]
    pub(crate) fn view(&self) -> KnnView<'_, N> {
        let matrix = self
            .file
            .matrix()
            .expect("construction viewed this immutable file's matrix");
        KnnView::new_unchecked(matrix)
    }
}

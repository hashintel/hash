//! The k-NN table's published form: one sparse matrix file and its mapped reader.
//!
//! A [`Knn`] table with a zero initial row pointer publishes as one [`crate::file::sprs`] file
//! holding its [`KnnMatrix`](super::table::KnnMatrix) verbatim. [`KnnArchive`] reopens the file
//! over a whole-file mapping and validates the table invariants. Views borrow the mapped matrix
//! regions without a heap copy.

use core::{error::Error, fmt, marker::PhantomData};
use std::io;

use hashql_core::id::Id;

use super::table::{Knn, KnnValidationError, KnnView, validate};
use crate::{
    file::{
        WriteAs, WriteInto,
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
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    ///
    /// # Panics
    ///
    /// This panics when the matrix's first row pointer is nonzero. [`Knn::new`] accepts such
    /// matrices, but the sparse-file writer requires an initial zero.
    fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };
        write_matrix(&self.matrix(), &mut writer).map_err(|error| match error {
            WriteSprsError::Io(error) => error,
            // validation establishes row-compressed storage and nonzero dimensions. The writer also
            // requires an initial zero pointer, which Knn::new does not establish.
            error @ (WriteSprsError::Sliced | WriteSprsError::ZeroDimension { .. }) => {
                unreachable!("a validated table is writable: {error}")
            }
        })?;

        Ok(writer.accumulator.finalize())
    }
}

// Both row domains are admitted: the corpus expansion writes the published table, and under the
// identity quotient the distinct table is the corpus's own rows in the corpus's own order.
impl<N> WriteAs<crate::file::salt::artifact::Knn> for Knn<N> where N: Id {}

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
/// Construction checks the table's domain and neighbour invariants. Each [`view`](Self::view)
/// re-checks the compressed-row structure and value bit patterns under [`SprsFile::matrix`]'s
/// contract. Reuse that borrowed view for repeated row access.
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
    /// Returns [`InvalidKnnFile`] for an incompatible matrix layout or a violated [`Knn`]
    /// invariant.
    pub(crate) fn new(file: SprsFile) -> Result<Self, InvalidKnnFile> {
        let matrix = file.matrix().map_err(InvalidKnnFile::Matrix)?;
        validate(matrix)?;

        Ok(Self {
            file,
            _marker: PhantomData,
        })
    }

    /// Borrows the table after rechecking its sparse structure and value bit patterns.
    ///
    /// # Complexity
    ///
    /// Each call takes O(rows + entries) time to validate the mapped regions. Reuse the resulting
    /// view within an operation.
    #[must_use]
    pub(crate) fn view(&self) -> KnnView<'_, N> {
        let matrix = self
            .file
            .matrix()
            .expect("construction viewed this immutable file's matrix");
        KnnView::new_unchecked(matrix)
    }
}

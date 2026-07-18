//! The semantic graph's published form: one sparse matrix file and its
//! mapped reader.
//!
//! A [`SemanticGraph`] publishes as one [`crate::file::sprs`] file
//! holding its [`SemanticMatrix`](super::SemanticMatrix) verbatim.
//! [`MappedSemanticGraph`] reopens the file over a whole-file mapping
//! and validates the graph invariants once, so training and release
//! evaluation read the same weights from the page cache without
//! holding them on the heap.

use core::{error::Error, fmt};
use std::io;

use super::{SemanticGraph, SemanticGraphView, SemanticValidationError, validate};
use crate::{
    file::sprs::{
        read::{SprsFile, SprsMatrixError},
        write::{WriteSprsError, write_matrix},
    },
    integrity::{Sha256, Sha256Digest, Writer},
};

impl SemanticGraph {
    /// Writes the graph as a sparse matrix file.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the
    /// repository records for the published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    pub(crate) fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        write_matrix(&self.matrix(), &mut writer).map_err(|error| match error {
            WriteSprsError::Io(error) => error,
            // A validated graph is row-compressed, unsliced, and at
            // least 2 x 2, so no non-IO write failure exists for it.
            error @ (WriteSprsError::Sliced | WriteSprsError::ZeroDimension { .. }) => {
                unreachable!("a validated graph is writable: {error}")
            }
        })?;

        Ok(writer.accumulator.finalize())
    }
}

/// An opened sparse matrix file does not hold a valid semantic graph.
#[derive(Debug)]
pub(crate) enum InvalidSemanticFile {
    /// The file does not hold the graph's matrix layout.
    Matrix(SprsMatrixError),
    /// The matrix violates a [`SemanticGraph`] invariant.
    Invalid(SemanticValidationError),
}

impl From<SemanticValidationError> for InvalidSemanticFile {
    fn from(invalid: SemanticValidationError) -> Self {
        Self::Invalid(invalid)
    }
}

impl fmt::Display for InvalidSemanticFile {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Matrix(error) => {
                write!(
                    fmt,
                    "the file does not hold a semantic graph matrix: {error}"
                )
            }
            Self::Invalid(invalid) => invalid.fmt(fmt),
        }
    }
}

impl Error for InvalidSemanticFile {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Matrix(error) => Some(error),
            Self::Invalid(invalid) => Some(invalid),
        }
    }
}

/// A published semantic graph opened over its mapped file.
///
/// Construction checks the graph invariants once, so an open graph only
/// serves valid views; the matrix regions stay in the page cache under
/// memory pressure and off the heap. Each [`view`](Self::view)
/// re-checks the compressed-row structure ([`SprsFile::matrix`]'s
/// contract), so stages call it once and hold the view.
#[derive(Debug)]
pub(crate) struct MappedSemanticGraph {
    file: SprsFile,
}

impl MappedSemanticGraph {
    /// Opens the graph over its mapped file.
    ///
    /// # Errors
    ///
    /// Returns an error when the file does not hold the graph's matrix
    /// layout or the matrix violates a [`SemanticGraph`] invariant.
    pub(crate) fn new(file: SprsFile) -> Result<Self, InvalidSemanticFile> {
        let matrix = file.matrix().map_err(InvalidSemanticFile::Matrix)?;
        validate(matrix)?;

        Ok(Self { file })
    }

    /// Borrows the validated graph.
    #[must_use]
    pub(crate) fn view(&self) -> SemanticGraphView<'_> {
        let matrix = self
            .file
            .matrix()
            .expect("construction viewed this immutable file's matrix");
        SemanticGraphView::new_unchecked(matrix)
    }
}

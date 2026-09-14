//! Semantic graph publication and mapped access to fixed attraction weights.
//!
//! A [`SemanticGraph`] with zero-based row pointers publishes as one [`crate::file::sprs`] file
//! preserving its [`SemanticMatrix`](super::SemanticMatrix) entries. [`SemanticGraphArchive`]
//! validates the graph invariants over the mapped matrix. Reopening the same artifact fixes the
//! semantic weights without copying the matrix regions to heap allocations.
#![cfg_attr(
    not(test),
    expect(
        dead_code,
        reason = "retained API for reading the published semantic graph"
    )
)]

use core::{error::Error, fmt, marker::PhantomData};
use std::io;

use hashql_core::id::Id;

use super::{SemanticGraph, SemanticGraphView, SemanticValidationError, validate};
use crate::{
    file::{
        WriteAs, WriteInto,
        salt::artifact,
        sprs::{
            read::{SprsFile, SprsMatrixError},
            write::{WriteSprsError, write_matrix},
        },
    },
    integrity::{Sha256, Sha256Digest, Writer},
};

impl<N> WriteInto for SemanticGraph<N>
where
    N: Id,
{
    type Error = io::Error;

    /// Writes the graph as a sparse matrix file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    ///
    /// # Panics
    ///
    /// This panics when the matrix's first row pointer is nonzero. [`SemanticGraph::new`] accepts
    /// such matrices, but the sparse-file writer requires zero-based pointers.
    fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        write_matrix(&self.matrix(), &mut writer).map_err(|error| match error {
            WriteSprsError::Io(error) => error,
            // validation establishes nonzero dimensions. Zero-based pointers are an additional
            // writer requirement, established by SemanticGraph::build but not SemanticGraph::new.
            error @ (WriteSprsError::Sliced | WriteSprsError::ZeroDimension { .. }) => {
                unreachable!("a validated graph is writable: {error}")
            }
        })?;

        Ok(writer.accumulator.finalize())
    }
}

impl<N> WriteAs<artifact::Semantic> for SemanticGraph<N> where N: Id {}

/// Failure to interpret a sparse matrix file as a semantic graph.
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
/// Construction checks the graph invariants once. Each [`Self::view`] rechecks the sparse structure
/// through [`SprsFile::matrix`] and borrows the mapped entries. Retain a view across repeated reads
/// to avoid repeating that structural scan.
///
/// Validated views require the backing file to remain immutable for the mapping's lifetime.
#[derive(Debug)]
pub(crate) struct SemanticGraphArchive<N> {
    file: SprsFile,
    _marker: PhantomData<N>,
}

impl<N> SemanticGraphArchive<N>
where
    N: Id,
{
    /// Opens the graph over its mapped file.
    ///
    /// # Errors
    ///
    /// Returns [`InvalidSemanticFile`] when the file cannot provide a matrix satisfying the graph's
    /// layout and invariants.
    pub(crate) fn new(file: SprsFile) -> Result<Self, InvalidSemanticFile> {
        let matrix = file.matrix().map_err(InvalidSemanticFile::Matrix)?;
        validate(matrix)?;

        Ok(Self {
            file,
            _marker: PhantomData,
        })
    }

    /// Borrows the validated graph after rechecking its sparse structure.
    ///
    /// # Complexity
    ///
    /// This takes O(n + m) work for `n` rows and `m` stored entries.
    #[must_use]
    pub(crate) fn view(&self) -> SemanticGraphView<'_, N> {
        let matrix = self
            .file
            .matrix()
            .expect("construction viewed this immutable file's matrix");
        SemanticGraphView::new_unchecked(matrix)
    }
}

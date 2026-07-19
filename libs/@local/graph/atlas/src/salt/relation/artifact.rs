//! The protection index's published form: one sparse matrix file and
//! its mapped reader.
//!
//! A [`ProtectionIndex`] publishes as one [`crate::file::sprs`] file
//! holding its [`ProtectionMatrix`](super::protection::ProtectionMatrix)
//! verbatim; the evidence pair travels as an opaque 8-byte value.
//! [`MappedProtection`] reopens the file over a whole-file mapping and
//! validates the index invariants once, so hard-negative mining reads
//! the evidence from the page cache without holding it on the heap.

use core::{error::Error, fmt};
use std::io;

use super::protection::{ProtectionIndex, ProtectionValidationError, ProtectionView, validate};
use crate::{
    file::sprs::{
        read::{SprsFile, SprsMatrixError},
        write::{WriteSprsError, write_matrix},
    },
    integrity::{Sha256, Sha256Digest, Writer},
};

impl ProtectionIndex {
    /// Writes the index as a sparse matrix file.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the
    /// repository records for the published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails, or the index
    /// spans zero rows, which the format cannot represent: a
    /// generation without node rows publishes no artifacts.
    pub(crate) fn write_into(&self, write: impl io::Write) -> Result<Sha256Digest, WriteSprsError> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        write_matrix(&self.matrix(), &mut writer).map_err(|error| match error {
            error @ (WriteSprsError::Io(_) | WriteSprsError::ZeroDimension { .. }) => error,
            // A validated index is row-compressed and unsliced.
            WriteSprsError::Sliced => {
                unreachable!("a validated index's pointers begin at zero")
            }
        })?;

        Ok(writer.accumulator.finalize())
    }
}

/// An opened sparse matrix file does not hold a valid protection index.
#[derive(Debug)]
pub(crate) enum InvalidProtectionFile {
    /// The file does not hold the index's matrix layout.
    Matrix(SprsMatrixError),
    /// The matrix violates a [`ProtectionIndex`] invariant.
    Invalid(ProtectionValidationError),
}

impl From<ProtectionValidationError> for InvalidProtectionFile {
    fn from(invalid: ProtectionValidationError) -> Self {
        Self::Invalid(invalid)
    }
}

impl fmt::Display for InvalidProtectionFile {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Matrix(error) => {
                write!(fmt, "the file does not hold a protection matrix: {error}")
            }
            Self::Invalid(invalid) => invalid.fmt(fmt),
        }
    }
}

impl Error for InvalidProtectionFile {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Matrix(error) => Some(error),
            Self::Invalid(invalid) => Some(invalid),
        }
    }
}

/// A published protection index opened over its mapped file.
///
/// Construction checks the index invariants once, so an open index only
/// serves valid views; the matrix regions stay in the page cache under
/// memory pressure and off the heap. Each [`view`](Self::view)
/// re-checks the compressed-row structure ([`SprsFile::matrix`]'s
/// contract), so stages call it once and hold the view.
#[derive(Debug)]
pub(crate) struct MappedProtection {
    file: SprsFile,
}

impl MappedProtection {
    /// Opens the index over its mapped file.
    ///
    /// # Errors
    ///
    /// Returns an error when the file does not hold the index's matrix
    /// layout or the matrix violates a [`ProtectionIndex`] invariant.
    pub(crate) fn new(file: SprsFile) -> Result<Self, InvalidProtectionFile> {
        let matrix = file.matrix().map_err(InvalidProtectionFile::Matrix)?;
        validate(matrix)?;

        Ok(Self { file })
    }

    /// Borrows the validated index.
    #[must_use]
    pub(crate) fn view(&self) -> ProtectionView<'_> {
        let matrix = self
            .file
            .matrix()
            .expect("construction viewed this immutable file's matrix");
        ProtectionView::new_unchecked(matrix)
    }
}

//! The k-NN table's published form: one combined file and its mapped
//! reader.
//!
//! A [`Knn`] table publishes as one [`crate::file::knn`] file: the
//! `u32[N, k]` neighbour columns and the entry-aligned `f32[N, k]`
//! distances, two regions of one table that cannot fall out of sync.
//!
//! Row pointers are not persisted: every row stores exactly `k`
//! entries, so row `i` spans entries `i * k` through `i * k + k - 1`
//! and the pointer column is derived at open time. [`MappedKnn`] opens
//! the file over a whole-file mapping, validates every table invariant
//! once, and serves [`KnnView`]s borrowing straight from the mapping,
//! so later pipeline stages read the table without holding it on the
//! heap.

use core::{error::Error, fmt};
use std::io::{self, Write as _};

use sprs::{CSR, errors::StructureError};
use zerocopy::IntoBytes as _;

use super::table::{InvalidKnn, Knn, KnnMatrixView, KnnView, validate};
use crate::{
    file::knn::{FileHeader, KnnFile},
    integrity::{Sha256, Sha256Digest, Writer},
};

impl Knn {
    /// Writes the table as a k-nearest-neighbour file.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the
    /// repository records for the published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    pub(crate) fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let header = FileHeader::new(
            u64::try_from(self.rows()).expect("node rows fit u64"),
            u64::try_from(self.neighbours()).expect("neighbour counts fit u64"),
        );
        let padding = header
            .columns_padding()
            .expect("a resident table's geometry fits u64");
        let padding = usize::try_from(padding).expect("padding stays below one region unit");

        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };
        writer.write_all(header.as_bytes())?;
        writer.write_all(self.matrix().indices().as_bytes())?;
        writer.write_all(&[0; FileHeader::SIZE][..padding])?;
        writer.write_all(self.matrix().data().as_bytes())?;

        Ok(writer.accumulator.finalize())
    }
}

/// A published k-NN table opened over its mapped file.
///
/// Construction validates every [`Knn`] invariant, so an open table
/// always serves valid views; the regions stay in the page cache under
/// memory pressure and the heap holds only the derived row pointers.
#[derive(Debug)]
pub(crate) struct MappedKnn {
    file: KnnFile,
    indptr: Vec<usize>,
}

impl MappedKnn {
    /// Opens the table over its mapped file.
    ///
    /// # Errors
    ///
    /// Returns an error when the table exceeds the address space or the
    /// regions violate a structural or [`Knn`] invariant.
    pub(crate) fn new(file: KnnFile) -> Result<Self, InvalidKnnFile> {
        let rows = usize::try_from(file.rows())
            .ok()
            .ok_or(InvalidKnnFile::TooLarge)?;
        let per_row = usize::try_from(file.neighbours())
            .ok()
            .ok_or(InvalidKnnFile::TooLarge)?;
        let indptr: Vec<usize> = (0..=rows)
            .map(|row| row.checked_mul(per_row))
            .collect::<Option<_>>()
            .ok_or(InvalidKnnFile::TooLarge)?;

        let mapped = Self { file, indptr };
        let matrix = KnnMatrixView::try_new(
            (rows, rows),
            mapped.indptr.as_slice(),
            mapped.file.columns(),
            mapped.file.distances(),
        )
        .map_err(|(_, _, _, error)| InvalidKnnFile::Structure(error))?;
        validate(matrix)?;

        Ok(mapped)
    }

    /// Borrows the validated table.
    #[must_use]
    pub(crate) fn view(&self) -> KnnView<'_> {
        let rows = self.indptr.len() - 1;
        // SAFETY: construction assembled this exact matrix through the
        // checked constructor and validated the table invariants; the
        // mapped file is an immutable published artifact and the row
        // pointers are untouched since, so every checked property still
        // holds.
        let matrix = unsafe {
            KnnMatrixView::new_unchecked(
                CSR,
                (rows, rows),
                self.indptr.as_slice(),
                self.file.columns(),
                self.file.distances(),
            )
        };
        KnnView::new_trusted(matrix)
    }
}

/// An opened k-nearest-neighbour file does not hold a valid table.
#[derive(Debug)]
pub(crate) enum InvalidKnnFile {
    /// The table does not fit the address space.
    TooLarge,
    /// The columns violate the compressed-row structure.
    Structure(StructureError),
    /// The regions violate a [`Knn`] invariant.
    Invalid(InvalidKnn),
}

impl From<InvalidKnn> for InvalidKnnFile {
    fn from(invalid: InvalidKnn) -> Self {
        Self::Invalid(invalid)
    }
}

impl fmt::Display for InvalidKnnFile {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooLarge => fmt.write_str("the table does not fit the address space"),
            Self::Structure(error) => write!(
                fmt,
                "the columns violate the compressed-row structure: {error}",
            ),
            Self::Invalid(invalid) => invalid.fmt(fmt),
        }
    }
}

impl Error for InvalidKnnFile {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Structure(error) => Some(error),
            Self::Invalid(invalid) => Some(invalid),
            Self::TooLarge => None,
        }
    }
}

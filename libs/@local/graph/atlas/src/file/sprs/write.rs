//! Streaming sparse-matrix-file writer.

use core::{error::Error, fmt, ops::Deref};
use std::io;

use sprs::CsMatBase;
use zerocopy::IntoBytes as _;

use super::{ArrayShape, Dim, FileHeader, PaddedFileHeader, SprsIndex, SprsValue};
use crate::file::region::write_region;

/// Writing a matrix as a sparse matrix file failed.
#[derive(Debug)]
pub(crate) enum WriteSprsError {
    /// The underlying writer failed.
    Io(io::Error),
    /// A sliced matrix, whose pointers do not begin at zero and therefore have no on-disk form.
    ///
    /// Copy the slice into an owned matrix first.
    Sliced,
    /// The matrix has a zero dimension, which terminates the shape and matches no real file.
    ZeroDimension { rows: usize, columns: usize },
}

impl From<io::Error> for WriteSprsError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl fmt::Display for WriteSprsError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(fmt, "the sparse matrix file could not be written: {error}"),
            Self::Sliced => fmt.write_str("a sliced matrix's pointers have no on-disk form"),
            Self::ZeroDimension { rows, columns } => write!(
                fmt,
                "a {rows} x {columns} matrix has a zero dimension and matches no real file",
            ),
        }
    }
}

impl Error for WriteSprsError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Sliced | Self::ZeroDimension { .. } => None,
        }
    }
}

/// Streams `matrix` as a sparse matrix file.
///
/// The written element types and compressed dimension are the matrix's own, recorded in the header,
/// so the file reopens as exactly the view it came from. Every region streams in file order behind
/// the header; wrap a raw [`File`](std::fs::File) in a [`BufWriter`](io::BufWriter) when the matrix
/// is small.
///
/// # Errors
///
/// Returns an error when the underlying writer fails or the matrix has no on-disk form: sliced
/// pointers or a zero dimension.
pub(crate) fn write_matrix<N, I, Iptr, IptrStorage, IStorage, DStorage>(
    matrix: &CsMatBase<N, I, IptrStorage, IStorage, DStorage, Iptr>,
    mut write: impl io::Write,
) -> Result<(), WriteSprsError>
where
    N: SprsValue,
    I: SprsIndex,
    Iptr: SprsIndex,
    IptrStorage: Deref<Target = [Iptr]>,
    IStorage: Deref<Target = [I]>,
    DStorage: Deref<Target = [N]>,
{
    if matrix.rows() == 0 || matrix.cols() == 0 {
        return Err(WriteSprsError::ZeroDimension {
            rows: matrix.rows(),
            columns: matrix.cols(),
        });
    }
    let indptr = matrix.indptr();
    let indptr = indptr.as_slice().ok_or(WriteSprsError::Sliced)?;

    let shape = ArrayShape::new(&[
        Dim::new(matrix.rows() as u64),
        Dim::new(matrix.cols() as u64),
    ])
    .expect("two dimensions fit the maximum shape rank");
    let header = FileHeader::new(
        N::TAG,
        size_of::<N>() as u64,
        I::VARIANT,
        Iptr::VARIANT,
        matrix.storage().into(),
        shape,
        matrix.nnz() as u64,
    );

    write.write_all(PaddedFileHeader::new(header).as_bytes())?;
    write_region(&mut write, indptr.as_bytes())?;
    write_region(&mut write, matrix.indices().as_bytes())?;
    write.write_all(matrix.data().as_bytes())?;

    Ok(())
}

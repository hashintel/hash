//! Streaming sparse-matrix-file writer.

use core::ops::Deref;
use std::io;

use sprs::CsMatBase;
use zerocopy::IntoBytes as _;

use super::{ArrayShape, Dim, FileHeader, SprsIndex, SprsValue};

/// Streams `matrix` as a sparse matrix file.
///
/// The written element types are the matrix's own, recorded in the
/// header, so the file reopens as exactly the view it was written
/// from. Every region streams in file order behind the header; wrap a
/// raw [`File`](std::fs::File) in a [`BufWriter`](io::BufWriter) when
/// the matrix is small.
///
/// # Errors
///
/// Returns an error when the underlying writer fails.
///
/// # Panics
///
/// Panics when `matrix` is column-compressed, sliced (its row pointers
/// do not begin at zero), or has a zero dimension, none of which the
/// format represents; a malformed matrix is a programmer error, not a
/// writer failure.
#[expect(
    clippy::panic_in_result_fn,
    reason = "a malformed matrix is a programmer error, not a writer failure"
)]
pub(crate) fn write_matrix<N, I, Iptr, IptrStorage, IStorage, DStorage>(
    matrix: &CsMatBase<N, I, IptrStorage, IStorage, DStorage, Iptr>,
    mut write: impl io::Write,
) -> io::Result<()>
where
    N: SprsValue,
    I: SprsIndex,
    Iptr: SprsIndex,
    IptrStorage: Deref<Target = [Iptr]>,
    IStorage: Deref<Target = [I]>,
    DStorage: Deref<Target = [N]>,
{
    assert!(matrix.is_csr(), "the format stores row-compressed matrices");
    assert!(
        matrix.indptr().is_proper(),
        "a sliced matrix's row pointers have no on-disk form; copy it into an owned matrix first",
    );
    assert!(
        matrix.rows() > 0 && matrix.cols() > 0,
        "a zero dimension terminates the shape and matches no real file",
    );

    let shape = ArrayShape::new(&[
        Dim::new(u64::try_from(matrix.rows()).expect("row counts fit u64")),
        Dim::new(u64::try_from(matrix.cols()).expect("column counts fit u64")),
    ])
    .expect("two dimensions fit the maximum shape rank");
    let header = FileHeader::new(
        N::VARIANT,
        I::VARIANT,
        Iptr::VARIANT,
        shape,
        u64::try_from(matrix.nnz()).expect("entry counts fit u64"),
    );

    let indptr = matrix.indptr();
    let indptr = indptr
        .as_slice()
        .expect("proper row pointers were asserted above");
    let indices = matrix.indices().as_bytes();
    let values = matrix.data().as_bytes();

    // A resident matrix's geometry fits u64; the checked equations
    // exist for parsing foreign headers.
    let indices_offset = header
        .indices_offset()
        .expect("a resident matrix's geometry fits u64");
    let values_offset = header
        .values_offset()
        .expect("a resident matrix's geometry fits u64");

    let indptr_padding = indices_offset - FileHeader::SIZE as u64 - indptr.as_bytes().len() as u64;
    let indices_padding = values_offset - indices_offset - indices.len() as u64;
    let zeros = [0_u8; FileHeader::SIZE];

    write.write_all(header.as_bytes())?;
    write.write_all(indptr.as_bytes())?;
    write
        .write_all(&zeros[..usize::try_from(indptr_padding).expect("padding stays below 4096")])?;
    write.write_all(indices)?;
    write
        .write_all(&zeros[..usize::try_from(indices_padding).expect("padding stays below 4096")])?;
    write.write_all(values)?;

    Ok(())
}

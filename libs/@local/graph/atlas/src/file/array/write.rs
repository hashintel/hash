//! Streaming array-file writer.

use std::io::{self, Seek, SeekFrom, Write};

use zerocopy::IntoBytes as _;

use super::{ArrayShape, ArrayVariant, Dim, FileHeader};

/// Writes an array file row by row, counting rows as they stream.
///
/// The leading dimension is the row count, known only when the stream
/// ends, so the header is written last: [`new`](Self::new) reserves the
/// header region with bytes no parse accepts, rows append behind it, and
/// [`finish`](Self::finish) seals the file with the real header. An
/// abandoned write therefore never leaves a file a reader accepts.
///
/// Every row issues one write; wrap a raw [`File`](std::fs::File) in a
/// [`BufWriter`](io::BufWriter) when rows are small.
pub(crate) struct ArrayWriter<W> {
    writer: W,
    variant: ArrayVariant,
    /// The finished file's dimensions; slot 0 holds the row count and is
    /// set at [`finish`](Self::finish).
    dims: [Dim; ArrayShape::MAX_RANK],
    row_bytes: u64,
    rows: u64,
}

impl<W: Write + Seek> ArrayWriter<W> {
    /// Creates a writer and reserves the header region.
    ///
    /// `row_dims` shapes one row - the dimensions behind the leading row
    /// count - so the finished file's shape is `[rows, ..row_dims]`.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    ///
    /// # Panics
    ///
    /// Panics when `row_dims` holds [`ArrayShape::MAX_RANK`] or more
    /// dimensions, contains a zero (which would terminate the shape
    /// early), or describes a row whose byte length overflows `u64`.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "a malformed row shape is a programmer error, not a writer failure"
    )]
    pub(crate) fn new(mut writer: W, variant: ArrayVariant, row_dims: &[Dim]) -> io::Result<Self> {
        assert!(
            row_dims.len() < ArrayShape::MAX_RANK,
            "the row dimensions and the row count must fit the maximum shape rank",
        );
        assert!(
            row_dims.iter().all(|dim| dim.get() != 0),
            "a zero row dimension would terminate the shape before the rows",
        );

        let row_bytes = row_dims
            .iter()
            .try_fold(variant.width(), |bytes, dim| bytes.checked_mul(dim.get()))
            .expect("one row's byte length must fit `u64`");

        let mut dims = [Dim::ZERO; ArrayShape::MAX_RANK];
        dims[1..=row_dims.len()].copy_from_slice(row_dims);

        // The reserved region is zeros: not a parseable header, so a
        // write that never finishes leaves a file no reader accepts.
        writer.write_all(&[0; FileHeader::SIZE])?;

        Ok(Self {
            writer,
            variant,
            dims,
            row_bytes,
            rows: 0,
        })
    }

    /// Appends one row of packed elements.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    ///
    /// # Panics
    ///
    /// Panics when `row` is not exactly one row long.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "a mis-sized row is a programmer error, not a writer failure"
    )]
    pub(crate) fn write_row(&mut self, row: &[u8]) -> io::Result<()> {
        assert_eq!(
            row.len() as u64,
            self.row_bytes,
            "a row must hold exactly the row shape's bytes",
        );

        self.writer.write_all(row)?;
        self.rows += 1;
        Ok(())
    }

    /// Seals the file: writes the real header and flushes.
    ///
    /// Returns the number of rows written. Zero rows seal as the
    /// zero-element array, whose shape terminates at the leading zero.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    pub(crate) fn finish(mut self) -> io::Result<u64> {
        self.dims[0] = Dim::new(self.rows);
        let header = FileHeader::new(self.variant, ArrayShape { dims: self.dims });

        self.writer.seek(SeekFrom::Start(0))?;
        self.writer.write_all(header.as_bytes())?;
        self.writer.flush()?;

        Ok(self.rows)
    }
}

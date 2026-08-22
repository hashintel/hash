//! Streaming array-file writer.

use std::io::{self, Seek, SeekFrom, Write};

use hashql_core::id::{Id, IdSlice};
use zerocopy::IntoBytes as _;

use super::{ArrayShape, ArrayVariant, Dim, FileHeader, PaddedFileHeader};
use crate::{
    file::{WriteInto, region::PAGE_BYTES},
    identity::{BasePosition, ImportanceRank, NodeRowId},
    integrity::{Sha256, Sha256Digest, Writer},
    math::Vec2,
};

/// Writes an array file row by row, counting rows as they stream.
///
/// The leading dimension is the row count, known only when the stream ends, so this writer emits
/// the header last: [`new`](Self::new) reserves the header region with bytes no parse accepts, rows
/// append behind it, and [`finish`](Self::finish) seals the file with the real header. An abandoned
/// write therefore never leaves a file a reader accepts.
///
/// Every row issues one write; wrap a raw [`File`](std::fs::File) in a [`BufWriter`](io::BufWriter)
/// when rows are small.
pub(crate) struct ArrayWriter<W> {
    writer: W,
    variant: ArrayVariant,
    /// The finished file's dimensions.
    ///
    /// Slot 0 holds the row count, which [`finish`](Self::finish) writes when the stream ends.
    dims: [Dim; ArrayShape::MAX_RANK],
    row_bytes: u64,
    rows: u64,
}

impl<W: Write + Seek> ArrayWriter<W> {
    /// Creates a writer and reserves the header region.
    ///
    /// `row_dims` shapes one row, the dimensions behind the leading row count, so the finished
    /// file's shape is `[rows, ..row_dims]`.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    ///
    /// # Panics
    ///
    /// This panics when `row_dims` holds [`ArrayShape::MAX_RANK`] or more dimensions, when it
    /// contains a zero (a zero would terminate the shape early), or when one row's byte length
    /// overflows `u64`.
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
        writer.write_all(&[0; PAGE_BYTES])?;

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
    /// This panics when `row` is not exactly one row long.
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
    /// Returns the number of rows written. Zero rows seal as the zero-element array, whose shape
    /// terminates at the leading zero.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    pub(crate) fn finish(mut self) -> io::Result<u64> {
        self.dims[0] = Dim::new(self.rows);
        let header = FileHeader::new(self.variant, ArrayShape { dims: self.dims });

        self.writer.seek(SeekFrom::Start(0))?;
        self.writer
            .write_all(PaddedFileHeader::new(header).as_bytes())?;
        self.writer.flush()?;

        Ok(self.rows)
    }
}

/// Writes an array file whose full shape the caller supplies up front.
///
/// The shape includes the leading row count. The header leads the file and rows follow in one pass,
/// with the SHA-256 of the written bytes accumulating alongside, so [`finish`](Self::finish)
/// returns the file's digest without a second read. The writer never seeks; a stream whose row
/// count is only known at its end uses [`ArrayWriter`] instead and pays a digest pass over the
/// finished file.
///
/// The written bytes are exactly [`ArrayWriter`]'s for the same rows: the two writers share one
/// format, and only the header's timing differs.
pub(crate) struct SizedArrayWriter<W> {
    writer: Writer<Sha256, W>,
    row_bytes: u64,
    promised: u64,
    written: u64,
}

impl<W: Write> SizedArrayWriter<W> {
    /// Creates the writer and writes the header.
    ///
    /// `dims` is the finished file's full shape. The leading dimension is the row count, where zero
    /// seals as the zero-element array, and the rest shape one row.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    ///
    /// # Panics
    ///
    /// This panics when `dims` is empty or exceeds the maximum shape rank, when a row dimension is
    /// zero (a zero would terminate the shape early), or when one row's byte length overflows
    /// `u64`.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "a malformed shape is a programmer error, not a writer failure"
    )]
    pub(crate) fn new(writer: W, variant: ArrayVariant, dims: &[Dim]) -> io::Result<Self> {
        assert!(
            !dims.is_empty() && dims.len() <= ArrayShape::MAX_RANK,
            "the shape must lead with the row count and fit the maximum rank",
        );
        assert!(
            dims[1..].iter().all(|dim| dim.get() != 0),
            "a zero row dimension would terminate the shape before the rows",
        );

        let row_bytes = dims[1..]
            .iter()
            .try_fold(variant.width(), |bytes, dim| bytes.checked_mul(dim.get()))
            .expect("one row's byte length must fit `u64`");

        let mut padded = [Dim::ZERO; ArrayShape::MAX_RANK];
        padded[..dims.len()].copy_from_slice(dims);
        let header = FileHeader::new(variant, ArrayShape { dims: padded });

        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer,
        };
        writer.write_all(PaddedFileHeader::new(header).as_bytes())?;

        Ok(Self {
            writer,
            row_bytes,
            promised: dims[0].get(),
            written: 0,
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
    /// This panics when `row` is not exactly one row long, or when the row exceeds the shape's
    /// promised count.
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
        self.write_rows(1, row)
    }

    /// Appends `rows` whole rows of packed elements in one write.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    ///
    /// # Panics
    ///
    /// This panics when `bytes` does not hold exactly `rows` rows, or when the rows exceed the
    /// shape's promised count.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "a mis-sized stream is a programmer error, not a writer failure"
    )]
    pub(crate) fn write_rows(&mut self, rows: u64, bytes: &[u8]) -> io::Result<()> {
        assert_eq!(
            Some(bytes.len() as u64),
            rows.checked_mul(self.row_bytes),
            "the bytes must hold exactly the stated number of rows",
        );
        self.written = self
            .written
            .checked_add(rows)
            .expect("the row count fits `u64`");
        assert!(
            self.written <= self.promised,
            "the stream must stay within the shape's promised row count",
        );

        self.writer.write_all(bytes)
    }

    /// Seals the stream: flushes and returns the SHA-256 of the file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    ///
    /// # Panics
    ///
    /// This panics when the stream delivered fewer rows than the shape promised: the header is
    /// already on disk, so a short stream is a file no honest digest should endorse.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "a short stream is a programmer error, not a writer failure"
    )]
    pub(crate) fn finish(mut self) -> io::Result<Sha256Digest> {
        assert_eq!(
            self.written, self.promised,
            "the stream must deliver exactly the shape's promised rows",
        );
        self.writer.flush()?;
        Ok(self.writer.accumulator.finalize())
    }
}

/// One scalar element of a sized array column: its stored variant and its trailing row shape.
///
/// An implementation supplies the stored variant and the row shape, so a typed column write
/// derives its whole file shape from the element type and the row count, and no call site
/// restates a variant or a dimension.
pub(crate) trait ColumnScalar: zerocopy::Immutable + zerocopy::IntoBytes {
    /// The array file's element variant.
    const VARIANT: ArrayVariant;
    /// The dimensions one row adds beyond the leading row count.
    const TRAILING: &'static [Dim];
}

impl ColumnScalar for Vec2 {
    const TRAILING: &'static [Dim] = &[Dim::new(2)];
    const VARIANT: ArrayVariant = ArrayVariant::F32;
}

impl ColumnScalar for ImportanceRank {
    const TRAILING: &'static [Dim] = &[];
    const VARIANT: ArrayVariant = ArrayVariant::U32Le;
}

impl ColumnScalar for BasePosition {
    const TRAILING: &'static [Dim] = &[];
    const VARIANT: ArrayVariant = ArrayVariant::U32Le;
}

impl ColumnScalar for NodeRowId {
    const TRAILING: &'static [Dim] = &[];
    const VARIANT: ArrayVariant = ArrayVariant::U64Le;
}

impl ColumnScalar for [NodeRowId; 2] {
    const TRAILING: &'static [Dim] = &[Dim::new(2)];
    const VARIANT: ArrayVariant = ArrayVariant::U64Le;
}

/// One typed column as a sized array file: the value form of a column write.
///
/// The wrapper is transparent over the rows, so a column wraps by reference with no copy. The
/// row domain `I` and the element type travel in the value, so a write site cannot swap two
/// permutation columns of equal width, and the file shape derives from the element alone.
#[repr(transparent)]
pub(crate) struct SizedColumn<I, T>(IdSlice<I, T>);

impl<I, T> SizedColumn<I, T>
where
    I: Id,
    T: ColumnScalar,
{
    /// Wraps a column by reference.
    #[inline]
    #[must_use]
    pub(crate) const fn new(rows: &IdSlice<I, T>) -> &Self {
        // SAFETY: `Self` is `repr(transparent)` over `IdSlice<I, T>`, so the reference
        // reinterprets in place at the same layout, and the borrow keeps the input's lifetime.
        unsafe { &*((&raw const *rows) as *const Self) }
    }
}

impl<I, T> WriteInto for SizedColumn<I, T>
where
    I: Id,
    T: ColumnScalar,
{
    type Error = io::Error;

    /// Writes the column as a sized array file, the row count leading the shape.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the repository records for the
    /// published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut dims = [Dim::ZERO; ArrayShape::MAX_RANK];
        dims[0] = Dim::new(self.0.len() as u64);
        dims[1..=T::TRAILING.len()].copy_from_slice(T::TRAILING);

        let mut writer = SizedArrayWriter::new(write, T::VARIANT, &dims[..=T::TRAILING.len()])?;
        writer.write_rows(self.0.len() as u64, self.0.as_raw().as_bytes())?;
        writer.finish()
    }
}

//! Serializing one stream file as one rkyv archive.
//!
//! [`write_archive`] serializes a complete root value, which fits the streams whose records
//! carry out-of-line data and stay small enough to collect. [`StreamArchive`] writes a file
//! column by column instead: [`Column`] takes inline records one at a time straight to the
//! digesting writer, so a heavy embedding column costs one record of memory rather than the
//! whole column, and [`StreamArchive::finish`] emplaces the root over the columns' resolvers
//! at the file's end, where the reader derives the root position from the file's length. Both
//! paths return the file's manifest row, binding its length and digest.

use core::{marker::PhantomData, mem::MaybeUninit};
use std::{
    fs,
    io::{BufWriter, Write as _},
};

use camino::Utf8Path;
use rkyv::{
    Portable, Serialize,
    api::high::HighSerializer,
    place::Place,
    rancor::{self, Strategy},
    ser::{
        Positional as _, Serializer, Writer as _, WriterExt as _, allocator::ArenaHandle,
        sharing::Share, writer::IoWriter,
    },
    vec::{ArchivedVec, VecResolver},
};

use super::{
    super::format::{FileManifest, StreamKind},
    DumpError,
};
use crate::integrity::{Sha256, Writer};

/// The digesting file writer a stream archive serializes into.
pub(super) type ArchiveWriter = IoWriter<Writer<Sha256, BufWriter<fs::File>>>;

/// The high-level serializer a stream archive's records serialize against.
pub(super) type ArchiveSerializer<'arena> =
    HighSerializer<ArchiveWriter, ArenaHandle<'arena>, rancor::Error>;

/// Serializes one stream's root value into its file and returns the file's manifest row.
pub(super) fn write_archive<T, D, E>(
    directory: &Utf8Path,
    kind: StreamKind,
    value: &T,
) -> Result<FileManifest, DumpError<D, E>>
where
    T: for<'arena> rkyv::Serialize<
            HighSerializer<ArchiveWriter, ArenaHandle<'arena>, rancor::Error>,
        >,
{
    let io = |source| DumpError::Io { kind, source };

    let file = fs::File::create(directory.join(kind.file_name())).map_err(io)?;
    let writer = IoWriter::new(Writer {
        accumulator: Sha256::new(),
        writer: BufWriter::new(file),
    });

    let writer = rkyv::api::high::to_bytes_in::<_, rancor::Error>(value, writer)
        .map_err(|source| DumpError::Archive { kind, source })?;

    let bytes = writer.pos() as u64;
    let mut inner = writer.into_inner();
    inner.flush().map_err(io)?;

    Ok(FileManifest {
        bytes,
        sha256: inner.accumulator.finalize(),
    })
}

/// One stream file being written as a single rkyv archive, column by column.
///
/// Bytes flow through the digesting writer as they arrive. [`column`](Self::column) opens an
/// inline column that streams records one at a time, [`slice_column`](Self::slice_column)
/// serializes a collected column whole, and [`finish`](Self::finish) emplaces the root and
/// seals the file into its manifest row.
pub(super) struct StreamArchive<'arena> {
    kind: StreamKind,
    serializer: Serializer<ArchiveWriter, ArenaHandle<'arena>, Share>,
}

impl<'arena> StreamArchive<'arena> {
    /// Creates the stream file and the digesting serializer over it.
    pub(super) fn create<D, E>(
        directory: &Utf8Path,
        kind: StreamKind,
        alloc: ArenaHandle<'arena>,
    ) -> Result<Self, DumpError<D, E>> {
        let file = fs::File::create(directory.join(kind.file_name()))
            .map_err(|source| DumpError::Io { kind, source })?;
        let writer = IoWriter::new(Writer {
            accumulator: Sha256::new(),
            writer: BufWriter::new(file),
        });

        Ok(Self {
            kind,
            serializer: Serializer::new(writer, alloc, Share::new()),
        })
    }

    /// Wraps the serializer for the high-level serialization traits.
    fn strategy(&mut self) -> &mut ArchiveSerializer<'arena> {
        Strategy::wrap(&mut self.serializer)
    }

    /// Opens an inline column of `T` at the current position.
    ///
    /// The column is the serializer's tail from here on: nothing else may write to this
    /// archive until the column closes, and [`Column::push`] checks that per record.
    pub(super) fn column<T, D, E>(&mut self) -> Result<Column<T>, DumpError<D, E>> {
        let kind = self.kind;
        let pos = self
            .strategy()
            .align_for::<T>()
            .map_err(|source| DumpError::Archive { kind, source })?;

        Ok(Column {
            pos,
            count: 0,
            _marker: PhantomData,
        })
    }

    /// Serializes a collected column whole, for record types that carry out-of-line data.
    pub(super) fn slice_column<U, D, E>(
        &mut self,
        values: &[U],
    ) -> Result<(VecResolver, usize), DumpError<D, E>>
    where
        U: Serialize<ArchiveSerializer<'arena>>,
    {
        let kind = self.kind;
        ArchivedVec::serialize_from_slice(values, self.strategy())
            .map(|resolver| (resolver, values.len()))
            .map_err(|source| DumpError::Archive { kind, source })
    }

    /// Emplaces the root at the file's end and seals the file into its manifest row.
    ///
    /// `resolve` receives the root's place and resolves each field from its column's resolver
    /// and count. The root is the file's last write, so the reader derives its position from
    /// the file's length.
    pub(super) fn finish<R, D, E>(
        mut self,
        resolve: impl FnOnce(Place<R>),
    ) -> Result<FileManifest, DumpError<D, E>>
    where
        R: Portable,
    {
        let kind = self.kind;
        let archive = |source| DumpError::Archive { kind, source };

        let serializer = Strategy::<_, rancor::Error>::wrap(&mut self.serializer);
        let pos = serializer.align_for::<R>().map_err(archive)?;

        let mut resolved = MaybeUninit::<R>::uninit();
        // SAFETY: `resolved` is a local `MaybeUninit`, properly aligned and valid for a write
        // of `size_of::<R>()` bytes.
        unsafe {
            resolved.as_mut_ptr().write_bytes(0, 1);
        }
        // SAFETY: `resolved.as_mut_ptr()` is properly aligned and dereferenceable as a local,
        // and every one of its bytes was initialized by the zeroing write above.
        let out = unsafe { Place::new_unchecked(pos, resolved.as_mut_ptr()) };
        resolve(out);
        serializer.write(out.as_slice()).map_err(archive)?;

        let bytes = self.serializer.pos() as u64;
        let mut inner = self.serializer.into_writer().into_inner();
        inner
            .flush()
            .map_err(|source| DumpError::Io { kind, source })?;

        Ok(FileManifest {
            bytes,
            sha256: inner.accumulator.finalize(),
        })
    }
}

/// One in-progress inline column of `T`, tracked as its start position and record count.
///
/// The column admits only records whose serialization writes nothing beyond the value itself,
/// which is what lets them stream: out-of-line bytes written between two pushes would land
/// inside the column. [`push`](Self::push) enforces that per record.
pub(super) struct Column<T> {
    pos: usize,
    count: usize,
    _marker: PhantomData<fn(T)>,
}

impl<T: Portable> Column<T> {
    /// Records already pushed.
    pub(super) const fn count(&self) -> usize {
        self.count
    }

    /// Serializes one record into the column.
    ///
    /// # Panics
    ///
    /// This panics when the archive's position has moved between pushes, and when the record's
    /// serialization writes out-of-line data. Every type pushed here archives in place, so a
    /// panic means a record type changed shape rather than a runtime condition.
    #[expect(
        clippy::panic_in_result_fn,
        reason = "the position asserts are the column's structural contract, and the unsafe \
                  resolve below is sound only while they hold"
    )]
    pub(super) fn push<U, D, E>(
        &mut self,
        archive: &mut StreamArchive<'_>,
        value: &U,
    ) -> Result<(), DumpError<D, E>>
    where
        U: for<'arena> Serialize<ArchiveSerializer<'arena>, Archived = T>,
    {
        let kind = archive.kind;
        let serializer = archive.strategy();
        let tail = self.pos + self.count * size_of::<T>();
        assert_eq!(
            serializer.pos(),
            tail,
            "the column is the serializer's tail, so nothing else may write between pushes",
        );

        let resolver = value
            .serialize(serializer)
            .map_err(|source| DumpError::Archive { kind, source })?;
        assert_eq!(
            serializer.pos(),
            tail,
            "an inline column record must not write out-of-line data",
        );

        // SAFETY: `resolver` came from serializing `value` above, and the position asserts
        // hold the serializer at `pos + count * size_of::<T>()`: a whole number of records
        // past the aligned column start, which stays aligned for `U::Archived = T` because a
        // type's size is a multiple of its alignment.
        unsafe { serializer.resolve_aligned(value, resolver) }
            .map_err(|source| DumpError::Archive { kind, source })?;
        self.count += 1;

        Ok(())
    }

    /// Closes the column into its vector resolver and record count.
    pub(super) fn into_parts(self) -> (VecResolver, usize) {
        (VecResolver::from_pos(self.pos), self.count)
    }
}

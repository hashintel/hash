//! Defines the storage operations that journal submission and recovery use.
//!
//! Implement [`JournalStorage`] to supply readers and writers. The kernel checks record formats
//! and scan boundaries for each backend. [`StorageConfig`] opens the object-storage backend.

use core::{
    ops::{Bound, RangeBounds},
    pin::Pin,
    task::{Context, Poll, ready},
    time::Duration,
};

use bytes::{Buf, Bytes};
use error_stack::{Report, ResultExt as _};
use futures_core::Stream;
use opendata_common::StorageConfig;
use opendata_log::{
    Config, LogDb, LogDbReader, LogEntry, LogIterator, LogRead as _, ReadVisibility, ReaderConfig,
    Record,
};
use tokio_util::sync::ReusableBoxFuture;

use super::{
    APPEND_TIMEOUT, DURABILITY_WAIT_ATTEMPTS, ShardAppendError, flush_with_timeout,
    wait_until_durable_with,
};
use crate::{DurableError, sequence::JournalSequence};

/// Reads durable records as pairs of [`JournalSequence`] and stored bytes, in increasing sequence
/// order.
///
/// The journal assigns each record its journal sequence at append time. All keys in one journal
/// share one sequence, and it can have gaps. The stream yields an error if storage cannot supply
/// the next record.
pub trait JournalStream:
    Stream<Item = Result<(JournalSequence, Bytes), Report<DurableError>>> + Send
{
    /// Returns the exclusive end of the journal sequences read, including sequences with no record
    /// for the requested key. After the stream returns `None`, this must report how far storage was
    /// read, even if the scan stopped before the requested end.
    fn next_sequence(&self) -> JournalSequence;
}

/// Scans a journal without changing its contents.
pub trait JournalReader: Send + Sync + 'static {
    /// Streams the durable records of one key.
    type Stream: JournalStream;

    /// Reads records in journal sequence order within `range`. Gaps and empty ranges are valid.
    ///
    /// # Errors
    ///
    /// Returns an error if storage cannot open the requested scan.
    fn scan(
        &self,
        key: Bytes,
        range: impl RangeBounds<JournalSequence> + Send,
    ) -> impl Future<Output = Result<Self::Stream, Report<DurableError>>> + Send;

    /// Releases the reader or writer's storage resources.
    ///
    /// # Errors
    ///
    /// Returns an error if storage cannot close.
    fn close(self) -> impl Future<Output = Result<(), Report<DurableError>>> + Send;
}

/// Appends through one writer epoch. Opening a replacement must invalidate older writers.
pub trait JournalWriter: JournalReader {
    /// Returns the exclusive end of the durable journal sequences visible to this writer.
    fn durable_end_exclusive(&self) -> JournalSequence;

    /// Stores a record under the bytes remaining in `key`. Returns its journal sequence once the
    /// record is durable. Journal sequences increase across all keys and writer epochs and can have
    /// gaps.
    ///
    /// # Errors
    ///
    /// Returns a [`ShardAppendError`] whose kind is
    /// [`DefinitelyNotCommitted`](super::AppendFailureKind::DefinitelyNotCommitted),
    /// [`CommitUnknown`](super::AppendFailureKind::CommitUnknown), or
    /// [`Fenced`](super::AppendFailureKind::Fenced).
    fn append(
        &self,
        key: impl Buf + Send,
        value: Bytes,
    ) -> impl Future<Output = Result<JournalSequence, Report<ShardAppendError>>> + Send;
}

/// Opens journal readers and writers over the same storage.
pub trait JournalStorage: Send + Sync + 'static {
    /// Reads the journal. Opening a reader leaves writer ownership unchanged.
    type Reader: JournalReader;
    /// Appends to the journal and scans its durable prefix during recovery.
    type Writer: JournalWriter;

    /// # Errors
    ///
    /// Returns an error if the read-only journal cannot be opened.
    fn open_reader(
        &self,
    ) -> impl Future<Output = Result<Self::Reader, Report<DurableError>>> + Send;

    /// Opens a writer whose durability waits use `durability_timeout`.
    ///
    /// # Errors
    ///
    /// Returns an error if writer ownership cannot be acquired.
    fn open_writer(
        &self,
        durability_timeout: Duration,
    ) -> impl Future<Output = Result<Self::Writer, Report<DurableError>>> + Send;
}

/// Implements [`JournalReader`] with opendata-log.
pub struct StorageReader(LogDbReader);

/// Implements [`JournalWriter`] with opendata-log.
pub struct StorageWriter {
    log: LogDb,
    durability_timeout: Duration,
}

/// Implements [`JournalStream`] with opendata-log.
pub struct StorageStream {
    read: Option<ReusableBoxFuture<'static, (LogIterator, opendata_log::Result<Option<LogEntry>>)>>,
    key: Bytes,
    next_sequence: JournalSequence,
}

impl StorageStream {
    fn new(inner: LogIterator, key: Bytes) -> Self {
        Self {
            next_sequence: JournalSequence::new(inner.next_sequence()),
            read: Some(ReusableBoxFuture::new(Self::read_next(inner))),
            key,
        }
    }

    async fn read_next(
        mut inner: LogIterator,
    ) -> (LogIterator, opendata_log::Result<Option<LogEntry>>) {
        let entry = inner.next().await;
        (inner, entry)
    }
}

impl Stream for StorageStream {
    type Item = Result<(JournalSequence, Bytes), Report<DurableError>>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        let Some(read) = this.read.as_mut() else {
            return Poll::Ready(None);
        };
        let (inner, entry) = ready!(read.poll(cx));
        this.next_sequence = JournalSequence::new(inner.next_sequence());
        let entry = entry.change_context_lazy(|| DurableError::ReadRecord {
            key: this.key.clone(),
            next_sequence: this.next_sequence,
        });
        if matches!(entry, Ok(None)) {
            this.read = None;
        } else {
            read.set(Self::read_next(inner));
        }
        Poll::Ready(
            entry
                .map(|entry| entry.map(|entry| (JournalSequence::new(entry.sequence), entry.value)))
                .transpose(),
        )
    }
}

fn storage_range(
    range: (Bound<JournalSequence>, Bound<JournalSequence>),
) -> (Bound<u64>, Bound<u64>) {
    (
        range.0.map(JournalSequence::get),
        range.1.map(JournalSequence::get),
    )
}

impl JournalStream for StorageStream {
    fn next_sequence(&self) -> JournalSequence {
        self.next_sequence
    }
}

impl JournalReader for StorageReader {
    type Stream = StorageStream;

    async fn scan(
        &self,
        key: Bytes,
        range: impl RangeBounds<JournalSequence> + Send,
    ) -> Result<Self::Stream, Report<DurableError>> {
        let range = (range.start_bound().cloned(), range.end_bound().cloned());
        let inner = self
            .0
            .scan(key.clone(), storage_range(range))
            .await
            .change_context_lazy(|| DurableError::Scan {
                key: key.clone(),
                range,
            })?;
        Ok(StorageStream::new(inner, key))
    }

    async fn close(self) -> Result<(), Report<DurableError>> {
        self.0.close().await;
        Ok(())
    }
}

impl JournalReader for StorageWriter {
    type Stream = StorageStream;

    async fn scan(
        &self,
        key: Bytes,
        range: impl RangeBounds<JournalSequence> + Send,
    ) -> Result<Self::Stream, Report<DurableError>> {
        let range = (range.start_bound().cloned(), range.end_bound().cloned());
        let inner = self
            .log
            .scan(key.clone(), storage_range(range))
            .await
            .change_context_lazy(|| DurableError::Scan {
                key: key.clone(),
                range,
            })?;
        Ok(StorageStream::new(inner, key))
    }

    async fn close(self) -> Result<(), Report<DurableError>> {
        self.log
            .close()
            .await
            .change_context(DurableError::CloseJournal)
    }
}

impl JournalWriter for StorageWriter {
    fn durable_end_exclusive(&self) -> JournalSequence {
        JournalSequence::new(self.log.durable_sequence())
    }

    async fn append(
        &self,
        mut key: impl Buf + Send,
        value: Bytes,
    ) -> Result<JournalSequence, Report<ShardAppendError>> {
        let remaining = key.remaining();
        let key = key.copy_to_bytes(remaining);
        let output = self
            .log
            .append_timeout(vec![Record { key, value }], APPEND_TIMEOUT)
            .await
            .map_err(|error| {
                ShardAppendError::after_storage_call(DurableError::AppendRecord, error)
            })?;
        flush_with_timeout(self.log.flush(), self.durability_timeout).await?;
        wait_until_durable_with(
            &self.log,
            output.start_sequence + 1,
            self.durability_timeout,
            DURABILITY_WAIT_ATTEMPTS,
        )
        .await
        .map_err(ShardAppendError::from_storage_report)?;
        Ok(JournalSequence::new(output.start_sequence))
    }
}

impl JournalStorage for StorageConfig {
    type Reader = StorageReader;
    type Writer = StorageWriter;

    async fn open_reader(&self) -> Result<Self::Reader, Report<DurableError>> {
        LogDbReader::open(ReaderConfig {
            storage: self.clone(),
            ..ReaderConfig::default()
        })
        .await
        .change_context(DurableError::OpenReader)
        .map(StorageReader)
    }

    async fn open_writer(
        &self,
        durability_timeout: Duration,
    ) -> Result<Self::Writer, Report<DurableError>> {
        let log = LogDb::open(Config {
            storage: self.clone(),
            read_visibility: ReadVisibility::Remote,
            // Larger blocks reduce S3 range requests during sequential replay.
            sst_block_size: Some(slatedb::SstBlockSize::Block64Kib),
            ..Config::default()
        })
        .await
        .change_context(DurableError::OpenWriter)?;
        Ok(StorageWriter {
            log,
            durability_timeout,
        })
    }
}

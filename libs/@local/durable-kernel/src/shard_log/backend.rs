//! Storage operations used by journal submission and recovery.
//!
//! Implement [`JournalStorage`] to supply readers and writers. The kernel checks record formats
//! and scan boundaries for each backend. [`StorageConfig`] opens the object-storage backend.

use core::{
    ops::RangeBounds,
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
    post_invocation_report, post_invocation_source, wait_until_durable_with,
};
use crate::DurableError;

/// Reads durable records as `(journal sequence, stored bytes)` in increasing sequence order.
///
/// Each sequence is a position assigned at append time across all keys in one journal. Positions
/// can have gaps. A stream yields an error if storage cannot supply the next record.
pub trait JournalStream: Stream<Item = Result<(u64, Bytes), Report<DurableError>>> + Send {
    /// Exclusive end of the range read, including positions with no record for the requested key.
    /// After the stream returns `None`, this must report how far storage was read, even if the scan
    /// stopped before the requested end.
    fn next_sequence(&self) -> u64;
}

/// Scans a journal without changing its contents.
pub trait JournalReader: Send + Sync + 'static {
    /// A cursor over durable records for one key.
    type Stream: JournalStream;

    /// Reads records in sequence order within `range`. Sequence gaps and empty ranges are valid.
    ///
    /// # Errors
    ///
    /// Returns an error if storage cannot open the requested scan.
    fn scan(
        &self,
        key: Bytes,
        range: impl RangeBounds<u64> + Send,
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
    /// Exclusive end of durable records visible to this writer.
    fn durable_end_exclusive(&self) -> u64;

    /// Stores a record under the bytes remaining in `key` and returns its sequence only after it
    /// is durable. Sequences increase across all keys and writer epochs. They may contain gaps.
    ///
    /// # Errors
    ///
    /// Classifies a failure as definitely not committed, possibly committed, or fenced.
    fn append(
        &self,
        key: impl Buf + Send,
        value: Bytes,
    ) -> impl Future<Output = Result<u64, Report<ShardAppendError>>> + Send;
}

/// Opens journal readers and writers over the same storage.
pub trait JournalStorage: Send + Sync + 'static {
    /// A read-only view that leaves writer ownership unchanged.
    type Reader: JournalReader;
    /// A writer that can scan its durable prefix during recovery.
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

/// A reader backed by opendata-log.
pub struct StorageReader(LogDbReader);

/// A writer backed by opendata-log.
pub struct StorageWriter {
    log: LogDb,
    durability_timeout: Duration,
}

/// A scan backed by opendata-log.
pub struct StorageStream {
    read: Option<ReusableBoxFuture<'static, (LogIterator, opendata_log::Result<Option<LogEntry>>)>>,
    key: Bytes,
    next_sequence: u64,
}

impl StorageStream {
    fn new(inner: LogIterator, key: Bytes) -> Self {
        Self {
            next_sequence: inner.next_sequence(),
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
    type Item = Result<(u64, Bytes), Report<DurableError>>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        let Some(read) = this.read.as_mut() else {
            return Poll::Ready(None);
        };
        let (inner, entry) = ready!(read.poll(cx));
        this.next_sequence = inner.next_sequence();
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
                .map(|entry| entry.map(|entry| (entry.sequence, entry.value)))
                .transpose(),
        )
    }
}

impl JournalStream for StorageStream {
    fn next_sequence(&self) -> u64 {
        self.next_sequence
    }
}

impl JournalReader for StorageReader {
    type Stream = StorageStream;

    async fn scan(
        &self,
        key: Bytes,
        range: impl RangeBounds<u64> + Send,
    ) -> Result<Self::Stream, Report<DurableError>> {
        let range = (range.start_bound().cloned(), range.end_bound().cloned());
        let inner = self
            .0
            .scan(key.clone(), range)
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
        range: impl RangeBounds<u64> + Send,
    ) -> Result<Self::Stream, Report<DurableError>> {
        let range = (range.start_bound().cloned(), range.end_bound().cloned());
        let inner = self
            .log
            .scan(key.clone(), range)
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
    fn durable_end_exclusive(&self) -> u64 {
        self.log.durable_sequence()
    }

    async fn append(
        &self,
        mut key: impl Buf + Send,
        value: Bytes,
    ) -> Result<u64, Report<ShardAppendError>> {
        let remaining = key.remaining();
        let key = key.copy_to_bytes(remaining);
        let output = self
            .log
            .append_timeout(vec![Record { key, value }], APPEND_TIMEOUT)
            .await
            .map_err(|error| post_invocation_source(DurableError::AppendRecord, error))?;
        flush_with_timeout(self.log.flush(), self.durability_timeout).await?;
        wait_until_durable_with(
            &self.log,
            output.start_sequence + 1,
            self.durability_timeout,
            DURABILITY_WAIT_ATTEMPTS,
        )
        .await
        .map_err(post_invocation_report)?;
        Ok(output.start_sequence)
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

#[cfg(test)]
impl StorageWriter {
    pub(super) const fn raw_log(&self) -> &LogDb {
        &self.log
    }
}

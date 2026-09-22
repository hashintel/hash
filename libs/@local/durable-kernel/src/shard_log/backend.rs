//! Storage operations used by journal submission and recovery.
//!
//! Implement [`JournalStorage`] to supply readers and writers. The kernel checks record formats
//! and scan boundaries for each backend. [`StorageConfig`] opens the object-storage backend.

use core::{ops::Bound, time::Duration};

use bytes::Bytes;
use error_stack::{Report, ResultExt as _};
use opendata_common::StorageConfig;
use opendata_log::{
    Config, LogDb, LogDbReader, LogIterator, LogRead as _, ReadVisibility, ReaderConfig, Record,
};

use super::{
    APPEND_TIMEOUT, DURABILITY_WAIT_ATTEMPTS, ShardAppendError, flush_with_timeout,
    post_invocation_report, post_invocation_source, wait_until_durable_with,
};
use crate::DurableError;

/// Reads stored bytes in increasing sequence order.
pub trait JournalIterator: Send {
    /// Returns the next durable record in the range, or `None` when the scan ends.
    ///
    /// # Errors
    ///
    /// Returns an error if storage cannot supply the next record.
    fn next(
        &mut self,
    ) -> impl Future<Output = Result<Option<(u64, Bytes)>, Report<DurableError>>> + Send;

    /// Exclusive end of the range read, including positions with no record for the requested key.
    /// After `next` returns `None`, this must report how far storage was read, even if the scan
    /// stopped before the requested end.
    fn next_sequence(&self) -> u64;
}

/// Scans a journal without changing its contents.
pub trait JournalReader: Send + Sync + 'static {
    /// A cursor over durable records for one key.
    type Iterator: JournalIterator;

    /// Reads records in sequence order within `range`. Sequence gaps and empty ranges are valid.
    ///
    /// # Errors
    ///
    /// Returns an error if storage cannot open the requested scan.
    fn scan(
        &self,
        key: Bytes,
        range: (Bound<u64>, Bound<u64>),
    ) -> impl Future<Output = Result<Self::Iterator, Report<DurableError>>> + Send;

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

    /// Stores a record and returns its sequence only after it is durable. Sequences increase
    /// across all keys and writer epochs. They may contain gaps.
    ///
    /// # Errors
    ///
    /// Classifies a failure as definitely not committed, possibly committed, or fenced.
    fn append(
        &self,
        key: Bytes,
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
pub struct StorageIterator {
    inner: LogIterator,
    key: Bytes,
}

impl JournalIterator for StorageIterator {
    async fn next(&mut self) -> Result<Option<(u64, Bytes)>, Report<DurableError>> {
        self.inner
            .next()
            .await
            .change_context_lazy(|| DurableError::ReadRecord {
                key: self.key.clone(),
                next_sequence: self.inner.next_sequence(),
            })
            .map(|entry| entry.map(|entry| (entry.sequence, entry.value)))
    }

    fn next_sequence(&self) -> u64 {
        self.inner.next_sequence()
    }
}

impl JournalReader for StorageReader {
    type Iterator = StorageIterator;

    async fn scan(
        &self,
        key: Bytes,
        range: (Bound<u64>, Bound<u64>),
    ) -> Result<Self::Iterator, Report<DurableError>> {
        let inner = self
            .0
            .scan(key.clone(), range)
            .await
            .change_context_lazy(|| DurableError::Scan {
                key: key.clone(),
                range,
            })?;
        Ok(StorageIterator { inner, key })
    }

    async fn close(self) -> Result<(), Report<DurableError>> {
        self.0.close().await;
        Ok(())
    }
}

impl JournalReader for StorageWriter {
    type Iterator = StorageIterator;

    async fn scan(
        &self,
        key: Bytes,
        range: (Bound<u64>, Bound<u64>),
    ) -> Result<Self::Iterator, Report<DurableError>> {
        let inner = self
            .log
            .scan(key.clone(), range)
            .await
            .change_context_lazy(|| DurableError::Scan {
                key: key.clone(),
                range,
            })?;
        Ok(StorageIterator { inner, key })
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

    async fn append(&self, key: Bytes, value: Bytes) -> Result<u64, Report<ShardAppendError>> {
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

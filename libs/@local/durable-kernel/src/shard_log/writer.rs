use alloc::sync::Arc;
use core::{ops::Bound, time::Duration};

use bytes::Bytes;
use error_stack::{Report, ResultExt as _};
use opendata_log::{LogDb, Sequence};

#[cfg(any(test, feature = "test-util"))]
use super::EVENTS_KEY;
#[cfg(test)]
use super::StorageWriter;
use super::{
    AppendFailureKind, JournalStorage, JournalWriter, ShardAppendError, ShardLogLocation,
    ShardLogOpenError, ShardLogWriter, SnapshotCandidate, post_invocation_source, recovery_range,
    scan_records, scan_snapshot_records,
};
use crate::{
    DurableError,
    registry::{DurableRecord, UntrimmedJournalRecord},
};

pub(super) async fn flush_with_timeout(
    flush: impl core::future::Future<Output = opendata_log::Result<()>>,
    timeout: Duration,
) -> Result<(), Report<ShardAppendError>> {
    tokio::time::timeout(timeout, flush)
        .await
        .map_err(|error| post_invocation_source(DurableError::FlushTimeout { timeout }, error))?
        .map_err(|error| post_invocation_source(DurableError::FlushRecord, error))
}

/// Waits up to `attempts` times for `required` to become durable. It retries because the
/// durability notification can arrive after the write. Running out of attempts leaves the append
/// commit-unknown, which stops a leased shard.
pub(super) async fn wait_until_durable_with(
    log: &LogDb,
    required: Sequence,
    attempt_timeout: Duration,
    attempts: u32,
) -> Result<(), Report<DurableError>> {
    for attempt in 1..=attempts {
        if log.durable_sequence() >= required {
            return Ok(());
        }
        let mut changes = log.subscribe_durable();
        let wait = tokio::time::timeout(attempt_timeout, async {
            while *changes.borrow_and_update() < required {
                changes
                    .changed()
                    .await
                    .change_context(DurableError::DurabilitySubscriptionClosed { required })?;
            }
            Ok::<(), Report<DurableError>>(())
        })
        .await;
        match wait {
            Ok(result) => return result,
            Err(_elapsed) => {
                tracing::warn!(
                    attempt,
                    of = attempts,
                    required,
                    "durability wait timed out; checking again"
                );
            }
        }
    }
    Err(Report::new(DurableError::DurabilityTimeout {
        required,
        attempts,
        attempt_timeout,
    }))
}

impl<W: JournalWriter> ShardLogWriter<W> {
    pub(super) async fn open(
        location: &ShardLogLocation<impl JournalStorage<Writer = W>>,
    ) -> Result<Self, Report<ShardLogOpenError>> {
        let durability_timeout = location.durability_timeout;
        let backend = tokio::time::timeout(
            durability_timeout,
            location.storage.open_writer(durability_timeout),
        )
        .await
        .change_context(ShardLogOpenError::WriterTimeout {
            shard: location.shard,
            timeout: durability_timeout,
        })?
        .change_context(ShardLogOpenError::Writer {
            shard: location.shard,
        })?;
        Ok(Self {
            backend,
            durability_timeout,
            registry: Arc::clone(&location.registry),
        })
    }

    #[cfg(any(test, feature = "test-util"))]
    pub(super) async fn append<T: UntrimmedJournalRecord + Sync>(
        &self,
        value: &T,
    ) -> Result<u64, Report<ShardAppendError>> {
        self.append_registered(EVENTS_KEY, value).await
    }

    pub(super) fn durable_end_exclusive(&self) -> u64 {
        self.backend.durable_end_exclusive()
    }

    pub(super) async fn scan_suffix<T: UntrimmedJournalRecord>(
        &self,
        through_log_sequence: Option<u64>,
        durable_end_exclusive: u64,
    ) -> Result<Vec<(u64, T)>, Report<DurableError>> {
        self.registry
            .register(T::declaration())
            .change_context(DurableError::RegisterRecord {
                name: T::declaration().name,
            })?;
        let range = recovery_range(through_log_sequence, durable_end_exclusive)?;
        scan_records(&self.backend, range.bounds, Some(range.window)).await
    }

    pub(super) async fn scan_projection_snapshots<T: DurableRecord>(
        &self,
        durable_end_exclusive: u64,
    ) -> Result<Vec<SnapshotCandidate<T>>, Report<DurableError>> {
        self.registry
            .register(T::declaration())
            .change_context(DurableError::RegisterRecord {
                name: T::declaration().name,
            })?;
        scan_snapshot_records(
            &self.backend,
            (Bound::Unbounded, Bound::Excluded(durable_end_exclusive)),
            durable_end_exclusive,
        )
        .await
    }

    #[cfg(any(test, feature = "test-util"))]
    pub(super) async fn append_registered<T: DurableRecord + Sync>(
        &self,
        key: &'static [u8],
        value: &T,
    ) -> Result<u64, Report<ShardAppendError>> {
        let bytes = self.encode_registered::<T>(|writer| value.encode(writer))?;
        self.append_encoded(key, bytes).await
    }

    pub(super) fn encode_registered<T: DurableRecord>(
        &self,
        encode: impl FnOnce(&mut Vec<u8>) -> Result<(), Report<crate::registry::CompatError>>,
    ) -> Result<Bytes, Report<ShardAppendError>> {
        self.registry
            .require::<T>()
            .change_context(DurableError::ValidateRecordRegistration {
                name: T::declaration().name,
            })
            .change_context(ShardAppendError {
                kind: AppendFailureKind::DefinitelyNotCommitted,
            })?;
        let mut bytes = Vec::new();
        encode(&mut bytes)
            .change_context(DurableError::EncodeRecord {
                name: T::declaration().name,
            })
            .change_context(ShardAppendError {
                kind: AppendFailureKind::DefinitelyNotCommitted,
            })?;
        Ok(Bytes::from(bytes))
    }

    pub(super) async fn append_encoded(
        &self,
        key: &'static [u8],
        bytes: Bytes,
    ) -> Result<u64, Report<ShardAppendError>> {
        self.backend.append(Bytes::from_static(key), bytes).await
    }

    pub(super) async fn close(self) -> Result<(), Report<DurableError>> {
        let durability_timeout = self.durability_timeout;
        tokio::time::timeout(durability_timeout, self.backend.close())
            .await
            .change_context(DurableError::CloseTimeout {
                timeout: durability_timeout,
            })?
    }
}

#[cfg(test)]
impl ShardLogWriter<StorageWriter> {
    pub(super) const fn raw_log(&self) -> &LogDb {
        self.backend.raw_log()
    }
}

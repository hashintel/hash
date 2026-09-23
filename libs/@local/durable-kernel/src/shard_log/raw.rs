use error_stack::{Report, ResultExt as _};

use super::{
    AppendFailureKind, JournalStorage, JournalWriter, PROJECTION_SNAPSHOTS_KEY, ShardAppendError,
    ShardLogLocation, ShardLogOpenError, ShardLogWriter, StorageWriter,
};
use crate::{
    DurableError,
    registry::{DurableRecord, UntrimmedJournalRecord},
    sequence::JournalSequence,
};

/// Provides direct append access for tests that seed journals or open competing writers.
pub struct RawShardLog<W: JournalWriter = StorageWriter>(ShardLogWriter<W>);

impl<W: JournalWriter> RawShardLog<W> {
    /// # Errors
    ///
    /// Returns an error when the shard storage cannot be opened before its timeout.
    pub async fn open(
        location: &ShardLogLocation<impl JournalStorage<Writer = W>>,
    ) -> Result<Self, Report<ShardLogOpenError>> {
        ShardLogWriter::open(location).await.map(Self)
    }

    /// # Errors
    ///
    /// Returns an error when record validation, append, or durable flush fails.
    pub async fn append<T: UntrimmedJournalRecord + Sync>(
        &self,
        value: &T,
    ) -> Result<JournalSequence, Report<ShardAppendError>> {
        self.0
            .registry
            .register(T::declaration())
            .change_context(DurableError::RegisterRecord {
                name: T::declaration().name,
            })
            .change_context(ShardAppendError {
                kind: AppendFailureKind::DefinitelyNotCommitted,
            })?;
        self.0.append(value).await
    }

    /// # Errors
    ///
    /// Returns an error when snapshot validation, append, or durable flush fails.
    pub async fn append_projection_snapshot<T: DurableRecord + Sync>(
        &self,
        value: &T,
    ) -> Result<JournalSequence, Report<ShardAppendError>> {
        self.0
            .registry
            .register(T::declaration())
            .change_context(DurableError::RegisterRecord {
                name: T::declaration().name,
            })
            .change_context(ShardAppendError {
                kind: AppendFailureKind::DefinitelyNotCommitted,
            })?;
        self.0
            .append_registered(PROJECTION_SNAPSHOTS_KEY, value)
            .await
    }

    #[must_use]
    pub fn durable_end_exclusive(&self) -> JournalSequence {
        self.0.durable_end_exclusive()
    }

    /// # Errors
    ///
    /// Returns an error when the shard writer cannot be closed.
    pub async fn close(self) -> Result<(), Report<DurableError>> {
        self.0.close().await
    }
}

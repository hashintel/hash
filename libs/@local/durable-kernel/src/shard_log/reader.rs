use alloc::sync::Arc;
use core::ops::Bound;

use error_stack::{Report, ResultExt as _};

use super::{
    DURABILITY_TIMEOUT, JournalReader, JournalStorage, ShardLogLocation, ShardLogOpenError,
    StorageReader, recovery_range, scan_records,
};
use crate::{
    DurableError,
    registry::{RecordRegistry, UntrimmedJournalRecord},
};

/// Reads journal records without acquiring a writer. Production recovery uses the active
/// writer’s view of the journal.
pub struct ShardLogRecovery<R: JournalReader = StorageReader> {
    reader: R,
    registry: Arc<RecordRegistry>,
}

impl<R: JournalReader> ShardLogRecovery<R> {
    /// # Errors
    ///
    /// Returns an error when the shard storage cannot be opened before its timeout.
    pub async fn open(
        location: &ShardLogLocation<impl JournalStorage<Reader = R>>,
    ) -> Result<Self, Report<ShardLogOpenError>> {
        Ok(Self {
            reader: location.open_reader().await?,
            registry: Arc::clone(&location.registry),
        })
    }

    /// # Errors
    ///
    /// Returns an error when journal scanning, decoding, or sequence validation fails.
    pub async fn scan<T: UntrimmedJournalRecord>(
        &self,
    ) -> Result<Vec<(u64, T)>, Report<DurableError>> {
        self.registry
            .register(T::declaration())
            .change_context(DurableError::RegisterRecord {
                name: T::declaration().name,
            })?;
        scan_records(&self.reader, (Bound::Unbounded, Bound::Unbounded), None).await
    }

    /// # Errors
    ///
    /// Returns an error when journal scanning, decoding, or sequence validation fails.
    pub async fn scan_suffix<T: UntrimmedJournalRecord>(
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
        scan_records(&self.reader, range.bounds, Some(range.window)).await
    }

    /// Closes the reader, waiting up to the durability timeout. Close errors are discarded.
    pub async fn close(self) {
        let _: Result<_, _> = tokio::time::timeout(DURABILITY_TIMEOUT, self.reader.close()).await;
    }
}

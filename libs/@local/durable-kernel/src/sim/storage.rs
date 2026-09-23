//! Implements the shared journal interfaces with in-memory storage and pause points.

use alloc::sync::Arc;
use core::{
    future::ready,
    ops::{Bound, RangeBounds},
    pin::Pin,
    task::{Context, Poll},
    time::Duration,
};

use bytes::{Buf, Bytes};
use error_stack::{Report, ResultExt as _};
use futures_core::Stream;
use tokio::sync::Notify;

use super::{SimAppendResult, SimKey, SimLogHandle, SimWriter};
use crate::{
    DurableError,
    registry::RecordRegistry,
    routing::Shard,
    shard_log::{
        AppendFailureKind, JournalReader, JournalStorage, JournalStream, JournalWriter,
        ShardAppendError, ShardLogLocation,
    },
};

/// Pauses one storage operation until the test releases it.
#[derive(Debug, Default)]
pub struct SimPause {
    entered: Notify,
    release: Notify,
}

impl SimPause {
    /// Returns the `Notify` that is signalled when the storage operation reaches the pause.
    pub const fn entered(&self) -> &Notify {
        &self.entered
    }

    /// Returns the `Notify` to signal once to resume the storage operation.
    pub const fn release(&self) -> &Notify {
        &self.release
    }

    async fn wait(&self) {
        self.entered.notify_one();
        self.release.notified().await;
    }
}

impl SimLogHandle {
    /// Pauses the next append before it changes storage.
    #[must_use]
    pub fn pause_before_append(&self) -> Arc<SimPause> {
        let pause = Arc::new(SimPause::default());
        self.lock().before_append = Some(Arc::clone(&pause));
        pause
    }

    /// Pauses the next append after storage determines the result, before returning it.
    #[must_use]
    pub fn pause_after_append(&self) -> Arc<SimPause> {
        let pause = Arc::new(SimPause::default());
        self.lock().after_append = Some(Arc::clone(&pause));
        pause
    }
}

impl ShardLogLocation<SimLogHandle> {
    /// Creates a shard journal location with scheduled append outcomes and repeatable journal
    /// sequence gaps.
    #[must_use]
    pub const fn simulated(
        shard: Shard,
        journal: SimLogHandle,
        registry: Arc<RecordRegistry>,
    ) -> Self {
        Self::new(
            shard,
            journal,
            Duration::from_secs(60),
            Duration::from_secs(60),
            registry,
        )
    }
}

/// Streams the stored records returned by one scan of the simulated journal.
pub struct SimStream {
    entries: alloc::vec::IntoIter<(u64, Bytes)>,
    next_sequence: u64,
    end_exclusive: u64,
}

impl Stream for SimStream {
    type Item = Result<(u64, Bytes), Report<DurableError>>;

    fn poll_next(mut self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let entry = self.entries.next();
        self.next_sequence = entry.as_ref().map_or_else(
            || self.next_sequence.max(self.end_exclusive),
            |(sequence, _)| sequence + 1,
        );
        Poll::Ready(entry.map(Ok))
    }
}

impl JournalStream for SimStream {
    fn next_sequence(&self) -> u64 {
        self.next_sequence
    }
}

fn sim_key(key: &[u8]) -> Result<SimKey, Report<DurableError>> {
    match key {
        b"events" => Ok(SimKey::Events),
        b"projection-snapshots" => Ok(SimKey::Snapshots),
        _ => Err(Report::new(DurableError::UnsupportedJournalKey {
            key: Bytes::copy_from_slice(key),
        })),
    }
}

impl JournalReader for SimLogHandle {
    type Stream = SimStream;

    fn scan(
        &self,
        key: Bytes,
        range: impl RangeBounds<u64> + Send,
    ) -> impl Future<Output = Result<Self::Stream, Report<DurableError>>> + Send {
        ready(sim_key(&key).map(|key| {
            let range = (range.start_bound().cloned(), range.end_bound().cloned());
            let state = self.lock();
            let end_exclusive = match range.1 {
                Bound::Included(end) => end.saturating_add(1),
                Bound::Excluded(end) => end,
                Bound::Unbounded => state.durable_end_exclusive,
            }
            .min(state.durable_end_exclusive);
            let entries = state
                .entries
                .iter()
                .filter(|entry| entry.key == key && range.contains(&entry.sequence))
                .map(|entry| (entry.sequence, entry.bytes.clone()))
                .collect::<Vec<_>>()
                .into_iter();
            drop(state);
            let next_sequence = match range.0 {
                Bound::Included(start) => start,
                Bound::Excluded(start) => start.saturating_add(1),
                Bound::Unbounded => 0,
            };
            SimStream {
                entries,
                next_sequence,
                end_exclusive,
            }
        }))
    }

    fn close(self) -> impl Future<Output = Result<(), Report<DurableError>>> + Send {
        ready(Ok(()))
    }
}

impl JournalReader for SimWriter {
    type Stream = SimStream;

    async fn scan(
        &self,
        key: Bytes,
        range: impl RangeBounds<u64> + Send,
    ) -> Result<Self::Stream, Report<DurableError>> {
        JournalReader::scan(&self.handle, key, range).await
    }

    fn close(self) -> impl Future<Output = Result<(), Report<DurableError>>> + Send {
        ready(Ok(()))
    }
}

impl JournalWriter for SimWriter {
    fn durable_end_exclusive(&self) -> u64 {
        self.handle.durable_end_exclusive()
    }

    async fn append(
        &self,
        mut key: impl Buf + Send,
        value: Bytes,
    ) -> Result<u64, Report<ShardAppendError>> {
        let remaining = key.remaining();
        let key = key.copy_to_bytes(remaining);
        let key = sim_key(&key).change_context(ShardAppendError {
            kind: AppendFailureKind::DefinitelyNotCommitted,
        })?;
        let before = self.handle.lock().before_append.take();
        if let Some(pause) = before {
            pause.wait().await;
        }
        let result = self.append_record(key, value.to_vec());
        let after = self.handle.lock().after_append.take();
        if let Some(pause) = after {
            pause.wait().await;
        }
        match result {
            SimAppendResult::Acked(sequence) => Ok(sequence),
            SimAppendResult::DefinitelyNotCommitted => Err(Report::new(ShardAppendError {
                kind: AppendFailureKind::DefinitelyNotCommitted,
            })
            .attach("simulated pre-invocation failure")),
            SimAppendResult::CommitUnknown => Err(Report::new(ShardAppendError {
                kind: AppendFailureKind::CommitUnknown,
            })
            .attach("simulated append with unknown commit status")),
            SimAppendResult::Fenced => Err(Report::new(ShardAppendError {
                kind: AppendFailureKind::Fenced,
            })
            .attach("simulated newer writer epoch")),
        }
    }
}

impl JournalStorage for SimLogHandle {
    type Reader = Self;
    type Writer = SimWriter;

    fn open_reader(
        &self,
    ) -> impl Future<Output = Result<Self::Reader, Report<DurableError>>> + Send {
        ready(Ok(self.clone()))
    }

    fn open_writer(
        &self,
        _durability_timeout: Duration,
    ) -> impl Future<Output = Result<Self::Writer, Report<DurableError>>> + Send {
        ready(Ok(self.acquire_writer()))
    }
}

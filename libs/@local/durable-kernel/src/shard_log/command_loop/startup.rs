use error_stack::{Report, ResultExt as _};
use opendata_common::StorageConfig;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use super::{
    CommandLoop, FencedHook, RecoveredProjection, ShardCommandConfig, ShardCommandError,
    ShardCommandHandle, ShardOwner, StartupRecovery, StateChangeFeed,
    recovery::{replay_full_journal, replay_with_snapshots},
};
use crate::{
    port::{EventDomain, SnapshotDomain, SnapshotRecoveryStats},
    registry::DurableRecord,
    sequence::JournalSequence,
    shard_log::{JournalStorage, ShardLogLocation, ShardLogWriter},
};

#[derive(Debug)]
pub struct StartedShard<D: EventDomain> {
    pub owner: ShardOwner<D>,
    pub handle: ShardCommandHandle<D>,
    pub recovery: StartupRecovery<D::WorkIntent>,
    pub state_changes: StateChangeFeed<D::StateKey>,
    /// Returns the terminal error context. The failing command's reply carries the full report.
    pub task: tokio::task::JoinHandle<Result<(), ShardCommandError>>,
}

/// A writer awaiting recovery. Recover it and check the lease before enabling commands.
pub struct OpenedShard<S: JournalStorage = StorageConfig> {
    location: ShardLogLocation<S>,
    writer: Option<ShardLogWriter<S::Writer>>,
}

impl<S: JournalStorage> OpenedShard<S> {
    /// Opens a shard writer and records its durable journal end.
    ///
    /// # Errors
    ///
    /// Returns an error when the shard writer cannot be opened.
    pub async fn open(location: ShardLogLocation<S>) -> Result<Self, Report<ShardCommandError>> {
        let started = std::time::Instant::now();
        let writer = ShardLogWriter::open(&location)
            .await
            .change_context(ShardCommandError::OpenWriter)?;
        tracing::info!(
            shard = %location.shard.path_segment(),
            durable_end_exclusive = %writer.durable_end_exclusive(),
            elapsed_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX),
            "opened durable shard log"
        );
        Ok(Self {
            location,
            writer: Some(writer),
        })
    }

    /// Replays the full journal without loading snapshots.
    ///
    /// # Errors
    ///
    /// Returns an error when the durable journal cannot be read, decoded, or replayed.
    pub async fn recover<D: EventDomain>(
        mut self,
    ) -> Result<RecoveredShard<D, S>, Report<ShardCommandError>> {
        let writer = self.take_writer()?;
        let durable_end_exclusive = writer.durable_end_exclusive();
        let recovered = async {
            self.register::<D::Record>()?;
            replay_full_journal::<D>(&writer, self.location.shard, durable_end_exclusive).await
        }
        .await;
        let recovered = match recovered {
            Ok(recovered) => recovered,
            Err(error) => return Err(close_after_failure(writer, error).await),
        };
        Ok(self.into_recovered(writer, durable_end_exclusive, recovered, None))
    }

    /// Restores the newest usable snapshot and replays the journal after it. Falls back to a
    /// full replay when no snapshot can be restored.
    ///
    /// # Errors
    ///
    /// Returns an error when recovery cannot reconstruct a valid durable projection.
    pub async fn recover_with_snapshots<D: SnapshotDomain>(
        mut self,
        context: &D::SnapshotContext,
    ) -> Result<RecoveredShard<D, S>, Report<ShardCommandError>> {
        let writer = self.take_writer()?;
        let durable_end_exclusive = writer.durable_end_exclusive();
        let replay_started = std::time::Instant::now();
        let recovered = async {
            self.register::<D::Record>()?;
            self.register::<D::Snapshot>()?;
            replay_with_snapshots::<D>(&writer, self.location.shard, durable_end_exclusive, context)
                .await
        }
        .await;
        let recovered = match recovered {
            Ok(recovered) => recovered,
            Err(error) => return Err(close_after_failure(writer, error).await),
        };
        D::note_snapshot_recovery(
            context,
            &SnapshotRecoveryStats {
                replayed_events: recovered.replayed_events,
                replay_elapsed: replay_started.elapsed(),
                corruption_fallbacks: recovered.corruption_fallbacks,
                latest_snapshot_created_at: recovered.snapshot_created_at,
            },
        );
        let context = context.clone();
        let on_fenced: FencedHook = Box::new(move || D::note_fenced(&context));
        Ok(self.into_recovered(writer, durable_end_exclusive, recovered, Some(on_fenced)))
    }

    fn take_writer(&mut self) -> Result<ShardLogWriter<S::Writer>, Report<ShardCommandError>> {
        Ok(self
            .writer
            .take()
            .ok_or(ShardCommandError::WriterUnavailable)?)
    }

    fn register<T: DurableRecord>(&self) -> Result<(), Report<ShardCommandError>> {
        self.location
            .registry
            .register(T::declaration())
            .change_context_lazy(|| ShardCommandError::RegisterRecord {
                name: T::declaration().name,
            })
    }

    fn into_recovered<D: EventDomain>(
        self,
        writer: ShardLogWriter<S::Writer>,
        durable_end_exclusive: JournalSequence,
        recovered: RecoveredProjection<D>,
        on_fenced: Option<FencedHook>,
    ) -> RecoveredShard<D, S> {
        let projection = recovered.projection;
        let recovery = StartupRecovery {
            durable_end_exclusive,
            snapshot_through_sequence: recovered.snapshot_through_sequence,
            live_work: D::live_work(&projection).into_iter().collect(),
        };
        let initial_state_changes = D::initial_state_keys(&projection).into_iter().collect();
        RecoveredShard {
            location: self.location,
            writer: Some(writer),
            projection,
            last_snapshot_through_sequence: recovered.snapshot_through_sequence,
            on_fenced,
            recovery,
            initial_state_changes,
        }
    }

    /// # Errors
    ///
    /// Returns an error when the shard writer cannot be closed.
    pub async fn close(mut self) -> Result<(), Report<ShardCommandError>> {
        if let Some(writer) = self.writer.take() {
            writer
                .close()
                .await
                .change_context(ShardCommandError::CloseUnrecoveredWriter)?;
        }
        Ok(())
    }
}

/// Recovered state awaiting a lease check. Callers must complete that check before
/// enabling commands.
pub struct RecoveredShard<D: EventDomain, S: JournalStorage = StorageConfig> {
    location: ShardLogLocation<S>,
    writer: Option<ShardLogWriter<S::Writer>>,
    projection: D::Projection,
    last_snapshot_through_sequence: Option<JournalSequence>,
    on_fenced: Option<FencedHook>,
    recovery: StartupRecovery<D::WorkIntent>,
    initial_state_changes: Vec<D::StateKey>,
}

impl<D: EventDomain, S: JournalStorage> RecoveredShard<D, S> {
    /// Reports recovery results before the shard starts accepting commands.
    pub const fn startup_recovery(&self) -> &StartupRecovery<D::WorkIntent> {
        &self.recovery
    }

    pub fn enable(mut self, config: ShardCommandConfig) -> StartedShard<D> {
        let (sender, receiver) = mpsc::channel(config.channel_capacity.get());
        let (state_change_sender, state_change_receiver) =
            mpsc::channel(config.channel_capacity.get());
        let ownership_lost = CancellationToken::new();
        let admission_closed = ownership_lost.child_token();
        let owner = ShardOwner {
            _ownership: ownership_lost.clone().drop_guard(),
            sender: sender.clone(),
            admission_closed: admission_closed.clone(),
        };
        let handle = ShardCommandHandle {
            sender,
            admission_closed: admission_closed.clone(),
            shard: self.location.shard,
        };
        let command_loop = CommandLoop {
            location: self.location,
            writer: self.writer.take(),
            projection: self.projection,
            last_snapshot_attempt_through_sequence: self.last_snapshot_through_sequence,
            on_fenced: self.on_fenced.take(),
            safe_append_retries: config.safe_append_retries,
            receiver,
            state_change_sender,
            admission_closed,
            ownership_lost,
        };
        let task = tokio::spawn(command_loop.run());
        StartedShard {
            owner,
            handle,
            recovery: self.recovery,
            state_changes: StateChangeFeed {
                initial: self.initial_state_changes,
                receiver: state_change_receiver,
            },
            task,
        }
    }

    /// # Errors
    ///
    /// Returns an error when the shard writer cannot be closed.
    pub async fn close(mut self) -> Result<(), Report<ShardCommandError>> {
        if let Some(writer) = self.writer.take() {
            writer
                .close()
                .await
                .change_context(ShardCommandError::CloseRecoveredWriter)?;
        }
        Ok(())
    }
}

async fn close_after_failure<W: crate::shard_log::JournalWriter>(
    writer: ShardLogWriter<W>,
    error: Report<ShardCommandError>,
) -> Report<ShardCommandError> {
    match writer.close().await {
        Ok(()) => error,
        Err(close_error) => {
            let mut failures = error.expand();
            failures.push(close_error.change_context(ShardCommandError::CloseStartupWriter));
            failures.change_context(ShardCommandError::RecoverStartup)
        }
    }
}

use error_stack::{Report, ResultExt as _};
use opendata_common::StorageConfig;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use super::{
    CommandLoop, ShardCommandConfig, ShardCommandError, ShardCommandHandle, ShardOwner,
    StartupRecovery, StateChangeFeed, recovery::replay_with_snapshots,
};
use crate::{
    port::{Domain, SnapshotRecoveryStats},
    registry::DurableRecord as _,
    sequence::JournalSequence,
    shard_log::{JournalStorage, ShardLogLocation, ShardLogWriter},
};

#[derive(Debug)]
pub struct StartedShard<D: Domain> {
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

    /// Replays the full journal for tests. Leased startup uses
    /// [`Self::recover_with_snapshots`].
    #[cfg(any(test, feature = "test-util"))]
    /// # Errors
    ///
    /// Returns an error when the durable journal cannot be read, decoded, or replayed.
    pub async fn recover<D: Domain>(
        self,
    ) -> Result<RecoveredShard<D, S>, Report<ShardCommandError>> {
        self.recover_inner(None).await
    }

    /// # Errors
    ///
    /// Returns an error when recovery cannot reconstruct a valid durable projection.
    pub async fn recover_with_snapshots<D: Domain>(
        self,
        context: &D::SnapshotContext,
    ) -> Result<RecoveredShard<D, S>, Report<ShardCommandError>> {
        self.recover_inner(Some(context)).await
    }

    async fn recover_inner<D: Domain>(
        mut self,
        context: Option<&D::SnapshotContext>,
    ) -> Result<RecoveredShard<D, S>, Report<ShardCommandError>> {
        let writer = self
            .writer
            .take()
            .ok_or(ShardCommandError::WriterUnavailable)?;
        let durable_end_exclusive = writer.durable_end_exclusive();
        let replay_started = std::time::Instant::now();
        let recovered = match async {
            self.location
                .registry
                .register(D::Record::declaration())
                .change_context_lazy(|| ShardCommandError::RegisterRecord {
                    name: D::Record::declaration().name,
                })?;
            self.location
                .registry
                .register(D::Snapshot::declaration())
                .change_context_lazy(|| ShardCommandError::RegisterRecord {
                    name: D::Snapshot::declaration().name,
                })?;
            replay_with_snapshots::<D>(&writer, self.location.shard, durable_end_exclusive, context)
                .await
        }
        .await
        {
            Ok(recovered) => recovered,
            Err(error) => {
                if let Err(close_error) = writer.close().await {
                    let mut failures = error.expand();
                    failures
                        .push(close_error.change_context(ShardCommandError::CloseStartupWriter));
                    return Err(failures.change_context(ShardCommandError::RecoverStartup));
                }
                return Err(error);
            }
        };
        if let Some(context) = context {
            D::note_snapshot_recovery(
                context,
                &SnapshotRecoveryStats {
                    replayed_events: recovered.replayed_events,
                    replay_elapsed: replay_started.elapsed(),
                    corruption_fallbacks: recovered.corruption_fallbacks,
                    latest_snapshot_created_at: recovered.snapshot_created_at,
                },
            );
        }
        let snapshot_context = context.cloned();
        let projection = recovered.projection;
        let recovery = StartupRecovery {
            durable_end_exclusive,
            snapshot_through_sequence: recovered.snapshot_through_sequence,
            live_work: D::live_work(&projection).into_iter().collect(),
        };
        let initial_state_changes = D::initial_state_keys(&projection).into_iter().collect();
        Ok(RecoveredShard {
            location: self.location,
            writer: Some(writer),
            projection,
            last_snapshot_through_sequence: recovered.snapshot_through_sequence,
            snapshot_context,
            recovery,
            initial_state_changes,
        })
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
pub struct RecoveredShard<D: Domain, S: JournalStorage = StorageConfig> {
    location: ShardLogLocation<S>,
    writer: Option<ShardLogWriter<S::Writer>>,
    projection: D::Projection,
    last_snapshot_through_sequence: Option<JournalSequence>,
    snapshot_context: Option<D::SnapshotContext>,
    recovery: StartupRecovery<D::WorkIntent>,
    initial_state_changes: Vec<D::StateKey>,
}

impl<D: Domain, S: JournalStorage> RecoveredShard<D, S> {
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
            snapshot_context: self.snapshot_context,
            safe_append_retries: config.safe_append_retries,
            recovery_mode: config.recovery_mode,
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

/// Opens and recovers a shard for tests, then enables commands.
///
/// The returned handle includes all records below the writer’s durable journal end and the work
/// recovered from them. Production callers must complete lease acquisition before
/// enabling a shard.
#[cfg(any(test, feature = "test-util"))]
/// # Errors
///
/// Returns an error when opening or recovering the shard fails.
pub async fn start_recovered<D: Domain>(
    location: ShardLogLocation<impl JournalStorage>,
    config: ShardCommandConfig,
) -> Result<StartedShard<D>, Report<ShardCommandError>> {
    let opened = OpenedShard::open(location).await?;
    let recovered = opened.recover::<D>().await?;
    Ok(recovered.enable(config))
}

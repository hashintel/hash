//! Serializes changes to one shard's journal and projection.
//!
//! Producers submit typed records through a command handle. The loop checks
//! each proposal against its projection and applies the change after the append
//! is durable. External effects run outside the loop, so their completion
//! events may arrive after another command has changed the state.

use core::{convert::Infallible, num::NonZeroUsize};

use chrono::{DateTime, Utc};
use error_stack::{Report, ResultExt as _};
use opendata_common::StorageConfig;
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::{CancellationToken, DropGuard};

use super::{
    AppendFailureKind, JournalStorage, JournalWriter, ShardAppendError, ShardLogLocation,
    ShardLogWriter, SnapshotCandidate,
};
use crate::{
    DurableError,
    ids::EventId,
    port::{Domain, EventDomain, Prepared, SnapshotDomain, SnapshotRecoveryStats},
    registry::DurableRecord as _,
    routing::Shard,
};

const DEFAULT_CHANNEL_CAPACITY: usize = 64;
const DEFAULT_SAFE_APPEND_RETRIES: u32 = 3;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShardCommandOutcome<R = Infallible> {
    /// Validation rejected the record before it was appended.
    Rejected {
        rejection: R,
    },
    Applied {
        event_id: EventId,
        shard_sequence: u64,
    },
    AlreadyDurable {
        event_id: EventId,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ControlResolution<D: Domain> {
    pub append: ShardCommandOutcome,
    pub outcome: D::ControlOutcome,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display)]
pub enum ShardCommandErrorKind {
    #[display("invalid command")]
    InvalidCandidate,
    #[display("record was not committed")]
    DefinitelyNotCommitted,
    #[display("record commit status is unknown")]
    CommitUnknown,
    #[display("a replacement writer owns the journal")]
    Fenced,
    #[display("shard recovery failed")]
    Recovery,
    #[display("shard command loop is closed")]
    Closed,
}

impl ShardCommandErrorKind {
    const fn is_terminal(self) -> bool {
        matches!(self, Self::CommitUnknown | Self::Fenced | Self::Recovery)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display)]
pub enum ShardCommandKind {
    #[display("proposal")]
    Propose,
    #[display("control read")]
    InspectControl,
    #[display("control request")]
    ResolveControl,
    #[display("snapshot capture")]
    CaptureSnapshot,
    #[display("snapshot commit")]
    CommitSnapshot,
    #[display("query")]
    Query,
    #[display("shutdown")]
    Shutdown,
}

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum ShardCommandError {
    #[display("could not append event {event_id}: {kind}")]
    AppendEvent {
        event_id: EventId,
        kind: AppendFailureKind,
    },
    #[display("could not append snapshot through sequence {through_sequence}: {kind}")]
    AppendSnapshot {
        through_sequence: u64,
        kind: AppendFailureKind,
    },
    #[display("shard command loop stopped before replying to {command}")]
    ReplyDropped { command: ShardCommandKind },
    #[display("shard command loop is not accepting {command}")]
    AdmissionClosed { command: ShardCommandKind },
    #[display("shard command loop closed before accepting {command}")]
    QueueClosed { command: ShardCommandKind },
    #[display("shard command loop is already stopping")]
    AlreadyStopping,
    #[display("shard command loop is shutting down")]
    ShuttingDown,
    #[display("could not open shard writer")]
    OpenWriter,
    #[display("shard writer is unavailable")]
    WriterUnavailable,
    #[display("could not register record {name}")]
    RegisterRecord { name: &'static str },
    #[display("could not close writer after startup failure")]
    CloseStartupWriter,
    #[display("could not recover shard during startup")]
    RecoverStartup,
    #[display("could not recover shard after event {event_id} failed")]
    RecoverAfterFailure { event_id: EventId },
    #[display("could not close writer before recovery")]
    CloseUnrecoveredWriter,
    #[display("could not close recovered writer before enabling commands")]
    CloseRecoveredWriter,
    #[display("shard ownership was lost")]
    OwnershipLost,
    #[display("shard ownership was lost before appending an event")]
    OwnershipLostBeforeAppend,
    #[display("shard ownership was lost before appending a snapshot")]
    OwnershipLostBeforeSnapshot,
    #[display("control request for shard {} was proposed to shard {}", actual.get(), expected.get())]
    ControlShardMismatch { expected: Shard, actual: Shard },
    #[display("could not inspect control request")]
    InspectControl,
    #[display("could not build control record for event {event_id}")]
    BuildControlRecord { event_id: EventId },
    #[display("control record for event {event_id} was rejected")]
    ControlRecordRejected { event_id: EventId },
    #[display("could not read stored control outcome for event {event_id}")]
    ReadControlOutcome { event_id: EventId },
    #[display("could not apply durable event {event_id} at sequence {sequence}")]
    FinalizeRecord { event_id: EventId, sequence: u64 },
    #[display("acknowledged event {event_id} is absent after recovery")]
    MissingRecoveredEvent { event_id: EventId },
    #[display("acknowledged event {event_id} conflicts after recovery")]
    ConflictingRecoveredEvent { event_id: EventId },
    #[display("could not read snapshot bounds")]
    ReadSnapshotBounds,
    #[display("projection snapshot for shard {:03x} was proposed to shard {:03x}", actual.get(), expected.get())]
    SnapshotShardMismatch { expected: Shard, actual: Shard },
    #[display("cannot reference a snapshot for an empty projection")]
    SnapshotForEmptyProjection,
    #[display(
        "projection snapshot through journal sequence {snapshot_through} is ahead of the \
         projection at {current_sequence}"
    )]
    SnapshotAheadOfProjection {
        snapshot_through: u64,
        current_sequence: u64,
    },
    #[display("could not validate snapshot registration for {name}")]
    ValidateSnapshotRegistration { name: &'static str },
    #[display("could not encode projection snapshot")]
    EncodeSnapshot,
    #[display("recovering event {event_id} requires acquiring a new lease")]
    LeaseRequired { event_id: EventId },
    #[display("could not reopen shard writer")]
    ReopenWriter,
    #[display("recovered journal prefix is invalid")]
    ValidateRecoveredPrefix,
    #[display("could not close shard writer")]
    CloseWriter,
    #[display("could not read stored journal events")]
    ReadJournal,
    #[display("could not replay stored event at sequence {sequence}")]
    ReplayRecord { sequence: u64 },
}

impl ShardCommandError {
    #[must_use]
    pub const fn kind(&self) -> ShardCommandErrorKind {
        match self {
            Self::AppendEvent { kind, .. } | Self::AppendSnapshot { kind, .. } => match kind {
                AppendFailureKind::DefinitelyNotCommitted => {
                    ShardCommandErrorKind::DefinitelyNotCommitted
                }
                AppendFailureKind::CommitUnknown => ShardCommandErrorKind::CommitUnknown,
                AppendFailureKind::Fenced => ShardCommandErrorKind::Fenced,
            },
            Self::LeaseRequired { .. } => ShardCommandErrorKind::CommitUnknown,
            Self::OwnershipLost
            | Self::OwnershipLostBeforeAppend
            | Self::OwnershipLostBeforeSnapshot => ShardCommandErrorKind::Fenced,
            Self::ReplyDropped { .. }
            | Self::AdmissionClosed { .. }
            | Self::QueueClosed { .. }
            | Self::AlreadyStopping
            | Self::ShuttingDown => ShardCommandErrorKind::Closed,
            Self::ControlShardMismatch { .. }
            | Self::InspectControl
            | Self::BuildControlRecord { .. }
            | Self::ControlRecordRejected { .. }
            | Self::SnapshotShardMismatch { .. }
            | Self::SnapshotForEmptyProjection
            | Self::SnapshotAheadOfProjection { .. }
            | Self::EncodeSnapshot => ShardCommandErrorKind::InvalidCandidate,
            Self::OpenWriter
            | Self::WriterUnavailable
            | Self::RegisterRecord { .. }
            | Self::CloseStartupWriter
            | Self::RecoverStartup
            | Self::RecoverAfterFailure { .. }
            | Self::CloseUnrecoveredWriter
            | Self::CloseRecoveredWriter
            | Self::ReadControlOutcome { .. }
            | Self::FinalizeRecord { .. }
            | Self::MissingRecoveredEvent { .. }
            | Self::ConflictingRecoveredEvent { .. }
            | Self::ReadSnapshotBounds
            | Self::ValidateSnapshotRegistration { .. }
            | Self::ReopenWriter
            | Self::ValidateRecoveredPrefix
            | Self::CloseWriter
            | Self::ReadJournal
            | Self::ReplayRecord { .. } => ShardCommandErrorKind::Recovery,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
/// Holds the durable journal end, the restored snapshot, and the pending work that recovery found
/// before startup.
pub struct StartupRecovery<W> {
    pub durable_end_exclusive: u64,
    /// The last journal sequence that the restored snapshot includes, or `None` when startup
    /// replayed the complete journal.
    pub snapshot_through_log_sequence: Option<u64>,
    pub live_work: Vec<W>,
}

/// Reports keys whose state changed. Notifications may be dropped if the channel is full.
///
/// `initial` contains the keys recovered at startup, so consumers can rebuild their state even
/// if the previous process missed a notification.
#[derive(Debug)]
pub struct StateChangeFeed<K> {
    pub initial: Vec<K>,
    pub receiver: mpsc::Receiver<K>,
}

#[derive(Debug, Clone)]
/// Submits commands to one shard. Clones share the same writer and command queue.
pub struct ShardCommandHandle<D: Domain> {
    sender: mpsc::Sender<Command<D>>,
    admission_closed: CancellationToken,
    shard: crate::routing::Shard,
}

impl<D: Domain> ShardCommandHandle<D> {
    /// Returns the domain’s validation error in [`ShardCommandOutcome::Rejected`] without
    /// appending the record.
    ///
    /// # Errors
    ///
    /// Returns an error when the command loop closes or durable append or recovery fails.
    pub async fn propose(
        &self,
        record: D::RecordCurrent,
    ) -> Result<ShardCommandOutcome<D::FoldError>, Report<ShardCommandError>> {
        let (reply, response) = oneshot::channel();
        self.send(Command::Propose { record, reply }).await?;
        response
            .await
            .change_context(ShardCommandError::ReplyDropped {
                command: ShardCommandKind::Propose,
            })?
    }

    /// Inspects a control request against the projection inside the command loop.
    ///
    /// # Errors
    ///
    /// Returns an error when the command loop closes or the domain rejects the inspection.
    pub async fn inspect_control(
        &self,
        request: D::ControlRequest,
    ) -> Result<D::ControlSnapshot, Report<ShardCommandError>> {
        let (reply, response) = oneshot::channel();
        self.send(Command::InspectControl { request, reply })
            .await?;
        response
            .await
            .change_context(ShardCommandError::ReplyDropped {
                command: ShardCommandKind::InspectControl,
            })?
    }

    /// Rechecks a control request and appends its acceptance or rejection before processing
    /// another command.
    ///
    /// # Errors
    ///
    /// Returns an error when the command loop closes, the request is rejected, or append or
    /// recovery fails.
    pub async fn resolve_control(
        &self,
        request: D::ControlRequest,
        preflight_rejection: Option<D::ControlRejection>,
    ) -> Result<ControlResolution<D>, Report<ShardCommandError>> {
        let (reply, response) = oneshot::channel();
        self.send(Command::ResolveControl {
            request,
            preflight_rejection,
            reply,
        })
        .await?;
        response
            .await
            .change_context(ShardCommandError::ReplyDropped {
                command: ShardCommandKind::ResolveControl,
            })?
    }

    /// Captures a snapshot once at least `minimum_sequence_span` journal sequences have passed
    /// since the last capture attempt. Failed attempts count toward this interval.
    ///
    /// Returns `None` if the span is too small or the domain skips capture.
    ///
    /// # Errors
    ///
    /// Returns an error when the command loop closes before replying.
    pub async fn capture_snapshot(
        &self,
        minimum_sequence_span: u64,
    ) -> Result<Option<D::SnapshotCapture>, Report<ShardCommandError>> {
        let (reply, response) = oneshot::channel();
        self.send(Command::CaptureSnapshot {
            minimum_sequence_span,
            reply,
        })
        .await?;
        response
            .await
            .change_context(ShardCommandError::ReplyDropped {
                command: ShardCommandKind::CaptureSnapshot,
            })?
    }

    /// Appends a snapshot through the shard writer.
    ///
    /// # Errors
    ///
    /// Returns an error when the command loop closes or the snapshot cannot be committed.
    pub async fn commit_snapshot(
        &self,
        snapshot: D::Snapshot,
    ) -> Result<u64, Report<ShardCommandError>> {
        let (reply, response) = oneshot::channel();
        self.send(Command::CommitSnapshot { snapshot, reply })
            .await?;
        response
            .await
            .change_context(ShardCommandError::ReplyDropped {
                command: ShardCommandKind::CommitSnapshot,
            })?
    }

    /// # Errors
    ///
    /// Returns an error when the command loop closes before replying.
    pub async fn query(
        &self,
        query: D::Query,
    ) -> Result<D::QueryResult, Report<ShardCommandError>> {
        let (reply, response) = oneshot::channel();
        self.send(Command::Query { query, reply }).await?;
        response
            .await
            .change_context(ShardCommandError::ReplyDropped {
                command: ShardCommandKind::Query,
            })?
    }

    #[expect(
        clippy::integer_division_remainder_used,
        reason = "tokio select uses modulo to choose its polling order"
    )]
    async fn send(&self, command: Command<D>) -> Result<(), Report<ShardCommandError>> {
        let kind = command.kind();
        let permit = tokio::select! {
            biased;
            () = self.admission_closed.cancelled() => {
                return Err(Report::new(ShardCommandError::AdmissionClosed { command: kind }));
            }
            permit = self.sender.reserve() => permit.change_context_lazy(|| ShardCommandError::QueueClosed { command: kind })?,
        };
        permit.send(command);
        Ok(())
    }

    #[must_use]
    pub const fn shard(&self) -> crate::routing::Shard {
        self.shard
    }

    /// Returns the number of commands the channel can accept without waiting.
    #[cfg(any(test, feature = "test-util"))]
    #[must_use]
    pub fn queue_capacity(&self) -> usize {
        self.sender.capacity()
    }
}

/// Owns the right to stop a shard. Submission handles can be cloned independently.
///
/// Dropping the owner rejects new commands and asks the loop to close its writer. An append
/// already in progress may finish. Use [`shutdown`](Self::shutdown) to finish queued commands
/// before closing.
#[derive(Debug)]
pub struct ShardOwner<D: Domain> {
    // Declared first so that it drops first: ownership is cancelled before the command channel
    // closes.
    _ownership: DropGuard,
    sender: mpsc::Sender<Command<D>>,
    admission_closed: CancellationToken,
}

impl<D: Domain> ShardOwner<D> {
    /// Stops admission, finishes queued commands, and closes the writer.
    ///
    /// # Errors
    ///
    /// Returns an error when the loop is already stopping, closes before replying, or cannot close
    /// its writer.
    pub async fn shutdown(self) -> Result<(), Report<ShardCommandError>> {
        if self.admission_closed.is_cancelled() {
            return Err(Report::new(ShardCommandError::AlreadyStopping));
        }
        self.admission_closed.cancel();
        let (reply, response) = oneshot::channel();
        self.sender
            .reserve()
            .await
            .change_context(ShardCommandError::QueueClosed {
                command: ShardCommandKind::Shutdown,
            })?
            .send(Command::Shutdown { reply });
        response
            .await
            .change_context(ShardCommandError::ReplyDropped {
                command: ShardCommandKind::Shutdown,
            })?
    }
}

enum Command<D: Domain> {
    Propose {
        record: D::RecordCurrent,
        reply:
            oneshot::Sender<Result<ShardCommandOutcome<D::FoldError>, Report<ShardCommandError>>>,
    },
    InspectControl {
        request: D::ControlRequest,
        reply: oneshot::Sender<Result<D::ControlSnapshot, Report<ShardCommandError>>>,
    },
    ResolveControl {
        request: D::ControlRequest,
        preflight_rejection: Option<D::ControlRejection>,
        reply: oneshot::Sender<Result<ControlResolution<D>, Report<ShardCommandError>>>,
    },
    CaptureSnapshot {
        minimum_sequence_span: u64,
        reply: oneshot::Sender<Result<Option<D::SnapshotCapture>, Report<ShardCommandError>>>,
    },
    CommitSnapshot {
        snapshot: D::Snapshot,
        reply: oneshot::Sender<Result<u64, Report<ShardCommandError>>>,
    },
    Query {
        query: D::Query,
        reply: oneshot::Sender<Result<D::QueryResult, Report<ShardCommandError>>>,
    },
    Shutdown {
        reply: oneshot::Sender<Result<(), Report<ShardCommandError>>>,
    },
}

impl<D: Domain> Command<D> {
    const fn kind(&self) -> ShardCommandKind {
        match self {
            Self::Propose { .. } => ShardCommandKind::Propose,
            Self::InspectControl { .. } => ShardCommandKind::InspectControl,
            Self::ResolveControl { .. } => ShardCommandKind::ResolveControl,
            Self::CaptureSnapshot { .. } => ShardCommandKind::CaptureSnapshot,
            Self::CommitSnapshot { .. } => ShardCommandKind::CommitSnapshot,
            Self::Query { .. } => ShardCommandKind::Query,
            Self::Shutdown { .. } => ShardCommandKind::Shutdown,
        }
    }
}

struct CommandFailure {
    error: Report<ShardCommandError>,
    reply: Option<Box<dyn FnOnce(Report<ShardCommandError>) + Send>>,
}

impl From<Report<ShardCommandError>> for CommandFailure {
    fn from(error: Report<ShardCommandError>) -> Self {
        Self { error, reply: None }
    }
}

impl CommandFailure {
    fn reply(self) {
        if let Some(reply) = self.reply {
            reply(self.error);
        }
    }
}

fn send_reply<T: Send + 'static>(
    reply: oneshot::Sender<Result<T, Report<ShardCommandError>>>,
    result: Result<T, Report<ShardCommandError>>,
) -> Result<(), CommandFailure> {
    match result {
        Ok(value) => {
            let _: Result<_, _> = reply.send(Ok(value));
            Ok(())
        }
        Err(error) => Err(CommandFailure {
            error,
            reply: Some(Box::new(|error| {
                let _: Result<_, _> = reply.send(Err(error));
            })),
        }),
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ShardCommandConfig {
    channel_capacity: NonZeroUsize,
    safe_append_retries: u32,
    recovery_mode: RecoveryMode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RecoveryMode {
    LocalReopen,
    FullLeaseHandshake,
}

/// [`Default`] permits local writer reopen for tests and callers that manage recovery without
/// leases.
///
/// [`ShardCommandConfig::new`] requires lease reacquisition after a commit-unknown append.
impl Default for ShardCommandConfig {
    fn default() -> Self {
        Self {
            channel_capacity: NonZeroUsize::new(DEFAULT_CHANNEL_CAPACITY)
                .unwrap_or(NonZeroUsize::MIN),
            safe_append_retries: DEFAULT_SAFE_APPEND_RETRIES,
            recovery_mode: RecoveryMode::LocalReopen,
        }
    }
}

impl ShardCommandConfig {
    /// Requires lease reacquisition after a commit-unknown append.
    #[must_use]
    pub const fn new(channel_capacity: NonZeroUsize, safe_append_retries: u32) -> Self {
        Self {
            channel_capacity,
            safe_append_retries,
            recovery_mode: RecoveryMode::FullLeaseHandshake,
        }
    }

    #[must_use]
    pub const fn require_full_lease_handshake(mut self) -> Self {
        self.recovery_mode = RecoveryMode::FullLeaseHandshake;
        self
    }

    /// Allows tests to reopen the writer locally after a commit-unknown append.
    #[cfg(any(test, feature = "test-util"))]
    #[must_use]
    pub const fn allow_local_reopen(mut self) -> Self {
        self.recovery_mode = RecoveryMode::LocalReopen;
        self
    }
}

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
            durable_end_exclusive = writer.durable_end_exclusive(),
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
            snapshot_through_log_sequence: recovered.snapshot_through_log_sequence,
            live_work: D::live_work(&projection).into_iter().collect(),
        };
        let initial_state_changes = D::initial_state_keys(&projection).into_iter().collect();
        Ok(RecoveredShard {
            location: self.location,
            writer: Some(writer),
            projection,
            last_snapshot_through_log_sequence: recovered.snapshot_through_log_sequence,
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
    last_snapshot_through_log_sequence: Option<u64>,
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
            last_snapshot_attempt_through_log_sequence: self.last_snapshot_through_log_sequence,
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

struct CommandLoop<D: Domain, S: JournalStorage> {
    location: ShardLogLocation<S>,
    writer: Option<ShardLogWriter<S::Writer>>,
    projection: D::Projection,
    last_snapshot_attempt_through_log_sequence: Option<u64>,
    snapshot_context: Option<D::SnapshotContext>,
    safe_append_retries: u32,
    recovery_mode: RecoveryMode,
    receiver: mpsc::Receiver<Command<D>>,
    state_change_sender: mpsc::Sender<D::StateKey>,
    admission_closed: CancellationToken,
    ownership_lost: CancellationToken,
}

impl<D: Domain, S: JournalStorage> CommandLoop<D, S> {
    async fn run(mut self) -> Result<(), ShardCommandError> {
        let Err(failure) = self.run_commands().await else {
            return Ok(());
        };
        let error = &failure.error;
        tracing::error!(
            shard = %self.location.shard.path_segment(),
            kind = ?error.current_context().kind(),
            ?error,
            "stopping shard command loop after terminal failure"
        );
        let context = error.current_context().clone();
        failure.reply();
        if context.kind() == ShardCommandErrorKind::Fenced
            && let Some(snapshot_context) = &self.snapshot_context
        {
            D::note_fenced(snapshot_context);
        }
        self.admission_closed.cancel();
        self.receiver.close();
        self.reject_queued(&context);
        if let Err(error) = self.close_writer().await {
            tracing::error!(
                shard = %self.location.shard.path_segment(),
                ?error,
                "failed to close shard writer after terminal failure"
            );
        }
        Err(context)
    }

    #[expect(
        clippy::integer_division_remainder_used,
        reason = "tokio select uses modulo to choose its polling order"
    )]
    async fn run_commands(&mut self) -> Result<(), CommandFailure> {
        loop {
            let command = tokio::select! {
                biased;
                () = self.ownership_lost.cancelled() => {
                    return Err(CommandFailure::from(Report::new(ShardCommandError::OwnershipLost)));
                }
                command = self.receiver.recv() => command,
            };
            let Some(command) = command else {
                break;
            };
            let committing_snapshot = matches!(&command, Command::CommitSnapshot { .. });
            let shutting_down = matches!(&command, Command::Shutdown { .. });
            let result = match command {
                Command::Propose { record, reply } => {
                    let result = self.process(record).await;
                    send_reply(reply, result)
                }
                Command::InspectControl { request, reply } => {
                    let result = self.inspect_control_request(&request);
                    send_reply(reply, result)
                }
                Command::ResolveControl {
                    request,
                    preflight_rejection,
                    reply,
                } => {
                    let result =
                        Box::pin(self.process_control_request(request, preflight_rejection)).await;
                    send_reply(reply, result)
                }
                Command::CaptureSnapshot {
                    minimum_sequence_span,
                    reply,
                } => {
                    let capture = D::through_sequence(&self.projection)
                        .filter(|through| {
                            let span = self.last_snapshot_attempt_through_log_sequence.map_or_else(
                                || through.saturating_add(1),
                                |previous| through.saturating_sub(previous),
                            );
                            span >= minimum_sequence_span.max(1)
                        })
                        .and_then(|through| {
                            self.last_snapshot_attempt_through_log_sequence = Some(through);
                            D::capture_snapshot(self.location.shard, &self.projection)
                        });
                    send_reply(reply, Ok(capture))
                }
                Command::CommitSnapshot { snapshot, reply } => {
                    let result = self.process_snapshot(snapshot).await;
                    send_reply(reply, result)
                }
                Command::Query { query, reply } => {
                    send_reply(reply, Ok(D::answer(&self.projection, query)))
                }
                Command::Shutdown { reply } => {
                    self.admission_closed.cancel();
                    self.receiver.close();
                    self.reject_queued(&ShardCommandError::ShuttingDown);
                    let result = self.close_writer().await;
                    send_reply(reply, result)
                }
            };
            if let Err(failure) = result {
                let kind = failure.error.current_context().kind();
                if shutting_down
                    || (kind.is_terminal()
                        && !(committing_snapshot && kind == ShardCommandErrorKind::CommitUnknown))
                {
                    return Err(failure);
                }
                failure.reply();
            }
            if shutting_down {
                return Ok(());
            }
        }
        self.admission_closed.cancel();
        self.close_writer().await?;
        Ok(())
    }

    fn inspect_control_request(
        &self,
        request: &D::ControlRequest,
    ) -> Result<D::ControlSnapshot, Report<ShardCommandError>> {
        if D::control_shard(request) != self.location.shard {
            return Err(Report::new(ShardCommandError::ControlShardMismatch {
                expected: self.location.shard,
                actual: D::control_shard(request),
            })
            .attach(D::describe_foreign_control(request)));
        }
        D::inspect_control(&self.projection, request)
    }

    async fn process_control_request(
        &mut self,
        request: D::ControlRequest,
        preflight_rejection: Option<D::ControlRejection>,
    ) -> Result<ControlResolution<D>, Report<ShardCommandError>> {
        let snapshot = self.inspect_control_request(&request)?;
        if let Some(outcome) = D::control_prior_outcome(&snapshot) {
            return Ok(ControlResolution {
                append: ShardCommandOutcome::AlreadyDurable {
                    event_id: D::control_event_id(&request),
                },
                outcome,
            });
        }
        let record = D::build_control_record(&self.projection, &request, preflight_rejection)
            .change_context(ShardCommandError::BuildControlRecord {
                event_id: D::control_event_id(&request),
            })?;
        let append = match self.process(record).await? {
            ShardCommandOutcome::Applied {
                event_id,
                shard_sequence,
            } => ShardCommandOutcome::Applied {
                event_id,
                shard_sequence,
            },
            ShardCommandOutcome::AlreadyDurable { event_id } => {
                ShardCommandOutcome::AlreadyDurable { event_id }
            }
            ShardCommandOutcome::Rejected { rejection } => {
                return Err(Report::new(rejection).change_context(
                    ShardCommandError::ControlRecordRejected {
                        event_id: D::control_event_id(&request),
                    },
                ));
            }
        };
        let outcome = D::control_outcome_after_append(&self.projection, &request)
            .change_context_lazy(|| ShardCommandError::ReadControlOutcome {
                event_id: D::control_event_id(&request),
            })?;
        Ok(ControlResolution { append, outcome })
    }

    async fn process(
        &mut self,
        record: D::RecordCurrent,
    ) -> Result<ShardCommandOutcome<D::FoldError>, Report<ShardCommandError>> {
        if D::record_shard(&record) != self.location.shard {
            return Ok(ShardCommandOutcome::Rejected {
                rejection: D::reject_foreign_shard(&record),
            });
        }
        let event_id = D::record_event_id(&record);
        let integration_id = D::record_state_key(&record);
        let mut safe_failures = 0_u32;
        loop {
            let previous_state_sequence = self.checkpoint_state_sequence(&integration_id);
            let transition = match D::prepare(&self.projection, &record) {
                Ok(transition) => transition,
                Err(rejection) => return Ok(ShardCommandOutcome::Rejected { rejection }),
            };
            let Prepared::Mutation(delta) = transition else {
                self.notify_state_change_if_established(&integration_id);
                return Ok(ShardCommandOutcome::AlreadyDurable { event_id });
            };

            if self.ownership_lost.is_cancelled() {
                return Err(Report::new(ShardCommandError::OwnershipLostBeforeAppend));
            }
            let append_result = self.append(&record).await;
            match append_result {
                Ok(sequence) => {
                    if let Err(error) = D::finalize(&mut self.projection, delta, sequence)
                        .change_context(ShardCommandError::FinalizeRecord { event_id, sequence })
                    {
                        // The record is durable even though the state update failed. Recover
                        // and verify that it was applied before accepting another command.
                        self.recover_after_failure(event_id, error).await?;
                        return match D::prepare(&self.projection, &record) {
                            Ok(Prepared::Noop) => {
                                self.notify_state_change_if_established(&integration_id);
                                Ok(ShardCommandOutcome::AlreadyDurable { event_id })
                            }
                            Ok(Prepared::Mutation(_)) => {
                                Err(Report::new(ShardCommandError::MissingRecoveredEvent {
                                    event_id,
                                }))
                            }
                            Err(prepare_error) => Err(Report::new(prepare_error).change_context(
                                ShardCommandError::ConflictingRecoveredEvent { event_id },
                            )),
                        };
                    }
                    if self.checkpoint_state_sequence(&integration_id) != previous_state_sequence {
                        self.notify_state_change_if_established(&integration_id);
                    }
                    return Ok(ShardCommandOutcome::Applied {
                        event_id,
                        shard_sequence: sequence,
                    });
                }
                Err(error) => {
                    let kind = error.current_context().kind;
                    let context = ShardCommandError::AppendEvent { event_id, kind };
                    match kind {
                        AppendFailureKind::DefinitelyNotCommitted => {
                            if safe_failures >= self.safe_append_retries {
                                return Err(error.change_context(context));
                            }
                            safe_failures = safe_failures.saturating_add(1);
                        }
                        AppendFailureKind::CommitUnknown => {
                            self.recover_after_failure(event_id, error.change_context(context))
                                .await?;
                            // After recovery, `prepare` detects the stored event or a conflicting
                            // ID. If the event is absent, the loop retries it before processing
                            // another command.
                            safe_failures = 0;
                        }
                        AppendFailureKind::Fenced => return Err(error.change_context(context)),
                    }
                }
            }
        }
    }

    async fn process_snapshot(
        &mut self,
        snapshot: D::Snapshot,
    ) -> Result<u64, Report<ShardCommandError>> {
        let (snapshot_shard, snapshot_through) =
            D::snapshot_bounds(&snapshot).change_context(ShardCommandError::ReadSnapshotBounds)?;
        if snapshot_shard != self.location.shard {
            return Err(Report::new(ShardCommandError::SnapshotShardMismatch {
                expected: self.location.shard,
                actual: snapshot_shard,
            }));
        }
        let Some(current_sequence) = D::through_sequence(&self.projection) else {
            return Err(Report::new(ShardCommandError::SnapshotForEmptyProjection));
        };
        if snapshot_through > current_sequence {
            return Err(Report::new(ShardCommandError::SnapshotAheadOfProjection {
                snapshot_through,
                current_sequence,
            }));
        }

        self.location
            .registry
            .require::<D::Snapshot>()
            .change_context_lazy(|| ShardCommandError::ValidateSnapshotRegistration {
                name: D::Snapshot::declaration().name,
            })?;
        let mut bytes = Vec::new();
        snapshot
            .encode(&mut bytes)
            .change_context(ShardCommandError::EncodeSnapshot)?;
        let bytes = bytes::Bytes::from(bytes);
        let mut safe_failures = 0_u32;
        loop {
            if self.ownership_lost.is_cancelled() {
                return Err(Report::new(ShardCommandError::OwnershipLostBeforeSnapshot));
            }
            let writer = self
                .writer
                .as_ref()
                .ok_or(ShardCommandError::WriterUnavailable)?;
            match writer
                .append_encoded(super::PROJECTION_SNAPSHOTS_KEY, bytes.clone())
                .await
            {
                Ok(sequence) => {
                    self.last_snapshot_attempt_through_log_sequence = self
                        .last_snapshot_attempt_through_log_sequence
                        .max(Some(snapshot_through));
                    return Ok(sequence);
                }
                Err(error) => {
                    let kind = error.current_context().kind;
                    if kind != AppendFailureKind::DefinitelyNotCommitted
                        || safe_failures >= self.safe_append_retries
                    {
                        return Err(error.change_context(ShardCommandError::AppendSnapshot {
                            through_sequence: snapshot_through,
                            kind,
                        }));
                    }
                    safe_failures = safe_failures.saturating_add(1);
                }
            }
        }
    }

    fn checkpoint_state_sequence(&self, integration_id: &D::StateKey) -> Option<u64> {
        D::state_sequence(&self.projection, integration_id)
    }

    fn notify_state_change_if_established(&self, integration_id: &D::StateKey) {
        if self.checkpoint_state_sequence(integration_id).is_some() {
            // A full channel drops the notification. Startup and later state changes send the
            // key again.
            let _: Result<_, _> = self.state_change_sender.try_send(integration_id.clone());
        }
    }

    fn append(
        &self,
        record: &D::RecordCurrent,
    ) -> impl core::future::Future<Output = Result<u64, Report<ShardAppendError>>> + Send {
        let encoded = self
            .writer
            .as_ref()
            .ok_or_else(|| {
                Report::new(DurableError::WriterUnavailable).change_context(ShardAppendError {
                    kind: AppendFailureKind::CommitUnknown,
                })
            })
            .and_then(|writer| {
                let bytes = writer
                    .encode_registered::<D::Record>(|output| D::encode_record(record, output))?;
                Ok((writer, bytes))
            });
        async move {
            let (writer, bytes) = encoded?;
            writer.append_encoded(super::EVENTS_KEY, bytes).await
        }
    }

    async fn recover_after_failure(
        &mut self,
        event_id: EventId,
        failure: Report<ShardCommandError>,
    ) -> Result<(), Report<ShardCommandError>> {
        if self.recovery_mode == RecoveryMode::FullLeaseHandshake {
            return Err(failure.change_context(ShardCommandError::LeaseRequired { event_id }));
        }
        if let Err(recovery) = self.recover_durable_prefix().await {
            let mut failures = failure.expand();
            failures.push(recovery);
            return Err(
                failures.change_context(ShardCommandError::RecoverAfterFailure { event_id })
            );
        }
        Ok(())
    }

    async fn recover_durable_prefix(&mut self) -> Result<(), Report<ShardCommandError>> {
        if let Some(writer) = self.writer.take() {
            // Reopening obtains a new writer epoch even if closing the old writer fails.
            if let Err(error) = writer.close().await {
                tracing::warn!(
                    shard = %self.location.shard.path_segment(),
                    ?error,
                    "failed to close shard writer before recovery"
                );
            }
        }
        let writer = ShardLogWriter::open(&self.location)
            .await
            .change_context(ShardCommandError::ReopenWriter)?;
        let durable_end_exclusive = writer.durable_end_exclusive();
        self.writer = Some(writer);
        let writer = self
            .writer
            .as_ref()
            .ok_or(ShardCommandError::WriterUnavailable)?;
        let recovered = replay_with_snapshots::<D>(
            writer,
            self.location.shard,
            durable_end_exclusive,
            self.snapshot_context.as_ref(),
        )
        .await?;
        D::validate_recovered_prefix(&self.projection, &recovered.projection)
            .change_context(ShardCommandError::ValidateRecoveredPrefix)?;
        self.projection = recovered.projection;
        self.last_snapshot_attempt_through_log_sequence = self
            .last_snapshot_attempt_through_log_sequence
            .max(recovered.snapshot_through_log_sequence);
        Ok(())
    }

    fn reject_queued(&mut self, error: &ShardCommandError) {
        let stopped = || {
            Report::new(error.clone()).attach("command was queued when the command loop stopped")
        };
        while let Ok(command) = self.receiver.try_recv() {
            match command {
                Command::Propose { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(stopped()));
                }
                Command::InspectControl { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(stopped()));
                }
                Command::ResolveControl { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(stopped()));
                }
                Command::CaptureSnapshot { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(stopped()));
                }
                Command::CommitSnapshot { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(stopped()));
                }
                Command::Query { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(stopped()));
                }
                Command::Shutdown { reply } => {
                    let _: Result<_, _> = reply.send(Err(stopped()));
                }
            }
        }
    }

    async fn close_writer(&mut self) -> Result<(), Report<ShardCommandError>> {
        if let Some(writer) = self.writer.take() {
            writer
                .close()
                .await
                .change_context(ShardCommandError::CloseWriter)?;
        }
        Ok(())
    }
}

struct RecoveredProjection<D: EventDomain> {
    projection: D::Projection,
    snapshot_through_log_sequence: Option<u64>,
    snapshot_created_at: Option<DateTime<Utc>>,
    replayed_events: u64,
    corruption_fallbacks: u64,
}

async fn replay_with_snapshots<D: SnapshotDomain>(
    writer: &ShardLogWriter<impl JournalWriter>,
    shard: crate::routing::Shard,
    durable_end_exclusive: u64,
    context: Option<&D::SnapshotContext>,
) -> Result<RecoveredProjection<D>, Report<ShardCommandError>> {
    let mut corruption_fallbacks = 0_u64;
    if let Some(context) = context {
        match writer
            .scan_projection_snapshots(durable_end_exclusive)
            .await
        {
            Ok(candidates) => {
                if let Some(recovered) = replay_from_snapshots::<D>(
                    writer,
                    shard,
                    durable_end_exclusive,
                    context,
                    candidates,
                    &mut corruption_fallbacks,
                )
                .await
                {
                    return Ok(recovered);
                }
            }
            Err(error) => {
                corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                tracing::warn!(
                    shard = %shard.path_segment(),
                    error = ?error,
                    "projection-snapshot discovery failed; replaying the complete journal"
                );
            }
        }
    }
    replay_durable_prefix::<D>(writer, shard, durable_end_exclusive)
        .await
        .map(|(projection, replayed_events)| RecoveredProjection {
            projection,
            snapshot_through_log_sequence: None,
            snapshot_created_at: None,
            replayed_events,
            corruption_fallbacks,
        })
}

/// Restores the newest usable snapshot and replays the events after it.
///
/// Returns `None` when no candidate can be restored. Each skipped candidate increments
/// `corruption_fallbacks`.
async fn replay_from_snapshots<D: SnapshotDomain>(
    writer: &ShardLogWriter<impl JournalWriter>,
    shard: crate::routing::Shard,
    durable_end_exclusive: u64,
    context: &D::SnapshotContext,
    candidates: Vec<SnapshotCandidate<D::Snapshot>>,
    corruption_fallbacks: &mut u64,
) -> Option<RecoveredProjection<D>> {
    for (reference_sequence, candidate) in candidates.into_iter().rev() {
        let snapshot = match candidate {
            Ok(snapshot) => snapshot,
            Err(error) => {
                *corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                tracing::warn!(
                    shard = %shard.path_segment(),
                    reference_sequence,
                    error = ?error,
                    "ignored malformed projection-snapshot reference"
                );
                continue;
            }
        };
        let through = match D::snapshot_bounds(&snapshot) {
            Ok((_shard, through)) => through,
            Err(error) => {
                *corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                tracing::warn!(
                    shard = %shard.path_segment(),
                    reference_sequence,
                    error = ?error,
                    "ignored projection snapshot with invalid addressing"
                );
                continue;
            }
        };
        if through >= reference_sequence || through >= durable_end_exclusive {
            *corruption_fallbacks = corruption_fallbacks.saturating_add(1);
            tracing::warn!(
                shard = %shard.path_segment(),
                reference_sequence,
                through_log_sequence = through,
                durable_end_exclusive,
                "ignored projection snapshot with an impossible journal range"
            );
            continue;
        }
        let projection = match D::load_snapshot_projection(context, shard, &snapshot).await {
            Ok(projection) => projection,
            Err(error) => {
                *corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                tracing::warn!(
                    shard = %shard.path_segment(),
                    reference_sequence,
                    error = ?error,
                    "ignored unusable projection snapshot"
                );
                continue;
            }
        };
        match replay_durable_suffix::<D>(writer, shard, durable_end_exclusive, projection).await {
            Ok((projection, replayed_events)) => {
                return Some(RecoveredProjection {
                    projection,
                    snapshot_through_log_sequence: Some(through),
                    snapshot_created_at: Some(D::snapshot_created_at(&snapshot)),
                    replayed_events,
                    corruption_fallbacks: *corruption_fallbacks,
                });
            }
            Err(error) => {
                *corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                tracing::warn!(
                    shard = %shard.path_segment(),
                    reference_sequence,
                    error = ?error,
                    "replaying events after the snapshot failed; trying an older snapshot"
                );
            }
        }
    }
    None
}

async fn replay_durable_prefix<D: EventDomain>(
    writer: &ShardLogWriter<impl JournalWriter>,
    shard: crate::routing::Shard,
    durable_end_exclusive: u64,
) -> Result<(D::Projection, u64), Report<ShardCommandError>> {
    replay_durable_suffix::<D>(writer, shard, durable_end_exclusive, D::empty_projection()).await
}

async fn replay_durable_suffix<D: EventDomain>(
    writer: &ShardLogWriter<impl JournalWriter>,
    shard: crate::routing::Shard,
    durable_end_exclusive: u64,
    mut recovered: D::Projection,
) -> Result<(D::Projection, u64), Report<ShardCommandError>> {
    // The scan uses the writer that reported `durable_end_exclusive`, so the scan and its bounds
    // share one view of storage.
    let scan_started = std::time::Instant::now();
    let through_sequence = D::through_sequence(&recovered);
    let records = writer
        .scan_suffix(through_sequence, durable_end_exclusive)
        .await
        .change_context(ShardCommandError::ReadJournal);
    let records = records?;

    tracing::info!(
        shard = %shard.path_segment(),
        from_sequence = through_sequence.map_or(0, |sequence| sequence.saturating_add(1)),
        durable_end_exclusive,
        records = records.len(),
        elapsed_ms = u64::try_from(scan_started.elapsed().as_millis()).unwrap_or(u64::MAX),
        "read journal events after the snapshot"
    );

    let replayed_events = u64::try_from(records.len()).unwrap_or(u64::MAX);
    for (sequence, record) in records {
        D::replay(&mut recovered, shard, sequence, record)
            .change_context(ShardCommandError::ReplayRecord { sequence })?;
    }
    Ok((recovered, replayed_events))
}

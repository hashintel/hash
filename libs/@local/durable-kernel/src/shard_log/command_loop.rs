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
use tokio_util::sync::CancellationToken;

use super::{
    AppendFailureKind, JournalStorage, JournalWriter, ShardAppendError, ShardLogLocation,
    ShardLogWriter,
};
use crate::{
    DurableError,
    ids::EventId,
    port::{Domain, EventDomain, Prepared, SnapshotDomain, SnapshotRecoveryStats},
    registry::DurableRecord as _,
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
    #[display("writer no longer owns the journal")]
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

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("{kind}: {message}")]
pub struct ShardCommandError {
    pub kind: ShardCommandErrorKind,
    pub message: String,
}

impl ShardCommandError {
    fn from_append(error: Report<ShardAppendError>) -> Report<Self> {
        let kind = match error.current_context().kind {
            AppendFailureKind::DefinitelyNotCommitted => {
                ShardCommandErrorKind::DefinitelyNotCommitted
            }
            AppendFailureKind::CommitUnknown => ShardCommandErrorKind::CommitUnknown,
            AppendFailureKind::Fenced => ShardCommandErrorKind::Fenced,
        };
        error.change_context(Self {
            kind,
            message: "append shard record".to_owned(),
        })
    }

    fn invalid_candidate(message: impl Into<String>) -> Self {
        Self {
            kind: ShardCommandErrorKind::InvalidCandidate,
            message: message.into(),
        }
    }

    fn recovery(message: impl Into<String>) -> Self {
        Self {
            kind: ShardCommandErrorKind::Recovery,
            message: message.into(),
        }
    }

    fn closed(message: impl Into<String>) -> Self {
        Self {
            kind: ShardCommandErrorKind::Closed,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
/// Journal position, snapshot selection, and pending work recovered before startup.
pub struct StartupRecovery<W> {
    pub durable_end_exclusive: u64,
    /// Inclusive sequence restored from a validated snapshot, or `None` when
    /// startup replayed the complete journal.
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
        response.await.change_context_lazy(|| {
            ShardCommandError::closed("shard command loop stopped before replying to proposal")
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
        response.await.change_context_lazy(|| {
            ShardCommandError::closed("shard command loop stopped before replying to control read")
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
        response.await.change_context_lazy(|| {
            ShardCommandError::closed(
                "shard command loop stopped before replying to control request",
            )
        })?
    }

    /// Captures a snapshot after at least `minimum_sequence_span` journal positions have passed
    /// since the last capture attempt. Failed attempts also count toward this interval.
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
        response.await.change_context_lazy(|| {
            ShardCommandError::closed(
                "shard command loop stopped before replying to snapshot capture",
            )
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
        response.await.change_context_lazy(|| {
            ShardCommandError::closed(
                "shard command loop stopped before replying to snapshot commit",
            )
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
        response.await.change_context_lazy(|| {
            ShardCommandError::closed("shard command loop stopped before replying to query")
        })?
    }

    #[expect(
        clippy::integer_division_remainder_used,
        reason = "tokio select uses modulo to choose its polling order"
    )]
    async fn send(&self, command: Command<D>) -> Result<(), Report<ShardCommandError>> {
        let permit = tokio::select! {
            biased;
            () = self.admission_closed.cancelled() => {
                return Err(Report::new(ShardCommandError::closed(
                    "shard command loop is not accepting commands",
                )));
            }
            permit = self.sender.reserve() => permit.change_context_lazy(|| ShardCommandError::closed(
                "shard command loop closed before accepting command",
            ))?,
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
    sender: mpsc::Sender<Command<D>>,
    admission_closed: CancellationToken,
    ownership_lost: CancellationToken,
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
            return Err(Report::new(ShardCommandError::closed(
                "shard command loop is already stopping",
            )));
        }
        self.admission_closed.cancel();
        let (reply, response) = oneshot::channel();
        self.sender
            .reserve()
            .await
            .change_context_lazy(|| {
                ShardCommandError::closed("shard command loop closed before accepting shutdown")
            })?
            .send(Command::Shutdown { reply });
        response.await.change_context_lazy(|| {
            ShardCommandError::closed("shard command loop stopped before acknowledging shutdown")
        })?
    }
}

impl<D: Domain> Drop for ShardOwner<D> {
    fn drop(&mut self) {
        self.ownership_lost.cancel();
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
/// [`ShardCommandConfig::new`] requires lease reacquisition when an append’s commit status is
/// unknown.
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
    /// Requires lease reacquisition when an append’s commit status is unknown.
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

    /// Allows tests to reopen the writer locally when an append’s commit status is unknown.
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
    /// Opens a shard writer and captures its durable journal position.
    ///
    /// # Errors
    ///
    /// Returns an error when the shard writer cannot be opened.
    pub async fn open(location: ShardLogLocation<S>) -> Result<Self, Report<ShardCommandError>> {
        let started = std::time::Instant::now();
        let writer = ShardLogWriter::open(&location)
            .await
            .change_context(ShardCommandError::recovery("open shard writer"))?;
        tracing::info!(
            shard = %crate::routing::shard_path(location.shard),
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
            .ok_or_else(|| ShardCommandError::recovery("opened shard writer is unavailable"))?;
        let durable_end_exclusive = writer.durable_end_exclusive();
        let replay_started = std::time::Instant::now();
        let recovered = match async {
            self.location
                .registry
                .register(D::Record::declaration())
                .change_context_lazy(|| {
                    ShardCommandError::recovery("register journal-record declaration")
                })?;
            self.location
                .registry
                .register(D::Snapshot::declaration())
                .change_context_lazy(|| {
                    ShardCommandError::recovery("register snapshot declaration")
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
                    failures.push(close_error.change_context(ShardCommandError::recovery(
                        "close failed startup writer",
                    )));
                    return Err(failures.change_context(ShardCommandError::recovery(
                        "recover shard during startup",
                    )));
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
            live_work: D::live_work(&projection),
        };
        let initial_state_changes = D::initial_state_keys(&projection);
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
                .change_context(ShardCommandError::recovery("close unopened shard loop"))?;
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
            sender: sender.clone(),
            admission_closed: admission_closed.clone(),
            ownership_lost: ownership_lost.clone(),
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
                .change_context(ShardCommandError::recovery(
                    "close recovered shard before enable",
                ))?;
        }
        Ok(())
    }
}

/// Opens and recovers a shard for tests, then enables commands.
///
/// The returned handle includes all records below the writer’s captured durable position and
/// the work recovered from them. Production callers must complete lease acquisition before
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
            shard = %crate::routing::shard_path(self.location.shard),
            kind = ?error.current_context().kind,
            ?error,
            "stopping shard command loop after terminal failure"
        );
        let context = error.current_context().clone();
        failure.reply();
        if context.kind == ShardCommandErrorKind::Fenced
            && let Some(snapshot_context) = &self.snapshot_context
        {
            D::note_fenced(snapshot_context);
        }
        self.admission_closed.cancel();
        self.receiver.close();
        self.reject_queued(&context);
        if let Err(error) = self.close_writer().await {
            tracing::error!(
                shard = %crate::routing::shard_path(self.location.shard),
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
                    return Err(CommandFailure::from(Report::new(ShardCommandError {
                        kind: ShardCommandErrorKind::Fenced,
                        message: "shard ownership was lost".to_owned(),
                    })));
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
                    self.reject_queued(&ShardCommandError::closed(
                        "shard command loop is shutting down",
                    ));
                    let result = self.close_writer().await;
                    send_reply(reply, result)
                }
            };
            if let Err(failure) = result {
                let kind = failure.error.current_context().kind;
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
            return Err(Report::new(ShardCommandError {
                kind: ShardCommandErrorKind::InvalidCandidate,
                message: D::describe_foreign_control(request),
            }));
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
            .change_context(ShardCommandError::invalid_candidate("build control record"))?;
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
                    ShardCommandError::invalid_candidate("control record rejected"),
                ));
            }
        };
        let outcome = D::control_outcome_after_append(&self.projection, &request)
            .change_context_lazy(|| ShardCommandError::recovery("read stored control outcome"))?;
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
                return Err(Report::new(ShardCommandError {
                    kind: ShardCommandErrorKind::Fenced,
                    message: "shard ownership was lost before append".to_owned(),
                }));
            }
            let append_result = self.append(&record).await;
            match append_result {
                Ok(sequence) => {
                    if let Err(error) = D::finalize(&mut self.projection, delta, sequence) {
                        // The record is durable even though the state update failed. Recover
                        // and verify that it was applied before accepting another command.
                        self.recover_after_failure(Report::new(error).change_context(
                            ShardCommandError::recovery("finalize failed after durable append"),
                        ))
                        .await?;
                        return match D::prepare(&self.projection, &record) {
                            Ok(Prepared::Noop) => {
                                self.notify_state_change_if_established(&integration_id);
                                Ok(ShardCommandOutcome::AlreadyDurable { event_id })
                            }
                            Ok(Prepared::Mutation(_)) => {
                                Err(Report::new(ShardCommandError::recovery(format!(
                                    "event {event_id} was acknowledged but is absent after \
                                     recovery"
                                ))))
                            }
                            Err(prepare_error) => Err(Report::new(prepare_error).change_context(
                                ShardCommandError::recovery(format!(
                                    "event {event_id} was acknowledged but conflicts after \
                                     recovery"
                                )),
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
                Err(error)
                    if error.current_context().kind
                        == AppendFailureKind::DefinitelyNotCommitted =>
                {
                    if safe_failures >= self.safe_append_retries {
                        return Err(ShardCommandError::from_append(error));
                    }
                    safe_failures = safe_failures.saturating_add(1);
                }
                Err(error) if error.current_context().kind == AppendFailureKind::CommitUnknown => {
                    self.recover_after_failure(ShardCommandError::from_append(error))
                        .await?;
                    // After recovery, `prepare` detects the stored event or a conflicting ID.
                    // If the event is absent, retry it before processing another command.
                    safe_failures = 0;
                }
                Err(error) => return Err(ShardCommandError::from_append(error)),
            }
        }
    }

    async fn process_snapshot(
        &mut self,
        snapshot: D::Snapshot,
    ) -> Result<u64, Report<ShardCommandError>> {
        let (snapshot_shard, snapshot_through) = D::snapshot_bounds(&snapshot)
            .change_context_lazy(|| ShardCommandError::recovery("read snapshot bounds"))?;
        if snapshot_shard != self.location.shard {
            return Err(Report::new(ShardCommandError {
                kind: ShardCommandErrorKind::InvalidCandidate,
                message: format!(
                    "projection snapshot for shard {} was proposed to shard {}",
                    crate::routing::shard_path(snapshot_shard),
                    crate::routing::shard_path(self.location.shard)
                ),
            }));
        }
        let Some(current_sequence) = D::through_sequence(&self.projection) else {
            return Err(Report::new(ShardCommandError {
                kind: ShardCommandErrorKind::InvalidCandidate,
                message: "cannot reference a snapshot for an empty projection".to_owned(),
            }));
        };
        if snapshot_through > current_sequence {
            return Err(Report::new(ShardCommandError {
                kind: ShardCommandErrorKind::InvalidCandidate,
                message: format!(
                    "projection snapshot through {snapshot_through} is ahead of current \
                     projection {current_sequence}"
                ),
            }));
        }

        self.location
            .registry
            .require::<D::Snapshot>()
            .change_context_lazy(|| ShardCommandError::recovery("validate snapshot declaration"))?;
        let bytes = bytes::Bytes::from(snapshot.encode().change_context(
            ShardCommandError::invalid_candidate("encode projection snapshot"),
        )?);
        let mut safe_failures = 0_u32;
        loop {
            if self.ownership_lost.is_cancelled() {
                return Err(Report::new(ShardCommandError {
                    kind: ShardCommandErrorKind::Fenced,
                    message: "shard ownership was lost before snapshot append".to_owned(),
                }));
            }
            let writer = self
                .writer
                .as_ref()
                .ok_or_else(|| ShardCommandError::recovery("shard writer is unavailable"))?;
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
                Err(error)
                    if error.current_context().kind
                        == AppendFailureKind::DefinitelyNotCommitted =>
                {
                    if safe_failures >= self.safe_append_retries {
                        return Err(ShardCommandError::from_append(error));
                    }
                    safe_failures = safe_failures.saturating_add(1);
                }
                Err(error) => return Err(ShardCommandError::from_append(error)),
            }
        }
    }

    fn checkpoint_state_sequence(&self, integration_id: &D::StateKey) -> Option<u64> {
        D::state_sequence(&self.projection, integration_id)
    }

    fn notify_state_change_if_established(&self, integration_id: &D::StateKey) {
        if self.checkpoint_state_sequence(integration_id).is_some() {
            // Startup and later state changes refresh these hints, so a full channel may drop a
            // notification.
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
                let bytes = writer.encode_registered::<D::Record>(|| D::encode_record(record))?;
                Ok((writer, bytes))
            });
        async move {
            let (writer, bytes) = encoded?;
            writer.append_encoded(super::EVENTS_KEY, bytes).await
        }
    }

    async fn recover_after_failure(
        &mut self,
        failure: Report<ShardCommandError>,
    ) -> Result<(), Report<ShardCommandError>> {
        if let Err(recovery) = self.recover_durable_prefix().await {
            let kind = recovery.current_context().kind;
            let mut failures = failure.expand();
            failures.push(recovery);
            return Err(failures.change_context(ShardCommandError {
                kind,
                message: "recover shard after command failure".to_owned(),
            }));
        }
        Ok(())
    }

    async fn recover_durable_prefix(&mut self) -> Result<(), Report<ShardCommandError>> {
        if self.recovery_mode == RecoveryMode::FullLeaseHandshake {
            return Err(Report::new(ShardCommandError {
                kind: ShardCommandErrorKind::CommitUnknown,
                message: "shard writer recovery requires acquiring a new lease".to_owned(),
            }));
        }
        if let Some(writer) = self.writer.take() {
            // Reopening obtains a new writer epoch even if closing the old writer fails.
            let _: Result<_, _> = writer.close().await;
        }
        let writer = ShardLogWriter::open(&self.location)
            .await
            .change_context(ShardCommandError::recovery("reopen shard writer"))?;
        let durable_end_exclusive = writer.durable_end_exclusive();
        self.writer = Some(writer);
        let writer = self
            .writer
            .as_ref()
            .ok_or_else(|| ShardCommandError::recovery("reopened shard writer is unavailable"))?;
        let recovered = replay_with_snapshots::<D>(
            writer,
            self.location.shard,
            durable_end_exclusive,
            self.snapshot_context.as_ref(),
        )
        .await?;
        D::validate_recovered_prefix(&self.projection, &recovered.projection).change_context_lazy(
            || ShardCommandError::recovery("validate recovered journal prefix"),
        )?;
        self.projection = recovered.projection;
        self.last_snapshot_attempt_through_log_sequence = self
            .last_snapshot_attempt_through_log_sequence
            .max(recovered.snapshot_through_log_sequence);
        Ok(())
    }

    fn reject_queued(&mut self, error: &ShardCommandError) {
        let stopped =
            || Report::new(error.clone()).attach("command was queued when the shard loop stopped");
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
                .change_context(ShardCommandError::recovery("close shard writer"))?;
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

#[expect(
    clippy::too_many_lines,
    reason = "recovery checks each snapshot before replaying the events after it"
)]
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
                for (reference_sequence, candidate) in candidates.into_iter().rev() {
                    let snapshot = match candidate {
                        Ok(snapshot) => snapshot,
                        Err(error) => {
                            corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                            tracing::warn!(
                                shard = %crate::routing::shard_path(shard),
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
                            corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                            tracing::warn!(
                                shard = %crate::routing::shard_path(shard),
                                reference_sequence,
                                error = ?error,
                                "ignored projection snapshot with invalid addressing"
                            );
                            continue;
                        }
                    };
                    if through >= reference_sequence || through >= durable_end_exclusive {
                        corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                        tracing::warn!(
                            shard = %crate::routing::shard_path(shard),
                            reference_sequence,
                            through_log_sequence = through,
                            durable_end_exclusive,
                            "ignored projection snapshot with an impossible journal range"
                        );
                        continue;
                    }
                    let projection =
                        match D::load_snapshot_projection(context, shard, &snapshot).await {
                            Ok(projection) => projection,
                            Err(error) => {
                                corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                                tracing::warn!(
                                    shard = %crate::routing::shard_path(shard),
                                    reference_sequence,
                                    error = ?error,
                                    "ignored unusable projection snapshot"
                                );
                                continue;
                            }
                        };
                    match replay_durable_suffix::<D>(
                        writer,
                        shard,
                        durable_end_exclusive,
                        projection,
                    )
                    .await
                    {
                        Ok((projection, replayed_events)) => {
                            return Ok(RecoveredProjection {
                                projection,
                                snapshot_through_log_sequence: Some(through),
                                snapshot_created_at: Some(D::snapshot_created_at(&snapshot)),
                                replayed_events,
                                corruption_fallbacks,
                            });
                        }
                        Err(error) => {
                            corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                            tracing::warn!(
                                shard = %crate::routing::shard_path(shard),
                                reference_sequence,
                                error = ?error,
                                "replaying events after the snapshot failed; trying an older snapshot"
                            );
                        }
                    }
                }
            }
            Err(error) => {
                corruption_fallbacks = corruption_fallbacks.saturating_add(1);
                tracing::warn!(
                    shard = %crate::routing::shard_path(shard),
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
    // Use the writer that supplied the durable position, so the scan and its bounds share the
    // same view of storage.
    let scan_started = std::time::Instant::now();
    let through_sequence = D::through_sequence(&recovered);
    let records = writer
        .scan_suffix(through_sequence, durable_end_exclusive)
        .await
        .change_context(ShardCommandError::recovery("read stored journal events"));
    let records = records?;

    tracing::info!(
        shard = %crate::routing::shard_path(shard),
        from_sequence = through_sequence.map_or(0, |sequence| sequence.saturating_add(1)),
        durable_end_exclusive,
        records = records.len(),
        elapsed_ms = u64::try_from(scan_started.elapsed().as_millis()).unwrap_or(u64::MAX),
        "read journal events after the snapshot"
    );

    let replayed_events = u64::try_from(records.len()).unwrap_or(u64::MAX);
    for (sequence, record) in records {
        D::replay(&mut recovered, shard, sequence, record)
            .change_context_lazy(|| ShardCommandError::recovery("replay stored journal event"))?;
    }
    Ok((recovered, replayed_events))
}

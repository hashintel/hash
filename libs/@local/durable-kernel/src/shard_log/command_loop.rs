//! Serializes changes to one shard's journal and projection.
//!
//! Producers submit typed records through a command handle. The loop checks
//! each proposal against its projection and applies the change after the append
//! is durable. Planning and external effects run outside the loop, so their
//! proposals may arrive after another command has changed the state.

#[cfg(any(test, feature = "test-util"))]
use alloc::collections::VecDeque;
use alloc::sync::Arc;
use core::{
    convert::Infallible,
    fmt,
    num::NonZeroUsize,
    sync::atomic::{AtomicBool, Ordering},
};

#[cfg(any(test, feature = "test-util"))]
use tokio::sync::Notify;
use tokio::sync::{mpsc, oneshot};
use tokio_util::sync::CancellationToken;

use super::{AppendDisposition, ShardAppendError, ShardLogLocation, ShardLogWriter};
use crate::{
    ids::EventId,
    port::{Domain, Prepared, SnapshotRecoveryStats},
    registry::DurableRecord,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShardCommandErrorKind {
    InvalidCandidate,
    DefinitelyNotCommitted,
    CommitUnknown,
    Fenced,
    Recovery,
    Closed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShardCommandError {
    pub kind: ShardCommandErrorKind,
    pub message: String,
}

impl fmt::Display for ShardCommandError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl core::error::Error for ShardCommandError {}

#[derive(Debug, Clone, PartialEq, Eq)]
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
pub struct ShardCommandHandle<D: Domain> {
    sender: mpsc::Sender<Command<D>>,
    accepting: Arc<AtomicBool>,
    ownership_lost: CancellationToken,
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
    ) -> Result<ShardCommandOutcome<D::FoldError>, ShardCommandError> {
        if !self.accepting.load(Ordering::Acquire) {
            return Err(closed("shard command loop is not accepting proposals"));
        }
        let (reply, response) = oneshot::channel();
        self.sender
            .send(Command::Propose { record, reply })
            .await
            .map_err(|_send_error| closed("shard command loop closed before accepting proposal"))?;
        response.await.map_err(|_receive_error| {
            closed("shard command loop stopped before replying to proposal")
        })?
    }

    /// Returns only the bounded control layer view needed by the inbox. The
    /// whole projection and append handle never escape the shard owner loop.
    ///
    /// # Errors
    ///
    /// Returns an error when the command loop closes or the domain rejects the inspection.
    pub async fn inspect_control(
        &self,
        request: D::ControlRequest,
    ) -> Result<D::ControlSnapshot, ShardCommandError> {
        if !self.accepting.load(Ordering::Acquire) {
            return Err(closed("shard command loop is not accepting control reads"));
        }
        let (reply, response) = oneshot::channel();
        self.sender
            .send(Command::InspectControl { request, reply })
            .await
            .map_err(|_send_error| {
                closed("shard command loop closed before accepting control read")
            })?;
        response.await.map_err(|_receive_error| {
            closed("shard command loop stopped before replying to control read")
        })?
    }

    /// Atomically re-checks the request against the current projection, builds
    /// its pure promoted event or durable rejection and appends it through
    /// the sole fenced writer.
    ///
    /// # Errors
    ///
    /// Returns an error when the command loop closes, the request is rejected, or append or
    /// recovery fails.
    pub async fn resolve_control(
        &self,
        request: D::ControlRequest,
        preflight_rejection: Option<D::ControlRejection>,
    ) -> Result<ControlResolution<D>, ShardCommandError> {
        if !self.accepting.load(Ordering::Acquire) {
            return Err(closed(
                "shard command loop is not accepting control requests",
            ));
        }
        let (reply, response) = oneshot::channel();
        self.sender
            .send(Command::ResolveControl {
                request,
                preflight_rejection,
                reply,
            })
            .await
            .map_err(|_send_error| {
                closed("shard command loop closed before accepting control request")
            })?;
        response.await.map_err(|_receive_error| {
            closed("shard command loop stopped before replying to control request")
        })?
    }

    /// Captures the loop's snapshot payload once at least `minimum_sequence_span` events landed
    /// since the last committed snapshot.
    ///
    /// `None` means the span is not yet worth snapshotting.
    ///
    /// # Errors
    ///
    /// Returns an error when the command loop closes before replying.
    pub async fn capture_snapshot(
        &self,
        minimum_sequence_span: u64,
    ) -> Result<Option<D::SnapshotCapture>, ShardCommandError> {
        if !self.accepting.load(Ordering::Acquire) {
            return Err(closed(
                "shard command loop is not accepting snapshot captures",
            ));
        }
        let (reply, response) = oneshot::channel();
        self.sender
            .send(Command::CaptureSnapshot {
                minimum_sequence_span,
                reply,
            })
            .await
            .map_err(|_send_error| {
                closed("shard command loop closed before accepting snapshot capture")
            })?;
        response.await.map_err(|_receive_error| {
            closed("shard command loop stopped before replying to snapshot capture")
        })?
    }

    /// Appends a committed snapshot record through the sole fenced writer.
    ///
    /// # Errors
    ///
    /// Returns an error when the command loop closes or the snapshot cannot be committed.
    pub async fn commit_snapshot(&self, snapshot: D::Snapshot) -> Result<u64, ShardCommandError> {
        if !self.accepting.load(Ordering::Acquire) {
            return Err(closed(
                "shard command loop is not accepting snapshot commits",
            ));
        }
        let (reply, response) = oneshot::channel();
        self.sender
            .send(Command::CommitSnapshot { snapshot, reply })
            .await
            .map_err(|_send_error| {
                closed("shard command loop closed before accepting snapshot commit")
            })?;
        response.await.map_err(|_receive_error| {
            closed("shard command loop stopped before replying to snapshot commit")
        })?
    }

    /// # Errors
    ///
    /// Returns an error when the command loop closes before replying.
    pub async fn query(&self, query: D::Query) -> Result<D::QueryResult, ShardCommandError> {
        if !self.accepting.load(Ordering::Acquire) {
            return Err(closed("shard command loop is not accepting queries"));
        }
        let (reply, response) = oneshot::channel();
        self.sender
            .send(Command::Query { query, reply })
            .await
            .map_err(|_send_error| closed("shard command loop closed before accepting query"))?;
        response.await.map_err(|_receive_error| {
            closed("shard command loop stopped before replying to query")
        })?
    }

    /// # Errors
    ///
    /// Returns an error when the loop is already stopping, closes before replying, or cannot close
    /// its writer.
    pub async fn shutdown(&self) -> Result<(), ShardCommandError> {
        if self
            .accepting
            .compare_exchange(true, false, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Err(closed("shard command loop is already stopping"));
        }
        let (reply, response) = oneshot::channel();
        self.sender
            .send(Command::Shutdown { reply })
            .await
            .map_err(|_send_error| closed("shard command loop closed before accepting shutdown"))?;
        response.await.map_err(|_receive_error| {
            closed("shard command loop stopped before acknowledging shutdown")
        })?
    }

    /// Rejects new commands. Use `cancel_owned_writer` to wake and stop the loop.
    pub fn stop_admission(&self) {
        self.accepting.store(false, Ordering::Release);
    }

    pub fn cancel_owned_writer(&self) {
        self.ownership_lost.cancel();
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

enum Command<D: Domain> {
    Propose {
        record: D::RecordCurrent,
        reply: oneshot::Sender<Result<ShardCommandOutcome<D::FoldError>, ShardCommandError>>,
    },
    InspectControl {
        request: D::ControlRequest,
        reply: oneshot::Sender<Result<D::ControlSnapshot, ShardCommandError>>,
    },
    ResolveControl {
        request: D::ControlRequest,
        preflight_rejection: Option<D::ControlRejection>,
        reply: oneshot::Sender<Result<ControlResolution<D>, ShardCommandError>>,
    },
    CaptureSnapshot {
        minimum_sequence_span: u64,
        reply: oneshot::Sender<Result<Option<D::SnapshotCapture>, ShardCommandError>>,
    },
    CommitSnapshot {
        snapshot: D::Snapshot,
        reply: oneshot::Sender<Result<u64, ShardCommandError>>,
    },
    Query {
        query: D::Query,
        reply: oneshot::Sender<Result<D::QueryResult, ShardCommandError>>,
    },
    Shutdown {
        reply: oneshot::Sender<Result<(), ShardCommandError>>,
    },
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
    /// The production constructor makes recovery fail closed by default, so
    /// exclusivity never depends on a later call site remembering to change the mode.
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
    pub handle: ShardCommandHandle<D>,
    pub recovery: StartupRecovery<D::WorkIntent>,
    pub state_changes: StateChangeFeed<D::StateKey>,
    pub task: tokio::task::JoinHandle<Result<(), ShardCommandError>>,
}

/// A writer awaiting recovery. Recover it and revalidate the lease before enabling commands.
pub struct OpenedShard {
    location: ShardLogLocation,
    writer: Option<ShardLogWriter>,
}

impl OpenedShard {
    /// Opens a shard writer and captures its durable journal position.
    ///
    /// # Errors
    ///
    /// Returns an error when the shard writer cannot be opened.
    pub async fn open(location: ShardLogLocation) -> Result<Self, ShardCommandError> {
        let started = std::time::Instant::now();
        let writer = ShardLogWriter::open(&location)
            .await
            .map_err(|error| recovery(format!("open shard writer: {error:?}")))?;
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
    /// Returns an error when the durable journal cannot be read, decoded, or folded.
    pub async fn recover<D: Domain>(self) -> Result<RecoveredShard<D>, ShardCommandError> {
        self.recover_inner(None).await
    }

    /// # Errors
    ///
    /// Returns an error when recovery cannot reconstruct a valid durable projection.
    pub async fn recover_with_snapshots<D: Domain>(
        self,
        context: &D::SnapshotContext,
    ) -> Result<RecoveredShard<D>, ShardCommandError> {
        self.recover_inner(Some(context)).await
    }

    async fn recover_inner<D: Domain>(
        mut self,
        context: Option<&D::SnapshotContext>,
    ) -> Result<RecoveredShard<D>, ShardCommandError> {
        // Register codecs before reading any records, so conflicting declarations fail
        // recovery.
        crate::registry::intern_declaration(*<D::Record as DurableRecord>::declaration())
            .map_err(|error| recovery(format!("intern journal-record declaration: {error}")))?;
        crate::registry::intern_declaration(*<D::Snapshot as DurableRecord>::declaration())
            .map_err(|error| recovery(format!("intern snapshot declaration: {error}")))?;
        let writer = self
            .writer
            .take()
            .ok_or_else(|| recovery("opened shard writer is unavailable"))?;
        let durable_end_exclusive = writer.durable_end_exclusive();
        let replay_started = std::time::Instant::now();
        let recovered = match replay_with_snapshots::<D>(
            &writer,
            self.location.shard,
            durable_end_exclusive,
            context,
        )
        .await
        {
            Ok(recovered) => recovered,
            Err(error) => {
                if let Err(close_error) = writer.close().await {
                    return Err(recovery(format!(
                        "{error}; closing failed startup writer also failed: {close_error:?}"
                    )));
                }
                return Err(error);
            }
        };
        if let Some(context) = context {
            let latest_snapshot_created_at =
                recovered.snapshot_created_at.as_deref().and_then(|value| {
                    chrono::DateTime::parse_from_rfc3339(value)
                        .ok()
                        .map(chrono::DateTime::<chrono::Utc>::from)
                });
            D::note_snapshot_recovery(
                context,
                &SnapshotRecoveryStats {
                    replayed_events: recovered.replayed_events,
                    replay_elapsed: replay_started.elapsed(),
                    corruption_fallbacks: recovered.corruption_fallbacks,
                    latest_snapshot_created_at,
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
    pub async fn close(mut self) -> Result<(), ShardCommandError> {
        if let Some(writer) = self.writer.take() {
            writer
                .close()
                .await
                .map_err(|error| recovery(format!("close unopened shard loop: {error:?}")))?;
        }
        Ok(())
    }
}

/// Recovered state awaiting lease revalidation. Callers must complete that check before
/// enabling commands.
pub struct RecoveredShard<D: Domain> {
    location: ShardLogLocation,
    writer: Option<ShardLogWriter>,
    projection: D::Projection,
    last_snapshot_through_log_sequence: Option<u64>,
    snapshot_context: Option<D::SnapshotContext>,
    recovery: StartupRecovery<D::WorkIntent>,
    initial_state_changes: Vec<D::StateKey>,
}

impl<D: Domain> RecoveredShard<D> {
    /// Reports recovery results before the shard starts accepting commands.
    pub const fn startup_recovery(&self) -> &StartupRecovery<D::WorkIntent> {
        &self.recovery
    }

    pub fn enable(self, config: ShardCommandConfig) -> StartedShard<D> {
        self.enable_inner(
            config,
            #[cfg(any(test, feature = "test-util"))]
            TestHarness::default(),
        )
    }

    #[cfg(any(test, feature = "test-util"))]
    pub fn enable_with_harness(
        self,
        config: ShardCommandConfig,
        harness: TestHarness,
    ) -> StartedShard<D> {
        self.enable_inner(config, harness)
    }

    fn enable_inner(
        mut self,
        config: ShardCommandConfig,
        #[cfg(any(test, feature = "test-util"))] harness: TestHarness,
    ) -> StartedShard<D> {
        let (sender, receiver) = mpsc::channel(config.channel_capacity.get());
        let (state_change_sender, state_change_receiver) =
            mpsc::channel(config.channel_capacity.get());
        let accepting = Arc::new(AtomicBool::new(true));
        let ownership_lost = CancellationToken::new();
        let handle = ShardCommandHandle {
            sender,
            accepting: Arc::clone(&accepting),
            ownership_lost: ownership_lost.clone(),
            shard: self.location.shard,
        };
        let command_loop = CommandLoop {
            location: self.location,
            writer: self.writer.take(),
            projection: self.projection,
            last_snapshot_through_log_sequence: self.last_snapshot_through_log_sequence,
            snapshot_context: self.snapshot_context,
            safe_append_retries: config.safe_append_retries,
            recovery_mode: config.recovery_mode,
            receiver,
            state_change_sender,
            accepting,
            ownership_lost,
            #[cfg(any(test, feature = "test-util"))]
            faults: harness.faults,
            #[cfg(any(test, feature = "test-util"))]
            before_append: harness.before_append,
            #[cfg(any(test, feature = "test-util"))]
            before_recovery: harness.before_recovery,
        };
        let task = tokio::spawn(command_loop.run());
        StartedShard {
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
    pub async fn close(mut self) -> Result<(), ShardCommandError> {
        if let Some(writer) = self.writer.take() {
            writer.close().await.map_err(|error| {
                recovery(format!("close recovered shard before enable: {error:?}"))
            })?;
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
    location: ShardLogLocation,
    config: ShardCommandConfig,
) -> Result<StartedShard<D>, ShardCommandError> {
    let opened = OpenedShard::open(location).await?;
    let recovered = opened.recover::<D>().await?;
    Ok(recovered.enable(config))
}

struct CommandLoop<D: Domain> {
    location: ShardLogLocation,
    writer: Option<ShardLogWriter>,
    projection: D::Projection,
    last_snapshot_through_log_sequence: Option<u64>,
    snapshot_context: Option<D::SnapshotContext>,
    safe_append_retries: u32,
    recovery_mode: RecoveryMode,
    receiver: mpsc::Receiver<Command<D>>,
    state_change_sender: mpsc::Sender<D::StateKey>,
    accepting: Arc<AtomicBool>,
    ownership_lost: CancellationToken,
    #[cfg(any(test, feature = "test-util"))]
    faults: VecDeque<super::AppendFault>,
    #[cfg(any(test, feature = "test-util"))]
    before_append: Option<Arc<TestHold>>,
    #[cfg(any(test, feature = "test-util"))]
    before_recovery: Option<Arc<TestHold>>,
}

impl<D: Domain> CommandLoop<D> {
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "tokio select uses modulo to choose its polling order"
    )]
    #[expect(
        clippy::too_many_lines,
        reason = "one dispatch loop owns command ordering and terminal writer transitions"
    )]
    async fn run(mut self) -> Result<(), ShardCommandError> {
        loop {
            let command = tokio::select! {
                biased;
                () = self.ownership_lost.cancelled() => {
                    let error = ShardCommandError {
                        kind: ShardCommandErrorKind::Fenced,
                        message: "shard ownership was lost".to_owned(),
                    };
                    return self.stop_after_terminal(Some(error)).await;
                }
                command = self.receiver.recv() => command,
            };
            let Some(command) = command else {
                break;
            };
            match command {
                Command::Propose { record, reply } => {
                    let result = self.process(record).await;
                    let terminal = result
                        .as_ref()
                        .err()
                        .is_some_and(|error| is_terminal(error.kind));
                    let terminal_error = result.as_ref().err().cloned();
                    let _: Result<_, _> = reply.send(result);
                    if terminal {
                        self.accepting.store(false, Ordering::Release);
                        self.receiver.close();
                        let error = terminal_error
                            .unwrap_or_else(|| recovery("terminal command-loop failure"));
                        self.observe_terminal(&error);
                        self.reject_queued(&error);
                        let _: Result<_, _> = self.close_writer().await;
                        return Err(error);
                    }
                }
                Command::InspectControl { request, reply } => {
                    let result = self.inspect_control_request(&request);
                    let terminal = result
                        .as_ref()
                        .err()
                        .is_some_and(|error| is_terminal(error.kind));
                    let terminal_error = result.as_ref().err().cloned();
                    let _: Result<_, _> = reply.send(result);
                    if terminal {
                        return self.stop_after_terminal(terminal_error).await;
                    }
                }
                Command::ResolveControl {
                    request,
                    preflight_rejection,
                    reply,
                } => {
                    let result =
                        Box::pin(self.process_control_request(request, preflight_rejection)).await;
                    let terminal = result
                        .as_ref()
                        .err()
                        .is_some_and(|error| is_terminal(error.kind));
                    let terminal_error = result.as_ref().err().cloned();
                    let _: Result<_, _> = reply.send(result);
                    if terminal {
                        return self.stop_after_terminal(terminal_error).await;
                    }
                }
                Command::CaptureSnapshot {
                    minimum_sequence_span,
                    reply,
                } => {
                    let capture = D::through_sequence(&self.projection)
                        .filter(|through| {
                            let span = self.last_snapshot_through_log_sequence.map_or_else(
                                || through.saturating_add(1),
                                |previous| through.saturating_sub(previous),
                            );
                            span >= minimum_sequence_span.max(1)
                        })
                        .and_then(|_through| {
                            D::capture_snapshot(self.location.shard, &self.projection)
                        });
                    let _: Result<_, _> = reply.send(Ok(capture));
                }
                Command::CommitSnapshot { snapshot, reply } => {
                    let result = self.process_snapshot(snapshot).await;
                    let terminal = result
                        .as_ref()
                        .err()
                        .is_some_and(|error| is_terminal(error.kind));
                    let terminal_error = result.as_ref().err().cloned();
                    let _: Result<_, _> = reply.send(result);
                    if terminal {
                        return self.stop_after_terminal(terminal_error).await;
                    }
                }
                Command::Query { query, reply } => {
                    let _: Result<_, _> = reply.send(Ok(D::answer(&self.projection, query)));
                }
                Command::Shutdown { reply } => {
                    self.accepting.store(false, Ordering::Release);
                    self.receiver.close();
                    self.reject_queued(&closed("shard command loop is shutting down"));
                    let result = self.close_writer().await;
                    let _: Result<_, _> = reply.send(result.clone());
                    return result;
                }
            }
        }
        self.accepting.store(false, Ordering::Release);
        self.close_writer().await
    }

    async fn stop_after_terminal(
        &mut self,
        terminal_error: Option<ShardCommandError>,
    ) -> Result<(), ShardCommandError> {
        self.accepting.store(false, Ordering::Release);
        self.receiver.close();
        let error = terminal_error.unwrap_or_else(|| recovery("terminal command-loop failure"));
        self.observe_terminal(&error);
        self.reject_queued(&error);
        let _: Result<_, _> = self.close_writer().await;
        Err(error)
    }

    fn observe_terminal(&self, error: &ShardCommandError) {
        if error.kind == ShardCommandErrorKind::Fenced {
            if let Some(context) = &self.snapshot_context {
                D::note_fenced(context);
            }
        }
    }

    fn inspect_control_request(
        &self,
        request: &D::ControlRequest,
    ) -> Result<D::ControlSnapshot, ShardCommandError> {
        if D::control_shard(request) != self.location.shard {
            return Err(ShardCommandError {
                kind: ShardCommandErrorKind::InvalidCandidate,
                message: D::describe_foreign_control(request),
            });
        }
        D::inspect_control(&self.projection, request)
    }

    async fn process_control_request(
        &mut self,
        request: D::ControlRequest,
        preflight_rejection: Option<D::ControlRejection>,
    ) -> Result<ControlResolution<D>, ShardCommandError> {
        let snapshot = self.inspect_control_request(&request)?;
        if let Some(outcome) = D::control_prior_outcome(&snapshot) {
            return Ok(ControlResolution {
                append: ShardCommandOutcome::AlreadyDurable {
                    event_id: D::control_event_id(&request),
                },
                outcome,
            });
        }
        let record = D::promote_control(&self.projection, &request, preflight_rejection)
            .map_err(invalid_candidate)?;
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
                return Err(invalid_candidate(rejection));
            }
        };
        let outcome =
            D::control_outcome_after_append(&self.projection, &request).map_err(recovery)?;
        Ok(ControlResolution { append, outcome })
    }

    async fn process(
        &mut self,
        record: D::RecordCurrent,
    ) -> Result<ShardCommandOutcome<D::FoldError>, ShardCommandError> {
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

            #[cfg(any(test, feature = "test-util"))]
            self.wait_before_append().await;
            if self.ownership_lost.is_cancelled() {
                return Err(ShardCommandError {
                    kind: ShardCommandErrorKind::Fenced,
                    message: "shard ownership was lost before append".to_owned(),
                });
            }
            let append_result = self.append(&D::wire(record.clone())).await;
            match append_result {
                Ok(sequence) => {
                    if let Err(error) = D::finalize(&mut self.projection, delta, sequence) {
                        // The record is durable even though the state update failed. Recover
                        // and verify that it was applied before accepting another command.
                        self.recover_durable_prefix()
                            .await
                            .map_err(|recovery_error| {
                                recovery(format!(
                                    "finalize failed after durable append ({error}); \
                                     {recovery_error}"
                                ))
                            })?;
                        return match D::prepare(&self.projection, &record) {
                            Ok(Prepared::Noop) => {
                                self.notify_state_change_if_established(&integration_id);
                                Ok(ShardCommandOutcome::AlreadyDurable { event_id })
                            }
                            Ok(Prepared::Mutation(_)) => Err(recovery(format!(
                                "event {event_id} was acknowledged but is absent after recovery"
                            ))),
                            Err(prepare_error) => Err(recovery(format!(
                                "event {event_id} was acknowledged but conflicts after recovery: \
                                 {prepare_error}"
                            ))),
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
                Err(error) if error.disposition == AppendDisposition::DefinitelyNotCommitted => {
                    if safe_failures >= self.safe_append_retries {
                        return Err(append_error(&error));
                    }
                    safe_failures = safe_failures.saturating_add(1);
                }
                Err(error) if error.disposition == AppendDisposition::CommitUnknown => {
                    #[cfg(any(test, feature = "test-util"))]
                    self.wait_before_recovery().await;
                    self.recover_durable_prefix().await?;
                    // After recovery, `prepare` detects the stored event or a conflicting ID.
                    // If the event is absent, retry it before processing another command.
                    safe_failures = 0;
                }
                Err(error) => return Err(append_error(&error)),
            }
        }
    }

    async fn process_snapshot(&mut self, snapshot: D::Snapshot) -> Result<u64, ShardCommandError> {
        let (snapshot_shard, snapshot_through) = D::snapshot_bounds(&snapshot).map_err(recovery)?;
        if snapshot_shard != self.location.shard {
            return Err(ShardCommandError {
                kind: ShardCommandErrorKind::InvalidCandidate,
                message: format!(
                    "projection snapshot for shard {} was proposed to shard {}",
                    crate::routing::shard_path(snapshot_shard),
                    crate::routing::shard_path(self.location.shard)
                ),
            });
        }
        let Some(current_sequence) = D::through_sequence(&self.projection) else {
            return Err(ShardCommandError {
                kind: ShardCommandErrorKind::InvalidCandidate,
                message: "cannot reference a snapshot for an empty projection".to_owned(),
            });
        };
        if snapshot_through > current_sequence {
            return Err(ShardCommandError {
                kind: ShardCommandErrorKind::InvalidCandidate,
                message: format!(
                    "projection snapshot through {snapshot_through} is ahead of current \
                     projection {current_sequence}"
                ),
            });
        }

        let mut safe_failures = 0_u32;
        loop {
            #[cfg(any(test, feature = "test-util"))]
            self.wait_before_append().await;
            if self.ownership_lost.is_cancelled() {
                return Err(ShardCommandError {
                    kind: ShardCommandErrorKind::Fenced,
                    message: "shard ownership was lost before snapshot append".to_owned(),
                });
            }
            let writer = self
                .writer
                .as_ref()
                .ok_or_else(|| recovery("shard writer is unavailable"))?;
            match writer.append_projection_snapshot(&snapshot).await {
                Ok(sequence) => {
                    self.last_snapshot_through_log_sequence = Some(snapshot_through);
                    return Ok(sequence);
                }
                Err(error) if error.disposition == AppendDisposition::DefinitelyNotCommitted => {
                    if safe_failures >= self.safe_append_retries {
                        return Err(append_error(&error));
                    }
                    safe_failures = safe_failures.saturating_add(1);
                }
                Err(error) => return Err(append_error(&error)),
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

    #[cfg_attr(
        not(any(test, feature = "test-util")),
        expect(
            clippy::needless_pass_by_ref_mut,
            reason = "test builds consume the fault schedule through the same append method"
        )
    )]
    async fn append(&mut self, record: &D::Record) -> Result<u64, ShardAppendError> {
        let writer = self.writer.as_ref().ok_or_else(|| ShardAppendError {
            disposition: AppendDisposition::CommitUnknown,
            source: error_stack::Report::new(crate::DurableError)
                .attach("shard writer is unavailable"),
        })?;
        #[cfg(any(test, feature = "test-util"))]
        if let Some(fault) = self.faults.pop_front() {
            return writer.append_with_fault(record, fault).await;
        }
        writer.append(record).await
    }

    async fn recover_durable_prefix(&mut self) -> Result<(), ShardCommandError> {
        if self.recovery_mode == RecoveryMode::FullLeaseHandshake {
            return Err(ShardCommandError {
                kind: ShardCommandErrorKind::CommitUnknown,
                message: "shard writer recovery requires a new lease acquisition handshake"
                    .to_owned(),
            });
        }
        if let Some(writer) = self.writer.take() {
            // Reopening obtains a new writer epoch even if closing the old writer fails.
            let _: Result<_, _> = writer.close().await;
        }
        let writer = ShardLogWriter::open(&self.location)
            .await
            .map_err(|error| recovery(format!("reopen shard writer: {error:?}")))?;
        let durable_end_exclusive = writer.durable_end_exclusive();
        self.writer = Some(writer);
        let writer = self
            .writer
            .as_ref()
            .ok_or_else(|| recovery("reopened shard writer is unavailable"))?;
        let recovered = replay_with_snapshots::<D>(
            writer,
            self.location.shard,
            durable_end_exclusive,
            self.snapshot_context.as_ref(),
        )
        .await?;
        D::validate_recovered_prefix(&self.projection, &recovered.projection).map_err(recovery)?;
        self.projection = recovered.projection;
        self.last_snapshot_through_log_sequence = recovered.snapshot_through_log_sequence;
        Ok(())
    }

    fn reject_queued(&mut self, error: &ShardCommandError) {
        while let Ok(command) = self.receiver.try_recv() {
            match command {
                Command::Propose { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(error.clone()));
                }
                Command::InspectControl { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(error.clone()));
                }
                Command::ResolveControl { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(error.clone()));
                }
                Command::CaptureSnapshot { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(error.clone()));
                }
                Command::CommitSnapshot { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(error.clone()));
                }
                Command::Query { reply, .. } => {
                    let _: Result<_, _> = reply.send(Err(error.clone()));
                }
                Command::Shutdown { reply } => {
                    let _: Result<_, _> = reply.send(Err(error.clone()));
                }
            }
        }
    }

    async fn close_writer(&mut self) -> Result<(), ShardCommandError> {
        if let Some(writer) = self.writer.take() {
            writer
                .close()
                .await
                .map_err(|error| recovery(format!("close shard writer: {error:?}")))?;
        }
        Ok(())
    }

    #[cfg(any(test, feature = "test-util"))]
    async fn wait_before_append(&self) {
        if let Some(hold) = &self.before_append {
            hold.wait_once().await;
        }
    }

    #[cfg(any(test, feature = "test-util"))]
    async fn wait_before_recovery(&self) {
        if let Some(hold) = &self.before_recovery {
            hold.wait_once().await;
        }
    }
}

struct RecoveredProjection<D: Domain> {
    projection: D::Projection,
    snapshot_through_log_sequence: Option<u64>,
    snapshot_created_at: Option<String>,
    replayed_events: u64,
    corruption_fallbacks: u64,
}

#[expect(
    clippy::too_many_lines,
    reason = "snapshot fallback validates each candidate before replaying its suffix"
)]
async fn replay_with_snapshots<D: Domain>(
    writer: &ShardLogWriter,
    shard: crate::routing::Shard,
    durable_end_exclusive: u64,
    context: Option<&D::SnapshotContext>,
) -> Result<RecoveredProjection<D>, ShardCommandError> {
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
                                error = %error,
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
                                error = %error,
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
                                    error = %error,
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
                                error = %error,
                                "projection snapshot suffix failed validation; trying an older snapshot"
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

async fn replay_durable_prefix<D: Domain>(
    writer: &ShardLogWriter,
    shard: crate::routing::Shard,
    durable_end_exclusive: u64,
) -> Result<(D::Projection, u64), ShardCommandError> {
    replay_durable_suffix::<D>(
        writer,
        shard,
        durable_end_exclusive,
        D::Projection::default(),
    )
    .await
}

async fn replay_durable_suffix<D: Domain>(
    writer: &ShardLogWriter,
    shard: crate::routing::Shard,
    durable_end_exclusive: u64,
    mut recovered: D::Projection,
) -> Result<(D::Projection, u64), ShardCommandError> {
    // Use the writer that supplied the durable position, so the scan and its bounds share the
    // same view of storage.
    let scan_started = std::time::Instant::now();
    let through_sequence = D::through_sequence(&recovered);
    let records = writer
        .scan_suffix(through_sequence, durable_end_exclusive)
        .await
        .map_err(|error| recovery(format!("scan durable shard prefix: {error:?}")));
    let records = records?;

    tracing::info!(
        shard = %crate::routing::shard_path(shard),
        from_sequence = through_sequence.map_or(0, |sequence| sequence.saturating_add(1)),
        durable_end_exclusive,
        records = records.len(),
        elapsed_ms = u64::try_from(scan_started.elapsed().as_millis()).unwrap_or(u64::MAX),
        "scanned durable shard replay suffix"
    );

    let replayed_events = u64::try_from(records.len()).unwrap_or(u64::MAX);
    for (sequence, record) in records {
        D::replay(&mut recovered, shard, sequence, record).map_err(recovery)?;
    }
    Ok((recovered, replayed_events))
}

/// The integration's planned foreground work, when it is runnable.
fn invalid_candidate<E: fmt::Display>(error: E) -> ShardCommandError {
    ShardCommandError {
        kind: ShardCommandErrorKind::InvalidCandidate,
        message: error.to_string(),
    }
}

fn append_error(error: &ShardAppendError) -> ShardCommandError {
    let kind = match error.disposition {
        AppendDisposition::DefinitelyNotCommitted => ShardCommandErrorKind::DefinitelyNotCommitted,
        AppendDisposition::CommitUnknown => ShardCommandErrorKind::CommitUnknown,
        AppendDisposition::Fenced => ShardCommandErrorKind::Fenced,
    };
    ShardCommandError {
        kind,
        message: error.to_string(),
    }
}

fn recovery(message: impl Into<String>) -> ShardCommandError {
    ShardCommandError {
        kind: ShardCommandErrorKind::Recovery,
        message: message.into(),
    }
}

fn closed(message: impl Into<String>) -> ShardCommandError {
    ShardCommandError {
        kind: ShardCommandErrorKind::Closed,
        message: message.into(),
    }
}

const fn is_terminal(kind: ShardCommandErrorKind) -> bool {
    matches!(
        kind,
        ShardCommandErrorKind::CommitUnknown
            | ShardCommandErrorKind::Fenced
            | ShardCommandErrorKind::Recovery
    )
}

#[cfg(any(test, feature = "test-util"))]
#[derive(Default)]
pub struct TestHarness {
    pub faults: VecDeque<super::AppendFault>,
    pub before_append: Option<Arc<TestHold>>,
    pub before_recovery: Option<Arc<TestHold>>,
}

#[cfg(any(test, feature = "test-util"))]
#[derive(Default)]
pub struct TestHold {
    armed: AtomicBool,
    entered: Notify,
    release: Notify,
}

#[cfg(any(test, feature = "test-util"))]
impl TestHold {
    #[must_use]
    pub fn armed() -> Arc<Self> {
        Arc::new(Self {
            armed: AtomicBool::new(true),
            entered: Notify::new(),
            release: Notify::new(),
        })
    }

    /// Signalled once when the held code path first arrives at the hold point.
    pub const fn entered(&self) -> &Notify {
        &self.entered
    }

    /// Releases the held code path to continue.
    pub const fn release(&self) -> &Notify {
        &self.release
    }

    async fn wait_once(&self) {
        if self.armed.swap(false, Ordering::AcqRel) {
            self.entered.notify_one();
            self.release.notified().await;
        }
    }
}

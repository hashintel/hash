use error_stack::{Report, ResultExt as _};
use tokio::sync::oneshot;

use super::{
    ControlResolution, ShardCommandError, ShardCommandHandle, ShardCommandKind,
    ShardCommandOutcome, ShardOwner,
};
use crate::{port::Domain, sequence::JournalSequence};

pub(super) enum Command<D: Domain> {
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
        reply: oneshot::Sender<Result<JournalSequence, Report<ShardCommandError>>>,
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
    pub(super) const fn kind(&self) -> ShardCommandKind {
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
    ) -> Result<JournalSequence, Report<ShardCommandError>> {
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
    #[must_use]
    pub fn queue_capacity(&self) -> usize {
        self.sender.capacity()
    }
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

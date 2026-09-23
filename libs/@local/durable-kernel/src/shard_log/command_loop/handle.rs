use error_stack::{Report, ResultExt as _};
use tokio::sync::oneshot;

use super::{
    ShardCommandError, ShardCommandHandle, ShardCommandKind, ShardCommandOutcome, ShardOwner,
    operation::Operation,
};
use crate::port::EventDomain;

pub(super) enum Command<D: EventDomain> {
    Propose {
        record: D::RecordCurrent,
        reply:
            oneshot::Sender<Result<ShardCommandOutcome<D::FoldError>, Report<ShardCommandError>>>,
    },
    Operation(Box<dyn Operation<D>>),
    Shutdown {
        reply: oneshot::Sender<Result<(), Report<ShardCommandError>>>,
    },
}

impl<D: EventDomain> Command<D> {
    pub(super) fn kind(&self) -> ShardCommandKind {
        match self {
            Self::Propose { .. } => ShardCommandKind::Propose,
            Self::Operation(operation) => operation.kind(),
            Self::Shutdown { .. } => ShardCommandKind::Shutdown,
        }
    }
}

impl<D: EventDomain> ShardCommandHandle<D> {
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

    pub(super) async fn send_operation(
        &self,
        operation: Box<dyn Operation<D>>,
    ) -> Result<(), Report<ShardCommandError>> {
        self.send(Command::Operation(operation)).await
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

impl<D: EventDomain> ShardOwner<D> {
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

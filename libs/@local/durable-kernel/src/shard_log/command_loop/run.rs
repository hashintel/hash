use bytes::Bytes;
use error_stack::Report;
use futures_util::future::BoxFuture;
use tokio::sync::oneshot;

use super::{
    CommandLoop, ShardCommandError, ShardCommandErrorKind, ShardCommandKind, ShardCommandOutcome,
    handle::Command, operation::LoopAccess,
};
use crate::{
    port::EventDomain, registry::RecordRegistry, routing::Shard, sequence::JournalSequence,
    shard_log::JournalStorage,
};

pub(super) struct CommandFailure {
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

pub(super) fn send_reply<T: Send + 'static>(
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

impl<D: EventDomain, S: JournalStorage> CommandLoop<D, S> {
    pub(super) async fn run(mut self) -> Result<(), ShardCommandError> {
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
            && let Some(on_fenced) = self.on_fenced.take()
        {
            on_fenced();
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
            let committing_snapshot = command.kind() == ShardCommandKind::CommitSnapshot;
            let shutting_down = matches!(&command, Command::Shutdown { .. });
            let result = match command {
                Command::Propose { record, reply } => {
                    let result = self.process(record).await;
                    send_reply(reply, result)
                }
                Command::Operation(operation) => operation.run(self).await,
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
}

impl<D: EventDomain, S: JournalStorage> LoopAccess<D> for CommandLoop<D, S> {
    fn shard(&self) -> Shard {
        self.location.shard
    }

    fn projection(&self) -> &D::Projection {
        &self.projection
    }

    fn registry(&self) -> &RecordRegistry {
        &self.location.registry
    }

    fn last_snapshot_attempt(&self) -> Option<JournalSequence> {
        self.last_snapshot_attempt_through_sequence
    }

    fn set_last_snapshot_attempt(&mut self, through: JournalSequence) {
        self.last_snapshot_attempt_through_sequence = Some(through);
    }

    fn propose(
        &mut self,
        record: D::RecordCurrent,
    ) -> BoxFuture<'_, Result<ShardCommandOutcome<D::FoldError>, Report<ShardCommandError>>> {
        Box::pin(Self::process(self, record))
    }

    fn store_snapshot(
        &mut self,
        bytes: Bytes,
        through: JournalSequence,
    ) -> BoxFuture<'_, Result<JournalSequence, Report<ShardCommandError>>> {
        Box::pin(Self::append_snapshot(self, bytes, through))
    }
}

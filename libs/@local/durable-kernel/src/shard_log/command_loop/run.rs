use error_stack::{Report, ResultExt as _};
use tokio::sync::oneshot;

use super::{
    CommandLoop, ControlResolution, ShardCommandError, ShardCommandErrorKind, ShardCommandOutcome,
    handle::Command,
};
use crate::{port::Domain, shard_log::JournalStorage};

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

impl<D: Domain, S: JournalStorage> CommandLoop<D, S> {
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
                            let span = self.last_snapshot_attempt_through_sequence.map_or_else(
                                || through.get().saturating_add(1),
                                |previous| through.get().saturating_sub(previous.get()),
                            );
                            span >= minimum_sequence_span.max(1)
                        })
                        .and_then(|through| {
                            self.last_snapshot_attempt_through_sequence = Some(through);
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
}

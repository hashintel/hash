use error_stack::{Report, ResultExt as _};
use futures_util::future::BoxFuture;
use tokio::sync::oneshot;

use super::{
    ShardCommandError, ShardCommandHandle, ShardCommandKind, ShardCommandOutcome,
    operation::{LoopAccess, Operation},
    run::{CommandFailure, send_reply},
};
use crate::{port::ControlDomain, routing::Shard};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ControlResolution<D: ControlDomain> {
    pub append: ShardCommandOutcome,
    pub outcome: D::ControlOutcome,
}

fn inspect<D: ControlDomain>(
    shard: Shard,
    projection: &D::Projection,
    request: &D::ControlRequest,
) -> Result<D::ControlSnapshot, Report<ShardCommandError>> {
    if D::control_shard(request) != shard {
        return Err(Report::new(ShardCommandError::ControlShardMismatch {
            expected: shard,
            actual: D::control_shard(request),
        })
        .attach(D::describe_foreign_control(request)));
    }
    D::inspect_control(projection, request)
}

async fn resolve<D: ControlDomain>(
    access: &mut dyn LoopAccess<D>,
    request: D::ControlRequest,
    preflight_rejection: Option<D::ControlRejection>,
) -> Result<ControlResolution<D>, Report<ShardCommandError>> {
    let snapshot = inspect::<D>(access.shard(), access.projection(), &request)?;
    if let Some(outcome) = D::control_prior_outcome(&snapshot) {
        return Ok(ControlResolution {
            append: ShardCommandOutcome::AlreadyDurable {
                event_id: D::control_event_id(&request),
            },
            outcome,
        });
    }

    let record = D::build_control_record(access.projection(), &request, preflight_rejection)
        .change_context(ShardCommandError::BuildControlRecord {
            event_id: D::control_event_id(&request),
        })?;

    let append = match access.propose(record).await? {
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

    let outcome = D::control_outcome_after_append(access.projection(), &request)
        .change_context_lazy(|| ShardCommandError::ReadControlOutcome {
            event_id: D::control_event_id(&request),
        })?;

    Ok(ControlResolution { append, outcome })
}

struct InspectControl<D: ControlDomain> {
    request: D::ControlRequest,
    reply: oneshot::Sender<Result<D::ControlSnapshot, Report<ShardCommandError>>>,
}

impl<D: ControlDomain> Operation<D> for InspectControl<D> {
    fn kind(&self) -> ShardCommandKind {
        ShardCommandKind::InspectControl
    }

    fn run(
        self: Box<Self>,
        access: &mut dyn LoopAccess<D>,
    ) -> BoxFuture<'_, Result<(), CommandFailure>> {
        let result = inspect::<D>(access.shard(), access.projection(), &self.request);
        Box::pin(core::future::ready(send_reply(self.reply, result)))
    }

    fn reject(self: Box<Self>, error: Report<ShardCommandError>) {
        let _: Result<_, _> = self.reply.send(Err(error));
    }
}

struct ResolveControl<D: ControlDomain> {
    request: D::ControlRequest,
    preflight_rejection: Option<D::ControlRejection>,
    reply: oneshot::Sender<Result<ControlResolution<D>, Report<ShardCommandError>>>,
}

impl<D: ControlDomain> Operation<D> for ResolveControl<D> {
    fn kind(&self) -> ShardCommandKind {
        ShardCommandKind::ResolveControl
    }

    fn run(
        self: Box<Self>,
        access: &mut dyn LoopAccess<D>,
    ) -> BoxFuture<'_, Result<(), CommandFailure>> {
        let Self {
            request,
            preflight_rejection,
            reply,
        } = *self;
        Box::pin(async move {
            let result = resolve::<D>(access, request, preflight_rejection).await;
            send_reply(reply, result)
        })
    }

    fn reject(self: Box<Self>, error: Report<ShardCommandError>) {
        let _: Result<_, _> = self.reply.send(Err(error));
    }
}

impl<D: ControlDomain> ShardCommandHandle<D> {
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
        self.send_operation(Box::new(InspectControl::<D> { request, reply }))
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
        self.send_operation(Box::new(ResolveControl::<D> {
            request,
            preflight_rejection,
            reply,
        }))
        .await?;
        response
            .await
            .change_context(ShardCommandError::ReplyDropped {
                command: ShardCommandKind::ResolveControl,
            })?
    }
}

use error_stack::{Report, ResultExt as _};
use futures_util::future::BoxFuture;
use tokio::sync::oneshot;

use super::{
    ShardCommandError, ShardCommandHandle, ShardCommandKind,
    operation::{LoopAccess, Operation},
    run::{CommandFailure, send_reply},
};
use crate::{port::SnapshotDomain, registry::DurableRecord as _, sequence::JournalSequence};

struct CaptureSnapshot<D: SnapshotDomain> {
    minimum_sequence_span: u64,
    reply: oneshot::Sender<Result<Option<D::SnapshotCapture>, Report<ShardCommandError>>>,
}

impl<D: SnapshotDomain> Operation<D> for CaptureSnapshot<D> {
    fn kind(&self) -> ShardCommandKind {
        ShardCommandKind::CaptureSnapshot
    }

    fn run(
        self: Box<Self>,
        access: &mut dyn LoopAccess<D>,
    ) -> BoxFuture<'_, Result<(), CommandFailure>> {
        let previous = access.last_snapshot_attempt();
        let capture = D::through_sequence(access.projection())
            .filter(|through| {
                let span = previous.map_or_else(
                    || through.get().saturating_add(1),
                    |previous| through.get().saturating_sub(previous.get()),
                );
                span >= self.minimum_sequence_span.max(1)
            })
            .and_then(|through| {
                access.set_last_snapshot_attempt(through);
                D::capture_snapshot(access.shard(), access.projection())
            });
        Box::pin(core::future::ready(send_reply(self.reply, Ok(capture))))
    }

    fn reject(self: Box<Self>, error: Report<ShardCommandError>) {
        let _: Result<_, _> = self.reply.send(Err(error));
    }
}

struct CommitSnapshot<D: SnapshotDomain> {
    snapshot: D::Snapshot,
    reply: oneshot::Sender<Result<JournalSequence, Report<ShardCommandError>>>,
}

async fn commit<D: SnapshotDomain>(
    access: &mut dyn LoopAccess<D>,
    snapshot: D::Snapshot,
) -> Result<JournalSequence, Report<ShardCommandError>> {
    let (snapshot_shard, snapshot_through) =
        D::snapshot_bounds(&snapshot).change_context(ShardCommandError::ReadSnapshotBounds)?;
    if snapshot_shard != access.shard() {
        return Err(Report::new(ShardCommandError::SnapshotShardMismatch {
            expected: access.shard(),
            actual: snapshot_shard,
        }));
    }
    let Some(current_sequence) = D::through_sequence(access.projection()) else {
        return Err(Report::new(ShardCommandError::SnapshotForEmptyProjection));
    };
    if snapshot_through > current_sequence {
        return Err(Report::new(ShardCommandError::SnapshotAheadOfProjection {
            snapshot_through,
            current_sequence,
        }));
    }

    let declaration = D::Snapshot::declaration();
    access
        .registry()
        .register(declaration)
        .change_context(ShardCommandError::RegisterRecord {
            name: declaration.name,
        })?;
    access
        .registry()
        .require::<D::Snapshot>()
        .change_context_lazy(|| ShardCommandError::ValidateSnapshotRegistration {
            name: declaration.name,
        })?;
    let mut bytes = Vec::new();
    snapshot
        .encode(&mut bytes)
        .change_context(ShardCommandError::EncodeSnapshot)?;
    access
        .store_snapshot(bytes::Bytes::from(bytes), snapshot_through)
        .await
}

impl<D: SnapshotDomain> Operation<D> for CommitSnapshot<D> {
    fn kind(&self) -> ShardCommandKind {
        ShardCommandKind::CommitSnapshot
    }

    fn run(
        self: Box<Self>,
        access: &mut dyn LoopAccess<D>,
    ) -> BoxFuture<'_, Result<(), CommandFailure>> {
        let Self { snapshot, reply } = *self;
        Box::pin(async move {
            let result = commit::<D>(access, snapshot).await;
            send_reply(reply, result)
        })
    }

    fn reject(self: Box<Self>, error: Report<ShardCommandError>) {
        let _: Result<_, _> = self.reply.send(Err(error));
    }
}

impl<D: SnapshotDomain> ShardCommandHandle<D> {
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
        self.send_operation(Box::new(CaptureSnapshot::<D> {
            minimum_sequence_span,
            reply,
        }))
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
        self.send_operation(Box::new(CommitSnapshot::<D> { snapshot, reply }))
            .await?;
        response
            .await
            .change_context(ShardCommandError::ReplyDropped {
                command: ShardCommandKind::CommitSnapshot,
            })?
    }
}

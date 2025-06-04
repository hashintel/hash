use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use error_stack::{Report, ResultExt as _};
use futures::{
    Sink, SinkExt as _, Stream, StreamExt as _,
    channel::mpsc::{self, Sender},
    stream::{BoxStream, SelectAll, select_all},
};
use hash_graph_authorization::policies::principal::PrincipalConstraint;
use postgres_types::Json;
use type_system::principal::{PrincipalId, PrincipalType};

use super::{
    PolicyActionSnapshotRecord, PolicyRowBatch,
    record::PolicyEditionSnapshotRecord,
    table::{PolicyActionRow, PolicyEditionRow, PolicyRow},
};
use crate::snapshot::SnapshotRestoreError;

#[derive(Debug, Clone)]
pub struct PolicyEditionSender {
    id: Sender<PolicyRow>,
    edition: Sender<PolicyEditionRow>,
}

impl Sink<PolicyEditionSnapshotRecord> for PolicyEditionSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.id.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll policy sender")?;
        ready!(self.edition.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll policy edition sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(
        mut self: Pin<&mut Self>,
        policy: PolicyEditionSnapshotRecord,
    ) -> Result<(), Self::Error> {
        self.id
            .start_send_unpin(PolicyRow { id: policy.id })
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send policy row")?;

        let (principal_id, actor_type) = policy
            .principal
            .as_ref()
            .map(PrincipalConstraint::to_parts)
            .unwrap_or_default();

        self.edition
            .start_send_unpin(PolicyEditionRow {
                id: policy.id,
                name: policy.name.clone(),
                transaction_time: policy.transaction_time,
                effect: policy.effect,
                principal_id,
                principal_type: principal_id.map(PrincipalId::principal_type),
                actor_type: actor_type.map(PrincipalType::from),
                resource_constraint: policy.resource.map(Json),
            })
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send policy edition row")?;

        Ok(())
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.id.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush policy sender")?;
        ready!(self.edition.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush policy edition sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.id.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close policy sender")?;
        ready!(self.edition.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close policy edition sender")?;

        Poll::Ready(Ok(()))
    }
}

#[derive(Debug, Clone)]
pub struct PolicyActionSender {
    action: Sender<PolicyActionRow>,
}

impl Sink<PolicyActionSnapshotRecord> for PolicyActionSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.action.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll policy action sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(
        mut self: Pin<&mut Self>,
        action: PolicyActionSnapshotRecord,
    ) -> Result<(), Self::Error> {
        self.action
            .start_send_unpin(PolicyActionRow {
                policy_id: action.policy_id,
                action_name: action.name,
                transaction_time: action.transaction_time,
            })
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send policy action row")?;

        Ok(())
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.action.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush policy action sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.action.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close policy action sender")?;

        Poll::Ready(Ok(()))
    }
}

/// A stream to receive [`PolicyRowBatch`]es.
///
/// An `PolicyReceiver` with the corresponding [`PolicyEditionSender`] and [`PolicyActionSender`]
/// are created using the [`channel`] function.
pub struct PolicyReceiver {
    stream: SelectAll<BoxStream<'static, PolicyRowBatch>>,
}

// This is a direct wrapper around the underlying stream, batches the row in chunks, and unifies
// the `Item` into a single enumeration.
impl Stream for PolicyReceiver {
    type Item = PolicyRowBatch;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.stream.poll_next_unpin(cx)
    }
}

/// Create a new [`PolicyEditionSender`] and [`PolicyActionSender`] pair.
///
/// The `chunk_size` parameter is used to batch the rows into chunks of the given size.
pub(crate) fn channel(
    chunk_size: usize,
) -> (PolicyEditionSender, PolicyActionSender, PolicyReceiver) {
    let (id_tx, id_rx) = mpsc::channel(chunk_size);
    let (edition_tx, edition_rx) = mpsc::channel(chunk_size);
    let (action_tx, action_rx) = mpsc::channel(chunk_size);

    (
        PolicyEditionSender {
            id: id_tx,
            edition: edition_tx,
        },
        PolicyActionSender { action: action_tx },
        PolicyReceiver {
            stream: select_all([
                id_rx
                    .ready_chunks(chunk_size)
                    .map(PolicyRowBatch::Id)
                    .boxed(),
                edition_rx
                    .ready_chunks(chunk_size)
                    .map(PolicyRowBatch::Edition)
                    .boxed(),
                action_rx
                    .ready_chunks(chunk_size)
                    .map(PolicyRowBatch::Action)
                    .boxed(),
            ]),
        },
    )
}

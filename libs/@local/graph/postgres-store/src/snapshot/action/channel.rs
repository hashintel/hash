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

use super::{
    batch::ActionRowBatch,
    record::ActionSnapshotRecord,
    table::{ActionHierarchyRow, ActionRow},
};
use crate::snapshot::SnapshotRestoreError;

/// A sink to insert [`ActionSnapshotRecord`]s.
///
/// An `ActionSender` with the corresponding [`ActionReceiver`] are created using the
/// [`channel`] function.
#[derive(Debug, Clone)]
pub struct ActionSender {
    name: Sender<ActionRow>,
    hierarchy: Sender<ActionHierarchyRow>,
}

impl Sink<ActionSnapshotRecord> for ActionSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.name.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll action sender")?;
        ready!(self.hierarchy.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not poll action hierarchy sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(
        mut self: Pin<&mut Self>,
        action: ActionSnapshotRecord,
    ) -> Result<(), Self::Error> {
        self.name
            .start_send_unpin(ActionRow {
                name: action.name.clone(),
                parent: action.parents.first().cloned(),
            })
            .change_context(SnapshotRestoreError::Read)
            .attach("could not send action row")?;

        for (depth, parent_name) in action.parents.into_iter().enumerate() {
            self.hierarchy
                .start_send_unpin(ActionHierarchyRow {
                    parent_name,
                    child_name: action.name.clone(),
                    depth: i32::try_from(depth + 1).expect("Depth should be smaller than 2^31"),
                })
                .change_context(SnapshotRestoreError::Read)
                .attach("could not send action row")?;
        }

        self.hierarchy
            .start_send_unpin(ActionHierarchyRow {
                parent_name: action.name.clone(),
                child_name: action.name,
                depth: 0,
            })
            .change_context(SnapshotRestoreError::Read)
            .attach("could not send action row")?;

        Ok(())
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.name.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush action sender")?;
        ready!(self.hierarchy.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not flush action hierarchy sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.name.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close action sender")?;
        ready!(self.hierarchy.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach("could not close action hierarchy sender")?;

        Poll::Ready(Ok(()))
    }
}

/// A stream to receive [`ActionRowBatch`]es.
///
/// An `ActionReceiver` with the corresponding [`ActionSender`] are created using the
/// [`channel`] function.
pub struct ActionReceiver {
    stream: SelectAll<BoxStream<'static, ActionRowBatch>>,
}

// This is a direct wrapper around the underlying stream, batches the row in chunks, and unifies
// the `Item` into a single enumeration.
impl Stream for ActionReceiver {
    type Item = ActionRowBatch;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.stream.poll_next_unpin(cx)
    }
}

/// Create a new [`ActionSender`] and [`ActionReceiver`] pair.
///
/// The `chunk_size` parameter is used to batch the rows into chunks of the given size.
pub(crate) fn channel(chunk_size: usize) -> (ActionSender, ActionReceiver) {
    let (action_tx, action_rx) = mpsc::channel(chunk_size);
    let (action_hierarchy_tx, action_hierarchy_rx) = mpsc::channel(chunk_size);

    (
        ActionSender {
            name: action_tx,
            hierarchy: action_hierarchy_tx,
        },
        ActionReceiver {
            stream: select_all([
                action_rx
                    .ready_chunks(chunk_size)
                    .map(ActionRowBatch::Name)
                    .boxed(),
                action_hierarchy_rx
                    .ready_chunks(chunk_size)
                    .map(ActionRowBatch::Hierarchy)
                    .boxed(),
            ]),
        },
    )
}

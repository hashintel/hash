use std::{
    pin::Pin,
    result::Result as StdResult,
    task::{ready, Context, Poll},
};

use authorization::schema::AccountGroupRelationAndSubject;
use error_stack::{Report, ResultExt};
use futures::{
    channel::mpsc::{self, Sender},
    stream::{select_all, BoxStream, SelectAll},
    Sink, SinkExt, Stream, StreamExt,
};
use graph_types::account::AccountGroupId;

use crate::snapshot::{
    owner::{AccountGroupRow, AccountRow, AccountRowBatch, Owner},
    SnapshotRestoreError,
};

/// A sink to insert [`AccountId`]s and [`AccountGroupId`]s.
///
/// An `AccountSender` with the corresponding [`OwnerReceiver`] are created using the [`channel`]
/// function.
///
/// [`AccountId`]: graph_types::account::AccountId
/// [`AccountGroupId`]: graph_types::account::AccountGroupId
#[derive(Debug, Clone)]
pub struct OwnerSender {
    account_id: Sender<AccountRow>,
    account_group_id: Sender<AccountGroupRow>,
    account_group_relations: Sender<(AccountGroupId, AccountGroupRelationAndSubject)>,
}

// This is a direct wrapper around `Sink<mpsc::Sender<AccountRow>>` with error-handling added
// to make it easier to use.
impl Sink<Owner> for OwnerSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.account_id.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll account sender")?;
        ready!(self.account_group_id.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll account group sender")?;
        ready!(self.account_group_relations.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll account group relations sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(mut self: Pin<&mut Self>, item: Owner) -> StdResult<(), Self::Error> {
        match item {
            Owner::Account(account) => self
                .account_id
                .start_send_unpin(AccountRow {
                    account_id: account.id,
                })
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send account"),
            Owner::AccountGroup(account_group) => {
                for relation in account_group.relations {
                    self.account_group_relations
                        .start_send_unpin((account_group.id, relation))
                        .change_context(SnapshotRestoreError::Read)
                        .attach_printable("could not send account group relation")?;
                }
                Ok(())
            }
        }
    }

    fn poll_flush(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.account_id.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush account sender")?;
        ready!(self.account_group_id.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush account group sender")?;
        ready!(self.account_group_relations.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush account group relations sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.account_id.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close account sender")?;
        ready!(self.account_group_id.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close account group sender")?;
        ready!(self.account_group_relations.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close account group relations sender")?;

        Poll::Ready(Ok(()))
    }
}

/// A stream to emit [`AccountRowBatch`]es.
///
/// An [`OwnerSender`] with the corresponding `AccountReceiver` are created using the [`channel`]
/// function.
pub struct OwnerReceiver {
    stream: SelectAll<BoxStream<'static, AccountRowBatch>>,
}

// This is a direct wrapper around `Stream<mpsc::Receiver<AccountRow>>` with error-handling and
// batching added
impl Stream for OwnerReceiver {
    type Item = AccountRowBatch;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.stream.poll_next_unpin(cx)
    }
}

/// Creates a new [`OwnerSender`] and [`OwnerReceiver`] pair.
///
/// The `chunk_size` parameter determines the number of ids are sent in a single batch.
pub fn channel(chunk_size: usize) -> (OwnerSender, OwnerReceiver) {
    let (account_id_tx, account_id_rx) = mpsc::channel(chunk_size);
    let (account_group_id_tx, account_group_id_rx) = mpsc::channel(chunk_size);
    let (account_group_relations_tx, account_group_relations_rx) = mpsc::channel(chunk_size);

    (
        OwnerSender {
            account_id: account_id_tx,
            account_group_id: account_group_id_tx,
            account_group_relations: account_group_relations_tx,
        },
        OwnerReceiver {
            stream: select_all([
                account_id_rx
                    .ready_chunks(chunk_size)
                    .map(AccountRowBatch::Accounts)
                    .boxed(),
                account_group_id_rx
                    .ready_chunks(chunk_size)
                    .map(AccountRowBatch::AccountGroups)
                    .boxed(),
                account_group_relations_rx
                    .ready_chunks(chunk_size)
                    .map(AccountRowBatch::AccountGroupAccountRelations)
                    .boxed(),
            ]),
        },
    )
}

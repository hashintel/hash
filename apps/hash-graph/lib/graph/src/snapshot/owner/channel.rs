use std::{
    pin::Pin,
    result::Result as StdResult,
    task::{ready, Context, Poll},
};

use authorization::schema::AccountGroupRelation;
use error_stack::{Report, ResultExt};
use futures::{
    channel::mpsc::{self, Sender},
    stream::{select_all, BoxStream, SelectAll},
    Sink, SinkExt, Stream, StreamExt,
};
use graph_types::account::{AccountGroupId, AccountId};

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
#[expect(clippy::struct_field_names)]
pub struct OwnerSender {
    account_id: Sender<AccountRow>,
    account_group_id: Sender<AccountGroupRow>,
    account_group_account_relation: Sender<(AccountGroupId, AccountGroupRelation, AccountId)>,
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
        ready!(self.account_group_account_relation.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll account group account relation sender")?;

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
                let owners = account_group.owners.into_iter().map(|account_id| {
                    (
                        account_group.id,
                        AccountGroupRelation::DirectOwner,
                        account_id,
                    )
                });
                let admins = account_group.admins.into_iter().map(|account_id| {
                    (
                        account_group.id,
                        AccountGroupRelation::DirectAdmin,
                        account_id,
                    )
                });
                let members = account_group.members.into_iter().map(|account_id| {
                    (
                        account_group.id,
                        AccountGroupRelation::DirectMember,
                        account_id,
                    )
                });
                for relation in owners.chain(admins).chain(members) {
                    self.account_group_account_relation
                        .start_send_unpin(relation)
                        .change_context(SnapshotRestoreError::Read)
                        .attach_printable("could not send account group relation")?;
                }

                self.account_group_id
                    .start_send_unpin(AccountGroupRow {
                        account_group_id: account_group.id,
                    })
                    .change_context(SnapshotRestoreError::Read)
                    .attach_printable("could not send account group")
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
    let (account_group_account_relation_tx, account_group_account_relation_rx) =
        mpsc::channel(chunk_size);

    (
        OwnerSender {
            account_id: account_id_tx,
            account_group_id: account_group_id_tx,
            account_group_account_relation: account_group_account_relation_tx,
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
                account_group_account_relation_rx
                    .ready_chunks(chunk_size)
                    .map(AccountRowBatch::AccountGroupAccountRelations)
                    .boxed(),
            ]),
        },
    )
}

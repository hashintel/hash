use std::{
    pin::Pin,
    result::Result as StdResult,
    task::{ready, Context, Poll},
};

use authorization::schema::{AccountGroupPermission, OwnerId, WebRelation};
use error_stack::{Report, ResultExt};
use futures::{
    channel::mpsc::{self, Sender},
    stream::{select_all, BoxStream, SelectAll},
    Sink, SinkExt, Stream, StreamExt,
};
use graph_types::{
    account::{AccountGroupId, AccountId},
    web::WebId,
};

use crate::snapshot::{web::WebBatch, SnapshotRestoreError, Web};

/// A sink to insert [`Web`]s.
///
/// An `WebSender` with the corresponding [`WebReceiver`] are created using the [`channel`]
/// function.
#[derive(Debug, Clone)]
pub struct WebSender {
    web_account_relation: Sender<(WebId, WebRelation, AccountId)>,
    web_account_group_relation:
        Sender<(WebId, WebRelation, AccountGroupId, AccountGroupPermission)>,
}

impl Sink<Web> for WebSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.web_account_relation.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll web account relation sender")?;
        ready!(self.web_account_group_relation.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll web account group relation sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(mut self: Pin<&mut Self>, item: Web) -> StdResult<(), Self::Error> {
        let owner_relations = item
            .owners
            .into_iter()
            .map(|owner| (WebRelation::DirectOwner, owner));
        let editor_relations = item
            .editors
            .into_iter()
            .map(|owner| (WebRelation::DirectEditor, owner));

        for (relation, id) in owner_relations.chain(editor_relations) {
            match id {
                OwnerId::Account(account_id) => self
                    .web_account_relation
                    .start_send_unpin((item.id, relation, account_id))
                    .change_context(SnapshotRestoreError::Read)
                    .attach_printable("could not send web account relation owner")?,
                OwnerId::AccountGroupMembers(account_group_id) => self
                    .web_account_group_relation
                    .start_send_unpin((
                        item.id,
                        relation,
                        account_group_id,
                        AccountGroupPermission::Member,
                    ))
                    .change_context(SnapshotRestoreError::Read)
                    .attach_printable("could not send web account group relation owners")?,
            }
        }
        Ok(())
    }

    fn poll_flush(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.web_account_relation.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush web account relation sender")?;
        ready!(self.web_account_relation.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush web account group relation sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.web_account_relation.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close web account relation sender")?;
        ready!(self.web_account_relation.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close web account group relation sender")?;

        Poll::Ready(Ok(()))
    }
}

/// A stream to emit [`WebBatch`]es.
///
/// An [`WebSender`] with the corresponding `WebReceiver` are created using the [`channel`]
/// function.
pub struct WebReceiver {
    stream: SelectAll<BoxStream<'static, WebBatch>>,
}

// This is a direct wrapper around `Stream<mpsc::Receiver<WebBatch>>` with error-handling and
// batching added
impl Stream for WebReceiver {
    type Item = WebBatch;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.stream.poll_next_unpin(cx)
    }
}

/// Creates a new [`WebSender`] and [`WebReceiver`] pair.
///
/// The `chunk_size` parameter determines the number of ids are sent in a single batch.
pub fn channel(chunk_size: usize) -> (WebSender, WebReceiver) {
    let (web_account_relation_tx, web_account_relation_rx) = mpsc::channel(chunk_size);
    let (web_account_group_relation_tx, web_account_group_relation_rx) = mpsc::channel(chunk_size);

    (
        WebSender {
            web_account_relation: web_account_relation_tx,
            web_account_group_relation: web_account_group_relation_tx,
        },
        WebReceiver {
            stream: select_all([
                web_account_relation_rx
                    .ready_chunks(chunk_size)
                    .map(WebBatch::Accounts)
                    .boxed(),
                web_account_group_relation_rx
                    .ready_chunks(chunk_size)
                    .map(WebBatch::AccountGroups)
                    .boxed(),
            ]),
        },
    )
}

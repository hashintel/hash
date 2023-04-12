use std::{
    pin::Pin,
    result::Result as StdResult,
    task::{ready, Context, Poll},
};

use error_stack::{IntoReport, Report, ResultExt};
use futures::{
    channel::mpsc::{self, Sender},
    stream::{select_all, BoxStream, SelectAll},
    Sink, SinkExt, Stream, StreamExt,
};

use crate::{
    identifier::account::AccountId,
    snapshot::{
        account::{AccountRow, AccountRowBatch},
        SnapshotRestoreError,
    },
};

/// A sink to insert [`AccountId`]s.
///
/// An `AccountSender` with the corresponding [`AccountReceiver`] are created using the [`channel`]
/// function.
#[derive(Debug, Clone)]
pub struct AccountSender {
    id: Sender<AccountRow>,
}

// This is a direct wrapper around `Sink<mpsc::Sender<AccountRow>>` with error-handling added
// to make it easier to use.
impl Sink<AccountId> for AccountSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.id.poll_ready_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll account sender")?;

        Poll::Ready(Ok(()))
    }

    fn start_send(mut self: Pin<&mut Self>, item: AccountId) -> StdResult<(), Self::Error> {
        self.id
            .start_send_unpin(AccountRow { account_id: item })
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send account")
    }

    fn poll_flush(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.id.poll_flush_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush account sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
    ) -> Poll<StdResult<(), Self::Error>> {
        ready!(self.id.poll_close_unpin(cx))
            .into_report()
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close account sender")?;

        Poll::Ready(Ok(()))
    }
}

/// A stream to emit [`AccountRowBatch`]es.
///
/// An [`AccountSender`] with the corresponding `AccountReceiver` are created using the [`channel`]
/// function.
pub struct AccountReceiver {
    stream: SelectAll<BoxStream<'static, AccountRowBatch>>,
}

// This is a direct wrapper around `Stream<mpsc::Receiver<AccountRow>>` with error-handling and
// batching added
impl Stream for AccountReceiver {
    type Item = AccountRowBatch;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.stream.poll_next_unpin(cx)
    }
}

/// Creates a new [`AccountSender`] and [`AccountReceiver`] pair.
/// 
/// The `chunk_size` parameter determines the number of [`AccountId`]s that are sent in a single
/// [`AccountRowBatch`].
pub fn channel(chunk_size: usize) -> (AccountSender, AccountReceiver) {
    let (id_tx, id_rx) = mpsc::channel(chunk_size);

    (AccountSender { id: id_tx }, AccountReceiver {
        stream: select_all([id_rx
            .ready_chunks(chunk_size)
            .map(AccountRowBatch::Accounts)
            .boxed()]),
    })
}

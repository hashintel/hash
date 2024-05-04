use std::io;

use error_stack::{Context, Report, Result, ResultExt};
use futures::{stream, Sink, SinkExt, Stream, StreamExt};
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    request::{body::RequestBody, flags::RequestFlag, id::RequestId, Request},
    response::Response,
};
use libp2p::PeerId;
use scc::HashIndex;
use tokio::{
    pin, select,
    sync::{mpsc, OwnedSemaphorePermit},
};
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

use super::{
    session_id::SessionId,
    transaction::{Transaction, TransactionParts},
};
use crate::session::error::SessionError;

const RESPONSE_BUFFER_SIZE: usize = 16;

struct ConnectionDelegateTask<T> {
    rx: mpsc::Receiver<Response>,

    sink: T,
}

impl<T, C> ConnectionDelegateTask<T>
where
    T: Sink<Response, Error = Report<C>> + Send,
    C: Context,
{
    async fn run(self) -> Result<(), SessionError> {
        let sink = self.sink;
        pin!(sink);

        // redirect the receiver stream to the sink, needs an extra task to drive both
        ReceiverStream::new(self.rx)
            .map(Ok)
            .forward(sink)
            .await
            .change_context(SessionError)
    }
}

impl<T, C> IntoFuture for ConnectionDelegateTask<T>
where
    T: Sink<Response, Error = Report<C>> + Send,
    C: Context,
{
    type Output = Result<(), SessionError>;

    type IntoFuture = impl Future<Output = Result<(), SessionError>>;

    fn into_future(self) -> Self::IntoFuture {
        self.run()
    }
}

pub(crate) struct ConnectionTask<T, U> {
    session: SessionId,

    // TODO: secondary map of cancellation tokens?!
    transactions: HashIndex<RequestId, mpsc::Sender<Request>>,

    peer: PeerId,
    sink: T,
    stream: U,

    permit: OwnedSemaphorePermit,

    tx_transaction: mpsc::Sender<Transaction>,
}

impl<T, C, U> ConnectionTask<T, U>
where
    T: Sink<Response, Error = Report<C>> + Send + 'static,
    C: Context,
    U: Stream<Item = Result<Request, io::Error>>,
{
    async fn handle_request(
        peer: PeerId,
        session: SessionId,
        transactions: &HashIndex<RequestId, mpsc::Sender<Request>>,
        request: Request,
        response_tx: mpsc::Sender<Response>,
        transactions_tx: mpsc::Sender<Transaction>,
        cancel: &CancellationToken,
    ) {
        // check if this is a `Begin` request, in that case we need to create a new transaction,
        // otherwise, this is already a transaction and we need to forward it, or log out if it is a
        // rogue request
        // at the end of a transaction we close the transaction
        let request_id = request.header.request_id;
        let is_end = request.header.flags.contains(RequestFlag::EndOfRequest);

        // these transactions then need to be propagated to the main session layer via an mpsc
        // channel, which drops a transaction if there's too many.
        match &request.body {
            RequestBody::Begin(begin) => {
                let (transaction_tx, transaction_rx) = mpsc::channel(RESPONSE_BUFFER_SIZE);

                let (transaction, task) = Transaction::from_request(
                    request.header,
                    begin,
                    TransactionParts {
                        peer,
                        rx: transaction_rx,
                        tx: response_tx,
                        session,
                    },
                );

                // we put it in the buffer, so will resolve immediately
                transaction_tx.send(request).await;

                task.start(cancel);

                // TODO: evict old entry (if there's one)
                transactions.insert_async(request_id, transaction_tx);
                // TODO: error out if send not possible
                transactions_tx.send(transaction).await;
            }
            RequestBody::Frame(_) => {
                // forward the request to the transaction
                if let Some(entry) = transactions.get_async(&request.header.request_id).await {
                    if let Err(error) = entry.send(request).await {
                        tracing::warn!(?error, "failed to forward request to transaction");
                    }
                } else {
                    // request has no transaction, which means it is a rogue request
                    tracing::warn!(?request, "request not part of transaction");
                }
            }
        }

        // remove the transaction from the index if it is closed.
        // TODO: forced gc on timeout in upper layer (needs IPC)
        if is_end {
            // removing this also means that all the channels will cascade close
            transactions.remove_async(&request_id).await;
        }
    }

    async fn run(self, cancel: CancellationToken) -> Result<(), SessionError> {
        let sink = self.sink;
        let stream = self.stream;

        pin!(stream);

        // TODO: active transaction limit?!
        let tracker = TaskTracker::new();

        let (tx, rx) = mpsc::channel(RESPONSE_BUFFER_SIZE);
        tracker.spawn(ConnectionDelegateTask { rx, sink }.into_future());
        tracker.close();

        // delegate to a transaction, which delegates back?
        loop {
            select! {
                Some(request) = stream.next() => {

                },
                () = cancel.cancelled() => {
                    break;
                }
            }
        }

        // if the connection breaks down we no longer need the session.
        Ok(())
    }
}

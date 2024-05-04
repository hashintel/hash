use std::io;

use error_stack::{Context, Report, Result, ResultExt};
use futures::{stream, Sink, SinkExt, Stream, StreamExt};
use harpc_wire_protocol::{
    request::{body::RequestBody, id::RequestId, Request},
    response::Response,
};
use libp2p::PeerId;
use scc::HashIndex;
use tokio::{
    pin, select,
    sync::{mpsc, OwnedSemaphorePermit},
};
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::CancellationToken;

use super::session::Session;
use crate::session::error::SessionError;

const RESPONSE_BUFFER_SIZE: usize = 16;

struct ConnectionDelegateTask<T> {
    rx: mpsc::Receiver<Response>,

    sink: T,
}

impl<T, C> ConnectionDelegateTask<T>
where
    T: Sink<Response, Error = Report<C>>,
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
    T: Sink<Response, Error = Report<C>>,
    C: Context,
{
    type Output = Result<(), SessionError>;

    type IntoFuture = impl Future<Output = Result<(), SessionError>>;

    fn into_future(self) -> Self::IntoFuture {
        self.run()
    }
}

pub(crate) struct ConnectionTask<T, U> {
    session: Session,

    transactions: HashIndex<RequestId, ()>,

    peer: PeerId,
    sink: T,
    stream: U,

    permit: OwnedSemaphorePermit,
}

impl<T, C, U> ConnectionTask<T, U>
where
    T: Sink<Response, Error = Report<C>> + Send + 'static,
    C: Context,
    U: Stream<Item = Result<Request, io::Error>>,
{
    async fn handle_request(transactions: &mut HashIndex<RequestId, ()>, request: Request) {
        // check if this is a `Begin` request, in that case we need to create a new transaction,
        // otherwise, this is already a transaction and we need to forward it, or log out if it is a
        // rogue request
        // at the end of a transaction we close the transaction

        // these transactions then need to be propagated to the main session layer via an mpsc
        // channel, which drops a transaction if there's too many.

        let is_begin = matches!(request.body, RequestBody::Begin(_));

        if is_begin {
            // create a new Transaction, notify the session layer of the new transaction
            // transactions
            //     .entry_async(request.header.request_id, ())
            //     .await;
        }

        // TODO: handle the bytes from these transactions!
    }

    async fn run(self, cancel: CancellationToken) -> Result<(), SessionError> {
        let sink = self.sink;
        let stream = self.stream;

        pin!(stream);

        let (tx, rx) = mpsc::channel(RESPONSE_BUFFER_SIZE);
        tokio::spawn(ConnectionDelegateTask { rx, sink }.into_future());

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

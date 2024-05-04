use alloc::sync::Arc;
use core::any::{Any, TypeId};
use std::{collections::HashMap, io};

use bytes::Bytes;
use error_stack::{Result, ResultExt};
use futures::{FutureExt, Sink, Stream, StreamExt, TryFutureExt};
use harpc_wire_protocol::{
    request::{body::RequestBody, id::RequestId, Request},
    response::Response,
};
use libp2p::PeerId;
use scc::HashIndex;
use tokio::{
    pin, select,
    sync::{mpsc, OwnedSemaphorePermit, Semaphore},
};
use tokio_util::sync::CancellationToken;

use crate::{session::error::SessionError, transport::TransportLayer};

const CONNECTION_LIMIT: usize = 256;

struct SessionId(usize);

struct SessionIdProducer(usize);

impl SessionIdProducer {
    fn new() -> Self {
        Self(0)
    }

    fn next(&mut self) -> SessionId {
        let id = self.0;
        self.0 = self.0.wrapping_add(1);

        SessionId(id)
    }
}

struct Session {
    context: HashMap<TypeId, Box<dyn Any + Send + Sync + 'static>>,
}

pub(crate) enum Command {}

struct Transaction {
    peer: PeerId,
    id: RequestId,
    session: Session,

    sink: mpsc::Sender<Bytes>,
    stream: mpsc::Receiver<Bytes>,
}

pub(crate) struct ConnectionTask<T, U> {
    id: SessionId,
    session: Session,

    transactions: HashIndex<RequestId, ()>,

    peer: PeerId,
    sink: T,
    stream: U,

    permit: OwnedSemaphorePermit,
}

impl<T, U> ConnectionTask<T, U>
where
    T: Sink<Response>,
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

        pin!(sink, stream);

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

pub(crate) struct SupervisorTask {
    id: SessionIdProducer,
    transport: TransportLayer,

    active: Arc<Semaphore>,
}

impl SupervisorTask {
    async fn run(self, cancel: CancellationToken) -> Result<(), SessionError> {
        let mut listen = self.transport.listen().await.change_context(SessionError)?;

        loop {
            // first try to acquire a permit, if we can't, we can't accept new connections,
            // then we try to accept a new connection, this way we're able to still apply
            // backpressure
            let next = Arc::clone(&self.active).acquire_owned().and_then(|permit| {
                listen
                    .next()
                    .map(|connection| connection.map(|c| (permit, c)))
                    .map(Ok)
            });

            let connection = select! {
                connection = next => connection,
                () = cancel.cancelled() => {
                    break;
                }
            };

            match connection {
                Ok(Some((permit, (id, sink, stream)))) => {
                    let cancel = cancel.child_token();

                    todo!()
                }
                Ok(None) => {
                    break;
                }
                Err(_) => {
                    // semaphore has been closed, this means we can no longer accept new connections
                    break;
                }
            }
        }

        Ok(())
    }
}

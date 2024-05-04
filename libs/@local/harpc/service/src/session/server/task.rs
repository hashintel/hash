use alloc::sync::Arc;
use core::any::{Any, TypeId};
use std::{collections::HashMap, io};

use error_stack::{Result, ResultExt};
use futures::{Sink, Stream, StreamExt};
use harpc_wire_protocol::{
    request::{id::RequestId, Request},
    response::Response,
};
use libp2p::PeerId;
use tokio::{pin, select};
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

struct ActiveConnectionCount(Arc<()>);

impl ActiveConnectionCount {
    fn new() -> Self {
        Self(Arc::new(()))
    }

    fn connections(&self) -> usize {
        Arc::strong_count(&self.0)
    }
}

pub(crate) enum Command {}

struct Transaction<T, U> {
    peer: PeerId,
    id: RequestId,
    session: Session,

    sink: T,   // Sink<Bytes>
    stream: U, // Stream<Bytes>
}

pub(crate) struct ConnectionTask<T, U> {
    id: SessionId,
    active: ActiveConnectionCount,

    peer: PeerId,
    sink: T,
    stream: U,
}

impl<T, U> ConnectionTask<T, U>
where
    T: Sink<Response>,
    U: Stream<Item = Result<Request, io::Error>>,
{
    fn handle_request(request: Request) {
        // check if this is a `Begin` request, in that case we need to create a new transaction,
        // otherwise, this is already a transaction and we need to forward it, or log out if it is a
        // rogue request
        // at the end of a transaction we close the transaction

        // these transactions then need to be propagated to the main session layer via an mpsc
        // channel, which drops a transaction if there's too many.

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
}

impl SupervisorTask {
    async fn run(self, cancel: CancellationToken) -> Result<(), SessionError> {
        let mut listen = self.transport.listen().await.change_context(SessionError)?;

        loop {
            select! {
                Some(connection) = listen.next() => {
                    // spawn a task for every connection that handles the splitting of things

                    // todo: check connection limit, if more just respond with a `ConnectionLimitReached` error code
                },
                () = cancel.cancelled() => {
                    break;
                }
            }
        }

        Ok(())
    }
}

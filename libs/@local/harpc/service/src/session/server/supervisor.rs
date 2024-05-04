use alloc::sync::Arc;
use core::any::{Any, TypeId};
use std::{collections::HashMap, io};

use bytes::{Bytes, BytesMut};
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

pub(crate) enum Command {}

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

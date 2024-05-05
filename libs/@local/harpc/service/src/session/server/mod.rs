// What does the session do? It creates a new `Session`
// * (server) object for every new requestid on a connection and returns a `Transaction` object,
//   that has an `AsyncRead` + `AsyncWrite`, as well as `Session`, those are then bunched up
//   together into packets, once all connections are dropped, the session object is dropped as well.
// * (server) each connection a new `RequestId` on a request and is handled transparently
// * (server) there is a maximum number of connections that can be open at once, once the limit is
//   reached new connections are denied.
// * (server) connections are dropped if a certain timeout is reached in `AsyncRead` or `AsyncWrite`
//   calls.

mod connection;
mod session_id;
mod supervisor;
mod transaction;

use alloc::sync::Arc;

use futures::Stream;
use tokio::sync::{mpsc, Semaphore};
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::CancellationToken;

use self::{session_id::SessionIdProducer, supervisor::SupervisorTask, transaction::Transaction};
use crate::transport::TransportLayer;

const TRANSACTION_BUFFER_SIZE: usize = 32;
const CONNECTION_LIMIT: usize = 32;

pub struct SessionLayer {
    // TODO: IPC
    transport: TransportLayer,
}

impl SessionLayer {
    pub fn listen(self) -> impl Stream<Item = Transaction> + Send + Sync + 'static {
        let (tx, rx) = mpsc::channel(TRANSACTION_BUFFER_SIZE);

        let task = SupervisorTask {
            id: SessionIdProducer::new(),
            transport: self.transport,
            active: Arc::new(Semaphore::new(CONNECTION_LIMIT)),
            transactions: tx,
        };

        let cancel = CancellationToken::new();

        tokio::spawn(task.run(cancel.clone()));

        // TODO: cancel on drop

        ReceiverStream::new(rx)
    }
}

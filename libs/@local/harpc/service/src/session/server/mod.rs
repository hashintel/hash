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
mod task;
mod transaction;
mod write;

use alloc::sync::Arc;

use futures::Stream;
use tokio::sync::{mpsc, Semaphore};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

use self::{session_id::SessionIdProducer, task::Task, transaction::Transaction};
use crate::{codec::ErrorEncoder, stream::ReceiverStreamCancel, transport::TransportLayer};

const TRANSACTION_BUFFER_SIZE: usize = 32;
const CONCURRENT_CONNECTION_LIMIT: usize = 256;

// TODO: encoding and decoding layer(?)
// TODO: timeout layer - needs encoding layer (for error handling), and IPC to cancel a specific
// request in a session

pub struct SessionLayer<E> {
    // TODO: IPC (do we need it tho?)
    // TODO: notification channel tho!
    transport: TransportLayer,
    encoder: Arc<E>,

    tasks: TaskTracker,
}

impl<E> SessionLayer<E>
where
    E: ErrorEncoder + Send + Sync + 'static,
{
    pub fn new(transport: TransportLayer, encoder: E) -> Self {
        let tasks = transport.tasks().clone();

        Self {
            transport,
            encoder: Arc::new(encoder),
            tasks,
        }
    }

    #[must_use]
    pub const fn tasks(&self) -> &TaskTracker {
        &self.tasks
    }

    pub fn listen(self) -> impl Stream<Item = Transaction> + Send + Sync + 'static {
        let (tx, rx) = mpsc::channel(TRANSACTION_BUFFER_SIZE);

        let task = Task {
            id: SessionIdProducer::new(),
            transport: self.transport,
            active: Arc::new(Semaphore::new(CONCURRENT_CONNECTION_LIMIT)),
            transactions: tx,
            encoder: self.encoder,
        };

        let cancel = CancellationToken::new();

        self.tasks
            .spawn(task.run(self.tasks.clone(), cancel.clone()));

        ReceiverStreamCancel::new(rx, cancel.drop_guard())
    }
}

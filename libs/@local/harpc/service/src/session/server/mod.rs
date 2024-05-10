// What does the session do? It creates a new `Session`
// * (server) object for every new requestid on a connection and returns a `Transaction` object,
//   that has an `AsyncRead` + `AsyncWrite`, as well as `Session`, those are then bunched up
//   together into packets, once all connections are dropped, the session object is dropped as well.
// * (server) each connection a new `RequestId` on a request and is handled transparently
// * (server) there is a maximum number of connections that can be open at once, once the limit is
//   reached new connections are denied.
// * (server) connections are dropped if a certain timeout is reached in `AsyncRead` or `AsyncWrite`
//   calls.

mod config;
mod connection;
mod session_id;
mod task;
mod transaction;
mod write;

use alloc::sync::Arc;

use error_stack::{Result, ResultExt};
use futures::Stream;
use libp2p::Multiaddr;
use tokio::sync::{mpsc, Semaphore};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

pub use self::config::SessionConfig;
use self::{session_id::SessionIdProducer, task::Task, transaction::Transaction};
use super::error::SessionError;
use crate::{codec::ErrorEncoder, stream::ReceiverStreamCancel, transport::TransportLayer};

// TODO: encoding and decoding layer(?)
// TODO: timeout layer - needs encoding layer (for error handling), and IPC to cancel a specific
// request in a session

/// Session Layer
///
/// The session layer is responsible for accepting incoming connections, and splitting them up into
/// dedicated sessions, these sessions are then used to form transactions.
pub struct SessionLayer<E> {
    config: SessionConfig,
    encoder: Arc<E>,

    // TODO: IPC (do we need it tho?)
    // TODO: notification channel tho!
    transport: TransportLayer,

    tasks: TaskTracker,
}

impl<E> SessionLayer<E>
where
    E: ErrorEncoder + Send + Sync + 'static,
{
    pub fn new(config: SessionConfig, transport: TransportLayer, encoder: E) -> Self {
        let tasks = transport.tasks().clone();

        Self {
            config,
            encoder: Arc::new(encoder),

            transport,

            tasks,
        }
    }

    #[must_use]
    pub const fn tasks(&self) -> &TaskTracker {
        &self.tasks
    }

    /// Listen for incoming connections on the given address.
    ///
    /// # Errors
    ///
    /// Returns an error if the transport layer fails to listen on the given address.
    pub async fn listen(
        self,
        address: Multiaddr,
    ) -> Result<impl Stream<Item = Transaction> + Send + Sync + 'static, SessionError> {
        self.transport
            .listen_on(address)
            .await
            .change_context(SessionError)?;

        let (tx, rx) = mpsc::channel(self.config.transaction_buffer_size);

        let task = Task {
            id: SessionIdProducer::new(),
            transport: self.transport,
            config: self.config,
            active: Arc::new(Semaphore::new(self.config.concurrent_connection_limit)),
            transactions: tx,
            encoder: self.encoder,
        };

        let cancel = CancellationToken::new();

        self.tasks
            .spawn(task.run(self.tasks.clone(), cancel.clone()));

        Ok(ReceiverStreamCancel::new(rx, cancel.drop_guard()))
    }
}

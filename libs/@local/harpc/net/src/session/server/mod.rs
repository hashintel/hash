mod config;
mod connection;
pub(crate) mod session_id;
mod task;
#[cfg(test)]
pub(crate) mod test;
pub mod transaction;

use alloc::sync::Arc;
use core::{
    pin::Pin,
    task::{ready, Context, Poll},
};

use error_stack::{Result, ResultExt};
use futures::{stream::FusedStream, Stream};
use libp2p::Multiaddr;
use tokio::sync::{broadcast, mpsc, Semaphore};
use tokio_util::task::TaskTracker;

pub use self::{config::SessionConfig, session_id::SessionId, transaction::Transaction};
use self::{session_id::SessionIdProducer, task::Task};
use super::error::SessionError;
use crate::{codec::ErrorEncoder, transport::TransportLayer};

// TODO: encoding and decoding layer(?)
// TODO: timeout layer - needs encoding layer (for error handling), and IPC to cancel a specific
// request in a session

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum SessionEvent {
    SessionDropped { id: SessionId },
}

pub struct ListenStream {
    inner: mpsc::Receiver<Transaction>,

    is_finished: bool,
}

impl ListenStream {
    const fn new(inner: mpsc::Receiver<Transaction>) -> Self {
        Self {
            inner,
            is_finished: false,
        }
    }
}

impl Stream for ListenStream {
    type Item = Transaction;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // we don't need to poll again, if we know that the stream has finished
        if self.is_finished {
            return Poll::Ready(None);
        }

        let value = ready!(self.inner.poll_recv(cx));

        if value.is_none() {
            // if the inner poll returns `Poll::Ready(None)` this indicates that the receiver has
            // been closed *and* all messages before closing have been received.
            // A tokio mpsc channel cannot be re-opened, so we can safely assume that the stream
            // has finished.
            self.is_finished = true;
        }

        Poll::Ready(value)
    }
}

impl FusedStream for ListenStream {
    fn is_terminated(&self) -> bool {
        self.is_finished
    }
}

/// Session Layer
///
/// The session layer is responsible for accepting incoming connections, and splitting them up into
/// dedicated sessions, these sessions are then used to form transactions.
pub struct SessionLayer<E> {
    config: SessionConfig,
    encoder: E,

    events: broadcast::Sender<SessionEvent>,

    transport: TransportLayer,

    tasks: TaskTracker,
}

impl<E> SessionLayer<E>
where
    E: ErrorEncoder + Clone + Send + Sync + 'static,
{
    pub fn new(config: SessionConfig, transport: TransportLayer, encoder: E) -> Self {
        let tasks = transport.tasks().clone();

        let (events, _) = broadcast::channel(config.event_buffer_size.get());

        Self {
            config,
            encoder,

            events,

            transport,

            tasks,
        }
    }

    #[must_use]
    pub const fn tasks(&self) -> &TaskTracker {
        &self.tasks
    }

    #[must_use]
    pub fn events(&self) -> broadcast::Receiver<SessionEvent> {
        self.events.subscribe()
    }

    #[must_use]
    pub const fn transport(&self) -> &TransportLayer {
        &self.transport
    }

    /// Listen for incoming connections on the given address.
    ///
    /// # Errors
    ///
    /// Returns an error if the transport layer fails to listen on the given address.
    pub async fn listen(self, address: Multiaddr) -> Result<ListenStream, SessionError> {
        self.transport
            .listen_on(address)
            .await
            .change_context(SessionError)?;

        let (output, rx) = mpsc::channel(self.config.transaction_buffer_size.get());

        let cancel = self.transport.cancellation_token();
        let listen = self.transport.listen().await.change_context(SessionError)?;

        let task = Task {
            id: SessionIdProducer::new(),
            config: self.config,
            active: Arc::new(Semaphore::new(
                self.config.concurrent_connection_limit.as_usize(),
            )),
            output,
            events: self.events.clone(),
            encoder: self.encoder,
            _transport: self.transport,
        };

        self.tasks
            .spawn(task.run(listen, self.tasks.clone(), cancel));

        Ok(ListenStream::new(rx))
    }
}

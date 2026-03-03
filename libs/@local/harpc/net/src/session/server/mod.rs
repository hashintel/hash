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
    task::{Context, Poll, ready},
};

use error_stack::{Report, ResultExt as _};
use futures::{Stream, stream::FusedStream};
use libp2p::Multiaddr;
use tokio::sync::{Semaphore, broadcast, mpsc};
use tokio_util::task::TaskTracker;

pub use self::{config::SessionConfig, session_id::SessionId, transaction::Transaction};
use self::{session_id::SessionIdProducer, task::Task};
use super::error::SessionError;
use crate::transport::TransportLayer;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum SessionEvent {
    SessionDropped { id: SessionId },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum SessionEventError {
    /// The receiving stream lagged too far behind. Attempting to receive again will
    /// return the oldest message still retained by the underlying broadcast channel.
    ///
    /// Includes the number of skipped messages.
    #[error("The receiving stream lagged to far behind, and {amount} messages were dropped.")]
    Lagged { amount: u64 },
}

impl From<!> for SessionEventError {
    fn from(never: !) -> Self {
        never
    }
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

pin_project_lite::pin_project! {
    // Wrapper around a broadcast, allowing for a more controlled API, and our own error, making the underlying broadcast
    // channel an implementation detail.
    pub struct EventStream {
        #[pin]
        inner: tokio_stream::wrappers::BroadcastStream<SessionEvent>,

        is_finished: bool,
    }
}

impl Stream for EventStream {
    type Item = Result<SessionEvent, SessionEventError>;

    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.project();

        if *this.is_finished {
            return Poll::Ready(None);
        }

        // we're purposefully not implementing `From<BroadcastStreamRecvError>` as that would
        // require us to mark `tokio_stream` as a public dependency, something we want to avoid with
        // this specifically.
        match ready!(this.inner.poll_next(cx)) {
            Some(Ok(event)) => Poll::Ready(Some(Ok(event))),
            Some(Err(tokio_stream::wrappers::errors::BroadcastStreamRecvError::Lagged(amount))) => {
                Poll::Ready(Some(Err(SessionEventError::Lagged { amount })))
            }
            None => {
                *this.is_finished = true;

                Poll::Ready(None)
            }
        }
    }
}

// there is no chance this stream will ever be picked-up again, because receivers are only created
// from this one sender, and only expose a stream API, and will be alive as long as the task is
// alive, once all senders are dropped, it indicates that the task has completely shutdown.
impl FusedStream for EventStream {
    fn is_terminated(&self) -> bool {
        self.is_finished
    }
}

/// Session Layer.
///
/// The session layer is responsible for accepting incoming connections, and splitting them up into
/// dedicated sessions, these sessions are then used to form transactions.
pub struct SessionLayer {
    config: SessionConfig,

    events: broadcast::Sender<SessionEvent>,

    transport: TransportLayer,

    tasks: TaskTracker,
}

impl SessionLayer {
    #[must_use]
    pub fn new(config: SessionConfig, transport: TransportLayer) -> Self {
        let tasks = transport.tasks().clone();

        let (events, _) = broadcast::channel(config.event_buffer_size.get());

        Self {
            config,

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
    pub fn events(&self) -> EventStream {
        let receiver = self.events.subscribe();

        EventStream {
            inner: receiver.into(),
            is_finished: false,
        }
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
    pub async fn listen(self, address: Multiaddr) -> Result<ListenStream, Report<SessionError>> {
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

            _transport: self.transport,
        };

        self.tasks
            .spawn(task.run(listen, self.tasks.clone(), cancel));

        Ok(ListenStream::new(rx))
    }
}

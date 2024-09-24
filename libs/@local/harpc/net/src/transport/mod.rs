pub(crate) mod behaviour;
pub mod client;
mod config;
pub mod connection;
pub mod error;
mod ipc;
mod server;
mod task;
#[cfg(test)]
pub(crate) mod test;

use alloc::sync::Arc;

use error_stack::{Result, ResultExt};
use futures::stream::StreamExt;
use libp2p::{Multiaddr, PeerId, StreamProtocol, core::transport::ListenerId, metrics};
use tokio::io::BufStream;
use tokio_util::{
    codec::Framed, compat::FuturesAsyncReadCompatExt, sync::CancellationToken, task::TaskTracker,
};

use self::{
    client::ClientCodec,
    connection::{IncomingConnections, OutgoingConnection},
    error::TransportError,
    task::TransportTask,
};
pub use self::{
    config::{SwarmConfig, TransportConfig, YamuxConfig},
    ipc::TransportLayerIpc,
};

const PROTOCOL_NAME: StreamProtocol = StreamProtocol::new("/harpc/1.0.0");

pub trait Transport = libp2p::Transport<
        Output: futures::AsyncWrite + futures::AsyncRead + Send + Unpin,
        ListenerUpgrade: Send,
        Dial: Send,
        Error: Send + Sync,
    > + Send
    + Unpin
    + 'static;

pub struct TransportLayer {
    id: PeerId,
    ipc: TransportLayerIpc,

    registry: Arc<metrics::Registry>,

    tasks: TaskTracker,
    cancel: CancellationToken,
    cancel_task: CancellationToken,
}

impl TransportLayer {
    /// Create a new transport layer.
    ///
    /// This will create a new task, which will drive the internal state of the transport layer.
    ///
    /// # Errors
    ///
    /// Returns an error if the task fails to start.
    pub fn start(
        config: TransportConfig,
        transport: impl Transport,
        cancel: CancellationToken,
    ) -> Result<Self, TransportError> {
        let task = TransportTask::new(config, transport)?;
        let id = task.peer_id();
        let ipc = task.ipc();
        let registry = task.registry();

        let cancel_task = cancel.child_token();

        let tasks = TaskTracker::new();
        tasks.spawn(task.run(cancel_task.clone()));

        Ok(Self {
            id,
            ipc,

            registry,

            tasks,
            cancel,
            cancel_task,
        })
    }

    pub(crate) fn cancellation_token(&self) -> CancellationToken {
        self.cancel.clone()
    }

    // Only used for tests, to emulate crash of the underlying swarm task.
    #[cfg(test)]
    pub(crate) fn cancellation_token_task(&self) -> CancellationToken {
        self.cancel_task.clone()
    }

    #[must_use]
    pub const fn tasks(&self) -> &TaskTracker {
        &self.tasks
    }

    #[must_use]
    pub const fn ipc(&self) -> &TransportLayerIpc {
        &self.ipc
    }

    #[must_use]
    pub const fn peer_id(&self) -> PeerId {
        self.id
    }

    /// Lookup a peer by address.
    ///
    /// If the peer has been dialed before, the peer won't be dialed again and the known peer id
    /// will be returned.
    ///
    /// # Errors
    ///
    /// If the background task cannot be reached, crashes while processing the request, or is unable
    /// to dial the address provided.
    pub async fn lookup_peer(&self, address: Multiaddr) -> Result<PeerId, TransportError> {
        self.ipc
            .lookup_peer(address)
            .await
            .change_context(TransportError::Ipc)
    }

    /// Get the external addresses of the transport layer.
    ///
    /// # Errors
    ///
    /// If the background task cannot be reached or crashes while processing the request.
    pub async fn external_addresses(&self) -> Result<Vec<Multiaddr>, TransportError> {
        self.ipc
            .external_addresses()
            .await
            .change_context(TransportError::Ipc)
    }

    #[must_use]
    pub fn registry(&self) -> &metrics::Registry {
        &self.registry
    }

    /// Listen on an address.
    ///
    /// # Errors
    ///
    /// If the background task cannot be reached, crashes while processing the request, or the
    /// multiaddr is not supported by the transport.
    pub async fn listen_on(&self, address: Multiaddr) -> Result<ListenerId, TransportError> {
        self.ipc
            .listen_on(address)
            .await
            .change_context(TransportError::Ipc)
    }

    /// Listen for incoming connections.
    ///
    /// This will return a stream of streams, where each stream represents a connection to a peer.
    ///
    /// # Errors
    ///
    /// If the background task cannot be reached, crashes while processing the request or there is
    /// already an active listener.
    pub async fn listen(&self) -> Result<IncomingConnections, TransportError> {
        let mut control = self
            .ipc
            .control()
            .await
            .change_context(TransportError::Ipc)?;

        let incoming = control
            .accept(PROTOCOL_NAME)
            .change_context(TransportError::AlreadyListening)?;

        Ok(IncomingConnections::new(incoming))
    }

    /// Dial a peer.
    ///
    /// This will return a sink and stream, where the sink is used to send requests to the peer and
    /// the stream is used to receive responses from the peer.
    ///
    /// # Errors
    ///
    /// If the background task cannot be reached, crashes while processing the request or the remote
    /// peer does not support the protocol.
    pub async fn dial(&self, peer: PeerId) -> Result<OutgoingConnection, TransportError> {
        let mut control = self
            .ipc
            .control()
            .await
            .change_context(TransportError::Ipc)?;

        let stream = control
            .open_stream(peer, PROTOCOL_NAME)
            .await
            .change_context(TransportError::OpenStream { peer_id: peer })?;

        let stream = stream.compat();
        let stream = BufStream::new(stream);
        let stream = Framed::new(stream, ClientCodec::new());

        let (sink, stream) = stream.split();

        Ok(OutgoingConnection {
            peer_id: peer,
            sink,
            stream,
        })
    }
}

impl Drop for TransportLayer {
    fn drop(&mut self) {
        // always cancel the task when the transport layer is dropped
        // otherwise the once started swarm will keep running
        self.cancel_task.cancel();
    }
}

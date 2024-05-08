// TODO: tests about the behaviour of tasks on closure of different streams (such as a disconnect)
mod behaviour;
mod client;
mod error;
mod ipc;
mod server;
mod task;

use core::fmt::Debug;
use std::io;

use error_stack::{Result, ResultExt};
use futures::{prelude::stream::StreamExt, Sink, Stream};
use harpc_wire_protocol::{request::Request, response::Response};
use libp2p::{core::transport::ListenerId, metrics, Multiaddr, PeerId, StreamProtocol};
use tokio::io::BufStream;
use tokio_util::{
    codec::Framed, compat::FuturesAsyncReadCompatExt, sync::CancellationToken, task::TaskTracker,
};

use self::{
    client::ClientCodec,
    error::{OpenStreamError, TransportError},
    ipc::TransportLayerIpc,
    server::ServerCodec,
    task::Task,
};
use crate::config::Config;

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
    ipc: TransportLayerIpc,

    tasks: TaskTracker,
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
        config: Config,
        transport: impl Transport,
        cancel: CancellationToken,
    ) -> Result<Self, TransportError> {
        let task = Task::new(config, transport)?;
        let ipc = task.ipc();

        let tasks = TaskTracker::new();
        tasks.spawn(task.run(cancel));

        Ok(Self { ipc, tasks })
    }

    #[must_use]
    pub const fn tasks(&self) -> &TaskTracker {
        &self.tasks
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
        self.ipc.lookup_peer(address).await
    }

    /// Metrics about the transport layer.
    ///
    /// # Errors
    ///
    /// If the background task cannot be reached or crashes while processing the request.
    pub async fn metrics(&self) -> Result<metrics::Metrics, TransportError> {
        self.ipc.metrics().await
    }

    /// Listen on an address.
    ///
    /// # Errors
    ///
    /// If the background task cannot be reached, crashes while processing the request, or the
    /// multiaddr is not supported by the transport.
    pub async fn listen_on(&self, address: Multiaddr) -> Result<ListenerId, TransportError> {
        self.ipc.listen_on(address).await
    }

    /// Listen for incoming connections.
    ///
    /// This will return a stream of streams, where each stream represents a connection to a peer.
    ///
    /// # Errors
    ///
    /// If the background task cannot be reached, crashes while processing the request or there is
    /// already an active listener.
    pub async fn listen(
        &self,
    ) -> Result<
        impl futures::Stream<
            Item = (
                PeerId,
                impl Sink<Response, Error: Debug + Send> + Send + Sync + 'static,
                impl Stream<Item = Result<Request, io::Error>> + Send + Sync + 'static,
            ),
        > + Send
        + Sync
        + 'static,
        TransportError,
    > {
        let mut control = self.ipc.control().await?;

        let incoming = control
            .accept(PROTOCOL_NAME)
            .change_context(TransportError)?;

        Ok(incoming.map(|(peer, stream)| {
            let stream = stream.compat();
            let stream = BufStream::new(stream);
            let stream = Framed::new(stream, ServerCodec::new());

            let (sink, stream) = stream.split();

            (peer, sink, stream)
        }))
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
    pub async fn dial(
        &self,
        peer: PeerId,
    ) -> Result<
        (
            impl Sink<Request, Error: Send> + Send + Sync + 'static,
            impl Stream<Item = Result<Response, io::Error>> + Send + Sync + 'static,
        ),
        TransportError,
    > {
        let mut control = self.ipc.control().await?;

        let stream = control
            .open_stream(peer, PROTOCOL_NAME)
            .await
            .map_err(OpenStreamError::new)
            .change_context(TransportError)?;

        let stream = stream.compat();
        let stream = BufStream::new(stream);
        let stream = Framed::new(stream, ClientCodec::new());

        let (sink, stream) = stream.split();

        Ok((sink, stream))
    }
}

#[cfg(test)]
pub(crate) mod test {
    use core::{
        iter,
        sync::atomic::{AtomicU64, Ordering},
    };

    use libp2p::{core::transport::MemoryTransport, multiaddr::Protocol};
    use tokio_util::sync::CancellationToken;

    use super::TransportLayer;
    use crate::config::Config;

    pub(crate) fn address() -> libp2p::Multiaddr {
        // to allow for unique port numbers, even if the tests are run concurrently we use an atomic
        static CHANNEL: AtomicU64 = AtomicU64::new(0);

        // `SeqCst` just to be on the safe side.
        let id = CHANNEL.fetch_add(1, Ordering::SeqCst);

        iter::once(Protocol::Memory(id)).collect()
    }

    pub(crate) fn layer() -> (TransportLayer, impl Drop) {
        let transport = MemoryTransport::default();
        let config = Config::default();
        let cancel = CancellationToken::new();

        let layer = TransportLayer::start(config, transport, cancel.clone())
            .expect("should be able to create swarm");

        (layer, cancel.drop_guard())
    }

    #[test_log::test(tokio::test)]
    async fn lookup_peer() {
        let (server, _guard_server) = layer();
        let (client, _guard_client) = layer();

        let address = address();

        server
            .listen_on(address.clone())
            .await
            .expect("memory transport should be able to listen on memory address");

        let peer_id = client
            .lookup_peer(address)
            .await
            .expect("should be able to lookup peer");

        // TODO: peer id should be the same as the one returned by the server
    }

    #[tokio::test]
    async fn metrics() {
        // I think I misunderstood the purpose of metrics?! YEP I totally did. Metrics is not the
        // output, it's rather the input used to record metrics.
        let (layer, _guard) = layer();

        let metrics = layer
            .metrics()
            .await
            .expect("should be able to provide metrics");
    }

    #[tokio::test]
    async fn listen_on() {
        let (layer, _guard) = layer();

        layer
            .listen_on(address())
            .await
            .expect("memory transport should be able to listen on memory address");
    }
}

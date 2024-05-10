// TODO: tests about the behaviour of tasks on closure of different streams (such as a disconnect)
mod behaviour;
mod client;
mod error;
mod ipc;
mod server;
mod task;

use alloc::sync::Arc;
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
    id: PeerId,
    ipc: TransportLayerIpc,

    registry: Arc<metrics::Registry>,

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
        let id = task.peer_id();
        let ipc = task.ipc();
        let registry = task.registry();

        let tasks = TaskTracker::new();
        tasks.spawn(task.run(cancel));

        Ok(Self {
            id,
            ipc,

            registry,

            tasks,
        })
    }

    #[must_use]
    pub const fn tasks(&self) -> &TaskTracker {
        &self.tasks
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
        self.ipc.lookup_peer(address).await
    }

    /// Get the external addresses of the transport layer.
    ///
    /// # Errors
    ///
    /// If the background task cannot be reached or crashes while processing the request.
    pub async fn external_addresses(&self) -> Result<Vec<Multiaddr>, TransportError> {
        self.ipc.external_addresses().await
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
            impl Sink<Request, Error: Debug + Send> + Send + Sync + 'static,
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
        net::Ipv4Addr,
        sync::atomic::{AtomicU64, Ordering},
        time::Duration,
    };
    use std::assert_matches::assert_matches;

    use futures::{sink, SinkExt, StreamExt};
    use harpc_wire_protocol::{
        flags::BitFlagsOp,
        payload::Payload,
        protocol::{Protocol, ProtocolVersion},
        request::{
            body::RequestBody, flags::RequestFlags, frame::RequestFrame, header::RequestHeader,
            id::RequestId, Request,
        },
        response::{
            body::ResponseBody, flags::ResponseFlags, frame::ResponseFrame, header::ResponseHeader,
            Response,
        },
    };
    use libp2p::{
        core::transport::MemoryTransport, multiaddr, swarm::DialError, tcp, Multiaddr,
        TransportError,
    };
    use tokio_util::sync::CancellationToken;

    use super::TransportLayer;
    use crate::config::Config;

    static EXAMPLE_REQUEST: Request = Request {
        header: RequestHeader {
            protocol: Protocol {
                version: ProtocolVersion::V1,
            },
            request_id: RequestId::new_unchecked(0),
            flags: RequestFlags::EMPTY,
        },
        body: RequestBody::Frame(RequestFrame {
            payload: Payload::from_static(&[0x00_u8]),
        }),
    };

    static EXAMPLE_RESPONSE: Response = Response {
        header: ResponseHeader {
            protocol: Protocol {
                version: ProtocolVersion::V1,
            },
            request_id: RequestId::new_unchecked(0),
            flags: ResponseFlags::EMPTY,
        },
        body: ResponseBody::Frame(ResponseFrame {
            payload: Payload::from_static(&[0x00_u8]),
        }),
    };

    const DEFAULT_DELAY: Duration = Duration::from_millis(10);

    pub(crate) fn address() -> libp2p::Multiaddr {
        // to allow for unique port numbers, even if the tests are run concurrently we use an atomic
        // we're not starting at `0` as `0` indicates that the port should be chosen by the
        // underlying transport.
        static CHANNEL: AtomicU64 = AtomicU64::new(1);

        // `SeqCst` just to be on the safe side.
        let id = CHANNEL.fetch_add(1, Ordering::SeqCst);

        iter::once(multiaddr::Protocol::Memory(id)).collect()
    }

    pub(crate) fn layer() -> (TransportLayer, impl Drop) {
        let transport = MemoryTransport::default();
        let config = Config::default();
        let cancel = CancellationToken::new();

        let layer = TransportLayer::start(config, transport, cancel.clone())
            .expect("should be able to create swarm");

        (layer, cancel.drop_guard())
    }

    #[tokio::test]
    async fn lookup_peer() {
        let (server, _guard_server) = layer();
        let (client, _guard_client) = layer();

        let address = address();

        server
            .listen_on(address.clone())
            .await
            .expect("memory transport should be able to listen on memory address");

        // wait for `DEFAULT_DELAY` to make sure the server is ready
        // this is more than strictly necessary, but it's better to be safe
        tokio::time::sleep(DEFAULT_DELAY).await;

        let peer_id = client
            .lookup_peer(address)
            .await
            .expect("should be able to lookup peer");

        assert_eq!(peer_id, server.peer_id());
    }

    #[tokio::test]
    async fn lookup_peer_does_not_exist() {
        let (client, _guard_client) = layer();

        let address = address();

        let error = client
            .lookup_peer(address)
            .await
            .expect_err("shouldn't be accessible");

        let dial = error
            .downcast_ref::<DialError>()
            .expect("should be dial error");

        assert_matches!(dial, DialError::Transport(_));
    }

    #[tokio::test]
    async fn lookup_peer_unsupported_protocol() {
        let (client, _guard_client) = layer();

        let address: Multiaddr = [
            multiaddr::Protocol::Ip4(Ipv4Addr::LOCALHOST),
            multiaddr::Protocol::Tcp(8080),
        ]
        .into_iter()
        .collect();

        let error = client
            .lookup_peer(address.clone())
            .await
            .expect_err("shouldn't be accessible");

        let dial = error
            .downcast_ref::<DialError>()
            .expect("should be dial error");

        let DialError::Transport(transport) = dial else {
            panic!("should be transport error");
        };

        assert_eq!(transport.len(), 1);

        let (dialed_address, error) = &transport[0];

        assert_eq!(*dialed_address, address);
        assert_matches!(error, TransportError::MultiaddrNotSupported(_));
    }

    #[tokio::test]
    async fn establish_connection() {
        let (server, _guard_server) = layer();
        let (client, _guard_client) = layer();

        let address = address();

        server
            .listen_on(address.clone())
            .await
            .expect("memory transport should be able to listen on memory address");

        let server_id = server.peer_id();

        let mut stream = server.listen().await.expect("should be able to listen");

        tokio::spawn(async move {
            while let Some((_, sink, stream)) = stream.next().await {
                // we just check if we establish connection, so we don't need to do anything
                // with the connection
                drop(sink);
                let _ = stream.map(Ok).forward(sink::drain()).await;
            }
        });

        // wait for `DEFAULT_DELAY` to make sure the server is ready
        // this is more than strictly necessary, but it's better to be safe
        tokio::time::sleep(DEFAULT_DELAY).await;

        client
            .lookup_peer(address)
            .await
            .expect("should be able to lookup peer");

        let (sink, stream) = client
            .dial(server_id)
            .await
            .expect("should be able to dial");

        // we don't need to do anything with the connection, so we just drop the sink and stream
        drop(sink);
        drop(stream);
    }

    #[tokio::test]
    async fn send_request() {
        let (server, _guard_server) = layer();
        let (client, _guard_client) = layer();

        let address = address();

        server
            .listen_on(address.clone())
            .await
            .expect("memory transport should be able to listen on memory address");

        let server_id = server.peer_id();

        let mut stream = server.listen().await.expect("should be able to listen");

        let handle = tokio::spawn(async move {
            let Some((_, sink, mut stream)) = stream.next().await else {
                panic!("should receive connection");
            };

            // we just check if we establish connection, so we don't need to do anything with
            // the connection
            drop(sink);

            let Some(request) = stream.next().await else {
                panic!("should receive request");
            };

            let request = request.expect("should be able to receive request");

            assert_eq!(&request, &EXAMPLE_REQUEST);
        });

        // wait for `DEFAULT_DELAY` to make sure the server is ready
        // this is more than strictly necessary, but it's better to be safe
        tokio::time::sleep(DEFAULT_DELAY).await;

        client
            .lookup_peer(address)
            .await
            .expect("should be able to lookup peer");

        let (mut sink, stream) = client
            .dial(server_id)
            .await
            .expect("should be able to dial");

        drop(stream);

        sink.send(EXAMPLE_REQUEST.clone())
            .await
            .expect("should be able to send request");

        tokio::time::timeout(Duration::from_secs(1), handle)
            .await
            .expect("should be notified")
            .expect("should not have panicked during handling");
    }

    #[tokio::test]
    async fn send_request_response() {
        let (server, _guard_server) = layer();
        let (client, _guard_client) = layer();

        let address = address();

        server
            .listen_on(address.clone())
            .await
            .expect("memory transport should be able to listen on memory address");

        let server_id = server.peer_id();

        let mut stream = server.listen().await.expect("should be able to listen");

        let handle = tokio::spawn(async move {
            let Some((_, mut sink, mut stream)) = stream.next().await else {
                panic!("should receive connection");
            };

            let Some(request) = stream.next().await else {
                panic!("should receive request");
            };

            let request = request.expect("should be able to receive request");

            assert_eq!(request, EXAMPLE_REQUEST);

            sink.send(EXAMPLE_RESPONSE.clone())
                .await
                .expect("should be able to send response");
        });

        // wait for `DEFAULT_DELAY` to make sure the server is ready
        // this is more than strictly necessary, but it's better to be safe
        tokio::time::sleep(DEFAULT_DELAY).await;

        client
            .lookup_peer(address)
            .await
            .expect("should be able to lookup peer");

        let (mut sink, mut stream) = client
            .dial(server_id)
            .await
            .expect("should be able to dial");

        sink.send(EXAMPLE_REQUEST.clone())
            .await
            .expect("should be able to send request");

        let response = stream
            .next()
            .await
            .expect("should receive response")
            .expect("should be well-formed response");

        assert_eq!(response, EXAMPLE_RESPONSE);

        tokio::time::timeout(Duration::from_secs(1), handle)
            .await
            .expect("should have finished before deadline")
            .expect("should not have panicked during handling");
    }

    // TODO: send multiple packets

    #[tokio::test]
    async fn establish_connection_server_offline() {
        let (server, guard_server) = layer();
        let (client, _guard_client) = layer();

        let address = address();

        server
            .listen_on(address.clone())
            .await
            .expect("memory transport should be able to listen on memory address");

        // wait for `DEFAULT_DELAY` to make sure the server is ready
        // this is more than strictly necessary, but it's better to be safe
        tokio::time::sleep(DEFAULT_DELAY).await;

        let peer_id = server.peer_id();

        client
            .lookup_peer(address)
            .await
            .expect("should be able to lookup peer");

        // now the server is "crashed"
        drop(guard_server);
        drop(server);

        assert!(client.dial(peer_id).await.is_err());
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

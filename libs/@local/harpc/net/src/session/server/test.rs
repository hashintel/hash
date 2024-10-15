#![expect(clippy::significant_drop_tightening, reason = "test code")]
use alloc::sync::Arc;
use core::{
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};
use std::io::{self, ErrorKind};

use bytes::{Bytes, BytesMut};
use error_stack::{Report, ResultExt};
use futures::{SinkExt, Stream, StreamExt};
use harpc_codec::json::JsonCodec;
use harpc_types::{
    procedure::{ProcedureDescriptor, ProcedureId},
    service::{ServiceDescriptor, ServiceId},
    version::Version,
};
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    payload::Payload,
    protocol::{Protocol, ProtocolVersion},
    request::{
        Request,
        begin::RequestBegin,
        body::RequestBody,
        flags::{RequestFlag, RequestFlags},
        frame::RequestFrame,
        header::RequestHeader,
    },
    response::{Response, flags::ResponseFlag},
    test_utils::mock_request_id,
};
use libp2p::Multiaddr;
use libp2p_stream::OpenStreamError;
use tokio::{pin, sync::Notify};

use super::{
    ListenStream, SessionConfig, SessionLayer,
    transaction::{TransactionSink, TransactionStream},
};
use crate::{
    macros::non_zero,
    session::server::config::ConcurrentConnectionLimit,
    transport::{
        TransportLayer,
        connection::OutgoingConnection,
        error::TransportError,
        test::{layer, memory_address},
    },
};

fn make_request_header(flags: impl Into<RequestFlags>) -> RequestHeader {
    RequestHeader {
        protocol: Protocol {
            version: ProtocolVersion::V1,
        },
        request_id: mock_request_id(0x01),
        flags: flags.into(),
    }
}

pub(crate) fn make_request_begin(
    flags: impl Into<RequestFlags>,
    payload: impl Into<Bytes>,
) -> Request {
    Request {
        header: make_request_header(flags),
        body: RequestBody::Begin(RequestBegin {
            service: ServiceDescriptor {
                id: ServiceId::new(0x01),
                version: Version {
                    major: 0x00,
                    minor: 0x01,
                },
            },
            procedure: ProcedureDescriptor {
                id: ProcedureId::new(0x01),
            },
            payload: Payload::new(payload),
        }),
    }
}

pub(crate) fn make_request_frame(
    flags: impl Into<RequestFlags>,
    payload: impl Into<Bytes>,
) -> Request {
    Request {
        header: make_request_header(flags),
        body: RequestBody::Frame(RequestFrame {
            payload: Payload::new(payload),
        }),
    }
}

async fn session_map<T, U>(
    config: SessionConfig,
    address: Multiaddr,
    map_transport: impl FnOnce(&TransportLayer) -> T + Send,
    map_layer: impl FnOnce(&SessionLayer<JsonCodec>) -> U + Send,
) -> (ListenStream, T, U, impl Drop)
where
    T: Send,
    U: Send,
{
    let (transport, guard) = layer();

    let transport_data = map_transport(&transport);

    let layer = SessionLayer::new(config, transport, JsonCodec);

    let layer_data = map_layer(&layer);

    let stream = layer
        .listen(address)
        .await
        .expect("able to listen on address");

    (stream, transport_data, layer_data, guard)
}

async fn session(config: SessionConfig, address: Multiaddr) -> (ListenStream, impl Drop) {
    let (stream, (), (), guard) = session_map(config, address, |_| (), |_| ()).await;

    (stream, guard)
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
enum EchoError {
    #[error("the stream is incomplete")]
    IncompleteStream,
    #[error("the sink has been closed prematurely")]
    Sink,
}

#[derive(Debug, Clone)]
struct EchoStatistics {
    notify: Arc<Notify>,

    started: Arc<AtomicUsize>,
    stopped: Arc<AtomicUsize>,
    errors: Arc<AtomicUsize>,
}

impl EchoStatistics {
    fn started(&self) -> usize {
        self.started.load(Ordering::SeqCst)
    }

    fn stopped(&self) -> usize {
        self.stopped.load(Ordering::SeqCst)
    }

    fn errors(&self) -> usize {
        self.errors.load(Ordering::SeqCst)
    }

    fn increment_started(&self) {
        self.notify.notify_one();
        self.started.fetch_add(1, Ordering::SeqCst);
    }

    fn increment_stopped(&self) {
        self.notify.notify_one();
        self.stopped.fetch_add(1, Ordering::SeqCst);
    }

    fn increment_errors(&self) {
        self.notify.notify_one();
        self.errors.fetch_add(1, Ordering::SeqCst);
    }

    async fn changed(&self) {
        self.notify.notified().await;
    }
}

#[derive(Debug)]
struct EchoService {
    statistics: EchoStatistics,
}

impl EchoService {
    fn new() -> Self {
        Self {
            statistics: EchoStatistics {
                started: Arc::new(AtomicUsize::new(0)),
                stopped: Arc::new(AtomicUsize::new(0)),
                errors: Arc::new(AtomicUsize::new(0)),
                notify: Arc::new(Notify::new()),
            },
        }
    }

    fn statistics(&self) -> EchoStatistics {
        self.statistics.clone()
    }

    async fn handle(
        mut sink: TransactionSink,
        mut stream: TransactionStream,
    ) -> error_stack::Result<(), EchoError> {
        while let Some(bytes) = stream.next().await {
            sink.send(Ok(bytes)).await.change_context(EchoError::Sink)?;
        }

        if stream.is_incomplete() == Some(true) {
            return Err(Report::new(EchoError::IncompleteStream));
        }

        Ok(())
    }

    fn accept(&self, sink: TransactionSink, stream: TransactionStream) {
        let statistics = self.statistics.clone();

        tokio::spawn(async move {
            statistics.increment_started();

            if let Err(error) = Self::handle(sink, stream).await {
                statistics.increment_errors();

                tracing::error!(?error, "unable to complete service");
            }

            statistics.increment_stopped();
        });
    }

    fn spawn(self, mut server: ListenStream) {
        tokio::spawn(async move {
            // Using `loop` instead of `while let` to avoid significant scrutiny in drop
            loop {
                let Some(transaction) = server.next().await else {
                    break;
                };

                let (_, sink, stream) = transaction.into_parts();

                self.accept(sink, stream);
            }
        });
    }
}

async fn connect(client: &TransportLayer, address: Multiaddr) -> OutgoingConnection {
    let peer = client
        .lookup_peer(address)
        .await
        .expect("should be able to lookup peer");

    client
        .dial(peer)
        .await
        .expect("should be able to dial peer")
}

async fn connect_error(client: &TransportLayer, address: Multiaddr) -> Report<TransportError> {
    let peer = client
        .lookup_peer(address)
        .await
        .expect("should be able to lookup peer");

    client
        .dial(peer)
        .await
        .expect_err("should not be able to dial peer")
}

#[track_caller]
async fn assert_response(
    stream: impl Stream<Item = error_stack::Result<Response, io::Error>> + Send + Sync,
    expected: impl AsRef<[u8]> + Send,
) {
    pin!(stream);

    let mut output = BytesMut::new();
    while let Some(response) = stream.next().await {
        let response = response.expect("should be able to receive response");

        output.extend_from_slice(response.body.payload().as_ref());

        if response.header.flags.contains(ResponseFlag::EndOfResponse) {
            break;
        }
    }

    assert_eq!(output.freeze(), expected.as_ref());
}

#[tokio::test]
async fn single_session() {
    let address = memory_address();

    let (server, _server_guard) = session(SessionConfig::default(), address.clone()).await;
    let (client, _client_guard) = layer();

    let service = EchoService::new();
    let statistics = service.statistics();

    service.spawn(server);

    let OutgoingConnection {
        mut sink, stream, ..
    } = connect(&client, address).await;

    sink.send(make_request_begin(
        RequestFlag::BeginOfRequest,
        b"hello" as &[_],
    ))
    .await
    .expect("should be able to send");

    statistics.changed().await;

    // we should have a single session started, none stopped
    assert_eq!(statistics.started(), 1);
    assert_eq!(statistics.stopped(), 0);
    assert_eq!(statistics.errors(), 0);

    sink.send(make_request_frame(
        RequestFlag::EndOfRequest,
        b" world" as &[_],
    ))
    .await
    .expect("should be able to send");

    statistics.changed().await;

    // the transaction should be completed
    assert_eq!(statistics.started(), 1);
    assert_eq!(statistics.stopped(), 1);
    assert_eq!(statistics.errors(), 0);

    // the client should have received the exact echo
    assert_response(stream, b"hello world").await;
}

#[tokio::test]
async fn client_disconnect() {
    // if a client spuriously disconnects, do we properly disconnect as well and can still start
    // another connection
    let address = memory_address();

    let (server, _server_guard) = session(SessionConfig::default(), address.clone()).await;

    let service = EchoService::new();
    let statistics = service.statistics();

    service.spawn(server);

    let (client, _client_guard) = layer();

    // we immediately start and drop the connection
    let OutgoingConnection {
        mut sink, stream, ..
    } = connect(&client, address.clone()).await;

    sink.send(make_request_begin(
        RequestFlag::BeginOfRequest,
        b"hello" as &[_],
    ))
    .await
    .expect("should be able to send");

    drop(sink);
    drop(stream);

    // we should be able to start another connection on the same client
    let OutgoingConnection {
        mut sink, stream, ..
    } = connect(&client, address).await;

    sink.send(make_request_begin(
        RequestFlag::BeginOfRequest,
        b"hello" as &[_],
    ))
    .await
    .expect("should be able to send");

    tokio::time::sleep(Duration::from_millis(100)).await;

    assert_eq!(statistics.started(), 2);
    assert_eq!(statistics.stopped(), 1);
    assert_eq!(statistics.errors(), 1);

    sink.send(make_request_frame(
        RequestFlag::EndOfRequest,
        b" world" as &[_],
    ))
    .await
    .expect("should be able to send");

    tokio::time::sleep(Duration::from_millis(100)).await;

    assert_eq!(statistics.started(), 2);
    assert_eq!(statistics.stopped(), 2);
    assert_eq!(statistics.errors(), 1);

    // the client should have received the exact echo
    assert_response(stream, b"hello world").await;
}

#[tokio::test]
async fn server_disconnect_by_dropping_listen_stream() {
    let address = memory_address();

    let (mut server, _server_guard) = session(
        SessionConfig {
            connection_shutdown_linger: Duration::from_millis(100),
            ..SessionConfig::default()
        },
        address.clone(),
    )
    .await;
    let (client, _client_guard) = layer();

    let service = EchoService::new();

    // we first start a connection, and accept that transaction with an echo service
    let OutgoingConnection {
        mut sink, stream, ..
    } = connect(&client, address.clone()).await;

    // we should still be able to send a message
    sink.send(make_request_begin(RequestFlags::EMPTY, b"hello" as &[_]))
        .await
        .expect("should be able to send");

    let transaction = server
        .next()
        .await
        .expect("should be able to accept transaction");

    let (_, txn_sink, txn_stream) = transaction.into_parts();
    service.accept(txn_sink, txn_stream);

    // we now shutdown the server
    drop(server);

    tokio::time::sleep(Duration::from_millis(100)).await;

    sink.send(make_request_frame(
        RequestFlag::EndOfRequest,
        b" world" as &[_],
    ))
    .await
    .expect("should be able to send");

    // and receive the response
    assert_response(stream, b"hello world").await;
    drop(sink);

    tokio::time::sleep(Duration::from_millis(150)).await;

    // now that all active transactions of the connection (session) are completed, the session
    // should be terminated, meaning that no new transactions can be started
    let error = connect_error(&client, address).await;
    error
        .downcast_ref::<OpenStreamError>()
        .expect("should not be able to open another stream");
}

#[tokio::test]
async fn swarm_shutdown_client() {
    let address = memory_address();

    let (server, server_task_cancel, (), _server_guard) = session_map(
        SessionConfig::default(),
        address.clone(),
        TransportLayer::cancellation_token_task,
        |_| (),
    )
    .await;
    let (client, _client_guard) = layer();

    let service = EchoService::new();

    service.spawn(server);

    let OutgoingConnection {
        mut sink,
        mut stream,
        ..
    } = connect(&client, address).await;

    sink.send(make_request_begin(
        RequestFlag::BeginOfRequest,
        b"hello" as &[_],
    ))
    .await
    .expect("should be able to send");

    // we now simulate a server "crash"
    server_task_cancel.cancel();

    // the transport is now no longer accessible
    // (give it some time to just shutdown)
    tokio::time::sleep(Duration::from_millis(100)).await;

    // sending anything to the sink should result in an error
    let error = sink
        .send(make_request_frame(
            RequestFlag::EndOfRequest,
            b" world" as &[_],
        ))
        .await
        .expect_err("should not be able to send");
    let error = error.current_context();
    assert_eq!(error.kind(), ErrorKind::WriteZero);

    // errors are horribly designed, I (bmahmoud) looked for the original error everywhere
    // I know that it is yamux::ConnectionError::Closed, but during the conversion
    // libp2p converts into an io::Error (by presumably) converting it into a string.

    // the stream should be exhausted
    assert!(stream.next().await.is_none());
}

#[tokio::test]
async fn swarm_shutdown_server() {
    let address = memory_address();

    let (mut server, server_task_cancel, (), _server_guard) = session_map(
        SessionConfig {
            no_delay: true,
            per_transaction_response_byte_stream_buffer_size: non_zero!(1),
            ..SessionConfig::default()
        },
        address.clone(),
        TransportLayer::cancellation_token_task,
        |_| (),
    )
    .await;
    let (client, _client_guard) = layer();

    let OutgoingConnection { mut sink, .. } = connect(&client, address.clone()).await;

    sink.send(make_request_begin(
        RequestFlag::BeginOfRequest,
        b"hello" as &[_],
    ))
    .await
    .expect("should be able to send");

    let transaction = server
        .next()
        .await
        .expect("should be able to accept transaction");
    let (_, mut txn_sink, mut txn_stream) = transaction.into_parts();

    // and now the swarm "crashes"
    server_task_cancel.cancel();

    // the transport is now no longer accessible
    // (give it some time to just shutdown)
    tokio::time::sleep(Duration::from_millis(100)).await;

    // this one is always buffered by `PollSender`
    txn_sink
        .send(Ok(Bytes::from_static(b" world")))
        .await
        .expect("should be able to send");

    // ... this one will trigger the premature shutdown
    txn_sink
        .send(Ok(Bytes::from_static(b" world")))
        .await
        .expect("should be able to send");

    // ... this one will result in an error
    txn_sink
        .send(Ok(Bytes::from_static(b" world")))
        .await
        .expect_err("should not be able to send");

    // the stream should return None
    // we get one buffered message and that's it
    assert_eq!(txn_stream.next().await, Some(Bytes::from_static(b"hello")));
    assert!(txn_stream.next().await.is_none());
}

#[tokio::test]
async fn too_many_connections() {
    let address = memory_address();

    let (server, _server_guard) = session(
        SessionConfig {
            concurrent_connection_limit: ConcurrentConnectionLimit::new(1)
                .unwrap_or_else(|| unreachable!()),
            ..SessionConfig::default()
        },
        address.clone(),
    )
    .await;

    let (client, _client_guard) = layer();

    let service = EchoService::new();
    service.spawn(server);

    let OutgoingConnection {
        mut sink,
        stream: _stream,
        ..
    } = connect(&client, address.clone()).await;

    // creating a new connection would exceed the limit
    let OutgoingConnection {
        sink: mut sink2,
        stream: _stream2,
        ..
    } = connect(&client, address.clone()).await;

    // the first connection should still work
    sink.send(make_request_begin(RequestFlags::EMPTY, b"hello" as &[_]))
        .await
        .expect("should be able to send");

    // ... but the second one should not
    let error = sink2
        .send(make_request_begin(RequestFlags::EMPTY, b"hello" as &[_]))
        .await
        .expect_err("should not be able to send");

    let error = error.current_context();
    assert_eq!(error.kind(), ErrorKind::WriteZero);
}

#[tokio::test]
async fn connection_reclaim() {
    let address = memory_address();

    let (server, _server_guard) = session(
        SessionConfig {
            concurrent_connection_limit: ConcurrentConnectionLimit::new(1)
                .unwrap_or_else(|| unreachable!()),
            connection_shutdown_linger: Duration::from_millis(100),
            ..SessionConfig::default()
        },
        address.clone(),
    )
    .await;

    let (client, _client_guard) = layer();

    let service = EchoService::new();
    service.spawn(server);

    let OutgoingConnection {
        mut sink, stream, ..
    } = connect(&client, address.clone()).await;

    sink.send(make_request_begin(
        RequestFlag::EndOfRequest,
        b"hello" as &[_],
    ))
    .await
    .expect("should be able to send");

    assert_response(stream, "hello").await;
    drop(sink);

    // the connection should be reclaimed and we should be able to create a new one
    tokio::time::sleep(Duration::from_millis(150)).await;

    let OutgoingConnection {
        mut sink, stream, ..
    } = connect(&client, address.clone()).await;

    sink.send(make_request_begin(
        RequestFlag::EndOfRequest,
        b"hello" as &[_],
    ))
    .await
    .expect("should be able to send");

    assert_response(stream, "hello").await;
    drop(sink);
}

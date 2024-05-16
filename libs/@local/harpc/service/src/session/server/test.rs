use alloc::sync::Arc;
use core::{
    future::ready,
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};
use std::io;

use bytes::{Bytes, BytesMut};
use error_stack::{Report, ResultExt};
use futures::{SinkExt, Stream, StreamExt};
use harpc_types::{procedure::ProcedureId, service::ServiceId, version::Version};
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    payload::Payload,
    protocol::{Protocol, ProtocolVersion},
    request::{
        begin::RequestBegin,
        body::RequestBody,
        flags::{RequestFlag, RequestFlags},
        frame::RequestFrame,
        header::RequestHeader,
        procedure::ProcedureDescriptor,
        service::ServiceDescriptor,
        Request,
    },
    response::{flags::ResponseFlag, kind::ErrorCode, Response},
    test_utils::mock_request_id,
};
use libp2p::Multiaddr;
use tokio::{pin, sync::Notify};
use tokio_util::sync::PollSendError;

use super::{
    transaction::{TransactionSink, TransactionStream},
    ListenStream, SessionConfig, SessionLayer,
};
use crate::{
    codec::{ErrorEncoder, PlainError},
    session::error::TransactionError,
    transport::{
        connection::OutgoingConnection,
        test::{address, layer},
        TransportLayer,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct StringEncoder;

impl ErrorEncoder for StringEncoder {
    fn encode_error<E>(&self, error: E) -> impl Future<Output = TransactionError> + Send
    where
        E: PlainError,
    {
        ready(TransactionError {
            code: error.code(),
            bytes: error.to_string().into_bytes().into(),
        })
    }

    fn encode_report<C>(
        &self,
        report: error_stack::Report<C>,
    ) -> impl Future<Output = TransactionError> + Send {
        let code = report
            .request_ref::<ErrorCode>()
            .next()
            .copied()
            .unwrap_or(ErrorCode::INTERNAL_SERVER_ERROR);

        ready(TransactionError {
            code,
            bytes: report.to_string().into_bytes().into(),
        })
    }
}

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

async fn session(config: SessionConfig, address: Multiaddr) -> (ListenStream, impl Drop) {
    let (transport, guard) = layer();
    let layer = SessionLayer::new(config, transport, StringEncoder);

    let stream = layer
        .listen(address)
        .await
        .expect("able to listen on address");

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
            while let Some(transaction) = server.next().await {
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
    let address = address();

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
    let address = address();

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
#[ignore]
async fn server_disconnect_by_dropping_listen_stream() {}

#[tokio::test]
#[ignore]
async fn server_disconnect_by_swarm_shutdown() {}

#[tokio::test]
#[ignore]
async fn too_many_connections() {}

#[tokio::test]
#[ignore]
async fn connection_reclaim() {}

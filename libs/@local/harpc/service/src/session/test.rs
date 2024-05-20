use core::{future::ready, iter, net::Ipv4Addr};

use bytes::Bytes;
use error_stack::{Report, ResultExt};
use futures::{prelude::stream, sink::SinkExt, stream::StreamExt};
use harpc_types::{procedure::ProcedureId, service::ServiceId, version::Version};
use harpc_wire_protocol::{
    request::{procedure::ProcedureDescriptor, service::ServiceDescriptor},
    response::kind::ErrorCode,
};
use libp2p::{multiaddr, Multiaddr};
use tokio::time::Instant;
use tokio_util::sync::CancellationToken;

use super::{
    client,
    error::TransactionError,
    server::{
        self,
        transaction::{TransactionSink, TransactionStream},
        ListenStream,
    },
};
use crate::{
    codec::{ErrorEncoder, PlainError},
    transport::{Transport, TransportConfig, TransportLayer},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct Descriptor {
    pub(crate) service: ServiceDescriptor,
    pub(crate) procedure: ProcedureDescriptor,
}

impl Default for Descriptor {
    fn default() -> Self {
        Self {
            service: ServiceDescriptor {
                id: ServiceId::new(0x00),
                version: Version { major: 1, minor: 1 },
            },
            procedure: ProcedureDescriptor {
                id: ProcedureId::new(0x00),
            },
        }
    }
}

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

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
enum PingError {
    #[error("the stream is incomplete")]
    IncompleteStream,
    #[error("the sink has been closed prematurely")]
    Sink,
}

/// Simple Echo Service
///
/// Unlike the `EchoService` in `server/test.rs` this one doesn't keep track of statistics, to
/// remove as many variables as possible from RTT measurements.
struct SimpleEchoService;

impl SimpleEchoService {
    async fn handle(
        mut sink: TransactionSink,
        mut stream: TransactionStream,
    ) -> error_stack::Result<(), PingError> {
        while let Some(received) = stream.next().await {
            sink.send(Ok(received))
                .await
                .change_context(PingError::Sink)?;
        }

        if stream.is_incomplete() == Some(true) {
            return Err(Report::new(PingError::IncompleteStream));
        }

        Ok(())
    }

    fn accept(sink: TransactionSink, stream: TransactionStream) {
        tokio::spawn(async move {
            if let Err(error) = Self::handle(sink, stream).await {
                tracing::error!(?error, "failed to handle transaction");
            }
        });
    }

    fn spawn(mut server: ListenStream) {
        tokio::spawn(async move {
            while let Some(transaction) = server.next().await {
                let (_, sink, stream) = transaction.into_parts();
                Self::accept(sink, stream);
            }
        });
    }
}

fn server(
    transport_config: TransportConfig,
    session_config: server::SessionConfig,
    transport: impl Transport,
) -> (server::SessionLayer<StringEncoder>, impl Drop) {
    let cancel = CancellationToken::new();

    let transport_layer = TransportLayer::start(transport_config, transport, cancel.clone())
        .expect("failed to start transport layer");

    let session_layer = server::SessionLayer::new(session_config, transport_layer, StringEncoder);

    (session_layer, cancel.drop_guard())
}

fn client(
    transport_config: TransportConfig,
    session_config: client::SessionConfig,
    transport: impl Transport,
) -> (client::SessionLayer, impl Drop) {
    let cancel = CancellationToken::new();

    let transport_layer = TransportLayer::start(transport_config, transport, cancel.clone())
        .expect("failed to start transport layer");

    let session_layer = client::SessionLayer::new(session_config, transport_layer);

    (session_layer, cancel.drop_guard())
}

async fn echo<T>(mut transport: impl FnMut() -> T + Send, address: Multiaddr)
where
    T: Transport,
{
    let (server, _server_guard) = server(
        TransportConfig::default(),
        server::SessionConfig::default(),
        transport(),
    );
    let server_ipc = server.transport().ipc().clone();

    let address = {
        let server_stream = server
            .listen(address)
            .await
            .expect("should be able to listen on TCP");

        let address = server_ipc
            .external_addresses()
            .await
            .expect("should have transport layer running")
            .pop()
            .expect("should have at least one external address");

        SimpleEchoService::spawn(server_stream);

        address
    };

    let (client, _client_guard) = client(
        TransportConfig::default(),
        client::SessionConfig::default(),
        transport(),
    );

    let descriptor = Descriptor::default();

    // send 1MiB of data
    let payload = Bytes::from(vec![0_u8; 1024 * 1024]);
    let payload_len = payload.len();

    let connection = client
        .dial(address)
        .await
        .expect("should be able to dial server");

    let time = Instant::now();

    let mut stream = connection
        .call(
            descriptor.service,
            descriptor.procedure,
            stream::iter(iter::once(payload)),
        )
        .await
        .expect("connection should be open");

    let mut response = stream
        .next()
        .await
        .expect("should receive a response")
        .expect("value response");

    let mut bytes = 0;

    while let Some(chunk) = response.next().await {
        bytes += chunk.len();
    }

    let elapsed = time.elapsed();
    println!("Elapsed: {:?}", elapsed);

    assert_eq!(bytes, payload_len);
}

#[tokio::test]
async fn echo_memory() {
    let address: Multiaddr = iter::once(multiaddr::Protocol::Memory(0)).collect();

    echo(libp2p::core::transport::MemoryTransport::default, address).await;
}

#[test_log::test(tokio::test(flavor = "multi_thread", worker_threads = 8))]
async fn echo_tcp() {
    let address: Multiaddr = [
        multiaddr::Protocol::Ip4(Ipv4Addr::LOCALHOST),
        multiaddr::Protocol::Tcp(0),
    ]
    .into_iter()
    .collect();

    echo(libp2p::tcp::tokio::Transport::default, address).await;
}

#[tokio::test]
#[ignore]
async fn echo_memory_concurrent() {}

#[tokio::test]
#[ignore]
async fn echo_tcp_concurrent() {}

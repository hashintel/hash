use alloc::sync::Arc;
use core::{future::ready, iter, net::Ipv4Addr, time::Duration};

use bytes::Bytes;
use error_stack::{Report, ResultExt as _};
use futures::{prelude::stream, sink::SinkExt as _, stream::StreamExt as _};
use harpc_types::{procedure::ProcedureId, service::ServiceId, version::Version};
use harpc_wire_protocol::{
    request::{procedure::ProcedureDescriptor, service::ServiceDescriptor},
    response::kind::ErrorCode,
};
use humansize::ISizeFormatter;
use libp2p::{Multiaddr, multiaddr};
use tokio::{sync::Barrier, task::JoinSet, time::Instant};
use tokio_util::sync::CancellationToken;

use super::{
    client::{self, Connection},
    error::TransactionError,
    server::{
        self, ListenStream,
        transaction::{TransactionSink, TransactionStream},
    },
};
use crate::{
    codec::{ErrorEncoder, WireError},
    transport::{Transport, TransportConfig, TransportLayer, test::memory_address},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct Descriptor {
    pub service: ServiceDescriptor,
    pub procedure: ProcedureDescriptor,
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
        E: WireError,
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
            // Using `loop` instead of `while let` to avoid significant scrutiny in drop
            loop {
                let Some(transaction) = server.next().await else {
                    break;
                };

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

        // Give the swarm some time to acquire the external address
        // This is necessary for CI, as otherwise the tests are a bit flaky.
        // TODO: Implement waiting for server to be ready
        //   see https://linear.app/hash/issue/H-2837
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

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
    let payload = Bytes::from(vec![0_u8; 1024 * 1024 * 32]);
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

    assert_eq!(bytes, payload_len);

    println!("Elapsed: {elapsed:?}");

    // calculate the throughput in bytes per second
    #[expect(
        clippy::float_arithmetic,
        clippy::cast_precision_loss,
        reason = "statistics"
    )]
    let throughput = (payload_len as f64) / elapsed.as_secs_f64();
    let formatter = ISizeFormatter::new(throughput, humansize::BINARY);

    println!("Throughput: {formatter:.2}/s");
}

#[test_log::test(tokio::test(flavor = "multi_thread", worker_threads = 8))]
async fn echo_memory() {
    let address = memory_address();

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

struct ClientOptions {
    length: usize,
    index: u8,
}

async fn echo_client<const VERIFY: bool>(
    connection: Connection,
    ClientOptions { length, index }: ClientOptions,
) -> Duration {
    let descriptor = Descriptor::default();

    let payload = Bytes::from(vec![index; length]);
    let payload_len = payload.len();

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

        if VERIFY {
            assert!(chunk.iter().all(|&byte| byte == index));
        }
    }

    let elapsed = time.elapsed();

    assert_eq!(bytes, payload_len);

    elapsed
}

async fn echo_concurrent<T>(
    mut transport: impl FnMut() -> T + Send,
    address: Multiaddr,
    clients: u8,
) where
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

        // Give the swarm some time to acquire the external address
        // This is necessary for CI, as otherwise the tests are a bit flaky.
        // TODO: `listen_on` should wait until the transport layer has acquired said address.
        //   see https://linear.app/hash/issue/H-2837
        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

        let address = server_ipc
            .external_addresses()
            .await
            .expect("should have transport layer running")
            .pop()
            .expect("should have at least one external address");

        SimpleEchoService::spawn(server_stream);

        address
    };

    let length = 1024 * 1024 * 32; // 32 MiB

    let mut handles = JoinSet::new();
    let barrier = Arc::new(Barrier::new(usize::from(clients)));

    let (client, _client_guard) = client(
        TransportConfig::default(),
        client::SessionConfig::default(),
        transport(),
    );

    for index in 0..clients {
        let remote = address.clone();

        let barrier = Arc::clone(&barrier);

        let connection = client
            .dial(remote.clone())
            .await
            .expect("should be able to dial server");

        handles.spawn(async move {
            barrier.wait().await;

            echo_client::<true>(connection, ClientOptions { length, index }).await
        });
    }

    let mut total = Duration::default();
    while let Some(elapsed) = handles.join_next().await {
        total += elapsed.expect("should not have crashed");
    }
    let average = total / u32::from(clients);

    // calculate the throughput in bytes per second
    #[expect(
        clippy::float_arithmetic,
        clippy::cast_precision_loss,
        reason = "statistics"
    )]
    let throughput = (length as f64) / average.as_secs_f64();
    let formatter = ISizeFormatter::new(throughput, humansize::BINARY);

    println!("Average Elapsed: {average:?}");
    println!("Average Throughput: {formatter:.2}/s");
}

#[test_log::test(tokio::test(flavor = "multi_thread", worker_threads = 8))]
async fn echo_memory_concurrent() {
    let address = memory_address();

    echo_concurrent(
        libp2p::core::transport::MemoryTransport::default,
        address,
        4,
    )
    .await;
}

#[test_log::test(tokio::test(flavor = "multi_thread", worker_threads = 8))]
async fn echo_tcp_concurrent() {
    let address: Multiaddr = [
        multiaddr::Protocol::Ip4(Ipv4Addr::LOCALHOST),
        multiaddr::Protocol::Tcp(0),
    ]
    .into_iter()
    .collect();

    echo_concurrent(libp2p::tcp::tokio::Transport::default, address, 4).await;
}

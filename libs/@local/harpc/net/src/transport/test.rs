use core::{
    assert_matches, iter,
    net::Ipv4Addr,
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};

use futures::{SinkExt as _, StreamExt as _, sink};
use harpc_wire_protocol::{
    flags::BitFlagsOp as _,
    payload::Payload,
    protocol::{Protocol, ProtocolVersion},
    request::{
        Request, body::RequestBody, flags::RequestFlags, frame::RequestFrame, header::RequestHeader,
    },
    response::{
        Response, body::ResponseBody, flags::ResponseFlags, frame::ResponseFrame,
        header::ResponseHeader,
    },
    test_utils::mock_request_id,
};
use libp2p::{
    Multiaddr, TransportError, core::transport::MemoryTransport, multiaddr, swarm::DialError,
    tcp::tokio::Transport,
};
use libp2p_stream::OpenStreamError;
use multiaddr::multiaddr;
use tokio_util::sync::CancellationToken;

use super::{TransportConfig, TransportLayer};
use crate::transport::connection::{IncomingConnection, OutgoingConnection};

static EXAMPLE_REQUEST: Request = Request {
    header: RequestHeader {
        protocol: Protocol {
            version: ProtocolVersion::V1,
        },
        request_id: mock_request_id(0),
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
        request_id: mock_request_id(0),
        flags: ResponseFlags::EMPTY,
    },
    body: ResponseBody::Frame(ResponseFrame {
        payload: Payload::from_static(&[0x00_u8]),
    }),
};

const DEFAULT_DELAY: Duration = Duration::from_millis(10);

pub(crate) fn memory_address() -> libp2p::Multiaddr {
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
    let config = TransportConfig::default();
    let cancel = CancellationToken::new();

    let layer = TransportLayer::start(config, transport, cancel.clone())
        .expect("should be able to create swarm");

    (layer, cancel.drop_guard())
}

pub(crate) fn layer_tcp() -> (TransportLayer, impl Drop) {
    let transport = Transport::default();
    let config = TransportConfig::default();
    let cancel = CancellationToken::new();

    let layer = TransportLayer::start(config, transport, cancel.clone())
        .expect("should be able to create swarm");

    (layer, cancel.drop_guard())
}

#[tokio::test]
async fn lookup_peer() {
    let (server, _guard_server) = layer();
    let (client, _guard_client) = layer();

    let address = memory_address();

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

    let address = memory_address();

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

    let address = memory_address();

    server
        .listen_on(address.clone())
        .await
        .expect("memory transport should be able to listen on memory address");

    let server_id = server.peer_id();

    let mut stream = server.listen().await.expect("should be able to listen");

    tokio::spawn(async move {
        while let Some(IncomingConnection { sink, stream, .. }) = stream.next().await {
            // we just check if we establish connection, so we don't need to do anything
            // with the connection
            drop(sink);
            let Ok(()) = stream.map(Ok).forward(sink::drain()).await;
        }
    });

    // wait for `DEFAULT_DELAY` to make sure the server is ready
    // this is more than strictly necessary, but it's better to be safe
    tokio::time::sleep(DEFAULT_DELAY).await;

    client
        .lookup_peer(address)
        .await
        .expect("should be able to lookup peer");

    let OutgoingConnection { sink, stream, .. } = client
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

    let address = memory_address();

    server
        .listen_on(address.clone())
        .await
        .expect("memory transport should be able to listen on memory address");

    let server_id = server.peer_id();

    let mut stream = server.listen().await.expect("should be able to listen");

    let handle = tokio::spawn(async move {
        let Some(IncomingConnection {
            sink, mut stream, ..
        }) = stream.next().await
        else {
            panic!("should receive connection");
        };

        // we just check if we establish connection, so we don't need to do anything with
        // the connection
        drop(sink);

        let request = stream
            .next()
            .await
            .expect("should receive another request")
            .expect("should be well-formed request");
        assert_eq!(request, EXAMPLE_REQUEST);
    });

    // wait for `DEFAULT_DELAY` to make sure the server is ready
    // this is more than strictly necessary, but it's better to be safe
    tokio::time::sleep(DEFAULT_DELAY).await;

    client
        .lookup_peer(address)
        .await
        .expect("should be able to lookup peer");

    let OutgoingConnection {
        mut sink, stream, ..
    } = client
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

    let address = memory_address();

    server
        .listen_on(address.clone())
        .await
        .expect("memory transport should be able to listen on memory address");

    let server_id = server.peer_id();

    let mut stream = server.listen().await.expect("should be able to listen");

    let handle = tokio::spawn(async move {
        let Some(IncomingConnection {
            mut sink,
            mut stream,
            ..
        }) = stream.next().await
        else {
            panic!("should receive connection");
        };

        let request = stream
            .next()
            .await
            .expect("should receive another request")
            .expect("should be well-formed request");
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

    let OutgoingConnection {
        mut sink,
        mut stream,
        ..
    } = client
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

#[tokio::test]
async fn send_request_response_multiple() {
    let (server, _guard_server) = layer();
    let (client, _guard_client) = layer();

    let address = memory_address();

    server
        .listen_on(address.clone())
        .await
        .expect("memory transport should be able to listen on memory address");

    let server_id = server.peer_id();

    let mut stream = server.listen().await.expect("should be able to listen");

    let handle = tokio::spawn(async move {
        let Some(IncomingConnection {
            mut sink,
            mut stream,
            ..
        }) = stream.next().await
        else {
            panic!("should receive connection");
        };

        let request = stream
            .next()
            .await
            .expect("should receive another request")
            .expect("should be well-formed request");
        assert_eq!(request, EXAMPLE_REQUEST);

        let request = stream
            .next()
            .await
            .expect("should receive another request")
            .expect("should be well-formed request");
        assert_eq!(request, EXAMPLE_REQUEST);

        sink.send(EXAMPLE_RESPONSE.clone())
            .await
            .expect("should be able to send response");

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

    let OutgoingConnection {
        mut sink,
        mut stream,
        ..
    } = client
        .dial(server_id)
        .await
        .expect("should be able to dial");

    sink.send(EXAMPLE_REQUEST.clone())
        .await
        .expect("should be able to send request");

    sink.send(EXAMPLE_REQUEST.clone())
        .await
        .expect("should be able to send request");

    let response = stream
        .next()
        .await
        .expect("should receive response")
        .expect("should be well-formed response");
    assert_eq!(response, EXAMPLE_RESPONSE);

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

    // we cannot check if the stream is closed, because this would only happen after both the
    // sink and stream are closed, meaning we'd get into a deadlock.
}

#[tokio::test]
async fn establish_connection_server_offline() {
    let (server, guard_server) = layer();
    let (client, _guard_client) = layer();

    let address = memory_address();

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

    let error = client
        .dial(peer_id)
        .await
        .expect_err("should not be able to dial");
    error
        .downcast_ref::<OpenStreamError>()
        .expect("underlying error should be OpenStreamError");
}

#[tokio::test]
async fn listen_on() {
    let (layer, _guard) = layer();

    layer
        .listen_on(memory_address())
        .await
        .expect("memory transport should be able to listen on memory address");
}

#[tokio::test]
async fn listen_on_duplicate_address() {
    let (layer, _guard) = layer();

    let address = memory_address();

    layer
        .listen_on(address.clone())
        .await
        .expect("memory transport should be able to listen on memory address");

    let _error = layer
        .listen_on(address)
        .await
        .expect_err("should not be able to listen on the same address twice");
}

#[tokio::test]
async fn listen_on_tcp_unspecified() {
    let (layer, _guard) = layer_tcp();

    let address = multiaddr![Ip4(Ipv4Addr::UNSPECIFIED), Tcp(0_u16)];

    let chosen = layer
        .listen_on(address)
        .await
        .expect("memory transport should be able to listen on memory address");

    let protocol: Vec<_> = chosen.iter().collect();
    assert_matches!(protocol[0], multiaddr::Protocol::Ip4(addr) if addr != Ipv4Addr::UNSPECIFIED);
    assert_matches!(protocol[1], multiaddr::Protocol::Tcp(port) if port != 0);
}

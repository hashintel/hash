use alloc::sync::Arc;
use core::{
    assert_matches,
    sync::atomic::{AtomicUsize, Ordering},
    time::Duration,
};
use std::io;

use bytes::{Buf as _, BufMut as _, Bytes, BytesMut};
use error_stack::Report;
use futures::{StreamExt as _, stream};
use harpc_types::response_kind::ResponseKind;
use harpc_wire_protocol::{
    flags::BitFlagsOp as _,
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
    response::{
        Response,
        begin::ResponseBegin,
        body::ResponseBody,
        flags::{ResponseFlag, ResponseFlags},
        frame::ResponseFrame,
        header::ResponseHeader,
    },
    test_utils::mock_request_id,
};
use tachyonix::RecvTimeoutError;
use tokio::sync::{Notify, mpsc};
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::{
    sync::{CancellationToken, PollSender},
    task::TaskTracker,
};

use super::{Connection, ConnectionParts};
use crate::{
    macros::non_zero,
    session::{
        client::{
            TransactionStream as _, ValueStream,
            config::SessionConfig,
            connection::{
                ConnectionRequestDelegateTask, ConnectionResponseDelegateTask,
                collection::TransactionCollection,
            },
            transaction::{ClientTransactionPermit as _, stream::StreamState},
        },
        error::ConnectionPartiallyClosedError,
        gc::ConnectionGarbageCollectorTask,
        test::Descriptor,
    },
};

#[tokio::test]
async fn transaction_collection_acquire() {
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let (permit, mut rx) = collection.acquire().await;

    assert_eq!(collection.storage().len(), 1);

    let entry = collection
        .storage()
        .first_entry_async()
        .await
        .expect("should have a single entry");

    assert_eq!(*entry.key(), permit.id());
    assert!(!entry.cancel.is_cancelled());
    assert!(!entry.sender.is_closed());

    let response = Response {
        header: ResponseHeader {
            protocol: Protocol {
                version: ProtocolVersion::V1,
            },
            request_id: mock_request_id(0x00),
            flags: ResponseFlags::EMPTY,
        },
        body: ResponseBody::Frame(ResponseFrame {
            payload: Payload::from_static(b"hello world" as &[_]),
        }),
    };

    entry
        .sender
        .send(response.clone())
        .await
        .expect("should be able to send response");

    let received = rx.recv().await.expect("should receive response");
    assert_eq!(received, response);
}

#[tokio::test]
async fn transaction_permit_drop_removes_entry() {
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let (permit, _) = collection.acquire().await;
    let permit = Arc::new(permit);
    let cloned = Arc::clone(&permit);

    drop(permit);
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(collection.storage().len(), 1);

    drop(cloned);
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(collection.storage().len(), 0);
}

const fn make_mock_request() -> Request {
    Request {
        header: RequestHeader {
            protocol: Protocol {
                version: ProtocolVersion::V1,
            },
            request_id: mock_request_id(0x00),
            flags: RequestFlags::EMPTY,
        },
        body: RequestBody::Frame(RequestFrame {
            payload: Payload::from_static(b"hello world" as &[_]),
        }),
    }
}

#[tokio::test]
async fn request_delegate() {
    let (sink_tx, mut sink_rx) = mpsc::channel(8);
    let (rx_tx, rx_rx) = mpsc::channel(8);

    let task = ConnectionRequestDelegateTask {
        sink: PollSender::new(sink_tx),
        rx: rx_rx,
    };

    tokio::spawn(task.run(CancellationToken::new()));

    let request = make_mock_request();

    rx_tx
        .send(request.clone())
        .await
        .expect("should be able to send request");

    let received = sink_rx.recv().await.expect("should receive request");
    assert_eq!(received, request);
}

#[tokio::test]
async fn request_delegate_sink_closed() {
    let (sink_tx, sink_rx) = mpsc::channel(8);
    let (rx_tx, rx_rx) = mpsc::channel(8);

    let task = ConnectionRequestDelegateTask {
        sink: PollSender::new(sink_tx),
        rx: rx_rx,
    };

    let handle = tokio::spawn(task.run(CancellationToken::new()));
    drop(sink_rx);

    // because of the architecture of `Sink`s we're not immediately notified if the sink is closed,
    // only once we push a value
    let request = make_mock_request();
    rx_tx
        .send(request.clone())
        .await
        .expect("should be able to send request");

    tokio::task::yield_now().await;

    // once sent the task will shutdown and subsequent sends will fail
    rx_tx
        .send(request.clone())
        .await
        .expect_err("should not be able to send request");

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic")
        .expect_err("should have stopped polling");
}

#[tokio::test]
async fn request_delegate_rx_closed() {
    let (sink_tx, _sink_rx) = mpsc::channel(8);
    let (rx_tx, rx_rx) = mpsc::channel(8);

    let task = ConnectionRequestDelegateTask {
        sink: PollSender::new(sink_tx),
        rx: rx_rx,
    };

    let handle = tokio::spawn(task.run(CancellationToken::new()));

    drop(rx_tx);

    // simply dropping rx means that the stream is closed, we're good and winding down.

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic")
        .expect("should not error");
}

#[tokio::test]
async fn request_delegate_cancel() {
    let (sink_tx, _sink_rx) = mpsc::channel(8);
    let (_rx_tx, rx_rx) = mpsc::channel(8);

    let task = ConnectionRequestDelegateTask {
        sink: PollSender::new(sink_tx),
        rx: rx_rx,
    };

    let cancel = CancellationToken::new();

    let handle = tokio::spawn(task.run(cancel.clone()));

    cancel.cancel();

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic")
        .expect("should not error");
}

const fn make_mock_response() -> Response {
    Response {
        header: ResponseHeader {
            protocol: Protocol {
                version: ProtocolVersion::V1,
            },
            request_id: mock_request_id(0x00),
            flags: ResponseFlags::EMPTY,
        },
        body: ResponseBody::Frame(ResponseFrame {
            payload: Payload::from_static(b"hello world" as &[_]),
        }),
    }
}

#[tokio::test]
async fn response_delegate() {
    let (stream_tx, stream_rx) = mpsc::channel(8);

    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let task = ConnectionResponseDelegateTask {
        config: SessionConfig::default(),
        stream: ReceiverStream::new(stream_rx),
        storage: Arc::clone(collection.storage()),
        storage_empty_notify: Arc::new(Notify::new()),
        parent: CancellationToken::new(),
        _guard: CancellationToken::new().drop_guard(),
    };

    tokio::spawn(task.run(CancellationToken::new()));

    let (_permit, mut rx) = collection.acquire().await;

    let response = make_mock_response();
    stream_tx
        .send(Ok(response.clone()))
        .await
        .expect("should be able to send response");

    let received = rx.recv().await.expect("should receive response");
    assert_eq!(received, response);
}

#[tokio::test]
async fn response_delegate_ignore_errors() {
    let (stream_tx, stream_rx) = mpsc::channel(8);
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let task = ConnectionResponseDelegateTask {
        config: SessionConfig::default(),
        stream: ReceiverStream::new(stream_rx),
        storage: Arc::clone(collection.storage()),
        storage_empty_notify: Arc::new(Notify::new()),
        parent: CancellationToken::new(),
        _guard: CancellationToken::new().drop_guard(),
    };

    let handle = tokio::spawn(task.run(CancellationToken::new()));

    // just have a fitting receiver in place, so that we know if it got routed
    let (_permit, mut rx) = collection.acquire().await;

    stream_tx
        .send(Err(Report::new(io::Error::other("unknown"))))
        .await
        .expect("should be able to send error");

    tokio::time::sleep(Duration::from_millis(100)).await;

    assert!(!handle.is_finished());

    tokio::time::timeout(Duration::from_millis(100), rx.recv())
        .await
        .expect_err("should not have received item");
}

#[tokio::test]
async fn response_delegate_stream_closed() {
    let (stream_tx, stream_rx) = mpsc::channel(8);
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let task = ConnectionResponseDelegateTask {
        config: SessionConfig::default(),
        stream: ReceiverStream::new(stream_rx),
        storage: Arc::clone(collection.storage()),
        storage_empty_notify: Arc::new(Notify::new()),
        parent: CancellationToken::new(),
        _guard: CancellationToken::new().drop_guard(),
    };

    let handle = tokio::spawn(task.run(CancellationToken::new()));

    // just so that we have something to receive, in the event that something goes wrong
    let (_permit, _rx) = collection.acquire().await;

    drop(stream_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn response_delegate_tx_closed() {
    let (stream_tx, stream_rx) = mpsc::channel(8);
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let task = ConnectionResponseDelegateTask {
        config: SessionConfig::default(),
        stream: ReceiverStream::new(stream_rx),
        storage: Arc::clone(collection.storage()),
        storage_empty_notify: Arc::new(Notify::new()),
        parent: CancellationToken::new(),
        _guard: CancellationToken::new().drop_guard(),
    };

    let handle = tokio::spawn(task.run(CancellationToken::new()));

    // just so that we have something to receive, in the event that something goes wrong
    let (_permit, rx) = collection.acquire().await;

    drop(rx);

    stream_tx
        .send(Ok(make_mock_response()))
        .await
        .expect("should be able to send response");

    tokio::time::sleep(Duration::from_millis(100)).await;

    assert!(!handle.is_finished());
}

#[tokio::test]
async fn response_delegate_unknown_request_id() {
    let (stream_tx, stream_rx) = mpsc::channel(8);
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let task = ConnectionResponseDelegateTask {
        config: SessionConfig::default(),
        stream: ReceiverStream::new(stream_rx),
        storage: Arc::clone(collection.storage()),
        storage_empty_notify: Arc::new(Notify::new()),
        parent: CancellationToken::new(),
        _guard: CancellationToken::new().drop_guard(),
    };

    let handle = tokio::spawn(task.run(CancellationToken::new()));

    stream_tx
        .send(Ok(make_mock_response()))
        .await
        .expect("should be able to send response");

    // nothing should happen if we have a rogue request
    tokio::time::sleep(Duration::from_millis(100)).await;

    assert!(!handle.is_finished());
}

#[tokio::test]
async fn response_delegate_cancel() {
    let (_stream_tx, stream_rx) = mpsc::channel(8);
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let task = ConnectionResponseDelegateTask {
        config: SessionConfig::default(),
        stream: ReceiverStream::new(stream_rx),
        storage: Arc::clone(collection.storage()),
        storage_empty_notify: Arc::new(Notify::new()),
        parent: CancellationToken::new(),
        _guard: CancellationToken::new().drop_guard(),
    };

    let cancel = CancellationToken::new();
    let handle = tokio::spawn(task.run(cancel.clone()));

    cancel.cancel();

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn response_delegate_cancels_running_senders_on_shutdown() {
    let (stream_tx, stream_rx) = mpsc::channel(8);
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let task = ConnectionResponseDelegateTask {
        config: SessionConfig::default(),
        stream: ReceiverStream::new(stream_rx),
        storage: Arc::clone(collection.storage()),
        storage_empty_notify: Arc::new(Notify::new()),
        parent: CancellationToken::new(),
        _guard: CancellationToken::new().drop_guard(),
    };

    let handle = tokio::spawn(task.run(CancellationToken::new()));

    let (_permit_a, mut rx_a) = collection.acquire().await;
    let (_permit_b, mut rx_b) = collection.acquire().await;
    let (_permit_c, mut rx_c) = collection.acquire().await;

    drop(stream_tx);

    tokio::task::yield_now().await;

    assert!(handle.is_finished());
    assert_matches!(
        rx_a.recv_timeout(tokio::time::sleep(Duration::from_millis(100)))
            .await
            .expect_err("should be closed"),
        RecvTimeoutError::Closed
    );
    assert_matches!(
        rx_b.recv_timeout(tokio::time::sleep(Duration::from_millis(100)))
            .await
            .expect_err("should be closed"),
        RecvTimeoutError::Closed
    );
    assert_matches!(
        rx_c.recv_timeout(tokio::time::sleep(Duration::from_millis(100)))
            .await
            .expect_err("should be closed"),
        RecvTimeoutError::Closed
    );
}

#[tokio::test]
async fn garbage_collect_ignore_active() {
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let task = ConnectionGarbageCollectorTask {
        every: Duration::from_millis(10),
        index: Arc::clone(collection.storage()),
    };

    let (_permit, _rx) = collection.acquire().await;

    assert_eq!(collection.storage().len(), 1);

    // should have run a couple of times
    tokio::spawn(task.run(CancellationToken::new()));
    tokio::time::sleep(Duration::from_millis(100)).await;

    assert_eq!(collection.storage().len(), 1);
}

#[tokio::test]
async fn garbage_collect_remove_inactive() {
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let task = ConnectionGarbageCollectorTask {
        every: Duration::from_millis(10),
        index: Arc::clone(collection.storage()),
    };

    let (permit, _rx) = collection.acquire().await;

    assert_eq!(collection.storage().len(), 1);

    tokio::spawn(task.run(CancellationToken::new()));

    // mark explicitely as inactive
    permit.cancellation_token().cancel();

    tokio::time::sleep(Duration::from_millis(100)).await;

    assert_eq!(collection.storage().len(), 0);
}

#[tokio::test]
async fn garbage_collect_cancel() {
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let task = ConnectionGarbageCollectorTask {
        every: Duration::from_millis(10),
        index: Arc::clone(collection.storage()),
    };

    let cancel = CancellationToken::new();
    let handle = tokio::spawn(task.run(cancel.clone()));

    cancel.cancel();

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[expect(clippy::type_complexity, reason = "setup code")]
fn setup_connection_mapped<T>(
    config: SessionConfig,
    with_parts: impl FnOnce(&ConnectionParts) -> T,
) -> (
    Connection,
    mpsc::Sender<Result<Response, Report<io::Error>>>,
    mpsc::Receiver<Request>,
    T,
    TaskTracker,
) {
    let (sink_tx, sink_rx) = mpsc::channel(8);
    let (stream_tx, stream_rx) = mpsc::channel(8);

    let tasks = TaskTracker::new();
    let parts = ConnectionParts {
        config,
        tasks: &tasks,
        cancel: CancellationToken::new(),
    };

    let parts_value = with_parts(&parts);

    let connection = Connection::spawn(
        parts,
        PollSender::new(sink_tx),
        ReceiverStream::new(stream_rx),
    );

    (connection, stream_tx, sink_rx, parts_value, tasks)
}

#[expect(clippy::type_complexity, reason = "setup code")]
fn setup_connection(
    config: SessionConfig,
) -> (
    Connection,
    mpsc::Sender<Result<Response, Report<io::Error>>>,
    mpsc::Receiver<Request>,
    TaskTracker,
) {
    let (connection, stream_tx, sink_rx, (), tasks) = setup_connection_mapped(config, |_| ());

    (connection, stream_tx, sink_rx, tasks)
}

struct EchoSystem {
    packets_received: Arc<AtomicUsize>,
}

impl EchoSystem {
    fn new() -> Self {
        Self {
            packets_received: Arc::new(AtomicUsize::new(0)),
        }
    }

    async fn serve(
        self,
        mut rx: mpsc::Receiver<Request>,
        tx: mpsc::Sender<Result<Response, Report<io::Error>>>,
    ) {
        while let Some(request) = rx.recv().await {
            self.packets_received.fetch_add(1, Ordering::SeqCst);

            let body = match request.body {
                RequestBody::Begin(RequestBegin {
                    subsystem,
                    procedure,
                    payload,
                }) => {
                    let mut bytes = BytesMut::new();

                    bytes.put_u16(subsystem.id.value());
                    bytes.put_u8(subsystem.version.major);
                    bytes.put_u8(subsystem.version.minor);

                    bytes.put_u16(procedure.id.value());

                    bytes.put(payload.into_bytes());

                    ResponseBody::Begin(ResponseBegin {
                        kind: ResponseKind::Ok,
                        payload: Payload::new(bytes.freeze()),
                    })
                }
                RequestBody::Frame(RequestFrame { payload }) => {
                    ResponseBody::Frame(ResponseFrame { payload })
                }
            };

            let mut flags = ResponseFlags::empty();
            if request.header.flags.contains(RequestFlag::EndOfRequest) {
                flags = flags.insert(ResponseFlag::EndOfResponse);
            }

            let response = Response {
                header: ResponseHeader {
                    protocol: Protocol {
                        version: ProtocolVersion::V1,
                    },
                    request_id: request.header.request_id,
                    flags,
                },
                body,
            };

            if tx.send(Ok(response)).await.is_err() {
                tracing::error!("sender has shutdown");
                break;
            }
        }
    }
}

#[track_caller]
async fn assert_stream(stream: &mut ValueStream, descriptor: Descriptor, expected: &[Bytes]) {
    let mut bytes = stream.next().await.expect("should have a value");
    assert_eq!(bytes.get_u16(), descriptor.subsystem.id.value());
    assert_eq!(bytes.get_u8(), descriptor.subsystem.version.major);
    assert_eq!(bytes.get_u8(), descriptor.subsystem.version.minor);

    assert_eq!(bytes.get_u16(), descriptor.procedure.id.value());

    if let Some(expected) = expected.first() {
        assert_eq!(bytes, expected);
    }

    for expected in &expected[1..] {
        let bytes = stream.next().await.expect("should have a value");
        assert_eq!(bytes, expected);
    }

    assert!(stream.next().await.is_none());
}

#[tokio::test]
async fn call() {
    let (connection, stream_tx, sink_rx, _tasks) = setup_connection(SessionConfig {
        no_delay: true,
        ..SessionConfig::default()
    });

    tokio::spawn(EchoSystem::new().serve(sink_rx, stream_tx));

    let descriptor = Descriptor::default();

    let payload = [Bytes::from_static(b"hello"), Bytes::from_static(b"world")];

    let mut stream = connection
        .call(
            descriptor.subsystem,
            descriptor.procedure,
            stream::iter(payload.clone()),
        )
        .await
        .expect("should not be closed");

    let mut value = stream
        .next()
        .await
        .expect("should have a value")
        .expect("should not error");

    assert_stream(&mut value, descriptor, &payload).await;

    assert_eq!(
        value.state().map(StreamState::is_end_of_response),
        Some(true)
    );

    assert!(stream.next().await.is_none());
}

#[tokio::test]
async fn call_do_not_admit_if_partially_closed_read() {
    let (connection, stream_tx, _sink_rx, _tasks) = setup_connection(SessionConfig {
        no_delay: true,
        ..SessionConfig::default()
    });
    drop(stream_tx);

    tokio::task::yield_now().await;

    let descriptor = Descriptor::default();
    assert_eq!(
        *connection
            .call(
                descriptor.subsystem,
                descriptor.procedure,
                stream::iter([Bytes::from_static(b"hello")]),
            )
            .await
            .expect_err("should be closed")
            .current_context(),
        ConnectionPartiallyClosedError {
            read: true,
            write: false
        }
    );
}

#[tokio::test]
async fn call_do_not_admit_if_partially_closed_write() {
    // write is using a sink, so we first need to close it by pushing
    let (connection, _stream_tx, sink_rx, _tasks) = setup_connection(SessionConfig {
        no_delay: true,
        ..SessionConfig::default()
    });
    drop(sink_rx);

    tokio::task::yield_now().await;

    let descriptor = Descriptor::default();
    connection
        .call(descriptor.subsystem, descriptor.procedure, stream::empty())
        .await
        .expect("should be open");

    tokio::task::yield_now().await;

    // now we have sent a packet, so the connection should be registered as closed
    assert_eq!(
        *connection
            .call(descriptor.subsystem, descriptor.procedure, stream::empty())
            .await
            .expect_err("should be closed")
            .current_context(),
        ConnectionPartiallyClosedError {
            read: false,
            write: true
        }
    );
}

#[tokio::test]
async fn call_unhealthy_connection() {
    let (connection, stream_tx, _sink_rx, _tasks) = setup_connection(SessionConfig {
        no_delay: true,
        ..SessionConfig::default()
    });

    assert!(connection.is_healthy());

    drop(stream_tx);
    tokio::task::yield_now().await;

    assert!(!connection.is_healthy());
}

#[tokio::test]
async fn call_finished_removes_stale_entry() {
    let (connection, stream_tx, sink_rx, _tasks) = setup_connection(SessionConfig {
        no_delay: true,
        ..SessionConfig::default()
    });

    tokio::spawn(EchoSystem::new().serve(sink_rx, stream_tx));

    let descriptor = Descriptor::default();
    let payload = [Bytes::from_static(b"hello"), Bytes::from_static(b"world")];

    let mut stream = connection
        .call(
            descriptor.subsystem,
            descriptor.procedure,
            stream::iter(payload.clone()),
        )
        .await
        .expect("should not be closed");

    assert_eq!(connection.transactions.storage().len(), 1);

    let mut value = stream
        .next()
        .await
        .expect("should have a value")
        .expect("should not error");

    assert_stream(&mut value, descriptor, &payload).await;
    assert_eq!(connection.transactions.storage().len(), 0);
}

#[tokio::test]
async fn call_input_output_independent() {
    let (connection, stream_tx, sink_rx, _tasks) = setup_connection(SessionConfig {
        no_delay: true,
        ..SessionConfig::default()
    });

    let service = EchoSystem::new();
    let packets_received = Arc::clone(&service.packets_received);

    tokio::spawn(service.serve(sink_rx, stream_tx));

    let descriptor = Descriptor::default();
    let payload = [Bytes::from_static(b"hello"), Bytes::from_static(b"world")];

    let stream = connection
        .call(
            descriptor.subsystem,
            descriptor.procedure,
            stream::iter(payload.clone()),
        )
        .await
        .expect("should not be closed");

    // even tho we don't receive anything we should still be able to send
    drop(stream);

    tokio::time::sleep(Duration::from_millis(100)).await;

    // should still have received every packet
    assert_eq!(packets_received.load(Ordering::SeqCst), 3);
}

#[tokio::test]
async fn call_cancel() {
    let (connection, stream_tx, sink_rx, cancel, tasks) = setup_connection_mapped(
        SessionConfig {
            no_delay: true,
            ..SessionConfig::default()
        },
        |parts| parts.cancel.clone(),
    );

    tokio::spawn(EchoSystem::new().serve(sink_rx, stream_tx));

    assert_eq!(tasks.len(), 3);

    let descriptor = Descriptor::default();
    let payload = [Bytes::from_static(b"hello"), Bytes::from_static(b"world")];

    let _stream = connection
        .call(
            descriptor.subsystem,
            descriptor.procedure,
            stream::iter(payload.clone()),
        )
        .await
        .expect("should not be closed");

    assert_eq!(tasks.len(), 5);

    cancel.cancel();

    tasks.close();
    tokio::time::timeout(Duration::from_secs(1), tasks.wait())
        .await
        .expect("tasks should have finished");
}

#[tokio::test]
async fn connection_drop_stops_tasks() {
    let (connection, _stream_tx, _sink_rx, tasks) = setup_connection(SessionConfig {
        no_delay: true,
        ..SessionConfig::default()
    });
    drop(connection);

    tokio::time::sleep(Duration::from_millis(100)).await;

    tasks.close();
    tokio::time::timeout(Duration::from_secs(1), tasks.wait())
        .await
        .expect("tasks should have finished");
}

#[tokio::test]
async fn connection_idle_does_not_terminate() {
    let (connection, stream_tx, sink_rx, _tasks) = setup_connection(SessionConfig {
        no_delay: true,
        ..SessionConfig::default()
    });

    tokio::spawn(EchoSystem::new().serve(sink_rx, stream_tx));

    let descriptor = Descriptor::default();
    let payload = [Bytes::from_static(b"hello"), Bytes::from_static(b"world")];

    for _ in 0..2 {
        let mut stream = connection
            .call(
                descriptor.subsystem,
                descriptor.procedure,
                stream::iter(payload.clone()),
            )
            .await
            .expect("should not be closed");

        let mut value = stream
            .next()
            .await
            .expect("should have a value")
            .expect("should not error");

        assert_stream(&mut value, descriptor, &payload).await;
        assert_eq!(
            value.state().map(StreamState::is_end_of_response),
            Some(true)
        );

        assert!(stream.next().await.is_none());

        tokio::time::sleep(Duration::from_millis(100)).await;

        assert!(connection.is_healthy());
        assert!(connection.transactions.storage().is_empty());
    }
}

#[tokio::test]
async fn connection_drop_waits_for_transaction_to_finish() {
    let (connection, stream_tx, sink_rx, tasks) = setup_connection(SessionConfig {
        no_delay: true,
        ..SessionConfig::default()
    });

    tokio::spawn(EchoSystem::new().serve(sink_rx, stream_tx));

    let descriptor = Descriptor::default();
    let payload = [Bytes::from_static(b"hello"), Bytes::from_static(b"world")];

    let mut stream = connection
        .call(
            descriptor.subsystem,
            descriptor.procedure,
            stream::iter(payload.clone()),
        )
        .await
        .expect("should not be closed");

    drop(connection);

    let mut value = stream
        .next()
        .await
        .expect("should have a value")
        .expect("should not error");

    assert_stream(&mut value, descriptor, &payload).await;
    assert_eq!(
        value.state().map(StreamState::is_end_of_response),
        Some(true)
    );

    assert!(stream.next().await.is_none());

    tasks.close();

    tokio::time::timeout(Duration::from_secs(1), tasks.wait())
        .await
        .expect("tasks should have finished");
}

#[tokio::test]
async fn call_release_on_deadline_missed() {
    let (connection, stream_tx, sink_rx, _tasks) = setup_connection(SessionConfig {
        no_delay: true,
        response_delivery_deadline: Duration::from_millis(100),
        per_transaction_response_buffer_size: non_zero!(1),
        per_transaction_response_byte_stream_buffer_size: non_zero!(1),
        ..SessionConfig::default()
    });

    let service = EchoSystem::new();
    let packets_received = Arc::clone(&service.packets_received);

    tokio::spawn(service.serve(sink_rx, stream_tx));

    let descriptor = Descriptor::default();
    let payload = [
        Bytes::from_static(b"hello"),
        Bytes::from_static(b"world"),
        Bytes::from_static(b"!"),
        Bytes::from_static(b"?"),
    ];

    let mut stream = connection
        .call(
            descriptor.subsystem,
            descriptor.procedure,
            stream::iter(payload.clone()),
        )
        .await
        .expect("should not be closed");

    tokio::time::sleep(Duration::from_millis(200)).await;

    assert_eq!(packets_received.load(Ordering::SeqCst), 5);
    assert!(connection.is_healthy());

    let mut value = stream
        .next()
        .await
        .expect("should have a value")
        .expect("should not error");

    assert_stream(&mut value, descriptor, &payload[..3]).await;
    assert_eq!(
        value.state().map(StreamState::is_end_of_response),
        Some(false)
    );
}

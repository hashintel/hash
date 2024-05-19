use alloc::sync::Arc;
use core::time::Duration;
use std::io;

use error_stack::Report;
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    payload::Payload,
    protocol::{Protocol, ProtocolVersion},
    request::{
        body::RequestBody, flags::RequestFlags, frame::RequestFrame, header::RequestHeader, Request,
    },
    response::{
        body::ResponseBody, flags::ResponseFlags, frame::ResponseFrame, header::ResponseHeader,
        Response,
    },
    test_utils::mock_request_id,
};
use tachyonix::RecvError;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::{CancellationToken, PollSender};

use crate::session::{
    client::{
        config::SessionConfig,
        connection::{
            collection::TransactionCollection, ConnectionRequestDelegateTask,
            ConnectionResponseDelegateTask,
        },
        transaction::ClientTransactionPermit,
    },
    gc::ConnectionGarbageCollectorTask,
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
async fn transaction_collection_cancel_all() {
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let (permit_a, mut rx_a) = collection.acquire().await;
    let (permit_b, mut rx_b) = collection.acquire().await;
    let (permit_c, mut rx_c) = collection.acquire().await;

    collection.cancel_all();

    assert_eq!(rx_a.recv().await, Err(RecvError));
    assert!(permit_a.cancellation_token().is_cancelled());

    assert_eq!(rx_b.recv().await, Err(RecvError));
    assert!(permit_b.cancellation_token().is_cancelled());

    assert_eq!(rx_c.recv().await, Err(RecvError));
    assert!(permit_c.cancellation_token().is_cancelled());
}

#[tokio::test]
async fn transaction_permit_drop_removes_entry() {
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let (permit, _) = collection.acquire().await;
    let cloned = Arc::clone(&permit);

    drop(permit);
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    assert_eq!(collection.storage().len(), 1);

    drop(cloned);
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
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
        stream: ReceiverStream::new(stream_rx),
        tx: Arc::clone(collection.storage()),
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
        stream: ReceiverStream::new(stream_rx),
        tx: Arc::clone(collection.storage()),
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
        stream: ReceiverStream::new(stream_rx),
        tx: Arc::clone(collection.storage()),
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
        stream: ReceiverStream::new(stream_rx),
        tx: Arc::clone(collection.storage()),
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
        stream: ReceiverStream::new(stream_rx),
        tx: Arc::clone(collection.storage()),
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
        stream: ReceiverStream::new(stream_rx),
        tx: Arc::clone(collection.storage()),
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

#[tokio::test]
#[ignore]
async fn call() {}

#[tokio::test]
#[ignore]
async fn call_do_not_admit_if_partially_closed() {}

#[tokio::test]
#[ignore]
async fn call_input_connection_closed() {}

#[tokio::test]
#[ignore]
async fn call_output_connection_closed() {}

#[tokio::test]
#[ignore]
async fn call_unhealthy_connection() {}

#[tokio::test]
#[ignore]
async fn call_finished_removes_stale_entry() {}

#[tokio::test]
#[ignore]
async fn call_input_output_independent() {}

#[tokio::test]
#[ignore]
async fn call_cancel() {}

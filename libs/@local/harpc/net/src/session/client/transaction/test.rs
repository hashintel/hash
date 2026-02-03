use alloc::sync::Arc;
use core::{assert_matches, num::NonZero, time::Duration};

use bytes::{Bytes, BytesMut};
use futures::StreamExt as _;
use harpc_types::{error_code::ErrorCode, response_kind::ResponseKind};
use harpc_wire_protocol::{
    flags::BitFlagsOp as _,
    payload::Payload,
    protocol::{Protocol, ProtocolVersion},
    request::{
        Request, begin::RequestBegin, body::RequestBody, flags::RequestFlag, frame::RequestFrame,
        id::RequestId,
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
use tokio::{sync::mpsc, task};
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::CancellationToken;

use super::{
    ClientTransactionPermit, ErrorStream, TransactionReceiveTask, TransactionSendTask, ValueStream,
};
use crate::session::{
    client::{TransactionStream as _, config::SessionConfig, transaction::StreamState},
    test::Descriptor,
};

struct StaticTransactionPermit {
    id: RequestId,
    cancel: CancellationToken,
}

impl ClientTransactionPermit for StaticTransactionPermit {
    fn id(&self) -> RequestId {
        self.id
    }

    fn cancellation_token(&self) -> &CancellationToken {
        &self.cancel
    }
}

#[expect(clippy::type_complexity, reason = "test code")]
fn setup_recv_mapped<T>(
    config: SessionConfig,
    with_permit: impl FnOnce(&StaticTransactionPermit) -> T,
) -> (
    tachyonix::Sender<Response>,
    mpsc::Receiver<Result<ValueStream, ErrorStream>>,
    T,
    task::JoinHandle<()>,
) {
    let (response_tx, response_rx) = tachyonix::channel(8);
    let (stream_tx, stream_rx) = mpsc::channel(8);

    let permit = StaticTransactionPermit {
        id: mock_request_id(0x00),
        cancel: CancellationToken::new(),
    };

    let permit_value = with_permit(&permit);

    let task = TransactionReceiveTask {
        config,
        rx: response_rx,
        tx: stream_tx,
        permit: Arc::new(permit),
    };

    let handle = tokio::spawn(task.run());

    (response_tx, stream_rx, permit_value, handle)
}

fn setup_recv(
    config: SessionConfig,
) -> (
    tachyonix::Sender<Response>,
    mpsc::Receiver<Result<ValueStream, ErrorStream>>,
    task::JoinHandle<()>,
) {
    let (tx, rx, (), handler) = setup_recv_mapped(config, |_| ());

    (tx, rx, handler)
}

fn make_response_header(flags: impl Into<ResponseFlags>) -> ResponseHeader {
    ResponseHeader {
        protocol: Protocol {
            version: ProtocolVersion::V1,
        },
        request_id: mock_request_id(0x00),
        flags: flags.into(),
    }
}

fn make_response_begin(
    flags: impl Into<ResponseFlags>,
    kind: ResponseKind,
    payload: impl Into<Bytes>,
) -> Response {
    Response {
        header: make_response_header(flags),
        body: ResponseBody::Begin(ResponseBegin {
            kind,
            payload: Payload::new(payload),
        }),
    }
}

fn make_response_frame(flags: impl Into<ResponseFlags>, payload: impl Into<Bytes>) -> Response {
    Response {
        header: make_response_header(flags),
        body: ResponseBody::Frame(ResponseFrame {
            payload: Payload::new(payload),
        }),
    }
}

#[tokio::test]
async fn receive_single_response_ok() {
    let (tx, mut rx, handle) = setup_recv(SessionConfig::default());

    let response = make_response_begin(
        ResponseFlag::EndOfResponse,
        ResponseKind::Ok,
        b"hello world" as &[_],
    );

    tx.send(response).await.expect("able to send response");

    // we should get a single value stream, and after that the stream should have terminated,
    // because of the end of response
    let mut stream = rx
        .recv()
        .await
        .expect("able to receive stream")
        .expect("should be ok stream");

    // checking now (where it isn't closed yet), incomplete should be inconclusive
    assert!(stream.state().is_none());

    assert_eq!(
        stream
            .next()
            .await
            .expect("should be able to get response")
            .as_ref(),
        b"hello world"
    );

    assert!(stream.next().await.is_none());

    // after that we should've terminated and we should be endOfResponse
    assert_eq!(
        stream.state().map(StreamState::is_end_of_response),
        Some(true)
    );

    // after that the stream should have terminated
    assert!(rx.recv().await.is_none());

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn receive_empty_skipped() {
    let (tx, mut rx, handle) = setup_recv(SessionConfig::default());

    let response = make_response_begin(ResponseFlag::EndOfResponse, ResponseKind::Ok, &[] as &[_]);

    tx.send(response).await.expect("able to send response");

    // we should get a single value stream, and after that the stream should have terminated,
    // because of the end of response
    let mut stream = rx
        .recv()
        .await
        .expect("able to receive stream")
        .expect("should be ok stream");

    // checking now (where it isn't closed yet), incomplete should be inconclusive
    assert!(stream.state().is_none());

    assert!(stream.next().await.is_none());

    // after that we should've terminated and we should be endOfResponse
    assert_eq!(
        stream.state().map(StreamState::is_end_of_response),
        Some(true)
    );

    // after that the stream should have terminated
    assert!(rx.recv().await.is_none());

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn receive_single_response_error() {
    let (tx, mut rx, handle) = setup_recv(SessionConfig::default());

    let code = ErrorCode::new(NonZero::new(0xFF).expect("infallible"));
    let response = make_response_begin(
        ResponseFlag::EndOfResponse,
        ResponseKind::Err(code),
        b"hello world" as &[_],
    );

    tx.send(response).await.expect("able to send response");

    // we should get a single value stream, and after that the stream should have terminated,
    // because of the end of response
    let mut stream = rx
        .recv()
        .await
        .expect("able to receive stream")
        .expect_err("should be error stream");

    assert_eq!(stream.code(), code);

    // checking now (where it isn't closed yet), incomplete should be inconclusive
    assert!(stream.state().is_none());

    assert_eq!(
        stream
            .next()
            .await
            .expect("should be able to get response")
            .as_ref(),
        b"hello world"
    );

    assert!(stream.next().await.is_none());

    // after that we should've terminated and we should be endOfResponse
    assert_eq!(
        stream.state().map(StreamState::is_end_of_response),
        Some(true)
    );

    // after that the stream should have terminated
    assert!(rx.recv().await.is_none());

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn receive_response_wrong_request_id() {
    // this has the RequestId 0x01, but we send something with RequestId 0x02, this should never
    // happen, but resilience is key
    let (tx, mut rx, _) = setup_recv(SessionConfig::default());

    let mut incorrect = make_response_begin(
        ResponseFlag::EndOfResponse,
        ResponseKind::Ok,
        b"hello world" as &[_],
    );
    incorrect.header.request_id = mock_request_id(0x02);

    tx.send(incorrect.clone())
        .await
        .expect("able to send response");

    tokio::time::sleep(Duration::from_millis(100)).await;

    // we shouldn't have received a new stream
    assert!(rx.is_empty());

    // if we send a correct one, then and then send the incorrect one, the incorrect one shouldn't
    // get into the stream
    let response = make_response_begin(
        ResponseFlags::EMPTY,
        ResponseKind::Ok,
        b"hello world" as &[_],
    );
    tx.send(response).await.expect("able to send response");

    // we now have a stream
    let mut stream = rx
        .recv()
        .await
        .expect("able to receive stream")
        .expect("should be ok stream");

    // and with that also some bytes
    assert_eq!(
        stream
            .next()
            .await
            .expect("should be able to get response")
            .as_ref(),
        b"hello world"
    );

    // now we send the wrong one
    tx.send(incorrect).await.expect("able to send response");

    tokio::time::timeout(Duration::from_millis(100), stream.next())
        .await
        .expect_err("should not receive message");
}

#[tokio::test]
async fn receive_multiple_responses() {
    let (tx, mut rx, handle) = setup_recv(SessionConfig::default());

    let response = make_response_begin(ResponseFlags::EMPTY, ResponseKind::Ok, b"fruits:" as &[_]);
    tx.send(response).await.expect("able to send response");

    for fruit in ["apple", "pear", "orange", "grapefruit"] {
        let response = make_response_frame(ResponseFlags::EMPTY, fruit.as_bytes());
        tx.send(response).await.expect("able to send response");
    }

    let response = make_response_frame(ResponseFlag::EndOfResponse, b"banana" as &[_]);
    tx.send(response).await.expect("able to send response");

    let mut stream = rx
        .recv()
        .await
        .expect("able to receive stream")
        .expect("should be ok stream");

    let mut buffer = BytesMut::new();
    while let Some(chunk) = stream.next().await {
        buffer.extend_from_slice(chunk.as_ref());
    }

    assert_eq!(
        stream.state().map(StreamState::is_end_of_response),
        Some(true)
    );

    assert_eq!(buffer.as_ref(), b"fruits:applepearorangegrapefruitbanana");

    // after that the stream should have terminated
    assert!(rx.recv().await.is_none());

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn receive_multiple_streams() {
    let (tx, mut rx, handle) = setup_recv(SessionConfig::default());

    let response = make_response_begin(ResponseFlags::EMPTY, ResponseKind::Ok, b"fruits:" as &[_]);
    tx.send(response).await.expect("able to send response");

    let mut stream = rx
        .recv()
        .await
        .expect("able to receive stream")
        .expect("should be ok stream");

    assert_eq!(
        stream
            .next()
            .await
            .expect("should be able to get response")
            .as_ref(),
        b"fruits:"
    );

    let response = make_response_begin(
        ResponseFlags::EMPTY,
        ResponseKind::Ok,
        b"vegetables:" as &[_],
    );
    tx.send(response).await.expect("able to send response");

    // we started a new one, so that old one is invalidated
    assert!(stream.next().await.is_none());
    // ... it is also not end of response
    assert_eq!(
        stream.state().map(StreamState::is_end_of_response),
        Some(false)
    );

    // but we have a new stream
    let mut stream = rx
        .recv()
        .await
        .expect("able to receive stream")
        .expect("should be ok stream");

    assert_eq!(
        stream
            .next()
            .await
            .expect("should be able to get response")
            .as_ref(),
        b"vegetables:"
    );

    let error = ErrorCode::new(NonZero::new(0x01).expect("infallible"));
    let response = make_response_begin(
        ResponseFlags::EMPTY,
        ResponseKind::Err(error),
        b"error" as &[_],
    );
    tx.send(response).await.expect("able to send response");

    // we started a new one, so that old one is invalidated
    assert!(stream.next().await.is_none());
    // ... it is also not end of response
    assert_eq!(
        stream.state().map(StreamState::is_end_of_response),
        Some(false)
    );

    // but we have a new stream
    let mut stream = rx
        .recv()
        .await
        .expect("able to receive stream")
        .expect_err("should be error stream");

    assert_eq!(stream.code(), error);

    assert_eq!(
        stream
            .next()
            .await
            .expect("should be able to get response")
            .as_ref(),
        b"error"
    );

    // send an end of response
    let response = make_response_frame(ResponseFlag::EndOfResponse, b"end" as &[_]);
    tx.send(response).await.expect("able to send response");

    assert_eq!(
        stream
            .next()
            .await
            .expect("should be able to get response")
            .as_ref(),
        b"end"
    );
    assert!(stream.next().await.is_none());
    assert_eq!(
        stream.state().map(StreamState::is_end_of_response),
        Some(true)
    );

    // and now we should be done
    assert!(rx.is_closed());

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn receive_terminate_after_end_of_response() {
    let (tx, mut rx, handle) = setup_recv(SessionConfig::default());

    let response = make_response_begin(ResponseFlags::EMPTY, ResponseKind::Ok, b"fruits:" as &[_]);
    tx.send(response).await.expect("able to send response");

    let response = make_response_frame(ResponseFlag::EndOfResponse, b"apple" as &[_]);
    tx.send(response).await.expect("able to send response");

    let _stream = rx
        .recv()
        .await
        .expect("able to receive stream")
        .expect("should be ok stream");

    // after that the stream should have terminated
    assert!(rx.recv().await.is_none());

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn receive_receiver_closed() {
    let (tx, rx, handle) = setup_recv(SessionConfig::default());

    drop(rx);

    // sending an item will work, but will be "lost"
    let response = make_response_begin(ResponseFlags::EMPTY, ResponseKind::Ok, b"fruits:" as &[_]);
    tx.send(response).await.expect("able to send response");

    // the task should automatically shutdown
    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // and the sender should be closed
    assert!(tx.is_closed());
}

#[tokio::test]
async fn receive_receiver_closed_can_still_receive_but_not_start_new() {
    let (tx, mut rx, handle) = setup_recv(SessionConfig::default());

    let response = make_response_begin(ResponseFlags::EMPTY, ResponseKind::Ok, b"fruits:" as &[_]);
    tx.send(response).await.expect("able to send response");

    // if we have a stream it will wait until we're done
    let mut stream = rx
        .recv()
        .await
        .expect("able to receive stream")
        .expect("should be ok stream");

    drop(rx);

    // we should still be able to send and receive responses
    let response = make_response_frame(ResponseFlags::EMPTY, b"apple" as &[_]);
    tx.send(response).await.expect("able to send response");

    // we should be able to receive the responses
    assert_eq!(
        stream
            .next()
            .await
            .expect("should be able to get response")
            .as_ref(),
        b"fruits:"
    );
    assert_eq!(
        stream
            .next()
            .await
            .expect("should be able to get response")
            .as_ref(),
        b"apple"
    );

    // but if we just start a new stream? we shutdown and it won't be delivered
    let response = make_response_begin(
        ResponseFlags::EMPTY,
        ResponseKind::Ok,
        b"vegetables:" as &[_],
    );
    tx.send(response).await.expect("able to send response");

    // the task should automatically shutdown
    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // and the sender should be closed
    assert!(tx.is_closed());
}

#[tokio::test]
async fn receive_sender_closed() {
    let (tx, mut rx, handle) = setup_recv(SessionConfig::default());

    drop(tx);

    // the task should automatically shutdown
    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    assert!(rx.recv().await.is_none());

    // and the receiver should be closed
    assert!(rx.is_closed());
}

#[tokio::test]
async fn receive_sender_closed_mit_frame() {
    let (tx, mut rx, handle) = setup_recv(SessionConfig::default());

    let response = make_response_begin(ResponseFlags::EMPTY, ResponseKind::Ok, b"fruits:" as &[_]);
    tx.send(response).await.expect("able to send response");

    let response = make_response_frame(ResponseFlags::EMPTY, b"apple" as &[_]);
    tx.send(response).await.expect("able to send response");

    drop(tx);

    // the task should automatically shutdown
    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // we should receive a response, but that one should be the last
    let mut stream = rx
        .recv()
        .await
        .expect("able to receive stream")
        .expect("should be ok stream");
    assert_eq!(
        stream
            .next()
            .await
            .expect("should be able to get response")
            .as_ref(),
        b"fruits:"
    );
    assert_eq!(
        stream
            .next()
            .await
            .expect("should be able to get response")
            .as_ref(),
        b"apple"
    );
    assert_eq!(stream.next().await, None);
    assert_eq!(
        stream.state().map(StreamState::is_end_of_response),
        Some(false)
    );

    assert!(rx.recv().await.is_none());

    // and the receiver should be closed
    assert!(rx.is_closed());
}

#[tokio::test]
async fn receive_out_of_order_frame() {
    // we have a frame that has no beginning
    let (tx, mut rx, _handle) = setup_recv(SessionConfig::default());

    let response = make_response_frame(ResponseFlags::EMPTY, b"apple" as &[_]);
    tx.send(response).await.expect("able to send response");

    // should be completely ignored
    tokio::time::timeout(Duration::from_millis(100), rx.recv())
        .await
        .expect_err("should not receive a value");
}

// TODO: inhibit that one can buffer the stream, but taking a mutable reference in the stream item?!
// Won't properly work because `Stream` doesn't make use of GATs
#[tokio::test]
async fn receive_next_dropped() {
    let (tx, mut rx, handle) = setup_recv(SessionConfig::default());

    let response = make_response_begin(ResponseFlags::EMPTY, ResponseKind::Ok, b"fruits:" as &[_]);
    tx.send(response).await.expect("able to send response");

    let mut stream = rx
        .recv()
        .await
        .expect("able to receive stream")
        .expect("should be ok stream");

    assert_eq!(
        stream
            .next()
            .await
            .expect("should be able to get response")
            .as_ref(),
        b"fruits:"
    );

    drop(stream);

    // we drop the stream, but continue to send frames until the end, we enter the out of order
    // state meaning they just get ignored
    for _ in 0..10 {
        let response = make_response_frame(ResponseFlags::EMPTY, b"apple" as &[_]);
        tx.send(response).await.expect("able to send response");
    }

    tokio::time::timeout(Duration::from_millis(100), rx.recv())
        .await
        .expect_err("should not receive a value");

    // end of response should still work and shutdown the task
    let response = make_response_frame(ResponseFlag::EndOfResponse, b"apple" as &[_]);
    tx.send(response).await.expect("able to send response");

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn receive_cancel() {
    let (_tx, _rx, cancel, handle) = setup_recv_mapped(SessionConfig::default(), |permit| {
        permit.cancellation_token().clone()
    });

    cancel.cancel();

    // the task should automatically shutdown
    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

fn setup_send_mapped<T>(
    config: SessionConfig,
    descriptor: Descriptor,
    with_permit: impl FnOnce(&StaticTransactionPermit) -> T,
) -> (
    mpsc::Sender<Bytes>,
    mpsc::Receiver<Request>,
    T,
    task::JoinHandle<()>,
) {
    let (bytes_tx, bytes_rx) = mpsc::channel(8);
    let (request_tx, request_rx) = mpsc::channel(8);

    let permit = StaticTransactionPermit {
        id: mock_request_id(0x00),
        cancel: CancellationToken::new(),
    };

    let permit_value = with_permit(&permit);

    let task = TransactionSendTask {
        config,
        subsystem: descriptor.subsystem,
        procedure: descriptor.procedure,
        rx: ReceiverStream::new(bytes_rx),
        tx: request_tx,
        permit: Arc::new(permit),
    };

    let handle = tokio::spawn(task.run());

    (bytes_tx, request_rx, permit_value, handle)
}

fn setup_send(
    config: SessionConfig,
    descriptor: Descriptor,
) -> (
    mpsc::Sender<Bytes>,
    mpsc::Receiver<Request>,
    task::JoinHandle<()>,
) {
    let (tx, rx, (), handle) = setup_send_mapped(config, descriptor, |_| ());

    (tx, rx, handle)
}

#[tokio::test]
async fn send_drop_sender() {
    // what happens if we just send... nothing
    let descriptor = Descriptor::default();
    let (tx, mut rx, handle) = setup_send(SessionConfig::default(), descriptor);

    drop(tx);

    // the task should automatically shutdown
    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // even an immediate drop we should get a single request (empty, with endOfRequest)
    let request = rx.recv().await.expect("able to receive request");

    assert_matches!(
        request.body,
        RequestBody::Begin(RequestBegin {
            subsystem,
            procedure,
            payload
        }) if subsystem == descriptor.subsystem
            && procedure == descriptor.procedure
            && payload.is_empty()
    );
}

#[tokio::test]
async fn send_drop_receiver_no_delay() {
    let (tx, rx, handle) = setup_send(
        SessionConfig {
            no_delay: true,
            ..SessionConfig::default()
        },
        Descriptor::default(),
    );

    // the remote connection has been suddenly terminated
    drop(rx);

    // trying to send some bytes will work once
    tx.send(Bytes::from_static(b"apple"))
        .await
        .expect("able to send bytes");
    tokio::task::yield_now().await; // the other task needs to react to our message, so we need to yield control
    tx.send(Bytes::from_static(b"banana"))
        .await
        .expect_err("should not be able to send bytes");

    // the task should automatically shutdown
    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn send_drop_receiver_delay() {
    let (tx, rx, handle) = setup_send(
        SessionConfig {
            no_delay: false,
            ..SessionConfig::default()
        },
        Descriptor::default(),
    );

    // the remote connection has been suddenly terminated
    drop(rx);

    // trying to send some bytes will work once, even if we don't flush in delay mode, we still
    // check the underlying connection on write.
    tx.send(Bytes::from_static(b"apple"))
        .await
        .expect("able to send bytes");
    tokio::task::yield_now().await; // the other task needs to react to our message, so we need to yield control
    // force a flush
    tx.send(Bytes::from(vec![0; Payload::MAX_SIZE]))
        .await
        .expect_err("should not be able to send bytes");

    // the task should automatically shutdown
    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn send_no_delay() {
    let descriptor = Descriptor::default();
    let (tx, mut rx, handle) = setup_send(
        SessionConfig {
            no_delay: true,
            ..SessionConfig::default()
        },
        descriptor,
    );

    tx.send(Bytes::from_static(b"apple"))
        .await
        .expect("able to send bytes");
    // should be instantly delivered
    let request = rx.recv().await.expect("able to receive request");
    assert!(!request.header.flags.contains(RequestFlag::EndOfRequest));
    assert_matches!(
        request.body,
        RequestBody::Begin(RequestBegin {
            subsystem,
            procedure,
            payload
        }) if subsystem == descriptor.subsystem
            && procedure == descriptor.procedure
            && *payload.as_bytes() == Bytes::from_static(b"apple")
    );

    // drop the sender to close the connection
    drop(tx);

    let request = rx.recv().await.expect("able to receive request");
    assert!(request.header.flags.contains(RequestFlag::EndOfRequest));
    assert_matches!(
        request.body,
        RequestBody::Frame(RequestFrame { payload }) if payload.is_empty()
    );

    // the task should automatically shutdown
    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn send_no_delay_flush_empty() {
    let descriptor = Descriptor::default();
    let (tx, mut rx, handle) = setup_send(
        SessionConfig {
            no_delay: true,
            ..SessionConfig::default()
        },
        descriptor,
    );

    drop(tx);

    let request = rx.recv().await.expect("able to receive request");
    assert!(request.header.flags.contains(RequestFlag::EndOfRequest));
    assert_matches!(
        request.body,
        RequestBody::Begin(RequestBegin {
            subsystem,
            procedure,
            payload
        }) if subsystem == descriptor.subsystem
            && procedure == descriptor.procedure
            && payload.is_empty()
    );

    // the task should automatically shutdown
    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn send_delay() {
    let descriptor = Descriptor::default();
    let (tx, mut rx, handle) = setup_send(
        SessionConfig {
            no_delay: false,
            ..SessionConfig::default()
        },
        descriptor,
    );

    tx.send(Bytes::from(vec![0; Payload::MAX_SIZE - 8]))
        .await
        .expect("able to send bytes");

    // we shouldn't receive anything yet
    tokio::time::timeout(Duration::from_millis(100), rx.recv())
        .await
        .expect_err("should not receive anything yet");

    // send the rest to trigger a write
    tx.send(Bytes::from_static(&[0; 16]))
        .await
        .expect("able to send bytes");

    // should be instantly delivered
    let request = rx.recv().await.expect("able to receive request");
    assert!(!request.header.flags.contains(RequestFlag::EndOfRequest));
    assert_matches!(
        request.body,
        RequestBody::Begin(RequestBegin {
            subsystem,
            procedure,
            payload
        }) if subsystem == descriptor.subsystem
            && procedure == descriptor.procedure
            && payload.len() == Payload::MAX_SIZE
    );

    drop(tx);

    // now we should have 8 bytes of payload left
    let request = rx.recv().await.expect("able to receive request");
    assert!(request.header.flags.contains(RequestFlag::EndOfRequest));
    assert_matches!(
        request.body,
        RequestBody::Frame(RequestFrame { payload }) if payload.len() == 8
    );

    // the task should automatically shutdown
    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn send_delay_flush_partial() {
    let descriptor = Descriptor::default();
    let (tx, mut rx, handle) = setup_send(
        SessionConfig {
            no_delay: false,
            ..SessionConfig::default()
        },
        descriptor,
    );

    tx.send(Bytes::from(vec![0; Payload::MAX_SIZE]))
        .await
        .expect("able to send bytes");

    // we shouldn't receive anything yet
    tokio::time::timeout(Duration::from_millis(100), rx.recv())
        .await
        .expect_err("should not receive anything yet");

    drop(tx);

    let request = rx.recv().await.expect("able to receive request");
    assert!(request.header.flags.contains(RequestFlag::EndOfRequest));
    assert_matches!(
        request.body,
        RequestBody::Begin(RequestBegin {
            subsystem,
            procedure,
            payload
        }) if subsystem == descriptor.subsystem
            && procedure == descriptor.procedure
            && payload.len() == Payload::MAX_SIZE
    );

    // the task should automatically shutdown
    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn send_delay_flush_empty() {
    let descriptor = Descriptor::default();
    let (tx, mut rx, handle) = setup_send(
        SessionConfig {
            no_delay: false,
            ..SessionConfig::default()
        },
        descriptor,
    );

    drop(tx);

    let request = rx.recv().await.expect("able to receive request");
    assert!(request.header.flags.contains(RequestFlag::EndOfRequest));
    assert_matches!(
        request.body,
        RequestBody::Begin(RequestBegin {
            subsystem,
            procedure,
            payload
        }) if subsystem == descriptor.subsystem
            && procedure == descriptor.procedure
            && payload.is_empty()
    );

    // the task should automatically shutdown
    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn send_cancel() {
    let (_tx, _rx, cancel, handle) =
        setup_send_mapped(SessionConfig::default(), Descriptor::default(), |permit| {
            permit.cancel.clone()
        });

    cancel.cancel();

    // the task should automatically shutdown
    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

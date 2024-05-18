use alloc::sync::Arc;
use core::{num::NonZero, time::Duration};

use bytes::{Bytes, BytesMut};
use futures::StreamExt;
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    payload::Payload,
    protocol::{Protocol, ProtocolVersion},
    request::id::RequestId,
    response::{
        begin::ResponseBegin,
        body::ResponseBody,
        flags::{ResponseFlag, ResponseFlags},
        frame::ResponseFrame,
        header::ResponseHeader,
        kind::{ErrorCode, ResponseKind},
        Response,
    },
    test_utils::mock_request_id,
};
use tokio::{sync::mpsc, task};
use tokio_util::sync::CancellationToken;

use super::{ErrorStream, Permit, TransactionReceiveTask, ValueStream};
use crate::session::client::config::SessionConfig;

struct StaticTransactionPermit {
    id: RequestId,
    cancel: CancellationToken,
}

impl Permit for StaticTransactionPermit {
    fn id(&self) -> RequestId {
        self.id
    }

    fn cancellation_token(&self) -> CancellationToken {
        self.cancel.clone()
    }
}

fn setup_recv(
    config: SessionConfig,
) -> (
    tachyonix::Sender<Response>,
    mpsc::Receiver<Result<ValueStream, ErrorStream>>,
    task::JoinHandle<()>,
) {
    let (response_tx, response_rx) = tachyonix::channel(8);
    let (stream_tx, stream_rx) = mpsc::channel(8);

    let task = TransactionReceiveTask {
        config,
        rx: response_rx,
        tx: stream_tx,
        permit: Arc::new(StaticTransactionPermit {
            id: mock_request_id(0x00),
            cancel: CancellationToken::new(),
        }),
    };

    let handle = tokio::spawn(task.run());

    (response_tx, stream_rx, handle)
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
    assert_eq!(stream.is_end_of_response(), None);

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
    assert_eq!(stream.is_end_of_response(), Some(true));

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
    assert_eq!(stream.is_end_of_response(), None);

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
    assert_eq!(stream.is_end_of_response(), Some(true));

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
    let (tx, mut rx, handle) = setup_recv(SessionConfig::default());

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

    assert_eq!(stream.is_end_of_response(), Some(true));

    assert_eq!(buffer.as_ref(), b"fruits:applepearorangegrapefruitbanana");
}

#[tokio::test]
#[ignore]
async fn receive_multiple_streams() {}

#[tokio::test]
#[ignore]
async fn receive_terminate_after_end_of_response() {}

#[tokio::test]
#[ignore]
async fn receive_receiver_closed() {}

#[tokio::test]
#[ignore]
async fn receive_sender_closed() {}

#[tokio::test]
#[ignore]
async fn receive_out_of_order_frame() {}

// TODO: inhibit that one can buffer the stream, but taking a mutable reference in the stream item?!
#[tokio::test]
#[ignore]
async fn receive_next_dropped() {}

#[tokio::test]
#[ignore]
async fn receive_cancel() {}

#[tokio::test]
#[ignore]
async fn send_no_delay() {}

#[tokio::test]
#[ignore]
async fn send_no_delay_flush_empty() {}

#[tokio::test]
#[ignore]
async fn send_delay() {}

#[tokio::test]
#[ignore]
async fn send_delay_flush() {}

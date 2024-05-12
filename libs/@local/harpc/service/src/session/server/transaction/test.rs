use alloc::sync::Arc;
use core::{
    num::NonZero,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use bytes::Bytes;
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
        id::RequestId,
        procedure::ProcedureDescriptor,
        service::ServiceDescriptor,
        Request,
    },
    response::{
        begin::ResponseBegin,
        body::ResponseBody,
        flags::{ResponseFlag, ResponseFlags},
        frame::ResponseFrame,
        kind::{ErrorCode, ResponseKind},
        Response,
    },
};
use tokio::{sync::mpsc, task::JoinHandle};
use tokio_util::sync::CancellationToken;

use super::TransactionRecvDelegateTask;
use crate::session::{
    error::TransactionError,
    server::{transaction::TransactionSendDelegateTask, SessionConfig},
};

fn config_delay() -> SessionConfig {
    SessionConfig {
        no_delay: false,
        ..SessionConfig::default()
    }
}

fn config_no_delay() -> SessionConfig {
    SessionConfig {
        no_delay: true,
        ..SessionConfig::default()
    }
}

fn setup_send(
    no_delay: bool,
) -> (
    mpsc::Sender<Result<Bytes, TransactionError>>,
    mpsc::Receiver<Response>,
    JoinHandle<()>,
) {
    // we choose 8 here, so that we can buffer all replies easily and not spawn an extra task
    let (bytes_tx, bytes_rx) = mpsc::channel(8);
    let (response_tx, response_rx) = mpsc::channel(8);

    let task = TransactionSendDelegateTask {
        id: RequestId::new_unchecked(0),
        config: if no_delay {
            config_no_delay()
        } else {
            config_delay()
        },
        rx: bytes_rx,
        tx: response_tx,
    };

    let handle = tokio::spawn(task.run(CancellationToken::new()));

    (bytes_tx, response_rx, handle)
}

#[derive(Debug, Copy, Clone)]
struct ExpectedBegin<'a, T: ?Sized> {
    flags: ResponseFlags,
    kind: ResponseKind,
    payload: &'a T,
}

#[track_caller]
fn assert_begin(response: &Response, expected: ExpectedBegin<impl AsRef<[u8]> + ?Sized>) {
    let ResponseBody::Begin(ResponseBegin { kind, payload }) = &response.body else {
        panic!("expected begin response, got {response:?}");
    };

    assert_eq!(response.header.flags, expected.flags);
    assert_eq!(*kind, expected.kind);
    assert_eq!(payload.as_ref(), expected.payload.as_ref());
}

#[derive(Debug, Copy, Clone)]
struct ExpectedFrame<'a, T: ?Sized> {
    flags: ResponseFlags,
    payload: &'a T,
}

#[track_caller]
fn assert_frame(response: &Response, expected: ExpectedFrame<impl AsRef<[u8]> + ?Sized>) {
    let ResponseBody::Frame(ResponseFrame { payload }) = &response.body else {
        panic!("expected frame response, got {response:?}");
    };

    assert_eq!(response.header.flags, expected.flags);
    assert_eq!(payload.as_ref(), expected.payload.as_ref());
}

#[tokio::test]
async fn send_delay_perfect_buffer() {
    let (bytes_tx, mut response_rx, handle) = setup_send(false);

    // send a message that fits perfectly into the buffer
    // this should not trigger any splitting
    let payload = Bytes::from_static(&[0; Payload::MAX_SIZE]);

    bytes_tx
        .send(Ok(payload.clone()))
        .await
        .expect("should not be closed");

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // we should receive 1 packet
    let mut responses = Vec::with_capacity(1);
    let available = response_rx.recv_many(&mut responses, 1).await;
    assert_eq!(available, 1);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            kind: ResponseKind::Ok,
            payload: &payload,
        },
    );
}

#[tokio::test]
async fn send_delay_split_large() {
    let (bytes_tx, mut response_rx, handle) = setup_send(false);

    // send a large message that needs to be split into multiple parts
    let payload = Bytes::from_static(&[0; Payload::MAX_SIZE + 8]);

    bytes_tx
        .send(Ok(payload.clone()))
        .await
        .expect("should not be closed");

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // we should receive 2 packets, the last packet should have the end of request flag set
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 2);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Ok,
            payload: &payload[..Payload::MAX_SIZE],
        },
    );

    assert_frame(
        &responses[1],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &payload[Payload::MAX_SIZE..],
        },
    );
}

#[tokio::test]
async fn send_delay_split_large_multiple() {
    let (bytes_tx, mut response_rx, handle) = setup_send(false);

    // send a large message that needs to be split into multiple parts
    let payload = Bytes::from_static(&[0; (Payload::MAX_SIZE * 2) + 8]);

    bytes_tx
        .send(Ok(payload.clone()))
        .await
        .expect("should not be closed");

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // we should receive 3 packets, the last packet should have the end of request flag set
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 3);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Ok,
            payload: &payload[..Payload::MAX_SIZE],
        },
    );

    assert_frame(
        &responses[1],
        ExpectedFrame {
            flags: ResponseFlags::EMPTY,
            payload: &payload[Payload::MAX_SIZE..(Payload::MAX_SIZE * 2)],
        },
    );

    assert_frame(
        &responses[2],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &payload[(Payload::MAX_SIZE * 2)..],
        },
    );
}

#[tokio::test]
async fn send_delay_merge_small() {
    let (bytes_tx, mut response_rx, handle) = setup_send(false);

    // send a couple of small messages that can be merged into a single packet
    let payload = Bytes::from_static(&[0, 1, 2, 3, 4, 5, 6, 7]);

    for _ in 0..4 {
        bytes_tx
            .send(Ok(payload.clone()))
            .await
            .expect("should not be closed");
    }

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // we should receive a single packet
    // the last packet should have the end of request flag set
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 1);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            kind: ResponseKind::Ok,
            payload: &payload.repeat(4),
        },
    );
}

#[tokio::test]
async fn send_delay_flush_remaining() {
    let (bytes_tx, mut response_rx, handle) = setup_send(false);

    // send a packet that is to be split into multiple frames
    let payload = Bytes::from_static(&[0; Payload::MAX_SIZE + 8]);

    bytes_tx
        .send(Ok(payload.clone()))
        .await
        .expect("should not be closed");

    // wait until the task has processed all messages
    while bytes_tx.capacity() != bytes_tx.max_capacity() {
        tokio::task::yield_now().await;
    }

    // we should have a single packet in the buffer
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 1);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Ok,
            payload: &payload[..Payload::MAX_SIZE],
        },
    );

    // dropping the sender means that we now flush the remaining messages
    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // we should receive a single packet
    // the last packet should have the end of request flag set
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 1);

    assert_frame(
        &responses[0],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &payload[Payload::MAX_SIZE..],
        },
    );
}

#[tokio::test]
async fn send_delay_flush_empty() {
    let (bytes_tx, mut response_rx, handle) = setup_send(false);

    // send a couple of small messages that can be merged into a single packet
    let payload = Bytes::from_static(&[0, 1, 2, 3, 4, 5, 6, 7]);

    for _ in 0..4 {
        bytes_tx
            .send(Ok(payload.clone()))
            .await
            .expect("should not be closed");
    }

    // wait until the task has processed all messages
    while bytes_tx.capacity() != bytes_tx.max_capacity() {
        tokio::task::yield_now().await;
    }

    // we should have not received any packets yet, even though the have been processed
    assert!(response_rx.is_empty());

    // dropping the sender means that we now flush the remaining messages
    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // we should receive a single packet
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 1);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            kind: ResponseKind::Ok,
            payload: &payload.repeat(4),
        },
    );
}

#[tokio::test]
async fn send_delay_empty() {
    let (bytes_tx, mut response_rx, handle) = setup_send(false);

    // dropping the sender means that we now flush the remaining messages
    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // we should receive a single packet
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 1);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            kind: ResponseKind::Ok,
            payload: &[],
        },
    );
}

#[tokio::test]
async fn send_delay_empty_bytes() {
    let (bytes_tx, mut response_rx, handle) = setup_send(false);

    bytes_tx
        .send(Ok(Bytes::new()))
        .await
        .expect("should not be closed");

    // dropping the sender means that we now flush the remaining messages
    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // we should receive a single packet
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 1);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            kind: ResponseKind::Ok,
            payload: &[],
        },
    );
}

#[tokio::test]
async fn send_delay_error_immediate() {
    let (bytes_tx, mut response_rx, handle) = setup_send(false);

    // send an error message
    let payload = Bytes::from_static(&[0, 1, 2, 3, 4, 5, 6, 7]);
    let code = ErrorCode::new(NonZero::new(0xFF_FF).expect("infallible"));

    bytes_tx
        .send(Err(TransactionError {
            code,
            bytes: payload.clone(),
        }))
        .await
        .expect("should not be closed");

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 1);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            kind: ResponseKind::Err(code),
            payload: &payload,
        },
    );
}

#[tokio::test]
async fn send_delay_error_delayed() {
    let (bytes_tx, mut response_rx, handle) = setup_send(false);

    // if we send a packet that is too large, we'll split, but when we encounter an error we
    // will discard the remaining messages
    let payload_ok = Bytes::from_static(&[0; Payload::MAX_SIZE + 8]);

    bytes_tx
        .send(Ok(payload_ok.clone()))
        .await
        .expect("should not be closed");

    // send an error message
    let payload_err = Bytes::from_static(&[0, 1, 2, 3, 4, 5, 6, 7]);
    let code = ErrorCode::new(NonZero::new(0xFF_FF).expect("infallible"));

    bytes_tx
        .send(Err(TransactionError {
            code,
            bytes: payload_err.clone(),
        }))
        .await
        .expect("should not be closed");

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // we should have received two packets, first ok, then error
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 2);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Ok,
            payload: &payload_ok[..Payload::MAX_SIZE],
        },
    );

    assert_begin(
        &responses[1],
        ExpectedBegin {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            kind: ResponseKind::Err(code),
            payload: &payload_err,
        },
    );
}

#[tokio::test]
async fn send_delay_error_multiple() {
    let (bytes_tx, mut response_rx, handle) = setup_send(false);

    // errors behave the same as normal messages in their flushing behaviour, which means that
    // only that you are unable to have a stream or error bytes and their values need to be
    // fully buffered.

    let payload_err = Bytes::from_static(&[0; Payload::MAX_SIZE + 8]);
    let code = ErrorCode::new(NonZero::new(0xFF_FF).expect("infallible"));

    for _ in 0..4 {
        bytes_tx
            .send(Err(TransactionError {
                code,
                bytes: payload_err.clone(),
            }))
            .await
            .expect("should not be closed");
    }

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // we should have received 5 packets, all errors
    let mut responses = Vec::with_capacity(8);
    let available = response_rx.recv_many(&mut responses, 8).await;
    assert_eq!(available, 5);

    // the first four should be the same
    for response in &responses[..4] {
        assert_begin(
            response,
            ExpectedBegin {
                flags: ResponseFlags::EMPTY,
                kind: ResponseKind::Err(code),
                payload: &payload_err[..Payload::MAX_SIZE],
            },
        );
    }

    assert_frame(
        &responses[4],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &payload_err[Payload::MAX_SIZE..],
        },
    );
}

#[tokio::test]
async fn send_delay_error_interspersed() {
    // once we have an error message, we no longer send any more messages
    let (bytes_tx, mut response_rx, handle) = setup_send(false);

    let payload_ok = Bytes::from_static(&[0; Payload::MAX_SIZE + 8]);
    let payload_err = Bytes::from_static(&[0; Payload::MAX_SIZE + 8]);
    let code = ErrorCode::new(NonZero::new(0xFF_FF).expect("infallible"));

    for _ in 0..4 {
        bytes_tx
            .send(Ok(payload_ok.clone()))
            .await
            .expect("should not be closed");

        bytes_tx
            .send(Err(TransactionError {
                code,
                bytes: payload_err.clone(),
            }))
            .await
            .expect("should not be closed");
    }

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // we're expected to have 5 packets, 1 ok, 5 errors
    let mut responses = Vec::with_capacity(8);
    let available = response_rx.recv_many(&mut responses, 8).await;
    assert_eq!(available, 6);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Ok,
            payload: &payload_ok[..Payload::MAX_SIZE],
        },
    );

    for response in &responses[1..5] {
        assert_begin(
            response,
            ExpectedBegin {
                flags: ResponseFlags::EMPTY,
                kind: ResponseKind::Err(code),
                payload: &payload_err[..Payload::MAX_SIZE],
            },
        );
    }

    assert_frame(
        &responses[5],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &payload_err[Payload::MAX_SIZE..],
        },
    );
}

#[tokio::test]
async fn send_delay_error_interspersed_small() {
    // if we actually have a small payload, we don't even send the intermediate errors
    let (bytes_tx, mut response_rx, handle) = setup_send(false);

    let payload_ok = Bytes::from_static(&[0; 8]);
    let payload_err = Bytes::from_static(&[0; 8]);
    let code = ErrorCode::new(NonZero::new(0xFF_FF).expect("infallible"));

    for _ in 0..4 {
        bytes_tx
            .send(Ok(payload_ok.clone()))
            .await
            .expect("should not be closed");

        bytes_tx
            .send(Err(TransactionError {
                code,
                bytes: payload_err.clone(),
            }))
            .await
            .expect("should not be closed");
    }

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // we're expected to have 1 packet
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 1);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            kind: ResponseKind::Err(code),
            payload: &payload_ok,
        },
    );
}

#[tokio::test]
async fn send_delay_error_split_large() {
    let (bytes_tx, mut response_rx, handle) = setup_send(false);

    // if we have a large payload we split it into multiple frames
    let payload_err = Bytes::from_static(&[0; Payload::MAX_SIZE + 8]);
    let code = ErrorCode::new(NonZero::new(0xFF_FF).expect("infallible"));

    bytes_tx
        .send(Err(TransactionError {
            code,
            bytes: payload_err.clone(),
        }))
        .await
        .expect("should not be closed");

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // we're expected to have 2 packets
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 2);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Err(code),
            payload: &payload_err[..Payload::MAX_SIZE],
        },
    );

    assert_frame(
        &responses[1],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &payload_err[Payload::MAX_SIZE..],
        },
    );
}

#[tokio::test]
async fn send_no_delay_split_large() {
    let (bytes_tx, mut response_rx, handle) = setup_send(true);

    let payload_ok = Bytes::from_static(&[0; Payload::MAX_SIZE + 8]);

    bytes_tx
        .send(Ok(payload_ok.clone()))
        .await
        .expect("should not be closed");

    while bytes_tx.capacity() != bytes_tx.max_capacity() {
        tokio::task::yield_now().await;
    }

    // we should have two packets already available
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 2);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Ok,
            payload: &payload_ok[..Payload::MAX_SIZE],
        },
    );

    assert_frame(
        &responses[1],
        ExpectedFrame {
            flags: ResponseFlags::EMPTY,
            payload: &payload_ok[Payload::MAX_SIZE..],
        },
    );

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // last sent is end of frame
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 1);

    assert_frame(
        &responses[0],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &[],
        },
    );
}

#[tokio::test]
async fn send_no_delay_split_large_multiple() {
    let (bytes_tx, mut response_rx, handle) = setup_send(true);

    let payload_ok = Bytes::from_static(&[0; (Payload::MAX_SIZE * 2) + 8]);

    bytes_tx
        .send(Ok(payload_ok.clone()))
        .await
        .expect("should not be closed");

    while bytes_tx.capacity() != bytes_tx.max_capacity() {
        tokio::task::yield_now().await;
    }

    // we should have three packets already available
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 3);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Ok,
            payload: &payload_ok[..Payload::MAX_SIZE],
        },
    );

    assert_frame(
        &responses[1],
        ExpectedFrame {
            flags: ResponseFlags::EMPTY,
            payload: &payload_ok[Payload::MAX_SIZE..(Payload::MAX_SIZE * 2)],
        },
    );

    assert_frame(
        &responses[2],
        ExpectedFrame {
            flags: ResponseFlags::EMPTY,
            payload: &payload_ok[(Payload::MAX_SIZE * 2)..],
        },
    );

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // last frame is end of response
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 1);

    assert_frame(
        &responses[0],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &[],
        },
    );
}

#[tokio::test]
async fn send_no_delay_no_merge_small() {
    let (bytes_tx, mut response_rx, handle) = setup_send(true);

    // send a couple of small payloads, we should get the same amount of responses
    let payload_ok = Bytes::from_static(&[0; 8]);

    for _ in 0..4 {
        bytes_tx
            .send(Ok(payload_ok.clone()))
            .await
            .expect("should not be closed");
    }

    while bytes_tx.capacity() != bytes_tx.max_capacity() {
        tokio::task::yield_now().await;
    }

    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 4);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Ok,
            payload: &payload_ok,
        },
    );

    for response in &responses[1..] {
        assert_frame(
            response,
            ExpectedFrame {
                flags: ResponseFlags::EMPTY,
                payload: &payload_ok,
            },
        );
    }

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    // last frame is end of response
    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 1);

    assert_frame(
        &responses[0],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &[],
        },
    );
}

#[tokio::test]
async fn send_no_delay_empty() {
    let (bytes_tx, mut response_rx, handle) = setup_send(true);

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 1);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            kind: ResponseKind::Ok,
            payload: &[],
        },
    );
}

#[tokio::test]
async fn send_no_delay_empty_pushed() {
    let (bytes_tx, mut response_rx, handle) = setup_send(true);

    bytes_tx
        .send(Ok(Bytes::new()))
        .await
        .expect("should not be closed");

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 1);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            kind: ResponseKind::Ok,
            payload: &[],
        },
    );
}

#[tokio::test]
async fn send_no_delay_skip_empty() {
    let (bytes_tx, mut response_rx, handle) = setup_send(true);

    bytes_tx
        .send(Ok(Bytes::from_static(&[0x00, 0x01])))
        .await
        .expect("should not be closed");

    bytes_tx
        .send(Ok(Bytes::new()))
        .await
        .expect("should not be closed");

    bytes_tx
        .send(Ok(Bytes::from_static(&[0x02, 0x03])))
        .await
        .expect("should not be closed");

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 3);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Ok,
            payload: &[0x00, 0x01],
        },
    );

    assert_frame(
        &responses[1],
        ExpectedFrame {
            flags: ResponseFlags::EMPTY,
            payload: &[0x02, 0x03],
        },
    );

    assert_frame(
        &responses[2],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &[],
        },
    );
}

#[tokio::test]
async fn send_no_delay_error_immediate() {
    let (bytes_tx, mut response_rx, handle) = setup_send(true);

    let payload_err = Bytes::from_static(b"error");
    let code = ErrorCode::new(NonZero::new(0xFF_FF).expect("infallible"));

    bytes_tx
        .send(Err(TransactionError {
            code,
            bytes: payload_err.clone(),
        }))
        .await
        .expect("should not be closed");

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 2);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Err(code),
            payload: &payload_err,
        },
    );

    assert_frame(
        &responses[1],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &[],
        },
    );
}

#[tokio::test]
async fn send_no_delay_error_delayed() {
    let (bytes_tx, mut response_rx, handle) = setup_send(true);

    let payload_ok = Bytes::from_static(b"ok");
    let payload_err = Bytes::from_static(b"error");
    let code = ErrorCode::new(NonZero::new(0xFF_FF).expect("infallible"));

    bytes_tx
        .send(Ok(payload_ok.clone()))
        .await
        .expect("should not be closed");

    bytes_tx
        .send(Err(TransactionError {
            code,
            bytes: payload_err.clone(),
        }))
        .await
        .expect("should not be closed");

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 3);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Ok,
            payload: &payload_ok,
        },
    );

    assert_begin(
        &responses[1],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Err(code),
            payload: &payload_err,
        },
    );

    assert_frame(
        &responses[2],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &[],
        },
    );
}

#[tokio::test]
async fn send_no_delay_error_multiple() {
    let (bytes_tx, mut response_rx, handle) = setup_send(true);

    let payload_ok = Bytes::from_static(b"ok");
    let payload_err = Bytes::from_static(b"error");
    let code = ErrorCode::new(NonZero::new(0xFF_FF).expect("infallible"));

    bytes_tx
        .send(Ok(payload_ok.clone()))
        .await
        .expect("should not be closed");

    for _ in 0..3 {
        bytes_tx
            .send(Err(TransactionError {
                code,
                bytes: payload_err.clone(),
            }))
            .await
            .expect("should not be closed");
    }

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    let mut responses = Vec::with_capacity(8);
    let available = response_rx.recv_many(&mut responses, 8).await;
    assert_eq!(available, 5);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Ok,
            payload: &payload_ok,
        },
    );

    for response in &responses[1..4] {
        assert_begin(
            response,
            ExpectedBegin {
                flags: ResponseFlags::EMPTY,
                kind: ResponseKind::Err(code),
                payload: &payload_err,
            },
        );
    }

    assert_frame(
        &responses[4],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &[],
        },
    );
}

#[tokio::test]
async fn send_no_delay_error_interspersed() {
    let (bytes_tx, mut response_rx, handle) = setup_send(true);

    let payload_ok = Bytes::from_static(b"ok");
    let payload_err = Bytes::from_static(b"error");
    let code = ErrorCode::new(NonZero::new(0xFF_FF).expect("infallible"));

    for _ in 0..3 {
        bytes_tx
            .send(Ok(payload_ok.clone()))
            .await
            .expect("should not be closed");

        bytes_tx
            .send(Err(TransactionError {
                code,
                bytes: payload_err.clone(),
            }))
            .await
            .expect("should not be closed");
    }

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    let mut responses = Vec::with_capacity(8);
    let available = response_rx.recv_many(&mut responses, 8).await;
    assert_eq!(available, 5);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Ok,
            payload: &payload_ok,
        },
    );

    for response in &responses[1..4] {
        assert_begin(
            response,
            ExpectedBegin {
                flags: ResponseFlags::EMPTY,
                kind: ResponseKind::Err(code),
                payload: &payload_err,
            },
        );
    }

    assert_frame(
        &responses[4],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &[],
        },
    );
}

#[tokio::test]
async fn send_no_delay_error_split_large() {
    let (bytes_tx, mut response_rx, handle) = setup_send(true);

    let payload_err = Bytes::from_static(&[0; Payload::MAX_SIZE + 8]);
    let code = ErrorCode::new(NonZero::new(0xFF_FF).expect("infallible"));

    bytes_tx
        .send(Err(TransactionError {
            code,
            bytes: payload_err.clone(),
        }))
        .await
        .expect("should not be closed");

    drop(bytes_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    let mut responses = Vec::with_capacity(4);
    let available = response_rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 3);

    assert_begin(
        &responses[0],
        ExpectedBegin {
            flags: ResponseFlags::EMPTY,
            kind: ResponseKind::Err(code),
            payload: &payload_err[..Payload::MAX_SIZE],
        },
    );

    assert_frame(
        &responses[1],
        ExpectedFrame {
            flags: ResponseFlags::EMPTY,
            payload: &payload_err[Payload::MAX_SIZE..],
        },
    );

    assert_frame(
        &responses[2],
        ExpectedFrame {
            flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            payload: &[],
        },
    );
}

fn setup_recv() -> (
    tachyonix::Sender<Request>,
    mpsc::Receiver<Bytes>,
    Arc<AtomicBool>,
    JoinHandle<()>,
) {
    let (request_tx, request_rx) = tachyonix::channel(8);
    let (bytes_tx, bytes_rx) = mpsc::channel(8);

    let incomplete = Arc::new(AtomicBool::new(false));

    let handle = tokio::spawn(
        TransactionRecvDelegateTask {
            rx: request_rx,
            tx: bytes_tx,
            incomplete: Arc::clone(&incomplete),
        }
        .run(CancellationToken::new()),
    );

    (request_tx, bytes_rx, incomplete, handle)
}

fn make_begin(flags: impl Into<RequestFlags>, payload: impl Into<Bytes>) -> Request {
    Request {
        header: RequestHeader {
            flags: flags.into(),
            protocol: Protocol {
                version: ProtocolVersion::V1,
            },
            request_id: RequestId::new_unchecked(0x01),
        },
        body: RequestBody::Begin(RequestBegin {
            service: ServiceDescriptor {
                id: ServiceId::new(0x00),
                version: Version {
                    major: 0x00,
                    minor: 0x00,
                },
            },
            procedure: ProcedureDescriptor {
                id: ProcedureId::new(0x00),
            },
            payload: Payload::new(payload),
        }),
    }
}

fn make_frame(flags: impl Into<RequestFlags>, payload: impl Into<Bytes>) -> Request {
    Request {
        header: RequestHeader {
            flags: flags.into(),
            protocol: Protocol {
                version: ProtocolVersion::V1,
            },
            request_id: RequestId::new_unchecked(0x01),
        },
        body: RequestBody::Frame(RequestFrame {
            payload: Payload::new(payload),
        }),
    }
}

#[tokio::test]
async fn recv() {
    let (request_tx, mut bytes_rx, incomplete, handle) = setup_recv();

    request_tx
        .send(make_begin(
            RequestFlags::EMPTY,
            Bytes::from_static(b"begin"),
        ))
        .await
        .expect("should not be closed");

    request_tx
        .send(make_frame(
            RequestFlags::EMPTY,
            Bytes::from_static(b"frame"),
        ))
        .await
        .expect("should not be closed");

    request_tx
        .send(make_frame(
            RequestFlag::EndOfRequest,
            Bytes::from_static(b"end of request"),
        ))
        .await
        .expect("should not be closed");

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    let mut bytes = Vec::with_capacity(4);
    let available = bytes_rx.recv_many(&mut bytes, 4).await;
    assert_eq!(available, 3);

    assert_eq!(bytes[0], Bytes::from_static(b"begin"));
    assert_eq!(bytes[1], Bytes::from_static(b"frame"));
    assert_eq!(bytes[2], Bytes::from_static(b"end of request"));

    assert!(!incomplete.load(Ordering::SeqCst));
}

#[tokio::test]
async fn recv_premature_close_tx() {
    let (request_tx, mut bytes_rx, incomplete, handle) = setup_recv();

    request_tx
        .send(make_begin(
            RequestFlags::EMPTY,
            Bytes::from_static(b"begin"),
        ))
        .await
        .expect("should not be closed");

    drop(request_tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    let mut bytes = Vec::with_capacity(1);
    let available = bytes_rx.recv_many(&mut bytes, 1).await;
    assert_eq!(available, 1);

    assert_eq!(bytes[0], Bytes::from_static(b"begin"));

    assert!(incomplete.load(Ordering::SeqCst));
}

#[tokio::test]
async fn recv_premature_close_rx() {
    let (request_tx, bytes_rx, incomplete, handle) = setup_recv();

    request_tx
        .send(make_begin(
            RequestFlags::EMPTY,
            Bytes::from_static(b"begin"),
        ))
        .await
        .expect("should not be closed");

    drop(bytes_rx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    assert!(incomplete.load(Ordering::SeqCst));
}

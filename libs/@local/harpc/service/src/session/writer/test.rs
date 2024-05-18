use bytes::{Buf, Bytes};
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    payload::Payload,
    response::{
        flags::{ResponseFlag, ResponseFlags},
        kind::ResponseKind,
    },
    test_utils::mock_request_id,
};
use tokio::sync::mpsc;

use super::ResponseWriter;
use crate::session::writer::{ResponseContext, WriterOptions};

#[test]
fn push() {
    let (tx, _rx) = mpsc::channel(1);

    let mut writer = ResponseWriter::new(
        WriterOptions { no_delay: false },
        ResponseContext {
            id: mock_request_id(0x01),
            kind: ResponseKind::Ok,
        },
        &tx,
    );
    assert_eq!(writer.buffer.segments(), 0);

    writer.push("hello".into());
    assert_eq!(writer.buffer.segments(), 1);

    writer.push(Bytes::new());
    assert_eq!(writer.buffer.segments(), 1);

    writer.push("world".into());
    assert_eq!(writer.buffer.segments(), 2);
}

#[tokio::test]
async fn write_remaining_on_empty() {
    let (tx, mut rx) = mpsc::channel(4);

    let mut writer = ResponseWriter::new(
        WriterOptions { no_delay: false },
        ResponseContext {
            id: mock_request_id(0x01),
            kind: ResponseKind::Ok,
        },
        &tx,
    );

    writer.write_remaining(false).await.expect("infallible");
    assert!(rx.is_empty());

    // if we are empty and we are end_of_response, we should still send a response
    writer.write_remaining(true).await.expect("infallible");
    assert!(
        rx.recv()
            .await
            .expect("response")
            .header
            .flags
            .contains(ResponseFlag::EndOfResponse)
    );
}

#[tokio::test]
async fn write_remaining_no_delay_increments_index() {
    let (tx, _rx) = mpsc::channel(4);

    let mut writer = ResponseWriter::new(
        WriterOptions { no_delay: true },
        ResponseContext {
            id: mock_request_id(0x01),
            kind: ResponseKind::Ok,
        },
        &tx,
    );
    writer.push(Bytes::from_static(&[0; 8]));

    writer.write_remaining(false).await.expect("infallible");
    assert_eq!(writer.index, 1);

    writer.push(Bytes::from_static(&[0; 8]));
    writer.write_remaining(false).await.expect("infallible");
    assert_eq!(writer.index, 2);

    writer.push(Bytes::from_static(&[0; 8]));
    writer.write_remaining(true).await.expect("infallible");
    assert_eq!(writer.index, 3);
}

#[tokio::test]
async fn flush_calls_write() {
    let (tx, mut rx) = mpsc::channel(4);

    let mut writer = ResponseWriter::new(
        WriterOptions { no_delay: false },
        ResponseContext {
            id: mock_request_id(0x01),
            kind: ResponseKind::Ok,
        },
        &tx,
    );
    writer.push(Bytes::from_static(&[0; Payload::MAX_SIZE + 8]));
    writer.flush().await.expect("infallible");

    // we should have sent 2 responses
    let mut responses = Vec::with_capacity(4);
    let available = rx.recv_many(&mut responses, 4).await;
    assert_eq!(available, 2);
}

#[tokio::test]
async fn write_calls_write_remaining_on_no_delay() {
    let (tx, mut rx) = mpsc::channel(4);

    let mut writer = ResponseWriter::new(
        WriterOptions { no_delay: true },
        ResponseContext {
            id: mock_request_id(0x01),
            kind: ResponseKind::Ok,
        },
        &tx,
    );
    writer.push(Bytes::from_static(&[0; 8]));
    writer.write().await.expect("infallible");

    // we should have sent 1 response
    let response = rx.recv().await.expect("response");
    assert_eq!(response.header.flags, ResponseFlags::empty());

    // ... and no data should be left in the buffer
    assert_eq!(writer.buffer.remaining(), 0);
}

// we don't need to differentiate between no_delay: true and no_delay: false
// here as the previous tests cover the `write_remaining` calls.
#[tokio::test]
async fn split_single() {
    let (tx, mut rx) = mpsc::channel(8);

    let mut writer = ResponseWriter::new(
        WriterOptions { no_delay: true },
        ResponseContext {
            id: mock_request_id(0x01),
            kind: ResponseKind::Ok,
        },
        &tx,
    );

    let bytes = Bytes::from_static(&[0; Payload::MAX_SIZE + 8]);

    writer.push(bytes.clone());
    assert_eq!(writer.buffer.segments(), 1);

    writer.write().await.expect("able to write");

    let mut responses = Vec::with_capacity(8);
    let available = rx.recv_many(&mut responses, 8).await;
    assert_eq!(available, 2);

    assert_eq!(
        responses[0].body.payload().as_bytes(),
        &bytes[..Payload::MAX_SIZE]
    );

    assert_eq!(
        responses[1].body.payload().as_bytes(),
        &bytes[Payload::MAX_SIZE..]
    );
}

#[tokio::test]
async fn split_multiple() {
    let (tx, mut rx) = mpsc::channel(8);

    let mut writer = ResponseWriter::new(
        WriterOptions { no_delay: true },
        ResponseContext {
            id: mock_request_id(0x01),
            kind: ResponseKind::Ok,
        },
        &tx,
    );

    let bytes = Bytes::from_static(&[0; Payload::MAX_SIZE * 2 + 8]);

    writer.push(bytes.clone());
    assert_eq!(writer.buffer.segments(), 1);

    writer.write().await.expect("able to write");

    let mut responses = Vec::with_capacity(8);
    let available = rx.recv_many(&mut responses, 8).await;
    assert_eq!(available, 3);

    assert_eq!(
        responses[0].body.payload().as_bytes(),
        &bytes[..Payload::MAX_SIZE]
    );

    assert_eq!(
        responses[1].body.payload().as_bytes(),
        &bytes[Payload::MAX_SIZE..Payload::MAX_SIZE * 2]
    );

    assert_eq!(
        responses[2].body.payload().as_bytes(),
        &bytes[Payload::MAX_SIZE * 2..]
    );
}

#[tokio::test]
#[expect(
    clippy::integer_division_remainder_used,
    clippy::integer_division,
    reason = "splitting the payload in half is intentional"
)]
async fn delay_push_merge_on_write() {
    let (tx, mut rx) = mpsc::channel(8);

    let mut writer = ResponseWriter::new(
        WriterOptions { no_delay: true },
        ResponseContext {
            id: mock_request_id(0x01),
            kind: ResponseKind::Ok,
        },
        &tx,
    );

    let bytes = Bytes::from_static(&[0; Payload::MAX_SIZE]);

    writer.push(bytes.slice(..Payload::MAX_SIZE / 2));
    writer.push(bytes.slice(Payload::MAX_SIZE / 2..));

    assert_eq!(writer.buffer.segments(), 2);

    writer.write().await.expect("able to write");

    let mut responses = Vec::with_capacity(8);
    let available = rx.recv_many(&mut responses, 8).await;
    assert_eq!(available, 1);

    let response = responses.pop().expect("response");
    assert_eq!(response.body.payload().as_bytes(), &*bytes);
}

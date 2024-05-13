use alloc::sync::Arc;
use core::{future::ready, num::NonZero, time::Duration};
use std::{assert_matches::assert_matches, io};

use bytes::Bytes;
use futures::{prelude::sink::SinkExt, StreamExt};
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
        header::ResponseHeader,
        kind::{ErrorCode, ResponseKind},
        Response,
    },
};
use libp2p::PeerId;
use tokio::{
    sync::{broadcast, mpsc, Barrier, Semaphore},
    task::{JoinHandle, JoinSet},
};
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::{
    sync::{CancellationToken, PollSender},
    task::TaskTracker,
};

use super::{ConcurrencyLimit, ConnectionTask, TransactionStorage};
use crate::{
    codec::ErrorEncoder,
    session::{
        error::{
            ConnectionShutdownError, ConnectionTransactionLimitReachedError,
            InstanceTransactionLimitReachedError, TransactionError, TransactionLaggingError,
        },
        server::{
            connection::{ConnectionDelegateTask, TransactionCollection},
            SessionConfig, SessionEvent, SessionId, Transaction,
        },
    },
};

struct StringEncoder;

impl ErrorEncoder for StringEncoder {
    fn encode_error<E>(
        &self,
        error: E,
    ) -> impl Future<Output = crate::session::error::TransactionError> + Send
    where
        E: crate::codec::PlainError,
    {
        ready(TransactionError {
            code: error.code(),
            bytes: error.to_string().into_bytes().into(),
        })
    }

    fn encode_report<C>(
        &self,
        report: error_stack::Report<C>,
    ) -> impl Future<Output = crate::session::error::TransactionError> + Send {
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

struct Setup {
    output: mpsc::Receiver<Transaction>,
    events: broadcast::Receiver<SessionEvent>,

    stream: mpsc::Sender<error_stack::Result<Request, io::Error>>,
    sink: mpsc::Receiver<Response>,

    handle: JoinHandle<()>,

    storage: TransactionStorage,
}

impl Setup {
    const OUTPUT_BUFFER_SIZE: usize = 8;
    const SESSION_ID: SessionId = SessionId::new_unchecked(0x00);

    #[expect(clippy::significant_drop_tightening, reason = "False positive")]
    fn new(config: SessionConfig) -> Self {
        let cancel = CancellationToken::new();

        let (output_tx, output_rx) = mpsc::channel(Self::OUTPUT_BUFFER_SIZE);
        let (events_tx, events_rx) = broadcast::channel(8);

        let (stream_tx, stream_rx) = mpsc::channel(8);
        let (sink_tx, sink_rx) = mpsc::channel(8);

        let permit = Arc::new(Semaphore::new(1))
            .try_acquire_owned()
            .expect("infallible");

        let task = ConnectionTask {
            peer: PeerId::random(),
            session: Self::SESSION_ID,
            active: TransactionCollection::new(config, cancel.clone()),
            output: output_tx,
            events: events_tx,
            config,
            encoder: Arc::new(StringEncoder),
            _permit: permit,
        };

        let storage = Arc::clone(&task.active.storage);

        let handle = tokio::spawn(task.run(
            PollSender::new(sink_tx),
            ReceiverStream::new(stream_rx),
            TaskTracker::new(),
            cancel,
        ));

        Self {
            output: output_rx,
            events: events_rx,
            stream: stream_tx,
            sink: sink_rx,
            handle,
            storage,
        }
    }
}

fn make_request_header(flags: impl Into<RequestFlags>) -> RequestHeader {
    RequestHeader {
        protocol: Protocol {
            version: ProtocolVersion::V1,
        },
        request_id: RequestId::new_unchecked(0x01),
        flags: flags.into(),
    }
}

fn make_request_begin(flags: impl Into<RequestFlags>, payload: impl Into<Bytes>) -> Request {
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

fn make_request_frame(flags: impl Into<RequestFlags>, payload: impl Into<Bytes>) -> Request {
    Request {
        header: make_request_header(flags),
        body: RequestBody::Frame(RequestFrame {
            payload: Payload::new(payload),
        }),
    }
}

#[tokio::test]
async fn stream_closed_does_not_stop_task() {
    let Setup {
        mut output,
        events: _events,
        stream,
        mut sink,
        handle,
        storage: _,
    } = Setup::new(SessionConfig {
        no_delay: true,
        ..SessionConfig::default()
    });

    stream
        .send(Ok(make_request_begin(
            RequestFlags::EMPTY,
            b"hello" as &[_],
        )))
        .await
        .expect("should be able to send message");

    drop(stream);

    // we should get a transaction handle
    let transaction = output.recv().await.expect("should receive transaction");
    let mut transaction_sink = transaction.into_sink();

    // to verify that the task hasn't stopped yet we can simply send a message to the sink.
    transaction_sink
        .send(Ok(Bytes::from_static(b"world")))
        .await
        .expect("should be able to send message");

    // if we would drop the sink, the task would automatically stop

    // response should be received
    let response = sink.recv().await.expect("should receive response");
    assert_eq!(
        response.body,
        ResponseBody::Begin(ResponseBegin {
            kind: ResponseKind::Ok,
            payload: Payload::new(b"world" as &[_]),
        })
    );

    // the handle should still be alive
    assert!(!handle.is_finished());
}

#[tokio::test]
async fn stream_closed_last_transaction_dropped_stops_task() {
    let Setup {
        mut output,
        events: _events,
        stream,
        mut sink,
        handle,
        storage: _,
    } = Setup::new(SessionConfig::default());

    stream
        .send(Ok(make_request_begin(
            RequestFlags::EMPTY,
            b"hello" as &[_],
        )))
        .await
        .expect("should be able to send message");

    drop(stream);

    // we should get a transaction handle
    let transaction = output.recv().await.expect("should receive transaction");
    let mut transaction_sink = transaction.into_sink();

    // to verify that the task hasn't stopped yet we can simply send a message to the sink.
    transaction_sink
        .send(Ok(Bytes::from_static(b"world")))
        .await
        .expect("should be able to send message");

    // last transaction, means task will shutdown gracefully.
    drop(transaction_sink);

    // response should be received
    let response = sink.recv().await.expect("should receive response");
    assert_eq!(
        response.body,
        ResponseBody::Begin(ResponseBegin {
            kind: ResponseKind::Ok,
            payload: Payload::new(b"world" as &[_]),
        })
    );

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn stream_closed_keep_alive_until_last_transaction() {
    let Setup {
        mut output,
        events: _events,
        stream,
        sink: _sink,
        handle,
        storage: _,
    } = Setup::new(SessionConfig::default());

    stream
        .send(Ok(make_request_begin(
            RequestFlags::EMPTY,
            b"hello" as &[_],
        )))
        .await
        .expect("should be able to send message");

    let mut request_2 = make_request_begin(RequestFlags::EMPTY, b"hello" as &[_]);
    request_2.header.request_id = RequestId::new_unchecked(0x02);

    stream
        .send(Ok(request_2))
        .await
        .expect("should be able to send message");

    drop(stream);

    // get two transaction handles
    let transaction_1 = output.recv().await.expect("should receive transaction");
    let transaction_2 = output.recv().await.expect("should receive transaction");

    drop(transaction_1);

    // give ample time to react (if needed)
    tokio::time::sleep(Duration::from_millis(100)).await;

    // task should not have stopped yet
    assert!(!handle.is_finished());

    drop(transaction_2);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn sink_closed_does_not_stop_task() {
    let Setup {
        mut output,
        events: _events,
        stream,
        sink,
        handle,
        storage: _,
    } = Setup::new(SessionConfig {
        per_connection_response_buffer_size: NonZero::new(1).expect("infallible"),
        per_transaction_response_byte_stream_buffer_size: NonZero::new(1).expect("infallible"),
        no_delay: true,
        ..SessionConfig::default()
    });

    drop(sink);

    stream
        .send(Ok(make_request_begin(
            RequestFlags::EMPTY,
            b"hello" as &[_],
        )))
        .await
        .expect("should be able to send message");

    let transaction = output.recv().await.expect("should receive transaction");
    let (_, mut transaction_sink, mut transaction_stream) = transaction.into_parts();

    // we should still be able to send additional requests, but sending a response should fail.
    let item = transaction_stream
        .next()
        .await
        .expect("should receive item.");

    stream
        .send(Ok(make_request_frame(
            RequestFlag::EndOfRequest,
            b" world" as &[_],
        )))
        .await
        .expect("should be able to send message");

    assert_eq!(item, Bytes::from_static(b"hello"));

    let item = transaction_stream
        .next()
        .await
        .expect("should receive item.");

    assert_eq!(item, Bytes::from_static(b" world"));

    // because we finished (end of request) next item should be none
    assert!(transaction_stream.next().await.is_none());
    assert_eq!(transaction_stream.is_incomplete(), Some(false));

    // task should not have stopped yet
    assert!(!handle.is_finished());

    // this is a limitation of sinks, the first item will succeed, but then the sink will stop
    // and the channel will stop accepting new items.

    // the first two items are buffered, so we'll be able to "send" it
    assert_eq!(transaction_sink.buffer_size(), 1);

    // buffered in bytes -> response buffer
    transaction_sink
        .send(Ok(Bytes::from_static(b"hello")))
        .await
        .expect("should be able to send message (is lost)");

    // buffered in response -> sink buffer
    transaction_sink
        .send(Ok(Bytes::from_static(b" world")))
        .await
        .expect("should be able to send message (is lost)");

    // this one will push the response through, so it will fail
    transaction_sink
        .send(Ok(Bytes::from_static(b" world")))
        .await
        .expect_err("channel should be closed");

    // the send task should terminate (because we explicitely polled), but the handle should
    // still be alive
    assert!(!handle.is_finished());

    // if we now drop the stream, the task should stop (both sink and stream have stopped)
    drop(stream);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn connection_closed() {
    let Setup {
        output: _output,
        events: _events,
        stream,
        sink,
        handle,
        storage: _,
    } = Setup::new(SessionConfig::default());

    drop(stream);
    drop(sink);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");
}

#[tokio::test]
async fn transaction_limit_reached_connection() {
    let Setup {
        output: _output,
        events: _events,
        stream,
        mut sink,
        handle: _handle,
        storage: _,
    } = Setup::new(SessionConfig {
        per_connection_concurrent_transaction_limit: 1,
        ..SessionConfig::default()
    });

    stream
        .send(Ok(make_request_begin(
            RequestFlags::EMPTY,
            b"hello" as &[_],
        )))
        .await
        .expect("should be able to send message");

    let mut request_2 = make_request_begin(RequestFlags::EMPTY, b"hello" as &[_]);
    request_2.header.request_id = RequestId::new_unchecked(0x02);

    stream
        .send(Ok(request_2))
        .await
        .expect("should be able to send message");

    // this message will bounce because the limit is reached
    let mut responses = Vec::with_capacity(8);
    let available = sink.recv_many(&mut responses, 8).await;
    assert_eq!(available, 1);

    let response = responses.pop().expect("infallible");
    assert_eq!(response.header.request_id, RequestId::new_unchecked(0x02));
    assert!(response.header.flags.contains(ResponseFlag::EndOfResponse));
    assert_eq!(
        response.body.payload().as_bytes().as_ref(),
        ConnectionTransactionLimitReachedError { limit: 1 }
            .to_string()
            .into_bytes()
    );
}

#[tokio::test]
#[allow(clippy::cast_possible_truncation)]
async fn transaction_limit_reached_instance() {
    let Setup {
        output: _output,
        events: _events,
        stream,
        mut sink,
        handle: _handle,
        storage: _,
    } = Setup::new(SessionConfig::default());

    // fill the buffer with transactions, the last transaction will bounce
    for index in 0..=Setup::OUTPUT_BUFFER_SIZE {
        let mut request = make_request_begin(RequestFlags::EMPTY, b"hello" as &[_]);
        request.header.request_id = RequestId::new_unchecked(index as u32);

        stream
            .send(Ok(request))
            .await
            .expect("should be able to send message");
    }

    let mut responses = Vec::with_capacity(16);
    let available = sink.recv_many(&mut responses, 16).await;
    assert_eq!(available, 1);

    let response = responses.pop().expect("infallible");
    assert_eq!(
        response.header.request_id,
        RequestId::new_unchecked(Setup::OUTPUT_BUFFER_SIZE as u32)
    );
    assert!(response.header.flags.contains(ResponseFlag::EndOfResponse));
    assert_eq!(
        response.body.payload().as_bytes().as_ref(),
        InstanceTransactionLimitReachedError
            .to_string()
            .into_bytes()
    );
}

#[tokio::test]
async fn transaction_overwrite() {
    // transaction 0x01 has been started, and then we start a transaction 0x01 again
    let Setup {
        mut output,
        events: _events,
        stream,
        sink,
        handle: _handle,
        storage: _,
    } = Setup::new(SessionConfig::default());

    stream
        .send(Ok(make_request_begin(
            RequestFlags::EMPTY,
            b"hello" as &[_],
        )))
        .await
        .expect("should be able to send message");

    let transaction = output.recv().await.expect("should receive transaction");

    assert!(!transaction.is_closed());

    stream
        .send(Ok(make_request_begin(
            RequestFlags::EMPTY,
            b"hello" as &[_],
        )))
        .await
        .expect("should be able to send message");

    let replacement = output.recv().await.expect("should receive transaction");

    assert!(!replacement.is_closed());
    assert!(transaction.is_closed());

    // the first transaction should be (silently) cancelled
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert!(sink.is_empty());
}

#[tokio::test]
async fn transaction_repeat() {
    // finish transaction 0x01, and then start it again
    let Setup {
        mut output,
        events: _events,
        stream,
        mut sink,
        handle: _handle,
        storage: _,
    } = Setup::new(SessionConfig::default());

    stream
        .send(Ok(make_request_begin(
            RequestFlag::EndOfRequest,
            b"hello" as &[_],
        )))
        .await
        .expect("should be able to send message");

    let transaction = output.recv().await.expect("should receive transaction");
    let (_, mut txn_sink, mut txn_stream) = transaction.into_parts();

    assert_eq!(
        txn_stream.next().await,
        Some(Bytes::from_static(b"hello" as &[_]))
    );

    assert_eq!(txn_stream.next().await, None);

    txn_sink
        .send(Ok(Bytes::from_static(b"world" as &[_])))
        .await
        .expect("should be able to send message");

    drop(txn_sink);

    // because the transaction has finished, we can safely start it again
    stream
        .send(Ok(make_request_begin(
            RequestFlag::EndOfRequest,
            b"hello" as &[_],
        )))
        .await
        .expect("should be able to send message");

    let transaction = output.recv().await.expect("should receive transaction");
    let (_, mut txn_sink, mut txn_stream) = transaction.into_parts();

    assert_eq!(
        txn_stream.next().await,
        Some(Bytes::from_static(b"hello" as &[_]))
    );

    assert_eq!(txn_stream.next().await, None);

    txn_sink
        .send(Ok(Bytes::from_static(b"world" as &[_])))
        .await
        .expect("should be able to send message");

    drop(txn_sink);

    tokio::time::sleep(Duration::from_millis(100)).await;

    let mut responses = Vec::with_capacity(8);
    let available = sink.recv_many(&mut responses, 8).await;
    assert_eq!(available, 2);

    for response in responses {
        assert_eq!(response.header.request_id, RequestId::new_unchecked(0x01));
        assert!(response.header.flags.contains(ResponseFlag::EndOfResponse));
        assert_eq!(response.body.payload().as_bytes().as_ref(), b"world");
    }
}

#[tokio::test]
async fn transaction() {
    // send and finish a whole transaction.
    let Setup {
        mut output,
        events: _events,
        stream,
        mut sink,
        handle: _handle,
        storage: _,
    } = Setup::new(SessionConfig::default());

    stream
        .send(Ok(make_request_begin(
            RequestFlag::EndOfRequest,
            b"hello" as &[_],
        )))
        .await
        .expect("should be able to send message");

    let transaction = output.recv().await.expect("should receive transaction");
    let (_, mut txn_sink, mut txn_stream) = transaction.into_parts();

    assert_eq!(
        txn_stream.next().await,
        Some(Bytes::from_static(b"hello" as &[_]))
    );

    assert_eq!(txn_stream.next().await, None);

    txn_sink
        .send(Ok(Bytes::from_static(b"world" as &[_])))
        .await
        .expect("should be able to send message");

    drop(txn_sink);

    tokio::time::sleep(Duration::from_millis(100)).await;

    let mut responses = Vec::with_capacity(8);
    let available = sink.recv_many(&mut responses, 8).await;
    assert_eq!(available, 1);

    let response = responses.pop().expect("should have a response");
    assert_eq!(response.header.request_id, RequestId::new_unchecked(0x01));
    assert!(response.header.flags.contains(ResponseFlag::EndOfResponse));
    assert_eq!(response.body.payload().as_bytes().as_ref(), b"world");
}

#[tokio::test]
async fn transaction_multiple() {
    // send and finish multiple transactions simultaneously
    let Setup {
        mut output,
        events: _events,
        stream,
        mut sink,
        handle: _handle,
        storage: _,
    } = Setup::new(SessionConfig::default());

    // we are sending four distinct packets, each one with a different message
    // these are ["(n) banana", "(n) apple", "(n) orange", "(n) pear"], and this we're doing
    // parallel.
    let mut tasks = JoinSet::new();
    let barrier = Arc::new(Barrier::new(4));

    for n in 0..4 {
        let stream = stream.clone();
        let barrier = Arc::clone(&barrier);

        tasks.spawn(async move {
            barrier.wait().await;

            let request_id = RequestId::new_unchecked(n);

            let mut request = make_request_begin(RequestFlags::EMPTY, format!("({n}) apple"));
            request.header.request_id = request_id;

            stream
                .send(Ok(request))
                .await
                .expect("should be able to send message");

            let mut request = make_request_frame(RequestFlags::EMPTY, format!("({n}) banana"));
            request.header.request_id = request_id;

            stream
                .send(Ok(request))
                .await
                .expect("should be able to send message");

            let mut request = make_request_frame(RequestFlags::EMPTY, format!("({n}) orange"));
            request.header.request_id = request_id;

            stream
                .send(Ok(request))
                .await
                .expect("should be able to send message");

            let mut request = make_request_frame(RequestFlag::EndOfRequest, format!("({n}) pear"));
            request.header.request_id = request_id;

            stream
                .send(Ok(request))
                .await
                .expect("should be able to send message");
        });
    }

    while tasks.join_next().await.is_some() {}

    // we should get 4 transactions
    let mut transactions = Vec::with_capacity(8);
    let available = output.recv_many(&mut transactions, 8).await;
    assert_eq!(available, 4);

    for transaction in transactions {
        let (txn_context, mut txn_sink, mut txn_stream) = transaction.into_parts();

        let mut messages = Vec::with_capacity(4);
        while let Some(message) = txn_stream.next().await {
            messages.push(message);
        }

        let n = txn_context.id();

        assert_eq!(messages.len(), 4);
        assert_eq!(messages[0].as_ref(), format!("({n}) apple").as_bytes());
        assert_eq!(messages[1].as_ref(), format!("({n}) banana").as_bytes());
        assert_eq!(messages[2].as_ref(), format!("({n}) orange").as_bytes());
        assert_eq!(messages[3].as_ref(), format!("({n}) pear").as_bytes());

        txn_sink
            .send(Ok(Bytes::from(format!("({n}) fruits"))))
            .await
            .expect("should be able to send message");
    }

    for _ in 0..4 {
        let response = sink.recv().await.expect("should have a response");

        assert!(response.header.flags.contains(ResponseFlag::EndOfResponse));

        let n = response.header.request_id;
        assert_eq!(
            response.body.payload().as_bytes().as_ref(),
            format!("({n}) fruits").as_bytes()
        );
    }
}

#[tokio::test]
async fn transaction_request_buffer_limit_reached() {
    // send too many request packets, but not process them, leading to a lagging state, which drops
    // the transaction.
    let Setup {
        mut output,
        events: _events,
        stream,
        mut sink,
        handle: _handle,
        storage: _,
    } = Setup::new(SessionConfig {
        per_transaction_request_buffer_size: NonZero::new(2).expect("infallible"),
        per_transaction_request_byte_stream_buffer_size: NonZero::new(2).expect("infallible"),
        ..SessionConfig::default()
    });

    // send 5 packets to the transaction, on the 6th packet the stream will be dropped
    stream
        .send(Ok(make_request_begin(RequestFlags::EMPTY, "hello")))
        .await
        .expect("should be able to send message");

    let transaction = output.recv().await.expect("should have a transaction");
    let (_, mut txn_sink, mut txn_stream) = transaction.into_parts();

    // send 4 messages, the transaction should still be active by then
    for _ in 0..4 {
        stream
            .send(Ok(make_request_frame(RequestFlags::EMPTY, "world")))
            .await
            .expect("should be able to send message");
    }

    assert_eq!(txn_stream.is_incomplete(), None);

    // send the 6th packet, the transaction stream will be dropped then
    stream
        .send(Ok(make_request_frame(RequestFlags::EMPTY, "world")))
        .await
        .expect("should be able to send message");

    tokio::time::sleep(Duration::from_millis(150)).await;

    // the sink will be inoperable as well, as we cancel the whole task
    txn_sink
        .send(Ok(Bytes::from_static(b"ok" as &[_])))
        .await
        .expect_err("should not be able to send message");

    let mut responses = Vec::with_capacity(8);
    while let Some(response) = txn_stream.next().await {
        responses.push(response);
    }

    assert_eq!(txn_stream.is_incomplete(), Some(true));

    // some messages will be lost, because we immediately cancel the task
    assert!(responses.len() < 6);
    assert_eq!(responses[0].as_ref(), b"hello");
    for response in &responses[1..] {
        assert_eq!(response.as_ref(), b"world");
    }

    drop(txn_stream);
    drop(txn_sink);

    // we should've received an error
    let mut responses = Vec::with_capacity(4);
    let available = sink.recv_many(&mut responses, 4).await;
    assert_eq!(available, 1);

    let response = responses.pop().expect("should have a response");
    assert!(response.header.flags.contains(ResponseFlag::EndOfResponse));
    assert_eq!(
        response.body.payload().as_bytes().as_ref(),
        TransactionLaggingError.to_string().as_bytes()
    );
    assert_matches!(
        response.body,
        ResponseBody::Begin(ResponseBegin {
            kind: ResponseKind::Err(ErrorCode::TRANSACTION_LAGGING),
            ..
        })
    );
}

#[tokio::test]
async fn transaction_send_output_closed() {
    // try to accept a new transaction, but the output mpsc::Sender<Transaction> is closed
    let Setup {
        mut output,
        events: _events,
        stream,
        mut sink,
        handle,
        storage: _,
    } = Setup::new(SessionConfig {
        no_delay: true,
        ..SessionConfig::default()
    });

    // trying to create a new transaction, when the output is gone, should result in wind-down of
    // tasks, but only if all transactions are done!
    stream
        .send(Ok(make_request_begin(RequestFlags::EMPTY, "hello")))
        .await
        .expect("should be able to send message");

    // but existing transactions are still being processed
    let transaction = output.recv().await.expect("should have a transaction");
    let (_, mut txn_sink, mut txn_stream) = transaction.into_parts();

    // we're no longer accepting any connections
    output.close();

    // ... and we can use the transactions to both still send and receive messages
    let message = txn_stream.next().await.expect("should have a message");
    assert_eq!(message.as_ref(), b"hello");

    txn_sink
        .send(Ok(Bytes::from("world")))
        .await
        .expect("should be able to send message");

    txn_sink
        .close()
        .await
        .expect("should be able to close sink");

    let mut responses = Vec::with_capacity(8);
    let available = sink.recv_many(&mut responses, 8).await;
    assert_eq!(available, 2);

    assert!(
        !responses[0]
            .header
            .flags
            .contains(ResponseFlag::EndOfResponse)
    );
    assert_eq!(responses[0].body.payload().as_bytes().as_ref(), b"world");

    assert!(
        responses[1]
            .header
            .flags
            .contains(ResponseFlag::EndOfResponse)
    );
    assert_eq!(responses[1].body.payload().as_bytes().as_ref(), b"");

    // but creating new transactions will fail
    let mut request = make_request_begin(RequestFlag::EndOfRequest, "hello");
    request.header.request_id = RequestId::new_unchecked(0x02);

    stream
        .send(Ok(request))
        .await
        .expect("should be able to send message");

    // we will have a response with an error
    let mut responses = Vec::with_capacity(8);
    let available = sink.recv_many(&mut responses, 8).await;
    assert_eq!(available, 1);

    let response = responses.pop().expect("should have a response");
    assert!(response.header.flags.contains(ResponseFlag::EndOfResponse));
    assert_matches!(
        response.body,
        ResponseBody::Begin(ResponseBegin {
            kind: ResponseKind::Err(ErrorCode::CONNECTION_SHUTDOWN),
            ..
        })
    );
    assert_eq!(
        response.body.payload().as_bytes().as_ref(),
        ConnectionShutdownError.to_string().into_bytes()
    );

    stream
        .send(Ok(make_request_frame(RequestFlag::EndOfRequest, "hello")))
        .await
        .expect("should be able to send message");

    let request = txn_stream.next().await.expect("should have a request");
    assert_eq!(request.as_ref(), b"hello");

    assert!(txn_stream.next().await.is_none());

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should finish gracefully");
}

#[tokio::test]
async fn transaction_graceful_shutdown() {
    // try to accept a new transaction, but the output mpsc::Sender<Transaction> is closed
    let Setup {
        mut output,
        events: _events,
        stream,
        mut sink,
        handle,
        storage: _,
    } = Setup::new(SessionConfig {
        no_delay: true,
        ..SessionConfig::default()
    });

    // trying to create a new transaction, when the output is gone, should result in wind-down of
    // tasks, but only if all transactions are done!
    stream
        .send(Ok(make_request_begin(RequestFlags::EMPTY, "hello")))
        .await
        .expect("should be able to send message");

    // but existing transactions are still being processed
    let transaction = output.recv().await.expect("should have a transaction");
    let (_, mut txn_sink, mut txn_stream) = transaction.into_parts();

    // we're no longer accepting any connections
    output.close();

    // once `output` has been closed, this will initiate a graceful shutdown,
    // but only once all transactions have been completed,
    // until then we will still be able to send and receive messages
    let message = txn_stream.next().await.expect("should have a message");
    assert_eq!(message.as_ref(), b"hello");

    txn_sink
        .send(Ok(Bytes::from("world")))
        .await
        .expect("should be able to send message");

    let mut responses = Vec::with_capacity(8);
    let available = sink.recv_many(&mut responses, 8).await;
    assert_eq!(available, 1);

    let response = responses.pop().expect("should have a response");
    assert!(!response.header.flags.contains(ResponseFlag::EndOfResponse));
    assert_eq!(response.body.payload().as_bytes().as_ref(), b"world");

    // we now send the end of the current transaction
    stream
        .send(Ok(make_request_frame(
            RequestFlag::EndOfRequest,
            b"good bye" as &[_],
        )))
        .await
        .expect("should be able to send message");

    // that one should still be received
    let response = txn_stream.next().await.expect("should have a response");
    assert_eq!(response.as_ref(), b"good bye");

    // the stream should now be exhausted
    assert!(txn_stream.next().await.is_none());

    // once we close the sink, the connection should be closed
    txn_sink
        .close()
        .await
        .expect("should be able to close sink");

    let mut responses = Vec::with_capacity(8);
    let available = sink.recv_many(&mut responses, 8).await;
    assert_eq!(available, 1);

    let response = responses.pop().expect("should have a response");
    assert!(response.header.flags.contains(ResponseFlag::EndOfResponse));
    assert_eq!(response.body.payload().as_bytes().as_ref(), b"");

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should finish gracefully");
}

#[tokio::test]
async fn transaction_reclamation() {
    // do a complete transaction, and once done the transaction should be reclaimed (the inner
    // buffer should be empty)
    let Setup {
        mut output,
        events: _events,
        stream,
        sink: _sink,
        handle: _handle,
        storage,
    } = Setup::new(SessionConfig::default());

    stream
        .send(Ok(make_request_begin(RequestFlag::EndOfRequest, "hello")))
        .await
        .expect("should be able to send message");

    let transaction = output.recv().await.expect("should have a response");
    let (_, mut txn_sink, mut txn_stream) = transaction.into_parts();

    let message = txn_stream.next().await.expect("should have a message");
    assert_eq!(message.as_ref(), b"hello");

    assert!(txn_stream.next().await.is_none());

    // closing the sink should be enough to finish the transaction
    txn_sink.close().await.expect("should be able to close");

    // we should have a single transaction in storage
    assert_eq!(storage.len(), 1);

    // once finishing the transaction (sending of request)
    // the transaction should be reclaimed
    tokio::time::sleep(Duration::from_millis(100)).await;

    assert_eq!(storage.len(), 0);
}

#[tokio::test]
async fn graceful_shutdown() {
    let Setup {
        output: _output,
        mut events,
        stream,
        sink,
        handle,
        storage: _,
    } = Setup::new(SessionConfig::default());

    drop(stream);
    drop(sink);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic");

    let event = events.recv().await.expect("should have a shutdown event");
    assert_eq!(
        event,
        SessionEvent::SessionDropped {
            id: Setup::SESSION_ID
        }
    );
}

#[test]
fn concurrency_limit() {
    let limit = ConcurrencyLimit::new(2);
    assert_eq!(limit.current.available_permits(), 2);

    let _permit = limit.acquire().expect("should be able to acquire permit");
    assert_eq!(limit.current.available_permits(), 1);

    let _permit2 = limit.acquire().expect("should be able to acquire permit");
    assert_eq!(limit.current.available_permits(), 0);
}

#[test]
fn concurrency_limit_reached() {
    let limit = ConcurrencyLimit::new(1);
    assert_eq!(limit.current.available_permits(), 1);

    let permit = limit.acquire().expect("should be able to acquire permit");
    assert_eq!(limit.current.available_permits(), 0);

    limit
        .acquire()
        .expect_err("should be unable to acquire permit");

    drop(permit);
    assert_eq!(limit.current.available_permits(), 1);

    let _permit = limit.acquire().expect("should be able to acquire permit");
    assert_eq!(limit.current.available_permits(), 0);
}

#[test]
fn concurrency_limit_reached_permit_reclaim() {
    let limit = ConcurrencyLimit::new(1);
    assert_eq!(limit.current.available_permits(), 1);

    let permit = limit.acquire().expect("should be able to acquire permit");
    assert_eq!(limit.current.available_permits(), 0);

    drop(permit);
    assert_eq!(limit.current.available_permits(), 1);
}

#[tokio::test]
async fn transaction_collection_acquire() {
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let (_permit, ..) = collection
        .acquire(RequestId::new_unchecked(0x01))
        .await
        .expect("should be able to acquire permit");

    assert_eq!(collection.storage.len(), 1);
}

#[tokio::test]
async fn transaction_collection_acquire_override() {
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let (permit, ..) = collection
        .acquire(RequestId::new_unchecked(0x01))
        .await
        .expect("should be able to acquire permit");

    let cancel = permit.cancellation_token();

    let (_permit, ..) = collection
        .acquire(RequestId::new_unchecked(0x01))
        .await
        .expect("should be able to acquire permit");

    assert!(cancel.is_cancelled());
}

#[tokio::test]
async fn transaction_collection_acquire_override_no_capacity() {
    // if we override and our capacity has no capacity left we won't be able to acquire a permit
    // this is a limitation of the current implementation, but also simplifies the logic quite a
    // bit.
    let collection = TransactionCollection::new(
        SessionConfig {
            per_connection_concurrent_transaction_limit: 1,
            ..SessionConfig::default()
        },
        CancellationToken::new(),
    );

    let (_permit, ..) = collection
        .acquire(RequestId::new_unchecked(0x01))
        .await
        .expect("should be able to acquire permit");

    collection
        .acquire(RequestId::new_unchecked(0x01))
        .await
        .expect_err("should not be able to acquire permit");
}

#[tokio::test]
async fn transaction_collection_release() {
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let (_permit, ..) = collection
        .acquire(RequestId::new_unchecked(0x01))
        .await
        .expect("should be able to acquire permit");

    // release does nothing if the transaction is not in the collection
    collection.release(RequestId::new_unchecked(0x02)).await;
}

#[tokio::test]
async fn transaction_collection_acquire_full_no_insert() {
    let collection = TransactionCollection::new(
        SessionConfig {
            per_connection_concurrent_transaction_limit: 0,
            ..SessionConfig::default()
        },
        CancellationToken::new(),
    );

    collection
        .acquire(RequestId::new_unchecked(0x01))
        .await
        .expect_err("should not be able to acquire permit");

    assert_eq!(collection.storage.len(), 0);
}

#[tokio::test]
async fn transaction_permit_reclaim() {
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let (permit, ..) = collection
        .acquire(RequestId::new_unchecked(0x01))
        .await
        .expect("should be able to acquire permit");

    assert_eq!(collection.storage.len(), 1);

    drop(permit);

    assert_eq!(collection.storage.len(), 0);
}

#[tokio::test]
async fn transaction_permit_reclaim_override() {
    let collection = TransactionCollection::new(SessionConfig::default(), CancellationToken::new());

    let (permit_a, ..) = collection
        .acquire(RequestId::new_unchecked(0x01))
        .await
        .expect("should be able to acquire permit");

    assert_eq!(collection.storage.len(), 1);

    let (permit_b, ..) = collection
        .acquire(RequestId::new_unchecked(0x01))
        .await
        .expect("should be able to acquire permit");

    assert!(permit_a.cancellation_token().is_cancelled());
    assert_eq!(collection.storage.len(), 1);

    drop(permit_a);

    assert_eq!(collection.storage.len(), 1);

    drop(permit_b);

    assert_eq!(collection.storage.len(), 0);
}

static EXAMPLE_RESPONSE: Response = Response {
    header: ResponseHeader {
        protocol: Protocol {
            version: ProtocolVersion::V1,
        },
        request_id: RequestId::new_unchecked(0x01),
        flags: ResponseFlags::EMPTY,
    },
    body: ResponseBody::Frame(ResponseFrame {
        payload: Payload::from_static(b"hello"),
    }),
};

#[tokio::test]
async fn delegate() {
    let (tx, rx) = mpsc::channel::<Response>(8);
    let (sink, mut stream) = mpsc::channel::<Response>(8);

    let delegate = ConnectionDelegateTask {
        rx,
        sink: PollSender::new(sink),
    };

    let cancel = CancellationToken::new();

    let handle = tokio::spawn(delegate.run(cancel.clone()));

    tx.send(EXAMPLE_RESPONSE.clone())
        .await
        .expect("should be open");

    // stream should immediately receive the response
    let response = stream.recv().await.expect("should be open");
    assert_eq!(response, EXAMPLE_RESPONSE);

    cancel.cancel();

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic")
        .expect("should not error");
}

#[tokio::test]
async fn delegate_drop_stream() {
    let (tx, rx) = mpsc::channel::<Response>(8);
    let (sink, stream) = mpsc::channel::<Response>(8);

    let delegate = ConnectionDelegateTask {
        rx,
        sink: PollSender::new(sink),
    };

    let handle = tokio::spawn(delegate.run(CancellationToken::new()));

    drop(stream);

    tx.send(EXAMPLE_RESPONSE.clone())
        .await
        .expect("should be open");

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic")
        .expect_err("should be unable to send to sink");
}

#[tokio::test]
async fn delegate_drop_tx() {
    let (tx, rx) = mpsc::channel::<Response>(8);
    let (sink, _stream) = mpsc::channel::<Response>(8);

    let delegate = ConnectionDelegateTask {
        rx,
        sink: PollSender::new(sink),
    };

    let handle = tokio::spawn(delegate.run(CancellationToken::new()));

    drop(tx);

    tokio::time::timeout(Duration::from_secs(1), handle)
        .await
        .expect("should finish within timeout")
        .expect("should not panic")
        .expect("should not error");
}

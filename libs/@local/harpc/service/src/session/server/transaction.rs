use bytes::Bytes;
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    request::{
        begin::RequestBegin, flags::RequestFlag, header::RequestHeader, id::RequestId,
        procedure::ProcedureDescriptor, service::ServiceDescriptor, Request,
    },
    response::Response,
};
use libp2p::PeerId;
use tokio::{select, sync::mpsc};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

use super::{session_id::SessionId, write::ResponseWriter, SessionConfig};
use crate::session::error::TransactionError;

struct TransactionSendDelegateTask {
    id: RequestId,
    config: SessionConfig,

    rx: mpsc::Receiver<core::result::Result<Bytes, TransactionError>>,
    tx: mpsc::Sender<Response>,
}

impl TransactionSendDelegateTask {
    #[allow(clippy::integer_division_remainder_used)]
    async fn run(mut self, cancel: CancellationToken) {
        // we cannot simply forward here, because we want to be able to send the end of request and
        // buffer the response into the least amount of packages possible

        let mut writer =
            Some(ResponseWriter::new_ok(self.id, &self.tx).with_no_delay(self.config.no_delay));

        loop {
            let bytes = select! {
                bytes = self.rx.recv() => bytes,
                () = cancel.cancelled() => {
                    break;
                },
            };

            let Some(bytes) = bytes else {
                // channel has been closed, we are done, flush the buffer

                // flush the remaining buffer, if there's any
                let Some(writer) = writer.take() else {
                    break;
                };

                if let Err(error) = writer.flush().await {
                    tracing::error!(?error, "connection has been prematurely closed");
                }

                break;
            };

            match (bytes, writer.as_mut()) {
                (Ok(_), None) => {
                    // we had an error previously, so just ignore the rest of the stream
                    continue;
                }
                (Ok(bytes), Some(writer)) => {
                    writer.push(bytes);

                    if let Err(error) = writer.write().await {
                        tracing::warn!(?error, "connection has been prematurely closed");
                        break;
                    }
                }
                (Err(TransactionError { code, bytes }), _) => {
                    writer = None;

                    let mut writer = ResponseWriter::new_error(self.id, code, &self.tx);
                    writer.push(bytes);

                    if let Err(error) = writer.flush().await {
                        tracing::warn!(?error, "connection has been prematurely closed");
                        break;
                    }
                }
            }
        }
    }
}

struct TransactionRecvDelegateTask {
    rx: mpsc::Receiver<Request>,
    tx: mpsc::Sender<Bytes>,
}

impl TransactionRecvDelegateTask {
    #[allow(clippy::integer_division_remainder_used)]
    async fn run(mut self, cancel: CancellationToken) {
        // TODO: timeout is done at a later layer, not here, this just delegates.
        loop {
            let request = select! {
                request = self.rx.recv() => request,
                () = cancel.cancelled() => {
                    break;
                },
            };

            let Some(request) = request else {
                // channel has been closed, we are done
                tracing::warn!("connection has been prematurely closed");

                break;
            };

            // send bytes to the other end, and close if we're at the end
            let is_end = request.header.flags.contains(RequestFlag::EndOfRequest);
            let bytes = request.body.into_payload().into_bytes();

            let result = self.tx.send(bytes).await;

            if let Err(error) = result {
                // TODO: the upper layer is responsible for notifying the other end as to why the
                // connection was closed.
                tracing::warn!(?error, "connection has been prematurely closed");
                break;
            }

            if is_end {
                // dropping both rx and tx means that we signal to both ends that we're done.
                break;
            }
        }
    }
}

pub(crate) struct TransactionParts {
    pub(crate) peer: PeerId,
    pub(crate) session: SessionId,

    pub(crate) config: SessionConfig,

    pub(crate) rx: mpsc::Receiver<Request>,
    pub(crate) tx: mpsc::Sender<Response>,
}

pub struct Transaction {
    id: RequestId,

    peer: PeerId,
    session: SessionId,

    service: ServiceDescriptor,
    procedure: ProcedureDescriptor,

    request: mpsc::Receiver<Bytes>,
    response: mpsc::Sender<Result<Bytes, TransactionError>>,
}

impl Transaction {
    pub(crate) fn from_request(
        header: RequestHeader,
        body: &RequestBegin,
        TransactionParts {
            peer,
            session,
            config,
            rx,
            tx,
        }: TransactionParts,
    ) -> (Self, TransactionTask) {
        let (request_tx, request_rx) =
            mpsc::channel(config.per_transaction_request_byte_stream_buffer_size.get());
        let (response_tx, response_rx) = mpsc::channel(
            config
                .per_transaction_response_byte_stream_buffer_size
                .get(),
        );

        let transaction = Self {
            peer,
            id: header.request_id,
            session,

            service: body.service,
            procedure: body.procedure,

            request: request_rx,
            response: response_tx,
        };

        let task = TransactionTask {
            id: header.request_id,
            config,

            request_rx: rx,
            request_tx,

            response_rx,
            response_tx: tx,
        };

        (transaction, task)
    }
}

pub(crate) struct TransactionTask {
    id: RequestId,
    config: SessionConfig,

    request_rx: mpsc::Receiver<Request>,
    request_tx: mpsc::Sender<Bytes>,

    response_rx: mpsc::Receiver<Result<Bytes, TransactionError>>,
    response_tx: mpsc::Sender<Response>,
}

impl TransactionTask {
    pub(super) fn start(self, tasks: &TaskTracker, cancel: CancellationToken) {
        let recv = TransactionRecvDelegateTask {
            rx: self.request_rx,
            tx: self.request_tx,
        };

        let send = TransactionSendDelegateTask {
            id: self.id,
            config: self.config,

            rx: self.response_rx,
            tx: self.response_tx,
        };

        tasks.spawn(recv.run(cancel.clone()));
        tasks.spawn(send.run(cancel));
    }
}

#[cfg(test)]
mod test {
    use core::time::Duration;

    use bytes::Bytes;
    use harpc_wire_protocol::{
        flags::BitFlagsOp,
        payload::Payload,
        request::id::RequestId,
        response::{
            begin::ResponseBegin,
            body::ResponseBody,
            flags::{ResponseFlag, ResponseFlags},
            frame::ResponseFrame,
            kind::ResponseKind,
            Response,
        },
    };
    use tokio::{sync::mpsc, task::JoinHandle};
    use tokio_util::sync::CancellationToken;

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
    async fn send_delay_error_immediate() {
        todo!()
    }

    #[tokio::test]
    async fn send_delay_error_delayed() {
        todo!()
    }

    #[tokio::test]
    async fn send_delay_error_multiple() {
        todo!()
    }

    #[tokio::test]
    async fn send_delay_error_interspersed() {
        todo!()
    }

    #[tokio::test]
    async fn send_no_delay_split_large() {
        todo!()
    }

    #[tokio::test]
    async fn send_no_delay_split_large_multiple() {
        todo!()
    }

    #[tokio::test]
    async fn send_no_delay_no_merge_small() {
        todo!()
    }

    #[tokio::test]
    async fn send_no_delay_flush_remaining() {
        todo!()
    }

    #[tokio::test]
    async fn send_no_delay_flush_empty() {
        todo!()
    }

    #[tokio::test]
    async fn send_no_delay_error_immediate() {
        todo!()
    }

    #[tokio::test]
    async fn send_no_delay_error_delayed() {
        todo!()
    }

    #[tokio::test]
    async fn send_no_delay_error_multiple() {
        todo!()
    }

    #[tokio::test]
    async fn send_no_delay_error_interspersed() {
        todo!()
    }
}

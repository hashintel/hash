use core::mem;

use bytes::{Buf, Bytes, BytesMut};
use bytes_utils::SegmentedBuf;
use futures::StreamExt;
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    payload::Payload,
    protocol::{Protocol, ProtocolVersion},
    request::{
        begin::RequestBegin,
        body::RequestBody,
        flags::{RequestFlag, RequestFlags},
        id::RequestId,
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
use kanal::SendError;
use libp2p::PeerId;
use tokio::{select, sync::mpsc};
use tokio_util::sync::CancellationToken;

use super::session::Session;

struct TransactionError {
    code: ErrorCode,
    bytes: Bytes,
}

struct Transaction {
    peer: PeerId,
    id: RequestId,
    session: Session,

    sink: mpsc::Sender<Bytes>,
    stream: mpsc::Receiver<Bytes>,
}

struct TransactionSendDelegateTaskForward<'a> {
    kind: ResponseKind,
    index: &'a mut usize,
    flush: bool,
}

struct TransactionSendDelegateTask {
    id: RequestId,

    tx: kanal::AsyncSender<Response>,
    rx: kanal::AsyncReceiver<core::result::Result<Bytes, TransactionError>>,
}

impl TransactionSendDelegateTask {
    async fn forward(
        &mut self,
        buffer: &mut SegmentedBuf<Bytes>,
        TransactionSendDelegateTaskForward {
            kind,
            index,
            flush,
        }: TransactionSendDelegateTaskForward<'_>,
    ) -> Result<(), SendError> {
        let body = |bytes: Bytes, index: usize| {
            let payload = Payload::new(bytes);

            if index == 0 {
                ResponseBody::Begin(ResponseBegin { kind, payload })
            } else {
                ResponseBody::Frame(ResponseFrame { payload })
            }
        };

        while buffer.remaining() > Payload::MAX_SIZE {
            let bytes = buffer.copy_to_bytes(Payload::MAX_SIZE);

            let response = Response {
                header: ResponseHeader {
                    protocol: Protocol {
                        version: ProtocolVersion::V1,
                    },
                    request_id: self.id,
                    flags: ResponseFlags::empty(),
                },
                body: body(bytes, *index),
            };

            self.tx.send(response).await?;
            *index += 1;
        }

        if !flush {
            return Ok(());
        }

        let remaining = buffer.remaining();
        let bytes = buffer.copy_to_bytes(remaining);

        let response = Response {
            header: ResponseHeader {
                protocol: Protocol {
                    version: ProtocolVersion::V1,
                },
                request_id: self.id,
                flags: ResponseFlags::from(ResponseFlag::EndOfResponse),
            },
            body: body(bytes, *index),
        };

        self.tx.send(response).await?;
        *index += 1;

        Ok(())
    }

    async fn run(mut self, cancel: CancellationToken) {
        // we cannot simply forward here, because we want to be able to send the end of request and
        // buffer the response into the least amount of packages possible
        let mut buffer = SegmentedBuf::new();

        let mut kind = ResponseKind::Ok;
        let mut index = 0;

        loop {
            let bytes = select! {
                bytes = self.rx.recv() => bytes,
                () = cancel.cancelled() => {
                    break;
                },
            };

            let Ok(bytes) = bytes else {
                // channel has been closed, we are done, flush the buffer

                // flush the remaining buffer only *if* data is successful
                if kind.is_err() {
                    break;
                }

                if let Err(error) = self
                    .forward(
                        &mut buffer,
                        TransactionSendDelegateTaskForward {
                            kind,
                            index: &mut index,
                            flush: true,
                        },
                    )
                    .await
                {
                    tracing::error!(?error, "connection has been prematurely closed");
                }

                break;
            };

            match bytes {
                Ok(_) if kind.is_err() => {
                    // we had an error previously, so just ignore the rest of the stream
                    continue;
                }
                Ok(bytes) => {
                    buffer.push(bytes);

                    if let Err(error) = self
                        .forward(
                            &mut buffer,
                            TransactionSendDelegateTaskForward {
                                kind,
                                index: &mut index,
                                flush: false,
                            },
                        )
                        .await
                    {
                        tracing::error!(?error, "connection has been prematurely closed");
                        break;
                    }
                }
                Err(TransactionError { code, bytes }) => {
                    kind = ResponseKind::Err(code);

                    // we start from the beginning
                    buffer = SegmentedBuf::new();
                    buffer.push(bytes);

                    if let Err(error) = self
                        .forward(
                            &mut buffer,
                            TransactionSendDelegateTaskForward {
                                kind,
                                index: &mut index,
                                flush: true,
                            },
                        )
                        .await
                    {
                        tracing::error!(?error, "connection has been prematurely closed");
                        break;
                    }
                }
            }
        }
    }
}

struct TransactionRecvDelegateTask {
    id: RequestId,

    tx: kanal::AsyncSender<Bytes>,
    rx: kanal::AsyncReceiver<Request>,
}

impl TransactionRecvDelegateTask {
    async fn run(self, cancel: CancellationToken) {
        // TODO: timeout is done at a later layer, not here, this just delegates.

        loop {
            let request = select! {
                request = self.rx.recv() => request,
                () = cancel.cancelled() => {
                    break;
                },
            };

            let Ok(request) = request else {
                // channel has been closed, we are done
                tracing::error!("connection has been prematurely closed");

                break;
            };

            // send bytes to the other end, and close if we're at the end
            let is_end = request.header.flags.contains(RequestFlag::EndOfRequest);
            let bytes = request.body.into_payload().into_bytes();

            let result = self.tx.send(bytes).await;

            if let Err(error) = result {
                // TODO: the upper layer is responsible for notifying the other end as to why the
                // connection was closed.
                tracing::error!(?error, "connection has been prematurely closed");
                break;
            }

            if is_end {
                // dropping both rx and tx means that we signal to both ends that we're done.
                break;
            }
        }
    }
}

// we essentially need two tasks per transaction/connection/session, one that delegates recv and one
// that delegates send

pub(crate) struct TransactionTask {
    request: mpsc::Receiver<Request>,
    response: mpsc::Sender<Response>,

    recv: mpsc::Receiver<Bytes>,
    send: mpsc::Sender<Bytes>,
}

impl TransactionTask {
    fn run(mut self, cancel: CancellationToken) {
        // Not necessary, but protects us from canceling other adjacent tasks if we are canceled.
        let cancel = cancel.child_token();

        let cancel_recv = cancel.child_token();
        let cancel_send = cancel.child_token();

        tokio::spawn(async move {
            loop {
                let request = select! {
                    Some(request) = self.request.recv() => {
                        // send bytes to the other end
                        request
                    },
                    () = cancel_recv.cancelled() => {
                        break;
                    }
                };

                // send bytes to the other end
                let Err(error) = self
                    .send
                    .send(request.body.into_payload().into_bytes())
                    .await
                else {
                    // we haven't failed so can safely continue
                    continue;
                };

                // if we failed we can also bail out of the recv, send task because the connection
                // has been closed either way. before we do we send a response
                cancel.cancel();
            }
        });

        tokio::spawn(async move {
            let mut buffer = BytesMut::new();

            loop {
                let response = select! {
                    bytes = self.recv.recv() => bytes,
                    () = cancel_send.cancelled() => {
                        break;
                    }
                };

                // if `None` then we're at the end of the stream
            }
        });
    }
}

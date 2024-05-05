use bytes::{Buf, Bytes};
use bytes_utils::SegmentedBuf;
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    payload::Payload,
    protocol::{Protocol, ProtocolVersion},
    request::{
        begin::RequestBegin, flags::RequestFlag, header::RequestHeader, id::RequestId,
        procedure::ProcedureDescriptor, service::ServiceDescriptor, Request,
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
use tokio::{select, sync::mpsc};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

use super::session_id::SessionId;
use crate::session::error::TransactionError;

struct TransactionSendDelegateTaskForward<'a> {
    kind: ResponseKind,
    index: &'a mut usize,
    flush: bool,
}

struct TransactionSendDelegateTask {
    id: RequestId,

    tx: mpsc::Sender<Response>,
    rx: mpsc::Receiver<core::result::Result<Bytes, TransactionError>>,
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
    ) -> Result<(), mpsc::error::SendError<Response>> {
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

            let Some(bytes) = bytes else {
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
                        tracing::warn!(?error, "connection has been prematurely closed");
                        break;
                    }
                }
                Err(TransactionError { code, bytes }) => {
                    kind = ResponseKind::Err(code);
                    index = 0;

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
                        tracing::warn!(?error, "connection has been prematurely closed");
                        break;
                    }
                }
            }
        }
    }
}

struct TransactionRecvDelegateTask {
    id: RequestId,

    tx: mpsc::Sender<Bytes>,
    rx: mpsc::Receiver<Request>,
}

impl TransactionRecvDelegateTask {
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

const REQUEST_BUFFER_SIZE: usize = 16;
const RESPONSE_BUFFER_SIZE: usize = 16;

pub(crate) struct TransactionParts {
    pub(crate) peer: PeerId,

    pub(crate) rx: mpsc::Receiver<Request>,
    pub(crate) tx: mpsc::Sender<Response>,

    pub(crate) session: SessionId,
}

pub struct Transaction {
    peer: PeerId,
    id: RequestId,
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
            rx,
            tx,
            session,
        }: TransactionParts,
    ) -> (Self, TransactionTask) {
        let (request_tx, request_rx) = mpsc::channel(REQUEST_BUFFER_SIZE);
        let (response_tx, response_rx) = mpsc::channel(RESPONSE_BUFFER_SIZE);

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

    request_rx: mpsc::Receiver<Request>,
    request_tx: mpsc::Sender<Bytes>,

    response_rx: mpsc::Receiver<Result<Bytes, TransactionError>>,
    response_tx: mpsc::Sender<Response>,
}

impl TransactionTask {
    pub(super) fn start(self, cancel: &CancellationToken) -> TaskTracker {
        let child = cancel.child_token();

        let recv = TransactionRecvDelegateTask {
            id: self.id,
            tx: self.request_tx,
            rx: self.request_rx,
        };

        let send = TransactionSendDelegateTask {
            id: self.id,
            tx: self.response_tx,
            rx: self.response_rx,
        };

        let tracker = TaskTracker::new();

        tracker.spawn(recv.run(child.clone()));
        tracker.spawn(send.run(child));

        tracker.close();

        tracker
    }
}

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
            mpsc::channel(config.per_transaction_request_byte_stream_buffer_size);
        let (response_tx, response_rx) =
            mpsc::channel(config.per_transaction_response_byte_stream_buffer_size);

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

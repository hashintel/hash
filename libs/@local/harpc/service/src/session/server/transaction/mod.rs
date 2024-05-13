#[cfg(test)]
mod test;

use alloc::sync::Arc;
use core::{
    pin::Pin,
    sync::atomic::{AtomicBool, Ordering},
    task::{Context, Poll},
};

use bytes::Bytes;
use futures::{Sink, Stream};
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
use tokio_util::{
    sync::{CancellationToken, PollSendError, PollSender},
    task::TaskTracker,
};

use super::{
    connection::TransactionPermit, session_id::SessionId, write::ResponseWriter, SessionConfig,
};
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
            ResponseWriter::new_ok(self.id, &self.tx).with_no_delay(self.config.no_delay);

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
                if let Err(error) = writer.flush().await {
                    tracing::error!(?error, "connection has been prematurely closed");
                }

                break;
            };

            match bytes {
                Ok(_) if writer.is_error() => {
                    // we had an error previously, so just ignore the rest of the stream
                    continue;
                }
                Ok(bytes) => {
                    writer.push(bytes);

                    if let Err(error) = writer.write().await {
                        tracing::warn!(?error, "connection has been prematurely closed");
                        break;
                    }
                }
                Err(TransactionError { code, bytes }) => {
                    writer = ResponseWriter::new_error(self.id, code, &self.tx)
                        .with_no_delay(self.config.no_delay);
                    writer.push(bytes);

                    if let Err(error) = writer.write().await {
                        tracing::warn!(?error, "connection has been prematurely closed");
                        break;
                    }
                }
            }
        }
    }
}

struct TransactionRecvDelegateTask {
    rx: tachyonix::Receiver<Request>,
    tx: mpsc::Sender<Bytes>,

    incomplete: Arc<AtomicBool>,
}

impl TransactionRecvDelegateTask {
    fn mark_incomplete(&self) {
        self.incomplete.store(true, Ordering::SeqCst);
    }

    #[allow(clippy::integer_division_remainder_used)]
    async fn run(mut self, cancel: CancellationToken) {
        // TODO: timeout is done at a later layer, not here, this just delegates.
        loop {
            let request = select! {
                request = self.rx.recv() => request,
                () = cancel.cancelled() => {
                    self.mark_incomplete();
                    break;
                },
            };

            let Ok(request) = request else {
                // channel has been closed, we are done
                tracing::warn!("connection has been prematurely closed");
                self.mark_incomplete();

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
                self.mark_incomplete();

                break;
            }

            if is_end {
                // dropping both rx and tx means that we signal to both ends that we're done.
                break;
            }
        }
    }
}

pub(crate) struct TransactionTask {
    id: RequestId,
    config: SessionConfig,

    request_rx: tachyonix::Receiver<Request>,
    request_tx: mpsc::Sender<Bytes>,

    response_rx: mpsc::Receiver<Result<Bytes, TransactionError>>,
    response_tx: mpsc::Sender<Response>,

    incomplete: Arc<AtomicBool>,
}

impl TransactionTask {
    pub(super) fn start(self, tasks: &TaskTracker, permit: Arc<TransactionPermit>) {
        let recv = TransactionRecvDelegateTask {
            rx: self.request_rx,
            tx: self.request_tx,
            incomplete: self.incomplete,
        };

        let send = TransactionSendDelegateTask {
            id: self.id,
            config: self.config,

            rx: self.response_rx,
            tx: self.response_tx,
        };

        let recv_permit = Arc::clone(&permit);
        tasks.spawn(async move {
            // move the permit into the task, so that it's dropped when the task is done
            let recv_permit = recv_permit;

            recv.run(recv_permit.cancellation_token()).await;
        });

        tasks.spawn(async move {
            // move the permit into the task, so that it's dropped when the task is done
            let send_permit = permit;

            send.run(send_permit.cancellation_token()).await;
        });
    }
}

pub(crate) struct TransactionParts {
    pub(crate) peer: PeerId,
    pub(crate) session: SessionId,

    pub(crate) config: SessionConfig,

    pub(crate) rx: tachyonix::Receiver<Request>,
    pub(crate) tx: mpsc::Sender<Response>,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct TransactionContext {
    id: RequestId,

    peer: PeerId,
    session: SessionId,

    service: ServiceDescriptor,
    procedure: ProcedureDescriptor,
}

impl TransactionContext {
    #[must_use]
    pub const fn id(&self) -> RequestId {
        self.id
    }

    #[must_use]
    pub const fn peer(&self) -> PeerId {
        self.peer
    }

    #[must_use]
    pub const fn session(&self) -> SessionId {
        self.session
    }

    #[must_use]
    pub const fn service(&self) -> ServiceDescriptor {
        self.service
    }

    #[must_use]
    pub const fn procedure(&self) -> ProcedureDescriptor {
        self.procedure
    }
}

pub struct Transaction {
    context: TransactionContext,

    request: mpsc::Receiver<Bytes>,
    response: mpsc::Sender<Result<Bytes, TransactionError>>,

    incomplete: Arc<AtomicBool>,
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

        let incomplete = Arc::new(AtomicBool::new(false));

        let transaction = Self {
            context: TransactionContext {
                id: header.request_id,
                peer,
                session,
                service: body.service,
                procedure: body.procedure,
            },

            request: request_rx,
            response: response_tx,

            incomplete: Arc::clone(&incomplete),
        };

        let task = TransactionTask {
            id: header.request_id,
            config,

            request_rx: rx,
            request_tx,

            response_rx,
            response_tx: tx,

            incomplete,
        };

        (transaction, task)
    }

    #[must_use]
    pub const fn context(&self) -> TransactionContext {
        self.context
    }

    pub fn into_parts(self) -> (TransactionContext, TransactionSink, TransactionStream) {
        let context = self.context;

        let sink = TransactionSink {
            inner: PollSender::new(self.response),
        };

        let stream = TransactionStream {
            inner: self.request,
            incomplete: self.incomplete,
        };

        (context, sink, stream)
    }

    #[must_use]
    pub fn is_closed(&self) -> bool {
        self.request.is_closed() || self.response.is_closed()
    }

    pub fn into_sink(self) -> TransactionSink {
        TransactionSink {
            inner: PollSender::new(self.response),
        }
    }

    pub fn into_stream(self) -> TransactionStream {
        TransactionStream {
            inner: self.request,
            incomplete: self.incomplete,
        }
    }
}

#[must_use = "streams do nothing unless polled"]
pub struct TransactionStream {
    inner: mpsc::Receiver<Bytes>,

    incomplete: Arc<AtomicBool>,
}

impl TransactionStream {
    #[must_use]
    pub fn is_incomplete(&self) -> Option<bool> {
        self.inner
            .is_closed()
            .then(|| self.incomplete.load(Ordering::SeqCst))
    }
}

impl Stream for TransactionStream {
    type Item = Bytes;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.inner.poll_recv(cx)
    }
}

type SinkItem = Result<Bytes, TransactionError>;

pin_project_lite::pin_project! {
    #[must_use = "sinks do nothing unless polled"]
    pub struct TransactionSink {
        #[pin]
        inner: PollSender<SinkItem>,
    }
}

impl TransactionSink {
    #[must_use]
    pub fn is_closed(&self) -> bool {
        self.inner.is_closed()
    }

    pub fn buffer_size(&self) -> usize {
        self.inner
            .get_ref()
            .map_or(0, tokio::sync::mpsc::Sender::max_capacity)
    }
}

impl Sink<SinkItem> for TransactionSink {
    type Error = PollSendError<SinkItem>;

    fn poll_ready(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.project().inner.poll_ready(cx)
    }

    fn start_send(self: Pin<&mut Self>, item: SinkItem) -> Result<(), Self::Error> {
        self.project().inner.start_send(item)
    }

    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.project().inner.poll_flush(cx)
    }

    fn poll_close(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.project().inner.poll_close(cx)
    }
}

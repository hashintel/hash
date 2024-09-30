#[cfg(test)]
mod test;

use alloc::sync::Arc;
use core::{
    pin::Pin,
    task::{Context, Poll, ready},
};

use bytes::Bytes;
use futures::{Sink, Stream, StreamExt as _, stream::FusedStream};
use harpc_wire_protocol::{
    flags::BitFlagsOp as _,
    request::{
        Request, begin::RequestBegin, flags::RequestFlag, id::RequestId,
        procedure::ProcedureDescriptor, service::ServiceDescriptor,
    },
    response::{Response, kind::ResponseKind},
};
use libp2p::PeerId;
use tokio::{select, sync::mpsc};
use tokio_util::{
    sync::{CancellationToken, PollSendError, PollSender},
    task::TaskTracker,
};

use super::{SessionConfig, connection::collection::TransactionPermit, session_id::SessionId};
use crate::session::{
    error::TransactionError,
    writer::{ResponseContext, ResponseWriter, WriterOptions},
};

pub(crate) trait ServerTransactionPermit: Send + Sync + 'static {
    fn id(&self) -> RequestId;
    fn cancellation_token(&self) -> &CancellationToken;
}

struct TransactionSendDelegateTask<P> {
    config: SessionConfig,

    // TODO: consider switching to `tachyonix` crate for better performance (not yet tested)
    // as well as more predictable buffering behavioud. `PollSender` is prone to just buffer
    // everything before sending, which might not be the best idea in this scenario.
    rx: mpsc::Receiver<core::result::Result<Bytes, TransactionError>>,
    tx: mpsc::Sender<Response>,

    permit: Arc<P>,
}

impl<P> TransactionSendDelegateTask<P>
where
    P: ServerTransactionPermit,
{
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]
    async fn run(mut self) {
        let cancel = self.permit.cancellation_token();

        // we cannot simply forward here, because we want to be able to send the end of request and
        // buffer the response into the least amount of packages possible

        let mut writer = ResponseWriter::new(
            WriterOptions {
                no_delay: self.config.no_delay,
            },
            ResponseContext {
                id: self.permit.id(),
                kind: ResponseKind::Ok,
            },
            &self.tx,
        );

        loop {
            // TODO: potential performance improvement: use `recv_many` instead of `recv`
            // This only is a performance improvement depending on the behaviour of the channel
            // used. `PollSender` likes to buffer as much as possible before sending, which might
            // not be a good idea.
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
                    writer = ResponseWriter::new(
                        WriterOptions {
                            no_delay: self.config.no_delay,
                        },
                        ResponseContext {
                            id: self.permit.id(),
                            kind: ResponseKind::Err(code),
                        },
                        &self.tx,
                    );
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

pub(crate) struct TransactionTask<P> {
    config: SessionConfig,

    response_rx: mpsc::Receiver<Result<Bytes, TransactionError>>,
    response_tx: mpsc::Sender<Response>,

    permit: Arc<P>,
}

impl<P> TransactionTask<P>
where
    P: ServerTransactionPermit,
{
    pub(super) fn start(self, tasks: &TaskTracker) {
        let send = TransactionSendDelegateTask {
            config: self.config,

            rx: self.response_rx,
            tx: self.response_tx,

            permit: self.permit,
        };

        tasks.spawn(send.run());
    }
}

pub(crate) struct TransactionParts<P> {
    pub peer: PeerId,
    pub session: SessionId,

    pub config: SessionConfig,

    pub rx: tachyonix::Receiver<Request>,
    pub tx: mpsc::Sender<Response>,

    pub permit: P,
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

    request: tachyonix::Receiver<Request>,
    response: mpsc::Sender<Result<Bytes, TransactionError>>,

    permit: Arc<TransactionPermit>,
}

impl Transaction {
    #[expect(
        clippy::significant_drop_tightening,
        reason = "TransactionPermit is used to track the transaction lifetime, false-positive"
    )]
    pub(crate) fn from_request(
        body: &RequestBegin,
        TransactionParts {
            peer,
            session,
            config,
            rx,
            tx,
            permit,
        }: TransactionParts<TransactionPermit>,
    ) -> (Self, TransactionTask<TransactionPermit>) {
        let permit = Arc::new(permit);

        let (response_tx, response_rx) = mpsc::channel(
            config
                .per_transaction_response_byte_stream_buffer_size
                .get(),
        );

        let transaction = Self {
            context: TransactionContext {
                id: permit.id(),
                peer,
                session,
                service: body.service,
                procedure: body.procedure,
            },

            request: rx,
            response: response_tx,

            permit: Arc::clone(&permit),
        };

        let task = TransactionTask {
            config,

            response_rx,
            response_tx: tx,

            permit,
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

        let stream = TransactionStream::new(self.request, self.permit);

        (context, sink, stream)
    }

    #[must_use]
    pub fn is_closed(&self) -> bool {
        self.response.is_closed()
    }

    pub fn into_sink(self) -> TransactionSink {
        TransactionSink {
            inner: PollSender::new(self.response),
        }
    }

    pub fn into_stream(self) -> TransactionStream {
        TransactionStream::new(self.request, self.permit)
    }
}

#[derive(Debug)]
enum TransactionStreamState {
    Open {
        sender: tachyonix::Receiver<Request>,
        _permit: Arc<TransactionPermit>,
    },
    Closed {
        complete: bool,
    },
}

#[must_use = "streams do nothing unless polled"]
#[derive(Debug)]
pub struct TransactionStream {
    state: TransactionStreamState,
}

impl TransactionStream {
    const fn new(sender: tachyonix::Receiver<Request>, permit: Arc<TransactionPermit>) -> Self {
        Self {
            state: TransactionStreamState::Open {
                sender,
                _permit: permit,
            },
        }
    }

    #[must_use]
    pub fn is_incomplete(&self) -> Option<bool> {
        match &self.state {
            TransactionStreamState::Open { .. } => None,
            TransactionStreamState::Closed { complete } => Some(!complete),
        }
    }
}

impl Stream for TransactionStream {
    type Item = Bytes;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let TransactionStreamState::Open { sender, .. } = &mut self.state else {
            return Poll::Ready(None);
        };

        let Some(value) = ready!(sender.poll_next_unpin(cx)) else {
            // connection has been prematurely closed by the remote
            // we should consider the transaction as incomplete
            self.state = TransactionStreamState::Closed { complete: false };
            tracing::warn!("connection has been prematurely closed");

            return Poll::Ready(None);
        };

        let is_end_of_request = value.header.flags.contains(RequestFlag::EndOfRequest);

        if is_end_of_request {
            self.state = TransactionStreamState::Closed { complete: true };
        }

        let bytes = value.body.into_payload().into_bytes();

        Poll::Ready(Some(bytes))
    }
}

impl FusedStream for TransactionStream {
    fn is_terminated(&self) -> bool {
        match &self.state {
            TransactionStreamState::Open { .. } => false,
            TransactionStreamState::Closed { .. } => true,
        }
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
        self.inner.get_ref().map_or(0, mpsc::Sender::max_capacity)
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

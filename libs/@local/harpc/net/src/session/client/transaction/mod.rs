pub(crate) mod stream;
#[cfg(test)]
mod test;

use alloc::sync::Arc;
use core::ops::ControlFlow;

use bytes::Bytes;
use futures::{prelude::future::FutureExt, Stream, StreamExt};
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    request::{id::RequestId, procedure::ProcedureDescriptor, service::ServiceDescriptor, Request},
    response::{
        begin::ResponseBegin, body::ResponseBody, flags::ResponseFlag, frame::ResponseFrame,
        kind::ResponseKind, Response,
    },
};
use tokio::{pin, select, sync::mpsc};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

use self::stream::{ErrorStream, StreamState, ValueStream};
use super::config::SessionConfig;
use crate::{
    session::writer::{RequestContext, RequestWriter, WriterOptions},
    stream::TerminatedChannelStream,
};

pub(crate) trait ClientTransactionPermit: Send + Sync + 'static {
    fn id(&self) -> RequestId;
    fn cancellation_token(&self) -> &CancellationToken;
}

struct ResponseState {
    tx: tachyonix::Sender<Bytes>,
    stream: StreamState,
}

pub(crate) struct TransactionReceiveTask<P> {
    config: SessionConfig,

    rx: tachyonix::Receiver<Response>,
    tx: mpsc::Sender<Result<ValueStream, ErrorStream>>,

    permit: Arc<P>,
}

impl<P> TransactionReceiveTask<P>
where
    P: ClientTransactionPermit,
{
    async fn handle_begin(
        &self,
        state: &mut Option<ResponseState>,
        ResponseBegin { kind, payload }: ResponseBegin,
    ) -> ControlFlow<(), Bytes> {
        let (tx, rx) = tachyonix::channel(
            self.config
                .per_transaction_response_byte_stream_buffer_size
                .get(),
        );

        let internal = StreamState::new();

        state.replace(ResponseState {
            tx,
            stream: internal.clone(),
        });

        let stream = match kind {
            ResponseKind::Ok => Ok(ValueStream {
                inner: TerminatedChannelStream::new(rx),
                state: internal,
            }),
            ResponseKind::Err(code) => Err(ErrorStream {
                code,
                inner: TerminatedChannelStream::new(rx),
                state: internal,
            }),
        };

        if self.tx.send(stream).await.is_err() {
            // The receiver for individual responses has been dropped, meaning we can stop
            // processing
            return ControlFlow::Break(());
        }

        ControlFlow::Continue(payload.into_bytes())
    }

    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]
    pub(crate) async fn run(mut self) {
        let mut state: Option<ResponseState> = None;
        let cancel = self.permit.cancellation_token();

        loop {
            // We cannot early break if tx is closed, because we might still deliver some responses
            let response = select! {
                response = self.rx.recv() => response,
                () = cancel.cancelled() => break
            };

            let Ok(response) = response else {
                // sender has been prematurely dropped, this might be because the transaction has
                // failed in some fashion or the request has been dropped.
                tracing::info!("connection prematurely dropped");

                // the consumer will be indirectly informed, as we're winding down operation, and
                // therefore will never send a EndOfResponse flag.

                break;
            };

            if response.header.request_id != self.permit.id() {
                let task_id = self.permit.id();
                let response_id = response.header.request_id;

                // this response is not for us, ignore it
                tracing::warn!(
                    %response_id,
                    %task_id,
                    "response with differing request id has been routed to transaction task, \
                     ignoring..."
                );
                continue;
            }

            let end_of_response = response.header.flags.contains(ResponseFlag::EndOfResponse);

            let bytes = match response.body {
                ResponseBody::Begin(begin) => self.handle_begin(&mut state, begin).await,
                ResponseBody::Frame(ResponseFrame { payload }) => {
                    ControlFlow::Continue(payload.into_bytes())
                }
            };

            let ControlFlow::Continue(bytes) = bytes else {
                // we don't need to notify the consumer of this, as the consumer was the one that
                // initiated it.
                tracing::info!("stream prematurely dropped");

                break;
            };

            let mut reset = false;
            if let Some(state) = &mut state {
                // before sending the last byte, flip the flag
                if end_of_response {
                    // SeqCst should ensure that we see the flag flip in any circumstance.
                    state.stream.set_end_of_response();
                }

                if bytes.is_empty() {
                    // don't do anything if the byte stream is empty
                    // (we could also add this to the other branch), but that one has side effects,
                    // so this makes it clearer as to what's happening
                } else if state.tx.send(bytes).await.is_err() {
                    // don't need to notify the consumer of this, as the consumer was the one that
                    // initiated it.
                    tracing::warn!("response byte stream has been prematurely dropped");
                    reset = true;
                }
            } else {
                tracing::warn!("received frame without a begin");
            }

            if reset {
                state.take();
            }

            if end_of_response {
                tracing::debug!("end of response, shutting down");
                break;
            }
        }

        tracing::trace!("transaction receive task shutting down");
    }
}

pub(crate) struct TransactionSendTask<S, P> {
    config: SessionConfig,

    service: ServiceDescriptor,
    procedure: ProcedureDescriptor,

    rx: S,
    tx: mpsc::Sender<Request>,

    permit: Arc<P>,
}

impl<S, P> TransactionSendTask<S, P>
where
    S: Stream<Item = Bytes> + Send,
    P: ClientTransactionPermit,
{
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]
    pub(crate) async fn run(self) {
        let cancel = self.permit.cancellation_token();
        let mut writer = RequestWriter::new(
            WriterOptions {
                no_delay: self.config.no_delay,
            },
            RequestContext {
                id: self.permit.id(),
                service: self.service,
                procedure: self.procedure,
            },
            &self.tx,
        );
        let rx = self.rx;

        pin!(rx);

        loop {
            let bytes = select! {
                bytes = rx.next().fuse() => bytes,
                () = cancel.cancelled() => {
                    break;
                },
            };

            let Some(bytes) = bytes else {
                // Stream has finished, flush the buffer
                if let Err(error) = writer.flush().await {
                    tracing::error!(?error, "connection has been prematurely closed");
                }

                break;
            };

            writer.push(bytes);
            if let Err(error) = writer.write().await {
                tracing::error!(?error, "connection has been prematurely closed");
                break;
            }
        }

        tracing::trace!("transaction send task shutting down");
    }
}

pub(crate) struct TransactionTask<S, P> {
    pub(crate) config: SessionConfig,
    pub(crate) permit: P,

    pub(crate) service: ServiceDescriptor,
    pub(crate) procedure: ProcedureDescriptor,

    pub(crate) response_rx: tachyonix::Receiver<Response>,
    pub(crate) response_tx: mpsc::Sender<Result<ValueStream, ErrorStream>>,

    pub(crate) request_rx: S,
    pub(crate) request_tx: mpsc::Sender<Request>,
}

impl<S, P> TransactionTask<S, P>
where
    S: Stream<Item = Bytes> + Send + 'static,
    P: ClientTransactionPermit,
{
    pub(crate) fn spawn(self, tasks: &TaskTracker) {
        let permit = Arc::new(self.permit);

        tasks.spawn(
            TransactionReceiveTask {
                config: self.config,
                rx: self.response_rx,
                tx: self.response_tx,
                permit: Arc::clone(&permit),
            }
            .run(),
        );

        tasks.spawn(
            TransactionSendTask {
                config: self.config,

                service: self.service,
                procedure: self.procedure,

                rx: self.request_rx,
                tx: self.request_tx,

                permit,
            }
            .run(),
        );
    }
}

#[cfg(test)]
mod test;

use alloc::sync::Arc;
use core::{
    ops::ControlFlow,
    sync::atomic::{AtomicBool, Ordering},
};

use bytes::Bytes;
use futures::{prelude::future::FutureExt, stream::FusedStream, Stream, StreamExt};
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    request::{id::RequestId, procedure::ProcedureDescriptor, service::ServiceDescriptor, Request},
    response::{
        begin::ResponseBegin,
        body::ResponseBody,
        flags::ResponseFlag,
        frame::ResponseFrame,
        kind::{ErrorCode, ResponseKind},
        Response,
    },
};
use tokio::{pin, select, sync::mpsc};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

use super::config::SessionConfig;
use crate::{
    session::writer::{RequestContext, RequestWriter, WriterOptions},
    stream::TerminatedChannelStream,
};

pub(crate) trait Permit: Send + Sync + 'static {
    fn id(&self) -> RequestId;
    fn cancellation_token(&self) -> CancellationToken;
}

#[derive(Debug)]
pub struct ErrorStream {
    code: ErrorCode,

    inner: TerminatedChannelStream<Bytes>,

    end_of_response: Arc<AtomicBool>,
}

impl ErrorStream {
    #[must_use]
    pub const fn code(&self) -> ErrorCode {
        self.code
    }

    #[must_use]
    pub fn is_end_of_response(&self) -> Option<bool> {
        if !self.inner.is_terminated() {
            return None;
        }

        Some(self.end_of_response.load(Ordering::SeqCst))
    }
}

impl Stream for ErrorStream {
    type Item = Bytes;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        self.inner.poll_next_unpin(cx)
    }
}

impl FusedStream for ErrorStream {
    fn is_terminated(&self) -> bool {
        self.inner.is_terminated()
    }
}

#[derive(Debug)]
pub struct ValueStream {
    inner: TerminatedChannelStream<Bytes>,

    end_of_response: Arc<AtomicBool>,
}

impl ValueStream {
    #[must_use]
    pub fn is_end_of_response(&self) -> Option<bool> {
        if !self.inner.is_terminated() {
            return None;
        }

        Some(self.end_of_response.load(Ordering::SeqCst))
    }
}

impl Stream for ValueStream {
    type Item = Bytes;

    fn poll_next(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        self.inner.poll_next_unpin(cx)
    }
}

impl FusedStream for ValueStream {
    fn is_terminated(&self) -> bool {
        self.inner.is_terminated()
    }
}

struct ResponseState {
    tx: tachyonix::Sender<Bytes>,
    end_of_response: Arc<AtomicBool>,
}

pub(crate) struct TransactionReceiveTask<P> {
    config: SessionConfig,

    rx: tachyonix::Receiver<Response>,
    tx: mpsc::Sender<Result<ValueStream, ErrorStream>>,

    permit: Arc<P>,
}

impl<P> TransactionReceiveTask<P>
where
    P: Permit,
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

        let end_of_response = Arc::new(AtomicBool::new(false));

        state.replace(ResponseState {
            tx,
            end_of_response: Arc::clone(&end_of_response),
        });

        let stream = match kind {
            ResponseKind::Ok => Ok(ValueStream {
                inner: TerminatedChannelStream::new(rx),
                end_of_response,
            }),
            ResponseKind::Err(code) => Err(ErrorStream {
                code,
                inner: TerminatedChannelStream::new(rx),
                end_of_response,
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
        let mut state = None;
        let cancel = self.permit.cancellation_token();

        loop {
            let response = select! {
                response = self.rx.recv() => response,
                () = cancel.cancelled() => break
            };

            let Ok(response) = response else {
                // sender has been prematurely dropped, this might be because the transaction has
                // failed in some fashion or the request has been dropped.
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
                tracing::info!("stream prematurely dropped");
                break;
            };

            let mut reset = false;
            if let Some(state) = &mut state {
                // before sending the last byte, flip the flag
                if end_of_response {
                    // SeqCst should ensure that we see the flag flip in any circumstance.
                    state.end_of_response.store(true, Ordering::SeqCst);
                }

                if state.tx.send(bytes).await.is_err() {
                    tracing::warn!("response bytestream has been prematurely dropped");
                    reset = true;
                }
            } else {
                tracing::warn!("received frame without a begin");
                continue;
            }

            if reset {
                state.take();
            }

            if end_of_response {
                tracing::debug!("end of response, shutting down");
                break;
            }
        }
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
    P: Permit,
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
    }
}

pub(crate) struct TransactionTask<S, P> {
    pub(crate) config: SessionConfig,
    pub(crate) permit: Arc<P>,

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
    P: Permit,
{
    pub(crate) fn spawn(self, tasks: &TaskTracker) {
        tasks.spawn(
            TransactionReceiveTask {
                config: self.config,
                rx: self.response_rx,
                tx: self.response_tx,
                permit: Arc::clone(&self.permit),
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

                permit: self.permit,
            }
            .run(),
        );
    }
}

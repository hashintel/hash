use alloc::sync::Arc;
use core::{
    ops::ControlFlow,
    sync::atomic::{AtomicBool, Ordering},
};

use bytes::Bytes;
use futures::{prelude::future::FutureExt, Stream};
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
use tokio_stream::StreamExt;
use tokio_util::sync::CancellationToken;

use super::config::SessionConfig;
use crate::session::writer::{RequestContext, RequestWriter, WriterOptions};

pub struct ErrorStream {
    code: ErrorCode,

    rx: mpsc::Receiver<Bytes>,

    end_of_response: Arc<AtomicBool>,
}

impl ErrorStream {
    pub fn is_end_of_response(&self) -> bool {
        self.end_of_response.load(Ordering::SeqCst)
    }
}

pub struct ValueStream {
    rx: mpsc::Receiver<Bytes>,

    end_of_response: Arc<AtomicBool>,
}

impl ValueStream {
    pub fn is_end_of_response(&self) -> bool {
        self.end_of_response.load(Ordering::SeqCst)
    }
}

struct ResponseState {
    tx: mpsc::Sender<Bytes>,
    end_of_response: Arc<AtomicBool>,
}

pub(crate) struct TransactionReceiveTask {
    pub(crate) config: SessionConfig,

    pub(crate) rx: mpsc::Receiver<Response>,
    pub(crate) tx: mpsc::Sender<Result<ValueStream, ErrorStream>>,
}

impl TransactionReceiveTask {
    async fn handle_begin(
        &self,
        state: &mut Option<ResponseState>,
        ResponseBegin { kind, payload }: ResponseBegin,
    ) -> ControlFlow<(), Bytes> {
        let (tx, rx) = mpsc::channel(
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
                rx,
                end_of_response,
            }),
            ResponseKind::Err(code) => Err(ErrorStream {
                code,
                rx,
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
    pub(crate) async fn run(mut self, cancel: CancellationToken) {
        let mut state = None;

        loop {
            let response = select! {
                response = self.rx.recv() => response,
                () = cancel.cancelled() => break
            };

            let Some(response) = response else {
                break;
            };

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

pub(crate) struct TransactionSendTask<S> {
    pub(crate) config: SessionConfig,
    pub(crate) id: RequestId,

    pub(crate) service: ServiceDescriptor,
    pub(crate) procedure: ProcedureDescriptor,

    pub(crate) rx: S,
    pub(crate) tx: mpsc::Sender<Request>,
}

impl<S> TransactionSendTask<S>
where
    S: Stream<Item = Bytes> + Send,
{
    #[expect(
        clippy::integer_division_remainder_used,
        reason = "required for select! macro"
    )]
    pub(crate) async fn run(self, cancel: CancellationToken) {
        let mut writer = RequestWriter::new(
            WriterOptions {
                no_delay: self.config.no_delay,
            },
            RequestContext {
                id: self.id,
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

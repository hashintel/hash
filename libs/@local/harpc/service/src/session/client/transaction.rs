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

use crate::session::client::writer::RequestWriter;

const BYTE_STREAM_BUFFER_SIZE: usize = 32;

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

pub(crate) struct TransactionReceiveTask {
    pub(crate) rx: mpsc::Receiver<Response>,
    pub(crate) tx: mpsc::Sender<Result<ValueStream, ErrorStream>>,
}

impl TransactionReceiveTask {
    async fn handle_begin(
        &self,
        bytes_tx: &mut Option<mpsc::Sender<Bytes>>,
        end_of_response: &mut Option<Arc<AtomicBool>>,
        ResponseBegin { kind, payload }: ResponseBegin,
    ) -> ControlFlow<(), Bytes> {
        let (tx, rx) = mpsc::channel(BYTE_STREAM_BUFFER_SIZE);
        bytes_tx.replace(tx);

        let flag = Arc::new(AtomicBool::new(false));
        end_of_response.replace(Arc::clone(&flag));

        let stream = match kind {
            ResponseKind::Ok => Ok(ValueStream {
                rx,
                end_of_response: flag,
            }),
            ResponseKind::Err(code) => Err(ErrorStream {
                code,
                rx,
                end_of_response: flag,
            }),
        };

        if self.tx.send(stream).await.is_err() {
            return ControlFlow::Break(());
        }

        ControlFlow::Continue(payload.into_bytes())
    }

    #[allow(clippy::integer_division_remainder_used)]
    pub(crate) async fn run(mut self, cancel: CancellationToken) {
        let mut bytes_tx = None;
        let mut end_of_response = None;

        loop {
            let response = select! {
                response = self.rx.recv() => response,
                () = cancel.cancelled() => break
            };

            let Some(response) = response else {
                break;
            };

            // TODO: we can't signal to the other side if we're done with the stream (EndOfResponse)
            // or if we actually just dropped everything.
            // We *could* in theory signal this using maybe an AtomicBool(?)
            // in that case we would need to flip the flag before we drop the stream? but then we
            // have a potential race condition.

            let is_end = response.header.flags.contains(ResponseFlag::EndOfResponse);

            let bytes = match response.body {
                ResponseBody::Begin(begin) => {
                    self.handle_begin(&mut bytes_tx, &mut end_of_response, begin)
                        .await
                }
                ResponseBody::Frame(ResponseFrame { payload }) => {
                    ControlFlow::Continue(payload.into_bytes())
                }
            };

            let ControlFlow::Continue(bytes) = bytes else {
                tracing::info!("stream prematurely dropped");
                break;
            };

            if is_end {
                // before sending the last byte, flip the flag
                if let Some(last) = &end_of_response {
                    // SeqCst should ensure that we see the flag flip in any circumstance.
                    last.store(true, Ordering::SeqCst);
                }
            }

            if let Some(tx) = &mut bytes_tx {
                if tx.send(bytes).await.is_err() {
                    tracing::info!("stream prematurely dropped");
                    break;
                }
            }

            if is_end {
                tracing::debug!("end of response, shutting down");
                break;
            }
        }
    }
}

pub(crate) struct TransactionSendTask<S> {
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
    #[allow(clippy::integer_division_remainder_used)]
    pub(crate) async fn run(self, cancel: CancellationToken) {
        let mut writer = RequestWriter::new(self.id, self.service, self.procedure, &self.tx);
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

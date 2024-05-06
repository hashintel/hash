use alloc::sync::Arc;
use core::{
    ops::ControlFlow,
    sync::atomic::{AtomicBool, Ordering},
};

use bytes::Bytes;
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    response::{
        begin::ResponseBegin,
        body::ResponseBody,
        flags::ResponseFlag,
        frame::ResponseFrame,
        kind::{ErrorCode, ResponseKind},
        Response,
    },
};
use tokio::sync::mpsc;

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

    pub(crate) async fn run(mut self) {
        let mut bytes_tx = None;
        let mut end_of_response = None;

        while let Some(response) = self.rx.recv().await {
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
                if let Err(_) = tx.send(bytes).await {
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

use core::ops::ControlFlow;

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
}

pub struct ValueStream {
    rx: mpsc::Receiver<Bytes>,
}

pub(crate) struct TransactionReceiveTask {
    pub(crate) rx: mpsc::Receiver<Response>,
    pub(crate) tx: mpsc::Sender<Result<ValueStream, ErrorStream>>,
}

impl TransactionReceiveTask {
    async fn handle_begin(
        &self,
        bytes_tx: &mut Option<mpsc::Sender<Bytes>>,
        ResponseBegin { kind, payload }: ResponseBegin,
    ) -> ControlFlow<(), Bytes> {
        let (tx, rx) = mpsc::channel(BYTE_STREAM_BUFFER_SIZE);
        bytes_tx.replace(tx);

        let stream = match kind {
            ResponseKind::Ok => Ok(ValueStream { rx }),
            ResponseKind::Err(code) => Err(ErrorStream { code, rx }),
        };

        if self.tx.send(stream).await.is_err() {
            return ControlFlow::Break(());
        }

        ControlFlow::Continue(payload.into_bytes())
    }

    pub(crate) async fn run(mut self) {
        let mut bytes_tx = None;

        while let Some(response) = self.rx.recv().await {
            let is_end = response.header.flags.contains(ResponseFlag::EndOfResponse);

            let bytes = match response.body {
                ResponseBody::Begin(begin) => self.handle_begin(&mut bytes_tx, begin).await,
                ResponseBody::Frame(ResponseFrame { payload }) => {
                    ControlFlow::Continue(payload.into_bytes())
                }
            };

            let ControlFlow::Continue(bytes) = bytes else {
                tracing::info!("stream prematurely dropped");
                break;
            };

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

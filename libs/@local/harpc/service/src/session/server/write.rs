use bytes::{Buf, Bytes};
use bytes_utils::SegmentedBuf;
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    payload::Payload,
    protocol::{Protocol, ProtocolVersion},
    request::id::RequestId,
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
use tokio::sync::mpsc;

pub(crate) struct ResponseWriter<'a> {
    id: RequestId,
    kind: ResponseKind,
    index: usize,

    buffer: SegmentedBuf<Bytes>,

    tx: &'a mpsc::Sender<Response>,
}

impl<'a> ResponseWriter<'a> {
    pub(crate) fn new_ok(id: RequestId, tx: &'a mpsc::Sender<Response>) -> Self {
        Self {
            id,
            kind: ResponseKind::Ok,
            index: 0,
            buffer: SegmentedBuf::new(),

            tx,
        }
    }

    pub(crate) fn new_error(
        id: RequestId,
        error: ErrorCode,
        tx: &'a mpsc::Sender<Response>,
    ) -> Self {
        Self {
            id,
            kind: ResponseKind::Err(error),
            index: 0,
            buffer: SegmentedBuf::new(),

            tx,
        }
    }

    pub(crate) fn is_error(&self) -> bool {
        matches!(self.kind, ResponseKind::Err(_))
    }

    pub(crate) fn push(&mut self, bytes: Bytes) {
        self.buffer.push(bytes);
    }

    fn body(&self, bytes: Bytes) -> ResponseBody {
        let payload = Payload::new(bytes);

        if self.index == 0 {
            ResponseBody::Begin(ResponseBegin {
                kind: self.kind,
                payload,
            })
        } else {
            ResponseBody::Frame(ResponseFrame { payload })
        }
    }

    fn make(&self, bytes: Bytes) -> Response {
        Response {
            header: ResponseHeader {
                protocol: Protocol {
                    version: ProtocolVersion::V1,
                },
                request_id: self.id,
                flags: ResponseFlags::empty(),
            },
            body: self.body(bytes),
        }
    }

    pub(crate) async fn write(&mut self) -> Result<(), mpsc::error::SendError<Response>> {
        while self.buffer.remaining() > Payload::MAX_SIZE {
            let bytes = self.buffer.copy_to_bytes(Payload::MAX_SIZE);

            let response = self.make(bytes);

            self.tx.send(response).await?;
            self.index += 1;
        }

        Ok(())
    }

    pub(crate) async fn flush(mut self) -> Result<(), mpsc::error::SendError<Response>> {
        self.write().await?;

        assert!(self.buffer.remaining() <= Payload::MAX_SIZE);

        let bytes = self.buffer.copy_to_bytes(self.buffer.remaining());

        let mut response = self.make(bytes);
        response.header.flags = response.header.flags.insert(ResponseFlag::EndOfResponse);

        self.tx.send(response).await?;

        Ok(())
    }
}

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

    no_delay: bool,
}

impl<'a> ResponseWriter<'a> {
    pub(crate) fn new_ok(id: RequestId, tx: &'a mpsc::Sender<Response>) -> Self {
        Self {
            id,
            kind: ResponseKind::Ok,
            index: 0,
            buffer: SegmentedBuf::new(),
            no_delay: false,

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
            no_delay: false,

            tx,
        }
    }

    pub(crate) const fn is_error(&self) -> bool {
        matches!(self.kind, ResponseKind::Err(_))
    }

    pub(crate) fn with_no_delay(self, no_delay: bool) -> Self {
        Self { no_delay, ..self }
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

        if self.no_delay {
            self.write_remaining(false).await?;
        }

        Ok(())
    }

    /// Write the remaining bytes in the buffer.
    ///
    /// The caller must ensure that the payload size is less than or equal to `Payload::MAX_SIZE`.
    pub(crate) async fn write_remaining(
        &mut self,
        end_of_response: bool,
    ) -> Result<(), mpsc::error::SendError<Response>> {
        if self.buffer.remaining() == 0 && !end_of_response {
            return Ok(());
        }

        assert!(self.buffer.remaining() <= Payload::MAX_SIZE);

        let bytes = self.buffer.copy_to_bytes(self.buffer.remaining());

        let mut response = self.make(bytes);

        if end_of_response {
            response.header.flags = response.header.flags.insert(ResponseFlag::EndOfResponse);
        }

        self.tx.send(response).await?;

        Ok(())
    }

    pub(crate) async fn flush(mut self) -> Result<(), mpsc::error::SendError<Response>> {
        self.write().await?;

        self.write_remaining(true).await?;

        Ok(())
    }
}

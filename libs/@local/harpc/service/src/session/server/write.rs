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
        // don't even bother pushing empty bytes
        if !bytes.has_remaining() {
            return;
        }

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

    async fn send(&mut self, response: Response) -> Result<(), mpsc::error::SendError<Response>> {
        self.tx.send(response).await?;
        self.index += 1;

        Ok(())
    }

    pub(crate) async fn write(&mut self) -> Result<(), mpsc::error::SendError<Response>> {
        while self.buffer.remaining() > Payload::MAX_SIZE {
            let bytes = self.buffer.copy_to_bytes(Payload::MAX_SIZE);

            let response = self.make(bytes);

            self.send(response).await?;
        }

        if self.no_delay {
            self.write_remaining(false).await?;
        }

        Ok(())
    }

    /// Write the remaining bytes in the buffer.
    ///
    /// The caller must ensure that the payload size is less than or equal to `Payload::MAX_SIZE`.
    async fn write_remaining(
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

        self.send(response).await?;

        Ok(())
    }

    pub(crate) async fn flush(mut self) -> Result<(), mpsc::error::SendError<Response>> {
        self.write().await?;

        self.write_remaining(true).await?;

        Ok(())
    }
}

#[cfg(test)]
mod test {
    use bytes::{Buf, Bytes};
    use harpc_wire_protocol::{
        flags::BitFlagsOp,
        payload::Payload,
        request::id::RequestId,
        response::flags::{ResponseFlag, ResponseFlags},
    };
    use tokio::sync::mpsc;

    use super::ResponseWriter;

    #[test]
    fn push() {
        let (tx, _rx) = mpsc::channel(1);

        let mut writer = ResponseWriter::new_ok(RequestId::new_unchecked(0x01), &tx);
        assert_eq!(writer.buffer.segments(), 0);

        writer.push("hello".into());
        assert_eq!(writer.buffer.segments(), 1);

        writer.push(Bytes::new());
        assert_eq!(writer.buffer.segments(), 1);

        writer.push("world".into());
        assert_eq!(writer.buffer.segments(), 2);
    }

    #[tokio::test]
    async fn write_remaining_on_empty() {
        let (tx, mut rx) = mpsc::channel(4);

        let mut writer = ResponseWriter::new_ok(RequestId::new_unchecked(0x01), &tx);

        writer.write_remaining(false).await.expect("infallible");
        assert!(rx.is_empty());

        // if we are empty and we are end_of_response, we should still send a response
        writer.write_remaining(true).await.expect("infallible");
        assert!(
            rx.recv()
                .await
                .expect("response")
                .header
                .flags
                .contains(ResponseFlag::EndOfResponse)
        );
    }

    #[tokio::test]
    async fn write_remaining_no_delay_increments_index() {
        let (tx, _rx) = mpsc::channel(4);

        let mut writer =
            ResponseWriter::new_ok(RequestId::new_unchecked(0x01), &tx).with_no_delay(true);
        writer.push(Bytes::from_static(&[0; 8]));

        writer.write_remaining(false).await.expect("infallible");
        assert_eq!(writer.index, 1);

        writer.push(Bytes::from_static(&[0; 8]));
        writer.write_remaining(false).await.expect("infallible");
        assert_eq!(writer.index, 2);

        writer.push(Bytes::from_static(&[0; 8]));
        writer.write_remaining(true).await.expect("infallible");
        assert_eq!(writer.index, 3);
    }

    #[tokio::test]
    async fn flush_calls_write() {
        let (tx, mut rx) = mpsc::channel(4);

        let mut writer = ResponseWriter::new_ok(RequestId::new_unchecked(0x01), &tx);
        writer.push(Bytes::from_static(&[0; Payload::MAX_SIZE + 8]));
        writer.flush().await.expect("infallible");

        // we should have sent 2 responses
        let mut responses = Vec::with_capacity(4);
        let available = rx.recv_many(&mut responses, 4).await;
        assert_eq!(available, 2);
    }

    #[tokio::test]
    async fn write_calls_write_remaining_on_no_delay() {
        let (tx, mut rx) = mpsc::channel(4);

        let mut writer =
            ResponseWriter::new_ok(RequestId::new_unchecked(0x01), &tx).with_no_delay(true);
        writer.push(Bytes::from_static(&[0; 8]));
        writer.write().await.expect("infallible");

        // we should have sent 1 response
        let response = rx.recv().await.expect("response");
        assert_eq!(response.header.flags, ResponseFlags::empty());

        // ... and no data should be left in the buffer
        assert_eq!(writer.buffer.remaining(), 0);
    }
}

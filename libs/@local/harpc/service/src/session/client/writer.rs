use bytes::{Buf, Bytes};
use bytes_utils::SegmentedBuf;
use harpc_wire_protocol::{
    flags::BitFlagsOp,
    payload::Payload,
    protocol::{Protocol, ProtocolVersion},
    request::{
        begin::RequestBegin,
        body::RequestBody,
        flags::{RequestFlag, RequestFlags},
        frame::RequestFrame,
        header::RequestHeader,
        id::RequestId,
        procedure::ProcedureDescriptor,
        service::ServiceDescriptor,
        Request,
    },
};
use tokio::sync::mpsc;

pub(crate) struct RequestWriter<'a> {
    id: RequestId,

    service: ServiceDescriptor,
    procedure: ProcedureDescriptor,

    index: usize,
    buffer: SegmentedBuf<Bytes>,

    tx: &'a mpsc::Sender<Request>,

    /// Whether to enable no-delay for the request.
    ///
    /// This option is similar to the `TCP_NODELAY` setting. When `no_delay` is `false`, requests
    /// are buffered until the payload size is maximized or the writer is flushed, which
    /// aggregates small packets into larger ones to improve throughput. When `no_delay` is
    /// `true`, requests are sent immediately, reducing latency but increasing the number of
    /// packets.
    ///
    /// Enabling `no_delay` increases the number of packets sent but decreases request latency.
    /// Buffering requests helps minimize packet overhead (32 bytes per packet), which can
    /// significantly impact throughput if small packets are sent immediately.
    ///
    /// Additionally, if `no_delay` is set, an empty `EndOfRequest` frame is sent to signal that
    /// the request is finished. When `no_delay` is disabled, the frame containing the
    /// remaining buffer will be tagged with `EndOfRequest` instead.
    no_delay: bool,
    // ^ TODO: implement this
}

impl<'a> RequestWriter<'a> {
    pub(crate) fn new(
        id: RequestId,
        service: ServiceDescriptor,
        procedure: ProcedureDescriptor,
        tx: &'a mpsc::Sender<Request>,
    ) -> Self {
        Self {
            id,

            service,
            procedure,

            index: 0,
            buffer: SegmentedBuf::new(),

            tx,

            no_delay: false,
        }
    }

    pub(crate) fn push(&mut self, bytes: Bytes) {
        // don't even bother pushing empty bytes
        if !bytes.has_remaining() {
            return;
        }

        self.buffer.push(bytes);
    }

    fn body(&self, bytes: Bytes) -> RequestBody {
        let payload = Payload::new(bytes);

        if self.index == 0 {
            RequestBody::Begin(RequestBegin {
                service: self.service,
                procedure: self.procedure,
                payload,
            })
        } else {
            RequestBody::Frame(RequestFrame { payload })
        }
    }

    fn make(&self, bytes: Bytes) -> Request {
        Request {
            header: RequestHeader {
                protocol: Protocol {
                    version: ProtocolVersion::V1,
                },
                request_id: self.id,
                flags: RequestFlags::empty(),
            },
            body: self.body(bytes),
        }
    }

    pub(crate) async fn write(&mut self) -> Result<(), mpsc::error::SendError<Request>> {
        while self.buffer.remaining() > Payload::MAX_SIZE {
            let bytes = self.buffer.copy_to_bytes(Payload::MAX_SIZE);

            let request = self.make(bytes);

            self.tx.send(request).await?;
            self.index += 1;
        }

        Ok(())
    }

    pub(crate) async fn flush(mut self) -> Result<(), mpsc::error::SendError<Request>> {
        self.write().await?;

        assert!(self.buffer.remaining() <= Payload::MAX_SIZE);

        let bytes = self.buffer.copy_to_bytes(self.buffer.remaining());

        let mut request = self.make(bytes);
        request.header.flags = request.header.flags.insert(RequestFlag::EndOfRequest);

        self.tx.send(request).await?;

        Ok(())
    }
}

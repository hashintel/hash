#[cfg(test)]
mod test;

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
    response::{
        begin::ResponseBegin,
        body::ResponseBody,
        flags::{ResponseFlag, ResponseFlags},
        frame::ResponseFrame,
        header::ResponseHeader,
        kind::ResponseKind,
        Response,
    },
};
use tokio::sync::mpsc;

pub(crate) struct WriterOptions {
    /// Whether to enable no-delay for packet transmission.
    ///
    /// This option is similar to the `TCP_NODELAY` setting. When `no_delay` is `false`, packets
    /// are buffered until the payload size is maximized or the writer is flushed, which
    /// aggregates small packets into larger ones to improve throughput. When `no_delay` is
    /// `true`, packets are sent immediately, reducing latency but increasing the number of
    /// packets.
    ///
    /// Enabling `no_delay` increases the number of packets sent but decreases transmission
    /// latency. Buffering packets helps minimize packet overhead (32 bytes per packet), which
    /// can significantly impact throughput if small packets are sent immediately.
    ///
    /// Additionally, if `no_delay` is set, an empty `EndOfPacket` frame is sent to signal that the
    /// packet transmission is finished. When `no_delay` is disabled, the frame containing the
    /// remaining buffer will be tagged with `EndOfPacket` instead.
    pub no_delay: bool,
}

pub(crate) trait NetworkPacket {
    type Context;

    fn new_begin(context: &Self::Context, bytes: Bytes) -> Self;
    fn new_frame(context: &Self::Context, bytes: Bytes) -> Self;

    fn mark_end(&mut self);
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct RequestContext {
    pub id: RequestId,

    pub service: ServiceDescriptor,
    pub procedure: ProcedureDescriptor,
}

fn new_request_header(context: RequestContext) -> RequestHeader {
    RequestHeader {
        protocol: Protocol {
            version: ProtocolVersion::V1,
        },
        request_id: context.id,
        flags: RequestFlags::empty(),
    }
}

impl NetworkPacket for Request {
    type Context = RequestContext;

    fn new_begin(context: &Self::Context, bytes: Bytes) -> Self {
        Self {
            header: new_request_header(*context),
            body: RequestBody::Begin(RequestBegin {
                service: context.service,
                procedure: context.procedure,
                payload: Payload::new(bytes),
            }),
        }
    }

    fn new_frame(context: &Self::Context, bytes: Bytes) -> Self {
        Self {
            header: new_request_header(*context),
            body: RequestBody::Frame(RequestFrame {
                payload: Payload::new(bytes),
            }),
        }
    }

    fn mark_end(&mut self) {
        self.header.flags = self.header.flags.insert(RequestFlag::EndOfRequest);
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct ResponseContext {
    pub id: RequestId,
    pub kind: ResponseKind,
}

fn new_response_header(context: ResponseContext) -> ResponseHeader {
    ResponseHeader {
        protocol: Protocol {
            version: ProtocolVersion::V1,
        },
        request_id: context.id,
        flags: ResponseFlags::empty(),
    }
}

impl NetworkPacket for Response {
    type Context = ResponseContext;

    fn new_begin(context: &Self::Context, bytes: Bytes) -> Self {
        Self {
            header: new_response_header(*context),
            body: ResponseBody::Begin(ResponseBegin {
                kind: context.kind,
                payload: Payload::new(bytes),
            }),
        }
    }

    fn new_frame(context: &Self::Context, bytes: Bytes) -> Self {
        Self {
            header: new_response_header(*context),
            body: ResponseBody::Frame(ResponseFrame {
                payload: Payload::new(bytes),
            }),
        }
    }

    fn mark_end(&mut self) {
        self.header.flags = self.header.flags.insert(ResponseFlag::EndOfResponse);
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("underlying output channel has been closed")]
pub(crate) struct OutputClosedError;

impl<T> From<mpsc::error::SendError<T>> for OutputClosedError {
    fn from(_: mpsc::error::SendError<T>) -> Self {
        Self
    }
}

pub(crate) struct PacketWriter<'a, T>
where
    T: NetworkPacket,
{
    context: T::Context,
    options: WriterOptions,

    index: usize,
    buffer: SegmentedBuf<Bytes>,

    tx: &'a mpsc::Sender<T>,
}

impl<'a, T> PacketWriter<'a, T>
where
    T: NetworkPacket + Send,
    T::Context: Send,
{
    pub(crate) fn new(
        options: WriterOptions,
        context: T::Context,
        tx: &'a mpsc::Sender<T>,
    ) -> Self {
        Self {
            context,
            options,

            index: 0,
            buffer: SegmentedBuf::new(),

            tx,
        }
    }

    pub(crate) fn push(&mut self, bytes: Bytes) {
        // don't even bother pushing empty bytes
        if !bytes.has_remaining() {
            return;
        }

        self.buffer.push(bytes);
    }

    fn make(&self, bytes: Bytes) -> T {
        if self.index == 0 {
            T::new_begin(&self.context, bytes)
        } else {
            T::new_frame(&self.context, bytes)
        }
    }

    async fn send(&mut self, packet: T) -> Result<(), mpsc::error::SendError<T>> {
        self.tx.send(packet).await?;
        self.index += 1;

        Ok(())
    }

    /// Write the remaining bytes in the buffer.
    ///
    /// The caller must ensure that the payload size is less than or equal to `Payload::MAX_SIZE`.
    async fn write_remaining(
        &mut self,
        end_of_stream: bool,
    ) -> Result<(), mpsc::error::SendError<T>> {
        if self.buffer.remaining() == 0 && !end_of_stream {
            return Ok(());
        }

        assert!(self.buffer.remaining() <= Payload::MAX_SIZE);

        let bytes = self.buffer.copy_to_bytes(self.buffer.remaining());

        let mut value = self.make(bytes);

        if end_of_stream {
            value.mark_end();
        }

        self.send(value).await?;

        Ok(())
    }

    // TODO: consider if we want to check if the channel has been closed, even if we don't send
    pub(crate) async fn write(&mut self) -> Result<(), OutputClosedError> {
        // even if we don't have any bytes to send, we need to check if the output is closed
        if !self.options.no_delay
            && self.buffer.has_remaining()
            && self.buffer.remaining() <= Payload::MAX_SIZE
            && self.tx.is_closed()
        {
            return Err(OutputClosedError);
        }

        while self.buffer.remaining() > Payload::MAX_SIZE {
            let bytes = self.buffer.copy_to_bytes(Payload::MAX_SIZE);

            let response = self.make(bytes);

            self.send(response).await?;
        }

        if self.options.no_delay {
            self.write_remaining(false).await?;
        }

        Ok(())
    }

    pub(crate) async fn flush(&mut self) -> Result<(), OutputClosedError> {
        self.write().await?;

        self.write_remaining(true).await?;

        Ok(())
    }
}

pub(crate) type ResponseWriter<'a> = PacketWriter<'a, Response>;

impl<'a> ResponseWriter<'a> {
    pub(crate) const fn is_error(&self) -> bool {
        matches!(self.context.kind, ResponseKind::Err(_))
    }
}

pub(crate) type RequestWriter<'a> = PacketWriter<'a, Request>;

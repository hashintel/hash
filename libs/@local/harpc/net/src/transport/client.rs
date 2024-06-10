use std::io;

use bytes::BytesMut;
use codec::harpc::wire::{RequestCodec, ResponseCodec};
use error_stack::{Report, Result};
use harpc_wire_protocol::{request::Request, response::Response};
use tokio_util::codec::{Decoder, Encoder};

#[derive(Debug)]
pub struct ClientCodec {
    request: RequestCodec,
    response: ResponseCodec,
}

impl ClientCodec {
    pub(super) const fn new() -> Self {
        Self {
            request: RequestCodec::new(),
            response: ResponseCodec::new(),
        }
    }
}

impl Encoder<Request> for ClientCodec {
    type Error = Report<io::Error>;

    fn encode(&mut self, item: Request, dst: &mut BytesMut) -> Result<(), io::Error> {
        self.request.encode(item, dst)
    }
}

impl Decoder for ClientCodec {
    type Error = Report<io::Error>;
    type Item = Response;

    fn decode(&mut self, src: &mut BytesMut) -> Result<Option<Response>, io::Error> {
        self.response.decode(src)
    }
}

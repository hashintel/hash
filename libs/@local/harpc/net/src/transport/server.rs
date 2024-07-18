use std::io;

use bytes::BytesMut;
use codec::harpc::wire::{RequestCodec, ResponseCodec};
use error_stack::{Report, Result};
use harpc_wire_protocol::{request::Request, response::Response};
use tokio_util::codec::{Decoder, Encoder};

#[derive(Debug)]
pub struct ServerCodec {
    request: RequestCodec,
    response: ResponseCodec,
}

impl ServerCodec {
    pub(super) const fn new() -> Self {
        Self {
            request: RequestCodec::new(),
            response: ResponseCodec::new(),
        }
    }
}

impl Encoder<Response> for ServerCodec {
    type Error = Report<io::Error>;

    fn encode(&mut self, item: Response, dst: &mut BytesMut) -> Result<(), io::Error> {
        self.response.encode(item, dst)
    }
}

impl Decoder for ServerCodec {
    type Error = Report<io::Error>;
    type Item = Request;

    fn decode(&mut self, src: &mut BytesMut) -> Result<Option<Request>, io::Error> {
        self.request.decode(src)
    }
}

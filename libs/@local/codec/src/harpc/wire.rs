use core::marker::PhantomData;
use std::io;

use error_stack::{Report, ResultExt};
use harpc_wire_protocol::{
    codec::{Buffer, Decode, Encode},
    request::Request,
    response::Response,
};
use tokio_util::{
    bytes::BytesMut,
    codec::{Decoder, Encoder},
};

pub struct ProtocolEncoder<T>(PhantomData<fn() -> *const T>);

impl<T> Encoder<T> for ProtocolEncoder<T>
where
    T: Encode,
{
    // we need to use io::Error here, because `Encoder` requires `From<io::Error> for Error`
    type Error = Report<io::Error>;

    fn encode(&mut self, item: T, dst: &mut BytesMut) -> Result<(), Self::Error> {
        let mut buffer = Buffer::new(dst);

        item.encode(&mut buffer)
            .change_context(io::Error::from(io::ErrorKind::InvalidData))
    }
}

pub struct ProtocolDecoder<T>(PhantomData<fn() -> *const T>);

impl<T> Decoder for ProtocolDecoder<T>
where
    T: Decode<Context = ()>,
{
    type Error = Report<io::Error>;
    type Item = T;

    #[expect(clippy::big_endian_bytes, reason = "This is a protocol requirement")]
    #[expect(clippy::missing_asserts_for_indexing, reason = "false positive")]
    fn decode(&mut self, src: &mut BytesMut) -> Result<Option<Self::Item>, Self::Error> {
        if src.len() < 32 {
            // Not enough data to decode a request
            return Ok(None);
        }

        // The length marker is always at bytes 30 and 31
        let length = u16::from_be_bytes([src[30], src[31]]) as usize;
        let packet_length = length + 32;

        if src.len() < packet_length {
            // Reserve space for the rest of the packet
            // Not necessarily needed, but good idea performance-wise
            src.reserve(packet_length - src.len());

            // Not enough data to decode a request
            return Ok(None);
        }

        // split of the packet into a separate buffer
        let mut bytes = src.split_to(packet_length);
        let mut buffer = Buffer::new(&mut bytes);

        T::decode(&mut buffer, ())
            .change_context(io::Error::from(io::ErrorKind::InvalidData))
            .map(Some)
    }
}

pub type RequestEncoder = ProtocolEncoder<Request>;
pub type RequestDecoder = ProtocolDecoder<Request>;

pub type ResponseEncoder = ProtocolEncoder<Response>;
pub type ResponseDecoder = ProtocolDecoder<Response>;

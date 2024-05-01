use bytes::{Buf, BufMut};
use error_stack::{Result, ResultExt};

use super::{body::RequestBody, flags::RequestFlags, id::RequestId};
use crate::{
    codec::{Buffer, BufferError, Decode, Encode},
    protocol::Protocol,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum RequestHeaderDecodeError {
    #[error("invalid protocol")]
    Protocol,
    #[error("buffer error")]
    Buffer,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct RequestHeader {
    pub protocol: Protocol,
    pub request_id: RequestId,

    pub flags: RequestFlags,
}

impl RequestHeader {
    pub(super) fn apply_body(self, body: &RequestBody) -> Self {
        Self {
            flags: self.flags.apply_body(body),
            ..self
        }
    }
}

impl Encode for RequestHeader {
    type Error = BufferError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        self.protocol.encode(buffer)?;
        self.request_id.encode(buffer)?;
        self.flags.encode(buffer)?;

        Ok(())
    }
}

impl Decode for RequestHeader {
    type Context = ();
    type Error = RequestHeaderDecodeError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        let protocol =
            Protocol::decode(buffer, ()).change_context(RequestHeaderDecodeError::Protocol)?;

        let request_id =
            RequestId::decode(buffer, ()).change_context(RequestHeaderDecodeError::Buffer)?;

        let flags =
            RequestFlags::decode(buffer, ()).change_context(RequestHeaderDecodeError::Buffer)?;

        Ok(Self {
            protocol,
            request_id,
            flags,
        })
    }
}

#[cfg(test)]
mod test {
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use expect_test::expect;

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        protocol::{Protocol, ProtocolVersion},
        request::{
            flags::{RequestFlag, RequestFlags},
            header::RequestHeader,
            id::{test::mock_request_id, RequestIdProducer},
        },
    };

    #[test]
    fn encode() {
        let mut producer = RequestIdProducer::new();

        let header = RequestHeader {
            protocol: Protocol {
                version: ProtocolVersion::V1,
            },
            request_id: producer.produce(),
            flags: RequestFlags::from(RequestFlag::BeginOfRequest),
        };

        assert_encode(
            &header,
            expect![[r#"
                b'h' b'a' b'r' b'p' b'c' 0x01 0x00 0x00 0x00 0x00 0x80
            "#]],
        );
    }

    #[test]
    fn decode() {
        assert_decode::<RequestHeader>(
            &[
                b'h', b'a', b'r', b'p', b'c', 0x01, 0x00, 0x00, 0x00, 0x00, 0x80,
            ] as &[_],
            &RequestHeader {
                protocol: Protocol {
                    version: ProtocolVersion::V1,
                },
                request_id: mock_request_id(0x00),
                flags: RequestFlags::from(RequestFlag::BeginOfRequest),
            },
            (),
        );
    }

    #[test_strategy::proptest]
    fn encode_decode(header: RequestHeader) {
        assert_codec(&header, ());
    }
}

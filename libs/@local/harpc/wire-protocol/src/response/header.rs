use std::io;

use error_stack::{Result, ResultExt};
use tokio::{
    io::{AsyncRead, AsyncWrite},
    pin,
};

use super::{flags::ResponseFlags, ResponseBody};
use crate::{
    codec::{Decode, Encode},
    protocol::Protocol,
    request::{codec::DecodeError, id::RequestId},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ResponseHeader {
    pub protocol: Protocol,
    pub request_id: RequestId,

    pub flags: ResponseFlags,
}

impl ResponseHeader {
    pub(super) fn apply_body(self, body: &ResponseBody) -> Self {
        Self {
            flags: self.flags.apply_body(body),
            ..self
        }
    }
}

impl Encode for ResponseHeader {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

        self.protocol.encode(&mut write).await?;
        self.request_id.encode(&mut write).await?;
        self.flags.encode(write).await
    }
}

impl Decode for ResponseHeader {
    type Context = ();
    type Error = DecodeError;

    async fn decode(mut read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        pin!(read);

        let protocol = Protocol::decode(&mut read, ())
            .await
            .change_context(DecodeError)?;
        let request_id = RequestId::decode(&mut read, ())
            .await
            .change_context(DecodeError)?;
        let flags = ResponseFlags::decode(read, ())
            .await
            .change_context(DecodeError)?;

        Ok(Self {
            protocol,
            request_id,
            flags,
        })
    }
}

#[cfg(test)]
mod test {
    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        flags::BitFlagsOp,
        protocol::{Protocol, ProtocolVersion},
        request::id::test::mock_request_id,
        response::{
            flags::{ResponseFlag, ResponseFlags},
            header::ResponseHeader,
        },
    };

    #[tokio::test]
    async fn encode() {
        let header = ResponseHeader {
            protocol: Protocol {
                version: ProtocolVersion::V1,
            },
            request_id: mock_request_id(0x1234),
            flags: ResponseFlags::EMPTY,
        };

        assert_encode(
            &header,
            &[
                b'h', b'a', b'r', b'p', b'c', 0x01, // protocol
                0x12, 0x34, // request_id
                0x00, // flags
            ],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        #[rustfmt::skip]
        let buffer = &[
            b'h', b'a', b'r', b'p', b'c', 0x01, // protocol
            0x23, 0x45, // request_id
            0b1000_0000, // flags
        ];

        assert_decode(
            buffer,
            &ResponseHeader {
                protocol: Protocol {
                    version: ProtocolVersion::V1,
                },
                request_id: mock_request_id(0x2345),
                flags: ResponseFlags::from(ResponseFlag::BeginOfResponse),
            },
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(header: ResponseHeader) {
        assert_encode_decode(&header, ()).await;
    }
}

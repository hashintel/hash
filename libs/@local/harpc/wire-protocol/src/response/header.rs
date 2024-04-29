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

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

        self.protocol.encode(&mut write).await?;
        self.request_id.encode(&mut write).await?;
        self.flags.encode(write).await
    }
}

impl Decode for ResponseHeader {
    type Context = ();
    type Error = DecodeError;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
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
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use expect_test::expect;

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
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
            request_id: mock_request_id(0x02_03_04_05),
            flags: ResponseFlags::EMPTY,
        };

        assert_encode(
            &header,
            expect![[r#"
                b'h' b'a' b'r' b'p' b'c' 0x01 0x02 0x03 0x04 0x05 0x00
            "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        #[rustfmt::skip]
        let buffer = &[
            b'h', b'a', b'r', b'p', b'c', 0x01, // protocol
            0x12, 0x34, 0x56, 0x78, // request_id
            0x80, // flags
        ];

        assert_decode::<ResponseHeader>(
            buffer,
            &ResponseHeader {
                protocol: Protocol {
                    version: ProtocolVersion::V1,
                },
                request_id: mock_request_id(0x12_34_56_78),
                flags: ResponseFlags::from(ResponseFlag::BeginOfResponse),
            },
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(header: ResponseHeader) {
        assert_codec(&header, ()).await;
    }
}

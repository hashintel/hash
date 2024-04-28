use std::io;

use error_stack::{Result, ResultExt};
use tokio::{
    io::{AsyncRead, AsyncWrite},
    pin,
};

use super::{body::RequestBody, codec::DecodeError, flags::RequestFlags, id::RequestId};
use crate::{
    codec::{Decode, Encode},
    protocol::Protocol,
};

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
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

        self.protocol.encode(&mut write).await?;
        self.request_id.encode(&mut write).await?;
        self.flags.encode(write).await
    }
}

impl Decode for RequestHeader {
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
        let flags = RequestFlags::decode(read, ())
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

    #[tokio::test]
    async fn encode() {
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
            expect!["0x68 0x61 0x72 0x70 0x63 0x01 0x00 0x00 0x00 0x00 0x80"],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        assert_decode::<RequestHeader>(
            &[
                b'h', b'a', b'r', b'p', b'c', 0x01, 0x00, 0x00, 0x00, 0x00, 0x80,
            ],
            &RequestHeader {
                protocol: Protocol {
                    version: ProtocolVersion::V1,
                },
                request_id: mock_request_id(0x00),
                flags: RequestFlags::from(RequestFlag::BeginOfRequest),
            },
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn encode_decode(header: RequestHeader) {
        assert_codec(&header, ()).await;
    }
}

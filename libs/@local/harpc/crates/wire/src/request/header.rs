use std::io;

use error_stack::Result;
use tokio::io::{AsyncRead, AsyncWrite};

use super::{flags::RequestFlags, id::RequestId};
use crate::{
    codec::{DecodePure, Encode},
    protocol::Protocol,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct RequestHeader {
    pub protocol: Protocol,
    pub request_id: RequestId,

    pub flags: RequestFlags,
}

impl Encode for RequestHeader {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.protocol.encode(&mut write).await?;
        self.request_id.encode(&mut write).await?;
        self.flags.encode(write).await
    }
}

impl DecodePure for RequestHeader {
    type Error = io::Error;

    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let protocol = Protocol::decode_pure(&mut read).await?;
        let request_id = RequestId::decode_pure(&mut read).await?;
        let flags = RequestFlags::decode_pure(read).await?;

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
        protocol::{Protocol, ProtocolVersion},
        request::{
            flags::{RequestFlag, RequestFlags},
            header::RequestHeader,
            id::RequestIdProducer,
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

            flags: RequestFlags::new(
                RequestFlag::ContainsAuthorization | RequestFlag::BeginOfRequest,
            ),
        };

        assert_encode(
            &header,
            &[
                0x01, // protocol version,
                0x00,
                0x00,        // request id
                0b1100_0000, // flags
            ],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        let mut producer = RequestIdProducer::new();

        let header = RequestHeader {
            protocol: Protocol {
                version: ProtocolVersion::V1,
            },
            request_id: producer.produce(),

            flags: RequestFlags::new(
                RequestFlag::ContainsAuthorization | RequestFlag::BeginOfRequest,
            ),
        };

        assert_decode(&[0x01, 0x00, 0x00, 0b1100_0000], &header, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn encode_decode(header: RequestHeader) {
        assert_encode_decode(&header, ()).await;
    }
}

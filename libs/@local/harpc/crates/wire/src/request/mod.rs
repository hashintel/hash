pub use bytes::Bytes;
use error_stack::{Result, ResultExt};
use tokio::io::{AsyncRead, AsyncWrite};

use self::{
    body::{RequestBody, RequestBodyContext},
    codec::{DecodeError, EncodeError},
    header::RequestHeader,
};
use crate::codec::{Decode, DecodePure, Encode};

pub mod authorization;
pub mod begin;
pub mod body;
pub mod codec;
pub mod flags;
pub mod frame;
pub mod header;
pub mod id;
pub mod payload;
pub mod procedure;
pub mod service;

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct Request {
    pub header: RequestHeader,
    pub body: RequestBody,
}

impl Encode for Request {
    type Error = EncodeError;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.header
            .apply_body(&self.body)
            .encode(&mut write)
            .await
            .change_context(EncodeError)?;

        self.body.encode(write).await
    }
}

impl DecodePure for Request {
    type Error = DecodeError;

    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let header = RequestHeader::decode_pure(&mut read)
            .await
            .change_context(DecodeError)?;
        let body = RequestBody::decode(read, RequestBodyContext::from_flags(header.flags))
            .await
            .change_context(DecodeError)?;

        Ok(Self { header, body })
    }
}

#[cfg(test)]
mod test {
    use harpc_types::{
        procedure::ProcedureId,
        service::{ServiceId, ServiceVersion},
    };

    use super::id::test::mock_request_id;
    use crate::{
        codec::test::assert_encode,
        protocol::{Protocol, ProtocolVersion},
        request::{
            begin::RequestBegin, body::RequestBody, flags::RequestFlags, frame::RequestFrame,
            header::RequestHeader, payload::RequestPayload, procedure::ProcedureDescriptor,
            service::ServiceDescriptor, Request,
        },
    };

    const EXAMPLE_HEADER: RequestHeader = RequestHeader {
        protocol: Protocol {
            version: ProtocolVersion::V1,
        },
        request_id: mock_request_id(0xCD_EF),
        flags: RequestFlags::empty(),
    };

    #[tokio::test]
    async fn encode_begin() {
        #[rustfmt::skip]
        let expected: &[_] = &[
            b'h', b'a', b'r', b'p', b'c', 0x01, // protocol
            0xCD, 0xEF,                         // request_id
            0b1000_0000,                        // flags
            0x12, 0x34,                         // service_id
            0x56, 0x78,                         // service_version
            0x9A, 0xBC,                         // procedure_id
            0x00, 0x0B,                         // payload_length
            b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
        ];

        assert_encode(
            &Request {
                header: EXAMPLE_HEADER,
                body: RequestBody::Begin(RequestBegin {
                    service: ServiceDescriptor {
                        id: ServiceId::new(0x1234),
                        version: ServiceVersion::new(0x56, 0x78),
                    },
                    procedure: ProcedureDescriptor {
                        id: ProcedureId::new(0x9ABC),
                    },
                    authorization: None,
                    payload: RequestPayload::from_static(b"hello world"),
                }),
            },
            expected,
        )
        .await;
    }

    #[tokio::test]
    async fn encode_frame() {
        #[rustfmt::skip]
        let expected = &[
            b'h', b'a', b'r', b'p', b'c', 0x01, // protocol
            0xCD, 0xEF,                         // request_id
            0b0000_0000,                        // flags
            0x00, 0x0B,                         // payload_length
            b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
        ];

        assert_encode(
            &Request {
                header: EXAMPLE_HEADER,
                body: RequestBody::Frame(RequestFrame {
                    payload: RequestPayload::from_static(b"hello world"),
                }),
            },
            expected,
        )
        .await;
    }
}

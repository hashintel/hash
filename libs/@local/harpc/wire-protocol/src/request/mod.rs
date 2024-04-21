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
pub mod encoding;
pub mod flags;
pub mod frame;
pub mod header;
pub mod id;
pub mod procedure;
pub mod service;

/// A request message.
///
/// A request message is composed of a header and a body and is used to send the actual message over
/// the wire, agnostic over the transport layer.
///
/// This is a binary protocol with minimal overhead with framing support. Messages can be up to
/// 64KiB in size, larger messages are split into multiple frames.
///
/// The transport layer is responsible for ensuring that the message is sent and received in order.
///
///
/// # `Begin` Packet
///
/// The layout of a `Begin` packet is as follows:
///
/// ```text
/// 0                   1                   2                   3
/// 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |  Magic  |P|R. |F|S. |S. |P. |E. |A. |      Authorization      |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |     |P. |                       Payload                       |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Magic (5 bytes)
/// * Protocol Version (1 byte)
/// * Request Id (2 bytes)
/// * Flags (1 byte)
/// * Service Id (2 bytes)
/// * Service Version (2 bytes)
/// * Procedure Id (2 bytes)
/// * Encoding (2 bytes)
/// * Accept (2 bytes)
/// * Authorization (16 bytes)
/// * Payload Length (2 bytes)
/// * Payload (27 bytes)
/// total 64 bytes
/// ```
///
/// The payload is of variable size and specified by the `Payload Length` field. `Authorization` is
/// optional and only present if the `ContainsAuthorization` bit in `Flags` is set.
/// Packets need to set the `BeginOfRequest` bit in the `Flags` field.
///
/// # `Frame` Packet
///
/// The layout of a `Frame` packet is as follows:
///
/// ```text
///  0                   1                   2                   3
/// 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |  Magic  |P|R. |F|P. |                                         |
/// +-+-+-+-+-+-+-+-+-+-+-+                                         +
/// |                            Payload                            |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Magic (5 bytes)
/// * Protocol Version (1 byte)
/// * Request Id (2 bytes)
/// * Flags (1 byte)
/// * Payload Length (2 bytes)
/// * Payload (53 bytes)
/// total 64 bytes
/// ```
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
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        encoding::{AcceptEncoding, Encoding},
        flags::BitFlagsOp,
        payload::Payload,
        protocol::{Protocol, ProtocolVersion},
        request::{
            begin::RequestBegin,
            body::RequestBody,
            encoding::EncodingHeader,
            flags::{RequestFlag, RequestFlags},
            frame::RequestFrame,
            header::RequestHeader,
            procedure::ProcedureDescriptor,
            service::ServiceDescriptor,
            Request,
        },
    };

    const EXAMPLE_HEADER: RequestHeader = RequestHeader {
        protocol: Protocol {
            version: ProtocolVersion::V1,
        },
        request_id: mock_request_id(0xCD_EF),
        flags: RequestFlags::EMPTY,
    };

    #[rustfmt::skip]
    const EXAMPLE_BEGIN_BUFFER: &[u8] = &[
        b'h', b'a', b'r', b'p', b'c', 0x01, // protocol
        0xCD, 0xEF,                         // request_id
        0b1000_0000,                        // flags
        0x12, 0x34,                         // service_id
        0x56, 0x78,                         // service_version
        0x9A, 0xBC,                         // procedure_id
        0x00, 0x01, 0x00, 0x01,             // encoding
        0x00, 0x0B,                         // payload_length
        b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
    ];

    #[rustfmt::skip]
    const EXAMPLE_FRAME_BUFFER: &[u8] = &[
        b'h', b'a', b'r', b'p', b'c', 0x01, // protocol
        0xCD, 0xEF,                         // request_id
        0b0000_0000,                        // flags
        0x00, 0x0B,                         // payload_length
        b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
    ];

    #[tokio::test]
    async fn encode_begin() {
        assert_encode(
            &Request {
                header: RequestHeader {
                    flags: RequestFlags::from(RequestFlag::BeginOfRequest),
                    ..EXAMPLE_HEADER
                },
                body: RequestBody::Begin(RequestBegin {
                    service: ServiceDescriptor {
                        id: ServiceId::new(0x1234),
                        version: ServiceVersion::new(0x56, 0x78),
                    },

                    procedure: ProcedureDescriptor {
                        id: ProcedureId::new(0x9ABC),
                    },
                    encoding: EncodingHeader {
                        encoding: Encoding::Raw,
                        accept: AcceptEncoding::new(Encoding::Raw),
                    },
                    authorization: None,
                    payload: Payload::from_static(b"hello world"),
                }),
            },
            EXAMPLE_BEGIN_BUFFER,
        )
        .await;
    }

    #[tokio::test]
    async fn encode_begin_begin_of_request_unset() {
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
                    encoding: EncodingHeader {
                        encoding: Encoding::Raw,
                        accept: AcceptEncoding::new(Encoding::Raw),
                    },
                    authorization: None,
                    payload: Payload::from_static(b"hello world"),
                }),
            },
            EXAMPLE_BEGIN_BUFFER,
        )
        .await;
    }

    #[tokio::test]
    async fn encode_frame() {
        assert_encode(
            &Request {
                header: EXAMPLE_HEADER,
                body: RequestBody::Frame(RequestFrame {
                    payload: Payload::from_static(b"hello world"),
                }),
            },
            EXAMPLE_FRAME_BUFFER,
        )
        .await;
    }

    #[tokio::test]
    async fn encode_frame_begin_of_request_set() {
        assert_encode(
            &Request {
                header: RequestHeader {
                    flags: RequestFlags::from(RequestFlag::BeginOfRequest),
                    ..EXAMPLE_HEADER
                },
                body: RequestBody::Frame(RequestFrame {
                    payload: Payload::from_static(b"hello world"),
                }),
            },
            EXAMPLE_FRAME_BUFFER,
        )
        .await;
    }

    // we don't need to test for malformed decoding, because we already do in `RequestBody`

    #[tokio::test]
    async fn decode_begin() {
        assert_decode(
            EXAMPLE_BEGIN_BUFFER,
            &Request {
                header: RequestHeader {
                    flags: RequestFlags::from(RequestFlag::BeginOfRequest),
                    ..EXAMPLE_HEADER
                },
                body: RequestBody::Begin(RequestBegin {
                    service: ServiceDescriptor {
                        id: ServiceId::new(0x1234),
                        version: ServiceVersion::new(0x56, 0x78),
                    },
                    procedure: ProcedureDescriptor {
                        id: ProcedureId::new(0x9ABC),
                    },
                    encoding: EncodingHeader {
                        encoding: Encoding::Raw,
                        accept: AcceptEncoding::new(Encoding::Raw),
                    },
                    authorization: None,
                    payload: Payload::from_static(b"hello world"),
                }),
            },
            (),
        )
        .await;
    }

    #[tokio::test]
    async fn decode_frame() {
        assert_decode(
            EXAMPLE_FRAME_BUFFER,
            &Request {
                header: EXAMPLE_HEADER,
                body: RequestBody::Frame(RequestFrame {
                    payload: Payload::from_static(b"hello world"),
                }),
            },
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(request: Request) {
        // encoding partially overrides flags if they are not set correctly, to ensure that
        // encode/decode is actually lossless we need to apply the body to the header
        // before encoding, this ensures that the flags are the same as the decoded request
        let request = Request {
            header: request.header.apply_body(&request.body),
            ..request
        };

        assert_encode_decode(&request, ()).await;
    }
}

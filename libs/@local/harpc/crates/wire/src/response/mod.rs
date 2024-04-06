use error_stack::{Result, ResultExt};
use tokio::io::{AsyncRead, AsyncWrite};

use self::{
    body::{ResponseBody, ResponseBodyContext},
    header::ResponseHeader,
};
use crate::{
    codec::{Decode, DecodePure, Encode},
    request::codec::{DecodeError, EncodeError},
};

pub mod begin;
pub mod body;
pub mod flags;
pub mod frame;
pub mod header;
pub mod kind;

/// A response to a request.
///
/// A response message is composed of a header and a body and is used to send the actual message
/// from the server back to the client over the wire, agnostic over the transport layer.
///
/// This is a binary protocol with minimal overhead with framing support. Messages can be up to
/// 64KiB in size, larger messages are split into multiple frames.
///
/// The transport layer is responsible for ensuring that the message is sent and received in order.
///
/// # `Begin` Packet
///
/// The layout of the `Begin` packet is as follows:
///
/// ```text
/// 0                   1                   2                   3
/// 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |  Magic  |P|R. |F|R|E. |P. |                                   |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+                                   +
/// |                            Payload                            |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Magic (5 bytes)
/// * Protocol Version (1 byte)
/// * Request Id (2 bytes)
/// * Flags (1 byte)
/// * Response Kind (1 byte)
/// * Encoding (2 bytes)
/// * Payload Length (2 bytes)
/// * Payload (50 bytes)
/// total 64 bytes
/// ```
///
/// # `Frame` Packet
///
/// The layout of the `Frame` packet is as follows:
///
/// ```text
/// 0                   1                   2                   3
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
pub struct Response {
    pub header: ResponseHeader,
    pub body: ResponseBody,
}

impl Encode for Response {
    type Error = EncodeError;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        let header = self.header.apply_body(&self.body);
        header
            .encode(&mut write)
            .await
            .change_context(EncodeError)?;

        self.body.encode(write).await
    }
}

impl DecodePure for Response {
    type Error = DecodeError;

    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let header = ResponseHeader::decode_pure(&mut read)
            .await
            .change_context(DecodeError)?;

        let context = ResponseBodyContext::from_flags(header.flags);

        let body = ResponseBody::decode(read, context)
            .await
            .change_context(DecodeError)?;

        Ok(Self { header, body })
    }
}

#[cfg(test)]
mod test {
    use super::{flags::ResponseFlags, header::ResponseHeader};
    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        encoding::Encoding,
        flags::BitFlagsOp,
        payload::Payload,
        protocol::{Protocol, ProtocolVersion},
        request::id::test::mock_request_id,
        response::{
            begin::ResponseBegin, body::ResponseBody, flags::ResponseFlag, frame::ResponseFrame,
            kind::ResponseKind, Response,
        },
    };

    const EXAMPLE_HEADER: ResponseHeader = ResponseHeader {
        protocol: Protocol {
            version: ProtocolVersion::V1,
        },
        request_id: mock_request_id(0xCD_EF),
        flags: ResponseFlags::EMPTY,
    };

    #[rustfmt::skip]
    const EXAMPLE_BEGIN_BUFFER: &[u8] = &[
        b'h', b'a', b'r', b'p', b'c', 0x01, // protocol
        0xCD, 0xEF,                         // request_id
        0b1000_0000,                        // flags
        0x00,                               // request kind
        0x00, 0x01,                         // encoding
        0x00, 0x0B,                         // payload length
        b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
    ];

    #[rustfmt::skip]
    const EXAMPLE_FRAME_BUFFER: &[u8] = &[
        b'h', b'a', b'r', b'p', b'c', 0x01, // protocol
        0xCD, 0xEF,                         // request_id
        0b0000_0000,                        // flags
        0x00, 0x0B,                         // payload length
        b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
    ];

    #[tokio::test]
    async fn encode_begin() {
        assert_encode(
            &Response {
                header: ResponseHeader {
                    flags: ResponseFlags::from(ResponseFlag::BeginOfResponse),
                    ..EXAMPLE_HEADER
                },
                body: ResponseBody::Begin(ResponseBegin {
                    kind: ResponseKind::Ok,
                    encoding: Encoding::Raw,
                    payload: Payload::from_static(b"hello world"),
                }),
            },
            EXAMPLE_BEGIN_BUFFER,
        )
        .await;
    }

    #[tokio::test]
    async fn encode_begin_begin_of_response_unset() {
        assert_encode(
            &Response {
                header: EXAMPLE_HEADER,
                body: ResponseBody::Begin(ResponseBegin {
                    kind: ResponseKind::Ok,
                    encoding: Encoding::Raw,
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
            &Response {
                header: EXAMPLE_HEADER,
                body: ResponseBody::Frame(ResponseFrame {
                    payload: Payload::from_static(b"hello world"),
                }),
            },
            EXAMPLE_FRAME_BUFFER,
        )
        .await;
    }

    #[tokio::test]
    async fn encode_frame_begin_of_response_set() {
        assert_encode(
            &Response {
                header: ResponseHeader {
                    flags: ResponseFlags::from(ResponseFlag::BeginOfResponse),
                    ..EXAMPLE_HEADER
                },
                body: ResponseBody::Frame(ResponseFrame {
                    payload: Payload::from_static(b"hello world"),
                }),
            },
            EXAMPLE_FRAME_BUFFER,
        )
        .await;
    }

    #[tokio::test]
    async fn decode_begin() {
        assert_decode(
            EXAMPLE_BEGIN_BUFFER,
            &Response {
                header: ResponseHeader {
                    flags: ResponseFlags::from(ResponseFlag::BeginOfResponse),
                    ..EXAMPLE_HEADER
                },
                body: ResponseBody::Begin(ResponseBegin {
                    kind: ResponseKind::Ok,
                    encoding: Encoding::Raw,
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
            &Response {
                header: EXAMPLE_HEADER,
                body: ResponseBody::Frame(ResponseFrame {
                    payload: Payload::from_static(b"hello world"),
                }),
            },
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(response: Response) {
        // encoding partially overrides flags if they are not set correctly, to ensure that
        // encode/decode is actually lossless we need to apply the body to the header
        // before encoding, this ensures that the flags are the same as the decoded request
        let response = Response {
            header: response.header.apply_body(&response.body),
            ..response
        };

        assert_encode_decode(&response, ()).await;
    }
}

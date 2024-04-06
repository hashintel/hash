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

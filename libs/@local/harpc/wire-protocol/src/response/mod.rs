use error_stack::{Result, ResultExt};
use tokio::{
    io::{AsyncRead, AsyncWrite},
    pin,
};

use self::{
    body::{ResponseBody, ResponseBodyContext},
    header::ResponseHeader,
};
use crate::{
    codec::{Decode, Encode},
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
/// 64 KiB in size, larger messages are split into multiple frames.
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
/// |  Magic  |P|Reque. |F|            Reserved             |R. |P. |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |                              ...                              |
/// +                            Payload                            +
/// |                              ...                              |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Magic (5 bytes)
/// * Protocol Version (1 byte)
/// * Request Id (4 bytes)
/// * Flags (1 byte)
/// * Reserved (17 bytes)
/// * Response Kind (2 bytes)
/// * Payload Length (2 bytes)
/// * Payload (up to 65504 bytes)
/// total 32 bytes to 64 KiB
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
/// |  Magic  |P|Reque. |F|              Reserved               |P. |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |                              ...                              |
/// +                            Payload                            +
/// |                              ...                              |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
///
/// * Magic (5 bytes)
/// * Protocol Version (1 byte)
/// * Request Id (4 bytes)
/// * Flags (1 byte)
/// * Reserved (19 bytes)
/// * Payload Length (2 bytes)
/// * Payload (up to 65504 bytes)
/// total 32 bytes to 64 KiB
/// ```
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct Response {
    pub header: ResponseHeader,
    pub body: ResponseBody,
}

impl Encode for Response {
    type Error = EncodeError;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

        let header = self.header.apply_body(&self.body);
        header
            .encode(&mut write)
            .await
            .change_context(EncodeError)?;

        self.body.encode(write).await
    }
}

impl Decode for Response {
    type Context = ();
    type Error = DecodeError;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        pin!(read);

        let header = ResponseHeader::decode(&mut read, ())
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
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use expect_test::expect;

    use super::{flags::ResponseFlags, header::ResponseHeader};
    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode, encode_value},
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
        request_id: mock_request_id(0xEF_CD_CD_EF),
        flags: ResponseFlags::EMPTY,
    };

    #[rustfmt::skip]
    const EXAMPLE_BEGIN_BUFFER: &[u8] = &[
        b'h', b'a', b'r', b'p', b'c', 0x01, // protocol
        0xEF, 0xCD, 0xCD, 0xEF,             // request_id
        0x80,                               // flags
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00,                               // reserved
        0x00, 0x00,                         // request kind
        0x00, 0x0B,                         // payload length
        b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
    ];

    #[rustfmt::skip]
    const EXAMPLE_FRAME_BUFFER: &[u8] = &[
        b'h', b'a', b'r', b'p', b'c', 0x01, // protocol
        0xEF, 0xCD, 0xCD, 0xEF,             // request_id
        0x00,                               // flags
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00,                   // reserved
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

                    payload: Payload::from_static(b"hello world"),
                }),
            },
            expect![[r#"
                b'h' b'a' b'r' b'p' b'c' 0x01 0xEF 0xCD 0xCD 0xEF 0x80 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x0B
                b'h' b'e' b'l' b'l' b'o' b' ' b'w' b'o' b'r' b'l' b'd'
            "#]],
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

                    payload: Payload::from_static(b"hello world"),
                }),
            },
            expect![[r#"
                b'h' b'a' b'r' b'p' b'c' 0x01 0xEF 0xCD 0xCD 0xEF 0x80 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x0B
                b'h' b'e' b'l' b'l' b'o' b' ' b'w' b'o' b'r' b'l' b'd'
            "#]],
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
            expect![[r#"
                b'h' b'a' b'r' b'p' b'c' 0x01 0xEF 0xCD 0xCD 0xEF 0x00 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x0B
                b'h' b'e' b'l' b'l' b'o' b' ' b'w' b'o' b'r' b'l' b'd'
            "#]],
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
            expect![[r#"
                b'h' b'a' b'r' b'p' b'c' 0x01 0xEF 0xCD 0xCD 0xEF 0x00 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x0B
                b'h' b'e' b'l' b'l' b'o' b' ' b'w' b'o' b'r' b'l' b'd'
            "#]],
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
    #[cfg_attr(miri, ignore)]
    async fn codec(response: Response) {
        // encoding partially overrides flags if they are not set correctly, to ensure that
        // encode/decode is actually lossless we need to apply the body to the header
        // before encoding, this ensures that the flags are the same as the decoded request
        let response = Response {
            header: response.header.apply_body(&response.body),
            ..response
        };

        assert_codec(&response, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    #[cfg_attr(miri, ignore)]
    async fn header_size(response: Response) {
        // ensure that for every response the header size is *always* 32 bytes

        let value = encode_value(&response).await;
        // remove the last n bytes (payload size)
        let header_length = value.len() - response.body.payload().as_bytes().len();

        proptest::prop_assert_eq!(header_length, 32);
    }
}

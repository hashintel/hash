pub use bytes::Bytes;
use bytes::{Buf, BufMut};
use error_stack::{Result, ResultExt};

use self::{
    body::{RequestBody, RequestBodyContext},
    header::RequestHeader,
};
use crate::codec::{Buffer, Decode, Encode};

pub mod begin;
pub mod body;
pub mod flags;
pub mod frame;
pub mod header;
pub mod id;
pub mod procedure;
pub mod service;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("unable to encode request")]
pub struct RequestEncodeError;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("unable to decode request")]
pub struct RequestDecodeError;

/// A request message.
///
/// A request message is composed of a header and a body and is used to send the actual message over
/// the wire, agnostic over the transport layer.
///
/// This is a binary protocol with minimal overhead with framing support. Messages can be up to
/// 64 KiB in size, larger messages are split into multiple frames.
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
/// |  Magic  |P|Reque. |F|S. |S. |P. |        Reserved         |P. |
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
/// * Service Id (2 bytes)
/// * Service Version (2 bytes)
/// * Procedure Id (2 bytes)
/// * Reserved (13 bytes)
/// * Payload Length (2 bytes)
/// * Payload (up to 65504 bytes)
/// total 32 bytes to 64 KiB
/// ```
///
/// The payload is of variable size and specified by the `Payload Length` field.
/// Packets need to set the `BeginOfRequest` bit in the `Flags` field.
///
/// # `Frame` Packet
///
/// The layout of a `Frame` packet is as follows:
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
pub struct Request {
    pub header: RequestHeader,
    pub body: RequestBody,
}

impl Encode for Request {
    type Error = RequestEncodeError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        self.header
            .apply_body(&self.body)
            .encode(buffer)
            .change_context(RequestEncodeError)?;

        self.body.encode(buffer).change_context(RequestEncodeError)
    }
}

impl Decode for Request {
    type Context = ();
    type Error = RequestDecodeError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        let header = RequestHeader::decode(buffer, ()).change_context(RequestDecodeError)?;

        let body = RequestBody::decode(buffer, RequestBodyContext::from_flags(header.flags))
            .change_context(RequestDecodeError)?;

        Ok(Self { header, body })
    }
}

#[cfg(test)]
mod test {
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use expect_test::expect;
    use harpc_types::{procedure::ProcedureId, service::ServiceId, version::Version};

    use super::id::test_utils::mock_request_id;
    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode, encode_value},
        flags::BitFlagsOp,
        payload::Payload,
        protocol::{Protocol, ProtocolVersion},
        request::{
            begin::RequestBegin,
            body::RequestBody,
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
        request_id: mock_request_id(0x89_AB_CD_EF),
        flags: RequestFlags::EMPTY,
    };

    #[rustfmt::skip]
    const EXAMPLE_BEGIN_BUFFER: &[u8] = &[
        b'h', b'a', b'r', b'p', b'c', 0x01, // protocol
        0x89, 0xAB, 0xCD, 0xEF,             // request_id
        0x80,                               // flags
        0x01, 0x02,                         // service_id
        0x03, 0x04,                         // service_version
        0x05, 0x06,                         // procedure_id
        // 13 bytes reserved
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00,       // reserved
        0x00, 0x0B,                         // payload_length
        b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
    ];

    #[rustfmt::skip]
    const EXAMPLE_FRAME_BUFFER: &[u8] = &[
        b'h', b'a', b'r', b'p', b'c', 0x01, // protocol
        0x89, 0xAB, 0xCD, 0xEF,             // request_id
        0x00,                               // flags
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00,                   // reserved
        0x00, 0x0B,                         // payload_length
        b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
    ];

    #[test]
    fn encode_begin() {
        assert_encode(
            &Request {
                header: RequestHeader {
                    flags: RequestFlags::from(RequestFlag::BeginOfRequest),
                    ..EXAMPLE_HEADER
                },
                body: RequestBody::Begin(RequestBegin {
                    service: ServiceDescriptor {
                        id: ServiceId::new(0x01_02),
                        version: Version {
                            major: 0x03,
                            minor: 0x04,
                        },
                    },

                    procedure: ProcedureDescriptor {
                        id: ProcedureId::new(0x05_06),
                    },

                    payload: Payload::from_static(b"hello world"),
                }),
            },
            expect![[r#"
                b'h' b'a' b'r' b'p' b'c' 0x01 0x89 0xAB 0xCD 0xEF 0x80 0x01 0x02 0x03 0x04 0x05
                0x06 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x0B
                b'h' b'e' b'l' b'l' b'o' b' ' b'w' b'o' b'r' b'l' b'd'
            "#]],
        );
    }

    #[test]
    fn encode_begin_begin_of_request_unset() {
        assert_encode(
            &Request {
                header: EXAMPLE_HEADER,
                body: RequestBody::Begin(RequestBegin {
                    service: ServiceDescriptor {
                        id: ServiceId::new(0x01_02),
                        version: Version {
                            major: 0x03,
                            minor: 0x04,
                        },
                    },
                    procedure: ProcedureDescriptor {
                        id: ProcedureId::new(0x05_06),
                    },

                    payload: Payload::from_static(b"hello world"),
                }),
            },
            expect![[r#"
                b'h' b'a' b'r' b'p' b'c' 0x01 0x89 0xAB 0xCD 0xEF 0x80 0x01 0x02 0x03 0x04 0x05
                0x06 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x0B
                b'h' b'e' b'l' b'l' b'o' b' ' b'w' b'o' b'r' b'l' b'd'
            "#]],
        );
    }

    #[test]
    fn encode_frame() {
        assert_encode(
            &Request {
                header: EXAMPLE_HEADER,
                body: RequestBody::Frame(RequestFrame {
                    payload: Payload::from_static(b"hello world"),
                }),
            },
            expect![[r#"
                b'h' b'a' b'r' b'p' b'c' 0x01 0x89 0xAB 0xCD 0xEF 0x00 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x0B
                b'h' b'e' b'l' b'l' b'o' b' ' b'w' b'o' b'r' b'l' b'd'
            "#]],
        );
    }

    #[test]
    fn encode_frame_begin_of_request_set() {
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
            expect![[r#"
                b'h' b'a' b'r' b'p' b'c' 0x01 0x89 0xAB 0xCD 0xEF 0x00 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x0B
                b'h' b'e' b'l' b'l' b'o' b' ' b'w' b'o' b'r' b'l' b'd'
            "#]],
        );
    }

    #[test]
    fn decode_begin() {
        assert_decode(
            EXAMPLE_BEGIN_BUFFER,
            &Request {
                header: RequestHeader {
                    flags: RequestFlags::from(RequestFlag::BeginOfRequest),
                    ..EXAMPLE_HEADER
                },
                body: RequestBody::Begin(RequestBegin {
                    service: ServiceDescriptor {
                        id: ServiceId::new(0x01_02),
                        version: Version {
                            major: 0x03,
                            minor: 0x04,
                        },
                    },
                    procedure: ProcedureDescriptor {
                        id: ProcedureId::new(0x05_06),
                    },

                    payload: Payload::from_static(b"hello world"),
                }),
            },
            (),
        );
    }

    #[test]
    fn decode_frame() {
        assert_decode(
            EXAMPLE_FRAME_BUFFER,
            &Request {
                header: EXAMPLE_HEADER,
                body: RequestBody::Frame(RequestFrame {
                    payload: Payload::from_static(b"hello world"),
                }),
            },
            (),
        );
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec(request: Request) {
        // encoding partially overrides flags if they are not set correctly, to ensure that
        // encode/decode is actually lossless we need to apply the body to the header
        // before encoding, this ensures that the flags are the same as the decoded request
        let request = Request {
            header: request.header.apply_body(&request.body),
            ..request
        };

        assert_codec(&request, ());
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn header_size(request: Request) {
        // ensure that for every request the header size is *always* 32 bytes

        let value = encode_value(&request);
        // remove the last n bytes (payload size)
        let header_length = value.len() - request.body.payload().as_bytes().len();

        proptest::prop_assert_eq!(header_length, 32);
    }
}

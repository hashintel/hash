use bytes::{Buf, BufMut};
use error_stack::{Result, ResultExt};

use super::{
    begin::RequestBegin,
    flags::{RequestFlag, RequestFlags},
    frame::RequestFrame,
};
use crate::{
    codec::{Buffer, BufferError, Decode, Encode},
    flags::BitFlagsOp,
    payload::Payload,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("unable to encode request body")]
pub struct RequestBodyEncodeError;

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub enum RequestBody {
    Begin(RequestBegin),
    Frame(RequestFrame),
}

impl RequestBody {
    pub const fn payload(&self) -> &Payload {
        match self {
            Self::Begin(begin) => &begin.payload,
            Self::Frame(frame) => &frame.payload,
        }
    }
}

impl Encode for RequestBody {
    type Error = RequestBodyEncodeError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        match self {
            Self::Begin(body) => body.encode(buffer).change_context(RequestBodyEncodeError),
            Self::Frame(body) => body.encode(buffer).change_context(RequestBodyEncodeError),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum RequestVariant {
    Begin,
    Frame,
}

impl From<&RequestBody> for RequestVariant {
    fn from(body: &RequestBody) -> Self {
        match body {
            RequestBody::Begin(_) => Self::Begin,
            RequestBody::Frame(_) => Self::Frame,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RequestBodyContext {
    pub variant: RequestVariant,
}

impl RequestBodyContext {
    pub(super) fn from_flags(flags: RequestFlags) -> Self {
        let variant = if flags.contains(RequestFlag::BeginOfRequest) {
            RequestVariant::Begin
        } else {
            RequestVariant::Frame
        };

        Self { variant }
    }
}

impl Decode for RequestBody {
    type Context = RequestBodyContext;
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, context: Self::Context) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        match context.variant {
            RequestVariant::Begin => RequestBegin::decode(buffer, ()).map(RequestBody::Begin),
            RequestVariant::Frame => RequestFrame::decode(buffer, ()).map(RequestBody::Frame),
        }
    }
}

#[cfg(test)]
mod test {
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use expect_test::expect;
    use harpc_types::{procedure::ProcedureId, service::ServiceId, version::Version};

    use super::{RequestBody, RequestBodyContext};
    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode, encode_value},
        payload::Payload,
        request::{
            begin::RequestBegin, body::RequestVariant, frame::RequestFrame,
            procedure::ProcedureDescriptor, service::ServiceDescriptor,
        },
    };

    static EXAMPLE_BEGIN: RequestBegin = RequestBegin {
        service: ServiceDescriptor {
            id: ServiceId::new(0x0102),
            version: Version {
                major: 0x03,
                minor: 0x04,
            },
        },
        procedure: ProcedureDescriptor {
            id: ProcedureId::new(0x0506),
        },
        payload: Payload::from_static(&[0x07, 0x08]),
    };

    static EXAMPLE_FRAME: RequestFrame = RequestFrame {
        payload: Payload::from_static(&[0x07, 0x08]),
    };

    #[test]
    fn encode_begin() {
        assert_encode(
            &RequestBody::Begin(EXAMPLE_BEGIN.clone()),
            expect![[r#"
            0x01 0x02 0x03 0x04 0x05 0x06 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
            0x00 0x00 0x00 0x00 0x02 0x07 0x08
        "#]],
        );
    }

    #[test]
    fn encode_frame() {
        assert_encode(
            &RequestBody::Frame(EXAMPLE_FRAME.clone()),
            expect![[r#"
            0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
            0x00 0x00 0x00 0x00 0x02 0x07 0x08
        "#]],
        );
    }

    #[test]
    fn decode_begin() {
        let bytes = encode_value(&EXAMPLE_BEGIN);

        let context = RequestBodyContext {
            variant: RequestVariant::Begin,
        };

        assert_decode(bytes, &RequestBody::Begin(EXAMPLE_BEGIN.clone()), context);
    }

    #[test]
    fn decode_frame() {
        let bytes = encode_value(&EXAMPLE_FRAME);

        let context = RequestBodyContext {
            variant: RequestVariant::Frame,
        };

        assert_decode(bytes, &RequestBody::Frame(EXAMPLE_FRAME.clone()), context);
    }

    #[test_strategy::proptest]
    fn codec(body: RequestBody) {
        let context = RequestBodyContext {
            variant: (&body).into(),
        };

        assert_codec(&body, context);
    }
}

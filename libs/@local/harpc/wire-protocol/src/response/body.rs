use bytes::{Buf, BufMut};
use error_stack::{Result, ResultExt};

use super::{
    begin::ResponseBegin,
    flags::{ResponseFlag, ResponseFlags},
    frame::ResponseFrame,
};
use crate::{
    codec::{Buffer, BufferError, Decode, Encode},
    flags::BitFlagsOp,
    payload::Payload,
};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("unable to encode response body")]
pub struct ResponseBodyEncodeError;

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub enum ResponseBody {
    Begin(ResponseBegin),
    Frame(ResponseFrame),
}

impl ResponseBody {
    pub const fn payload(&self) -> &Payload {
        match self {
            Self::Begin(body) => &body.payload,
            Self::Frame(body) => &body.payload,
        }
    }
}

impl Encode for ResponseBody {
    type Error = ResponseBodyEncodeError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        match self {
            Self::Begin(body) => body.encode(buffer).change_context(ResponseBodyEncodeError),
            Self::Frame(body) => body.encode(buffer).change_context(ResponseBodyEncodeError),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum ResponseVariant {
    Begin,
    Frame,
}

impl From<&ResponseBody> for ResponseVariant {
    fn from(body: &ResponseBody) -> Self {
        match body {
            ResponseBody::Begin(_) => Self::Begin,
            ResponseBody::Frame(_) => Self::Frame,
        }
    }
}

pub struct ResponseBodyContext {
    variant: ResponseVariant,
}

impl ResponseBodyContext {
    pub(super) fn from_flags(flags: ResponseFlags) -> Self {
        let variant = if flags.contains(ResponseFlag::BeginOfResponse) {
            ResponseVariant::Begin
        } else {
            ResponseVariant::Frame
        };

        Self { variant }
    }
}

impl Decode for ResponseBody {
    type Context = ResponseBodyContext;
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, context: Self::Context) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        match context.variant {
            ResponseVariant::Begin => ResponseBegin::decode(buffer, ()).map(Self::Begin),
            ResponseVariant::Frame => ResponseFrame::decode(buffer, ()).map(Self::Frame),
        }
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::needless_raw_strings)]
    use expect_test::expect;
    use harpc_types::response_kind::ResponseKind;

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        payload::Payload,
        response::{
            begin::ResponseBegin,
            body::{ResponseBody, ResponseBodyContext, ResponseVariant},
            frame::ResponseFrame,
        },
    };

    #[test]
    fn encode_begin() {
        let body = ResponseBody::Begin(ResponseBegin {
            kind: ResponseKind::Ok,

            payload: Payload::new(&[0x01_u8, 0x02, 0x03, 0x04] as &[_]),
        });

        assert_encode(&body, expect![[r#"
                0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 0x04 0x01 0x02 0x03 0x04
            "#]]);
    }

    #[test]
    fn encode_frame() {
        let body = ResponseBody::Frame(crate::response::frame::ResponseFrame {
            payload: Payload::new(&[0x01_u8, 0x02, 0x03, 0x04] as &[_]),
        });

        assert_encode(&body, expect![[r#"
                0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 0x04 0x01 0x02 0x03 0x04
            "#]]);
    }

    #[test]
    fn decode_begin() {
        assert_decode::<ResponseBody>(
            &[
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, // Reserved
                0x00, 0x00, // ResponseKind::Ok
                0x00, 0x04, 0x01, 0x02, 0x03, 0x04_u8,
            ] as &[_],
            &ResponseBody::Begin(ResponseBegin {
                kind: ResponseKind::Ok,
                payload: Payload::new(&[0x01_u8, 0x02, 0x03, 0x04] as &[_]),
            }),
            ResponseBodyContext {
                variant: ResponseVariant::Begin,
            },
        );
    }

    #[test]
    fn decode_frame() {
        assert_decode(
            &[
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, // Reserved
                0x00, 0x04, 0x01, 0x02, 0x03, 0x04_u8,
            ] as &[_],
            &ResponseBody::Frame(ResponseFrame {
                payload: Payload::new(&[0x01_u8, 0x02, 0x03, 0x04] as &[_]),
            }),
            ResponseBodyContext {
                variant: ResponseVariant::Frame,
            },
        );
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec(body: ResponseBody) {
        let context = ResponseBodyContext {
            variant: ResponseVariant::from(&body),
        };

        assert_codec(&body, context);
    }
}

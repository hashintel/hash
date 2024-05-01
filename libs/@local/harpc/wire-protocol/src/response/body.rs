use bytes::{Buf, BufMut};
use error_stack::{Report, ResultExt};
use tokio::io::{AsyncRead, AsyncWrite};

use super::{
    begin::ResponseBegin,
    flags::{ResponseFlag, ResponseFlags},
    frame::ResponseFrame,
};
use crate::{
    codec::{Buffer, BufferError, BytesEncodeError, Decode, Encode},
    flags::BitFlagsOp,
    payload::Payload,
};

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
    type Error = Report<BytesEncodeError>;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        match self {
            Self::Begin(body) => body.encode(buffer),
            Self::Frame(body) => body.encode(buffer),
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
    type Error = Report<BufferError>;

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
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use expect_test::expect;

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        payload::Payload,
        response::{
            begin::ResponseBegin,
            body::{ResponseBody, ResponseBodyContext, ResponseVariant},
            frame::ResponseFrame,
            kind::ResponseKind,
        },
    };

    #[tokio::test]
    async fn encode_begin() {
        let body = ResponseBody::Begin(ResponseBegin {
            kind: ResponseKind::Ok,

            payload: Payload::new(&[0x01_u8, 0x02, 0x03, 0x04] as &[_]),
        });

        assert_encode(
            &body,
            expect![[r#"
                0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 0x04 0x01 0x02 0x03 0x04
            "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn encode_frame() {
        let body = ResponseBody::Frame(crate::response::frame::ResponseFrame {
            payload: Payload::new(&[0x01_u8, 0x02, 0x03, 0x04] as &[_]),
        });

        assert_encode(
            &body,
            expect![[r#"
                0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 0x04 0x01 0x02 0x03 0x04
            "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn decode_begin() {
        assert_decode::<ResponseBody>(
            &[
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, // Reserved
                0x00, 0x00, // ResponseKind::Ok
                0x00, 0x04, 0x01, 0x02, 0x03, 0x04,
            ],
            &ResponseBody::Begin(ResponseBegin {
                kind: ResponseKind::Ok,
                payload: Payload::new(&[0x01_u8, 0x02, 0x03, 0x04] as &[_]),
            }),
            ResponseBodyContext {
                variant: ResponseVariant::Begin,
            },
        )
        .await;
    }

    #[tokio::test]
    async fn decode_frame() {
        assert_decode(
            &[
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, // Reserved
                0x00, 0x04, 0x01, 0x02, 0x03, 0x04,
            ],
            &ResponseBody::Frame(ResponseFrame {
                payload: Payload::new(&[0x01_u8, 0x02, 0x03, 0x04] as &[_]),
            }),
            ResponseBodyContext {
                variant: ResponseVariant::Frame,
            },
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(body: ResponseBody) {
        let context = ResponseBodyContext {
            variant: ResponseVariant::from(&body),
        };

        assert_codec(&body, context).await;
    }
}

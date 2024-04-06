use error_stack::{Result, ResultExt};
use tokio::io::{AsyncRead, AsyncWrite};

use super::{
    begin::ResponseBegin,
    flags::{ResponseFlag, ResponseFlags},
    frame::ResponseFrame,
};
use crate::{
    codec::{Decode, DecodePure, Encode},
    flags::BitFlagsOp,
    request::codec::{DecodeError, EncodeError},
};

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub enum ResponseBody {
    Begin(ResponseBegin),
    Frame(ResponseFrame),
}

impl ResponseBody {
    pub(super) const fn begin_of_response(&self) -> bool {
        matches!(self, Self::Begin(_))
    }
}

impl Encode for ResponseBody {
    type Error = EncodeError;

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        match self {
            Self::Begin(body) => body.encode(write).await,
            Self::Frame(body) => body.encode(write).await,
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
    type Error = DecodeError;

    async fn decode(
        read: impl AsyncRead + Unpin + Send,
        context: Self::Context,
    ) -> Result<Self, Self::Error> {
        match context.variant {
            ResponseVariant::Begin => ResponseBegin::decode_pure(read).await.map(Self::Begin),
            ResponseVariant::Frame => ResponseFrame::decode_pure(read)
                .await
                .map(Self::Frame)
                .change_context(DecodeError),
        }
    }
}

#[cfg(test)]
mod test {
    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        encoding::Encoding,
        payload::Payload,
        response::{
            begin::ResponseBegin,
            body::{ResponseBody, ResponseBodyContext, ResponseVariant},
            kind::ResponseKind,
        },
    };

    #[tokio::test]
    async fn encode_begin() {
        let body = ResponseBody::Begin(ResponseBegin {
            kind: ResponseKind::Ok,
            encoding: Encoding::Raw,
            payload: Payload::new(&[0x01_u8, 0x02, 0x03, 0x04] as &[_]),
        });

        assert_encode(
            &body,
            &[
                0x00, // ResponseKind::Ok
                0x00, 0x01, // Encoding::Raw
                0x00, 0x04, 0x01, 0x02, 0x03, 0x04,
            ],
        )
        .await;
    }

    #[tokio::test]
    async fn encode_frame() {
        let body = ResponseBody::Frame(crate::response::frame::ResponseFrame {
            payload: Payload::new(&[0x01_u8, 0x02, 0x03, 0x04] as &[_]),
        });

        assert_encode(&body, &[0x00, 0x04, 0x01, 0x02, 0x03, 0x04]).await;
    }

    #[tokio::test]
    async fn decode_begin() {
        let body = ResponseBody::Begin(ResponseBegin {
            kind: ResponseKind::Ok,
            encoding: Encoding::Raw,
            payload: Payload::new(&[0x01_u8, 0x02, 0x03, 0x04] as &[_]),
        });

        assert_decode(
            &[
                0x00, // ResponseKind::Ok
                0x00, 0x01, // Encoding::Raw
                0x00, 0x04, 0x01, 0x02, 0x03, 0x04,
            ],
            &body,
            ResponseBodyContext {
                variant: ResponseVariant::Begin,
            },
        )
        .await;
    }

    #[tokio::test]
    async fn decode_frame() {
        let body = ResponseBody::Frame(crate::response::frame::ResponseFrame {
            payload: Payload::new(&[0x01_u8, 0x02, 0x03, 0x04] as &[_]),
        });

        assert_decode(
            &[0x00, 0x04, 0x01, 0x02, 0x03, 0x04],
            &body,
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

        assert_encode_decode(&body, context).await;
    }
}

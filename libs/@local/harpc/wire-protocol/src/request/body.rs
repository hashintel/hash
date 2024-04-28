use error_stack::{Result, ResultExt};
use tokio::{
    io::{AsyncRead, AsyncWrite},
    pin,
};

use super::{
    begin::RequestBegin,
    codec::{DecodeError, EncodeError},
    flags::{RequestFlag, RequestFlags},
    frame::RequestFrame,
};
use crate::{
    codec::{Decode, Encode},
    flags::BitFlagsOp,
};

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub enum RequestBody {
    Begin(RequestBegin),
    Frame(RequestFrame),
}

impl RequestBody {
    #[must_use]
    pub(super) const fn begin_of_request(&self) -> bool {
        matches!(self, Self::Begin(_))
    }
}

impl Encode for RequestBody {
    type Error = EncodeError;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

        match self {
            Self::Begin(body) => body.encode(write).await,
            Self::Frame(body) => body.encode(write).await,
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
    type Error = DecodeError;

    async fn decode(
        read: impl AsyncRead + Send,
        context: Self::Context,
    ) -> Result<Self, Self::Error> {
        pin!(read);

        match context.variant {
            RequestVariant::Begin => RequestBegin::decode(read, ()).await.map(RequestBody::Begin),
            RequestVariant::Frame => RequestFrame::decode(read, ())
                .await
                .map(RequestBody::Frame)
                .change_context(DecodeError),
        }
    }
}

#[cfg(test)]
mod test {

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
            version: Version::new(0x03, 0x04),
        },
        procedure: ProcedureDescriptor {
            id: ProcedureId::new(0x0506),
        },
        payload: Payload::from_static(&[0x07, 0x08]),
    };

    static EXAMPLE_FRAME: RequestFrame = RequestFrame {
        payload: Payload::from_static(&[0x07, 0x08]),
    };

    #[tokio::test]
    async fn encode_begin() {
        assert_encode(
            &RequestBody::Begin(EXAMPLE_BEGIN.clone()),
            expect![
                "0x01 0x02 0x03 0x04 0x05 0x06 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 \
                 0x00 0x00 0x00 0x00 0x02 0x07 0x08"
            ],
        )
        .await;
    }

    #[tokio::test]
    async fn encode_frame() {
        assert_encode(
            &RequestBody::Frame(EXAMPLE_FRAME.clone()),
            expect![
                "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 \
                 0x00 0x00 0x00 0x00 0x02 0x07 0x08"
            ],
        )
        .await;
    }

    #[tokio::test]
    async fn decode_begin() {
        let bytes = encode_value(&EXAMPLE_BEGIN).await;

        let context = RequestBodyContext {
            variant: RequestVariant::Begin,
        };

        assert_decode::<RequestBody>(
            &bytes,
            expect![[r#"
                Begin(
                    RequestBegin {
                        service: ServiceDescriptor {
                            id: ServiceId(
                                258,
                            ),
                            version: Version {
                                major: 3,
                                minor: 4,
                            },
                        },
                        procedure: ProcedureDescriptor {
                            id: ProcedureId(
                                1286,
                            ),
                        },
                        payload: Payload(
                            b"\x07\x08",
                        ),
                    },
                )
            "#]],
            context,
        )
        .await;
    }

    #[tokio::test]
    async fn decode_frame() {
        let bytes = encode_value(&EXAMPLE_FRAME).await;

        let context = RequestBodyContext {
            variant: RequestVariant::Frame,
        };

        assert_decode::<RequestBody>(
            &bytes,
            expect![[r#"
                Frame(
                    RequestFrame {
                        payload: Payload(
                            b"\x07\x08",
                        ),
                    },
                )
            "#]],
            context,
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(body: RequestBody) {
        let context = RequestBodyContext {
            variant: (&body).into(),
        };

        assert_codec(&body, context).await;
    }
}

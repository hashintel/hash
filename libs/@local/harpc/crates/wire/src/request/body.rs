use std::io;

use error_stack::Result;
use tokio::io::{AsyncRead, AsyncWrite};

use super::{
    begin::{RequestBegin, RequestBeginContext},
    codec::EncodeError,
    flags::{RequestFlag, RequestFlags},
    frame::RequestFrame,
};
use crate::codec::{Decode, DecodePure, Encode};

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub enum RequestBody {
    Begin(RequestBegin),
    Frame(RequestFrame),
}

impl RequestBody {
    #[must_use]
    pub(super) const fn contains_authorization(&self) -> bool {
        let Self::Begin(body) = self else {
            return false;
        };

        body.authorization.is_some()
    }

    #[must_use]
    pub(super) const fn begin_of_request(&self) -> bool {
        matches!(self, Self::Begin(_))
    }
}

impl Encode for RequestBody {
    type Error = EncodeError;

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
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
    pub contains_authorization: bool,
    pub variant: RequestVariant,
}

impl RequestBodyContext {
    pub(super) fn from_flags(flags: RequestFlags) -> Self {
        let variant = if flags.contains(RequestFlag::BeginOfRequest) {
            RequestVariant::Begin
        } else {
            RequestVariant::Frame
        };

        Self {
            contains_authorization: flags.contains(RequestFlag::ContainsAuthorization),
            variant,
        }
    }
}

impl From<RequestBodyContext> for RequestBeginContext {
    fn from(context: RequestBodyContext) -> Self {
        Self {
            contains_authorization: context.contains_authorization,
        }
    }
}

impl Decode for RequestBody {
    type Context = RequestBodyContext;
    type Error = io::Error;

    async fn decode(
        read: impl AsyncRead + Unpin + Send,
        context: Self::Context,
    ) -> Result<Self, Self::Error> {
        match context.variant {
            RequestVariant::Begin => RequestBegin::decode(read, context.into())
                .await
                .map(RequestBody::Begin),
            RequestVariant::Frame => RequestFrame::decode_pure(read)
                .await
                .map(RequestBody::Frame),
        }
    }
}

#[cfg(test)]
mod test {
    use graph_types::account::AccountId;
    use harpc_types::{
        procedure::ProcedureId,
        service::{ServiceId, ServiceVersion},
    };
    use uuid::Uuid;

    use super::{RequestBody, RequestBodyContext};
    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode, encode_value},
        request::{
            authorization::Authorization, begin::RequestBegin, body::RequestVariant,
            frame::RequestFrame, payload::RequestPayload, procedure::ProcedureDescriptor,
            service::ServiceDescriptor,
        },
    };

    static EXAMPLE_BEGIN: RequestBegin = RequestBegin {
        service: ServiceDescriptor {
            id: ServiceId::new(0x01),
            version: ServiceVersion::new(0x00, 0x01),
        },
        procedure: ProcedureDescriptor {
            id: ProcedureId::new(0x01),
        },
        authorization: None,
        payload: RequestPayload::from_static(&[]),
    };

    static EXAMPLE_FRAME: RequestFrame = RequestFrame {
        payload: RequestPayload::from_static(&[]),
    };

    #[tokio::test]
    async fn encode_begin() {
        let expected = encode_value(&EXAMPLE_BEGIN).await;

        assert_encode(&RequestBody::Begin(EXAMPLE_BEGIN.clone()), &expected).await;
    }

    #[tokio::test]
    async fn encode_frame() {
        let expected = encode_value(&EXAMPLE_FRAME).await;

        assert_encode(&RequestBody::Frame(EXAMPLE_FRAME.clone()), &expected).await;
    }

    #[tokio::test]
    async fn decode_begin() {
        let bytes = encode_value(&EXAMPLE_BEGIN).await;

        let context = RequestBodyContext {
            contains_authorization: false,
            variant: RequestVariant::Begin,
        };

        assert_decode(&bytes, &RequestBody::Begin(EXAMPLE_BEGIN.clone()), context).await;
    }

    #[tokio::test]
    async fn decode_begin_with_authorization() {
        let begin = RequestBegin {
            authorization: Some(Authorization {
                account: AccountId::new(Uuid::new_v4()),
            }),
            ..EXAMPLE_BEGIN.clone()
        };

        let bytes = encode_value(&begin).await;

        let context = RequestBodyContext {
            contains_authorization: true,
            variant: RequestVariant::Begin,
        };

        assert_decode(&bytes, &RequestBody::Begin(begin), context).await;
    }

    #[tokio::test]
    async fn decode_frame() {
        let bytes = encode_value(&EXAMPLE_FRAME).await;

        let context = RequestBodyContext {
            contains_authorization: false,
            variant: RequestVariant::Frame,
        };

        assert_decode(&bytes, &RequestBody::Frame(EXAMPLE_FRAME.clone()), context).await;
    }

    #[tokio::test]
    async fn decode_frame_with_authorization() {
        // ensure that `contains_authorization` is ignored for `RequestFrame`
        let frame = RequestFrame {
            payload: RequestPayload::from_static(&[]),
        };

        let bytes = encode_value(&frame).await;

        let context = RequestBodyContext {
            contains_authorization: true,
            variant: RequestVariant::Frame,
        };

        assert_decode(&bytes, &RequestBody::Frame(frame), context).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(body: RequestBody) {
        let context = RequestBodyContext {
            contains_authorization: body.contains_authorization(),
            variant: (&body).into(),
        };

        assert_encode_decode(&body, context).await;
    }
}

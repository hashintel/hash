use std::io;

use error_stack::{Result, ResultExt};
use tokio::io::AsyncWrite;

use super::{
    authorization::Authorization, codec::EncodeError, payload::RequestPayload,
    procedure::ProcedureDescriptor, service::ServiceDescriptor,
};
use crate::codec::{Decode, DecodePure, Encode};

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct RequestBegin {
    service: ServiceDescriptor,
    procedure: ProcedureDescriptor,

    authorization: Option<Authorization>,

    // begin is 22 bytes, so payload can be 16KiB - 32 bytes (rest is padding for the future)
    // that way the packet won't ever exceed 16KiB
    payload: RequestPayload,
}

impl Encode for RequestBegin {
    type Error = EncodeError;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.service
            .encode(&mut write)
            .await
            .change_context(EncodeError)?;

        self.procedure
            .encode(&mut write)
            .await
            .change_context(EncodeError)?;

        if let Some(authorization) = &self.authorization {
            authorization
                .encode(&mut write)
                .await
                .change_context(EncodeError)?;
        }

        self.payload.encode(write).await.change_context(EncodeError)
    }
}

pub struct DecodeContext {
    pub has_authorization: bool,
}

impl Decode for RequestBegin {
    type Context = DecodeContext;
    type Error = io::Error;

    async fn decode(
        mut read: impl tokio::io::AsyncRead + Unpin + Send,
        context: Self::Context,
    ) -> Result<Self, Self::Error> {
        let service = ServiceDescriptor::decode_pure(&mut read).await?;
        let procedure = ProcedureDescriptor::decode_pure(&mut read).await?;

        #[expect(
            clippy::if_then_some_else_none,
            reason = "false positive, contains await"
        )]
        let authorization = if context.has_authorization {
            Some(Authorization::decode_pure(&mut read).await?)
        } else {
            None
        };

        let payload = RequestPayload::decode_pure(read).await?;

        Ok(Self {
            service,
            procedure,
            authorization,
            payload,
        })
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

    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        request::{
            authorization::Authorization,
            begin::{DecodeContext, RequestBegin},
            payload::RequestPayload,
            procedure::ProcedureDescriptor,
            service::ServiceDescriptor,
        },
    };

    const EXAMPLE_UUID: [u8; 16] = [
        0x90, 0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56, 0x78, 0x90, 0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56,
        0x78,
    ];

    static EXAMPLE_REQUEST: RequestBegin = RequestBegin {
        service: ServiceDescriptor {
            id: ServiceId::new(0x12),
            version: ServiceVersion::new(0x34, 0x56),
        },
        procedure: ProcedureDescriptor {
            id: ProcedureId::new(0x78),
        },
        authorization: Some(Authorization {
            account: AccountId::new(Uuid::from_bytes(EXAMPLE_UUID)),
        }),
        payload: RequestPayload::from_static(&[0x90, 0xAB, 0xCD]),
    };

    #[tokio::test]
    async fn encode_has_authorization() {
        assert_encode(
            &EXAMPLE_REQUEST,
            &[
                0x00, 0x12, // service id
                0x34, 0x56, // service version
                0x00, 0x78, // procedure id
                0x90, 0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56, 0x78, 0x90, 0xAB, 0xCD, 0xEF, 0x12, 0x34,
                0x56, 0x78, // account id
                0x00, 0x03, 0x90, 0xAB, 0xCD, // payload
            ],
        )
        .await;
    }

    #[tokio::test]
    async fn encode_no_authorization() {
        let request = RequestBegin {
            authorization: None,
            ..EXAMPLE_REQUEST.clone()
        };

        assert_encode(
            &request,
            &[
                0x00, 0x12, // service id
                0x34, 0x56, // service version
                0x00, 0x78, // procedure id
                0x00, 0x03, 0x90, 0xAB, 0xCD, // payload
            ],
        )
        .await;
    }

    #[tokio::test]
    async fn decode_has_authorization() {
        let bytes: &[u8] = &[
            0x00, 0x12, // service id
            0x34, 0x56, // service version
            0x00, 0x78, // procedure id
            0x90, 0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56, 0x78, 0x90, 0xAB, 0xCD, 0xEF, 0x12, 0x34,
            0x56, 0x78, // account id
            0x00, 0x03, 0x90, 0xAB, 0xCD, // payload
        ];

        assert_decode(
            bytes,
            &EXAMPLE_REQUEST,
            DecodeContext {
                has_authorization: true,
            },
        )
        .await;
    }

    #[tokio::test]
    async fn decode_no_authorization() {
        let bytes: &[u8] = &[
            0x00, 0x12, // service id
            0x34, 0x56, // service version
            0x00, 0x78, // procedure id
            0x00, 0x03, 0x90, 0xAB, 0xCD, // payload
        ];

        let request = RequestBegin {
            authorization: None,
            ..EXAMPLE_REQUEST.clone()
        };

        assert_decode(
            bytes,
            &request,
            DecodeContext {
                has_authorization: false,
            },
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn encode_decode(request: RequestBegin) {
        let context = DecodeContext {
            has_authorization: request.authorization.is_some(),
        };

        assert_encode_decode(&request, context).await;
    }
}

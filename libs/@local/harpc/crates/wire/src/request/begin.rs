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
    pub service: ServiceDescriptor,
    pub procedure: ProcedureDescriptor,

    pub authorization: Option<Authorization>,

    pub payload: RequestPayload,
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

pub struct RequestBeginContext {
    pub contains_authorization: bool,
}

impl Decode for RequestBegin {
    type Context = RequestBeginContext;
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
        let authorization = if context.contains_authorization {
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
    use std::io::{self, Cursor};

    use graph_types::account::AccountId;
    use harpc_types::{
        procedure::ProcedureId,
        service::{ServiceId, ServiceVersion},
    };
    use uuid::Uuid;

    use crate::{
        codec::{
            test::{assert_decode, assert_encode, assert_encode_decode, decode_value},
            Decode,
        },
        request::{
            authorization::Authorization,
            begin::{RequestBegin, RequestBeginContext},
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
            RequestBeginContext {
                contains_authorization: true,
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
            RequestBeginContext {
                contains_authorization: false,
            },
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn encode_decode(request: RequestBegin) {
        let context = RequestBeginContext {
            contains_authorization: request.authorization.is_some(),
        };

        assert_encode_decode(&request, context).await;
    }

    // these tests demonstrate that we have a robust decoding implementation that is non
    // self-describing but in the event of a malformed context will lead to a potential
    // successful decoding but with various potential side effects which are demonstrated in the
    // tests below.

    #[tokio::test]
    async fn decode_malformed_context_contains_authorization_too_much_data() {
        let bytes: &[u8] = &[
            0x00, 0x12, // service id
            0x34, 0x56, // service version
            0x00, 0x78, // procedure id
            0x00, 0x03, 0xCD, 0xEF, 0x12, 0x34, 0x56, 0x78, 0x90, 0xAB, 0xCD, 0xEF, 0x12, 0x34,
            0x56, 0x78, // account id
            0x00, 0x03, 0x90, 0xAB, 0xCD, // payload
        ];
        // ^ the payload ID has been manipulated, so that when we have an account id we will still
        // be successful but we won't have all the data consumed

        let mut reader = Cursor::new(bytes);

        // we should still be able to decode the request, but
        RequestBegin::decode(
            &mut reader,
            RequestBeginContext {
                contains_authorization: false,
            },
        )
        .await
        .expect("able to decode value");

        // ... we should have some data left in the reader
        assert_ne!(reader.position(), bytes.len() as u64);
    }

    #[tokio::test]
    async fn decode_malformed_context_too_much_data() {
        let bytes: &[u8] = &[
            0x00, 0x12, // service id
            0x34, 0x56, // service version
            0x00, 0x78, // procedure id
            0x00, 0x19, b'H', b'e', b'l', b'l', b'o', b' ', b'W', b'o', b'r', b'l', b'd', b',',
            b' ', b'h', // interpreted as account id
            0x00, 0x03, b' ', b'a', b'r', b'e', b' ', b'y', b'o', b'u', b'?',
        ];

        // ensure this is valid if the context is correct
        let value: RequestBegin = decode_value(
            bytes,
            RequestBeginContext {
                contains_authorization: false,
            },
        )
        .await;
        assert_eq!(
            value.payload.as_bytes().as_ref(),
            &[
                b'H', b'e', b'l', b'l', b'o', b' ', b'W', b'o', b'r', b'l', b'd', b',', b' ', b'h',
                0x00, 0x03, b' ', b'a', b'r', b'e', b' ', b'y', b'o', b'u', b'?',
            ]
        );

        let mut reader = Cursor::new(bytes);

        // we should still be able to decode the request, but
        RequestBegin::decode(
            &mut reader,
            RequestBeginContext {
                contains_authorization: true,
            },
        )
        .await
        .expect("able to decode value");

        // ... we should have some data left in the reader
        assert_ne!(reader.position(), bytes.len() as u64);
    }

    #[tokio::test]
    async fn decode_malformed_context_contains_authorization_not_enough_data() {
        let bytes: &[u8] = &[
            0x00, 0x12, // service id
            0x34, 0x56, // service version
            0x00, 0x78, // procedure id
            0x90, 0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56, 0x78, 0x90, 0xAB, 0xCD, 0xEF, 0x12, 0x34,
            0x56, 0x78, // account id
            0x00, 0x03, 0x90, 0xAB, 0xCD, // payload
        ];
        // 0x90 0xAB indicates that (if we don't have any authorization) we should have 37035 bytes
        // of data which we won't have. Deserialization should fail.

        let mut reader = Cursor::new(bytes);

        let error = RequestBegin::decode(
            &mut reader,
            RequestBeginContext {
                contains_authorization: false,
            },
        )
        .await
        .expect_err("unable to decode value");

        assert_eq!(error.current_context().kind(), io::ErrorKind::UnexpectedEof);
    }

    #[tokio::test]
    async fn decode_malformed_context_not_enough_data() {
        let bytes: &[u8] = &[
            0x00, 0x12, // service id
            0x34, 0x56, // service version
            0x00, 0x78, // procedure id
            0x00, 0x19, b'H', b'e', b'l', b'l', b'o', b' ', b'W', b'o', b'r', b'l', b'd', b',',
            b' ', b'h', // interpreted as account id
            b'o', b'w', b' ', b'a', b'r', b'e', b' ', b'y', b'o', b'u', b'?',
        ];

        // ensure this is valid if the context is correct
        let value: RequestBegin = decode_value(
            bytes,
            RequestBeginContext {
                contains_authorization: false,
            },
        )
        .await;
        assert_eq!(
            value.payload.as_bytes().as_ref(),
            b"Hello World, how are you?"
        );

        let mut reader = Cursor::new(bytes);

        // we should still be able to decode the request, but
        let error = RequestBegin::decode(
            &mut reader,
            RequestBeginContext {
                contains_authorization: true,
            },
        )
        .await
        .expect_err("unable to decode value");

        assert_eq!(error.current_context().kind(), io::ErrorKind::UnexpectedEof);
    }

    #[tokio::test]
    async fn decode_malformed_context_contains_authorization_enough_data() {
        let bytes: &[u8] = &[
            0x00, 0x12, // service id
            0x34, 0x56, // service version
            0x00, 0x78, // procedure id
            0x00, 0x13, 0xCD, 0xEF, 0x12, 0x34, 0x56, 0x78, 0x90, 0xAB, 0xCD, 0xEF, 0x12, 0x34,
            0x56, 0x78, // account id
            0x00, 0x03, 0x90, 0xAB, 0xCD, // payload
        ];
        // ^ the ID has been manipulated so that it is exactly _just_ enough to decode correctly

        assert_decode(
            bytes,
            &RequestBegin {
                service: ServiceDescriptor {
                    id: ServiceId::new(0x12),
                    version: ServiceVersion::new(0x34, 0x56),
                },
                procedure: ProcedureDescriptor {
                    id: ProcedureId::new(0x78),
                },
                authorization: None,
                payload: RequestPayload::from_static(&[
                    0xCD, 0xEF, 0x12, 0x34, 0x56, 0x78, 0x90, 0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56,
                    0x78, 0x00, 0x03, 0x90, 0xAB, 0xCD,
                ]),
            },
            RequestBeginContext {
                contains_authorization: false,
            },
        )
        .await;
    }

    #[tokio::test]
    async fn decode_malformed_context_enough_data() {
        let bytes: &[u8] = &[
            0x00, 0x12, // service id
            0x34, 0x56, // service version
            0x00, 0x78, // procedure id
            0x00, 0x19, b'H', b'e', b'l', b'l', b'o', b' ', b'W', b'o', b'r', b'l', b'd', b',',
            b' ', b'h', // interpreted as account id
            0x00, 0x03, b' ', b'a', b'r',
        ];

        assert_decode(
            bytes,
            &RequestBegin {
                service: ServiceDescriptor {
                    id: ServiceId::new(0x12),
                    version: ServiceVersion::new(0x34, 0x56),
                },
                procedure: ProcedureDescriptor {
                    id: ProcedureId::new(0x78),
                },
                authorization: Some(Authorization {
                    account: AccountId::new(Uuid::from_bytes([
                        0x00, 0x19, b'H', b'e', b'l', b'l', b'o', b' ', b'W', b'o', b'r', b'l',
                        b'd', b',', b' ', b'h',
                    ])),
                }),
                payload: RequestPayload::from_static(&[b' ', b'a', b'r']),
            },
            RequestBeginContext {
                contains_authorization: true,
            },
        )
        .await
    }
}

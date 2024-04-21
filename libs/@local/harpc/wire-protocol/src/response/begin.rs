use error_stack::{Result, ResultExt};
use tokio::io::{AsyncRead, AsyncWrite};

use super::kind::ResponseKind;
use crate::{
    codec::{DecodePure, Encode},
    encoding::Encoding,
    payload::Payload,
    request::codec::{DecodeError, EncodeError},
};

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ResponseBegin {
    pub kind: ResponseKind,
    pub encoding: Encoding,

    pub payload: Payload,
}

impl Encode for ResponseBegin {
    type Error = EncodeError;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.kind
            .encode(&mut write)
            .await
            .change_context(EncodeError)?;

        self.encoding
            .encode(&mut write)
            .await
            .change_context(EncodeError)?;

        self.payload.encode(write).await.change_context(EncodeError)
    }
}

impl DecodePure for ResponseBegin {
    type Error = DecodeError;

    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let kind = ResponseKind::decode_pure(&mut read)
            .await
            .change_context(DecodeError)?;

        let encoding = Encoding::decode_pure(&mut read)
            .await
            .change_context(DecodeError)?;

        let payload = Payload::decode_pure(read)
            .await
            .change_context(DecodeError)?;

        Ok(Self {
            kind,
            encoding,
            payload,
        })
    }
}

#[cfg(test)]
mod test {
    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        encoding::Encoding,
        payload::Payload,
        response::{begin::ResponseBegin, kind::ResponseKind},
    };

    #[tokio::test]
    async fn encode() {
        let frame = ResponseBegin {
            kind: ResponseKind::Ok,
            encoding: Encoding::Raw,
            payload: Payload::new(b"hello world" as &[_]),
        };

        assert_encode(
            &frame,
            &[
                0x00, // ResponseKind::Ok
                0x00, 0x01, // Encoding::Raw
                0x00, 0x0B, b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
            ],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        let frame = ResponseBegin {
            kind: ResponseKind::Ok,
            encoding: Encoding::Raw,
            payload: Payload::new(b"hello world" as &[_]),
        };

        assert_decode(
            &[
                0x00, // ResponseKind::Ok
                0x00, 0x01, // Encoding::Raw
                0x00, 0x0B, b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
            ],
            &frame,
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(frame: ResponseBegin) {
        assert_encode_decode(&frame, ()).await;
    }
}

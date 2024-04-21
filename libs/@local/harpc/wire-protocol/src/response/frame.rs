use std::io;

use error_stack::{Result, ResultExt};
use tokio::io::{AsyncRead, AsyncWrite};

use crate::{
    codec::{DecodePure, Encode},
    payload::Payload,
    request::codec::EncodeError,
};

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ResponseFrame {
    pub payload: Payload,
}

impl Encode for ResponseFrame {
    type Error = EncodeError;

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.payload.encode(write).await.change_context(EncodeError)
    }
}

impl DecodePure for ResponseFrame {
    type Error = io::Error;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let payload = Payload::decode_pure(read).await?;

        Ok(Self { payload })
    }
}

#[cfg(test)]
mod test {
    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        payload::Payload,
        response::frame::ResponseFrame,
    };

    #[tokio::test]
    async fn encode() {
        let frame = ResponseFrame {
            payload: Payload::new(b"hello world" as &[_]),
        };

        assert_encode(
            &frame,
            &[
                0x00, 0x0B, b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
            ],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        let frame = ResponseFrame {
            payload: Payload::new(b"hello world" as &[_]),
        };

        assert_decode(
            &[
                0x00, 0x0B, b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
            ],
            &frame,
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(frame: ResponseFrame) {
        assert_encode_decode(&frame, ()).await;
    }
}

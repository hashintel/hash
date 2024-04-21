use std::io;

use error_stack::{Result, ResultExt};
use tokio::io::{AsyncRead, AsyncWrite};

use super::codec::EncodeError;
use crate::{
    codec::{DecodePure, Encode},
    payload::Payload,
};

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct RequestFrame {
    pub payload: Payload,
}

impl Encode for RequestFrame {
    type Error = EncodeError;

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.payload.encode(write).await.change_context(EncodeError)
    }
}

impl DecodePure for RequestFrame {
    type Error = io::Error;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        Ok(Self {
            payload: Payload::decode_pure(read).await?,
        })
    }
}

#[cfg(test)]
mod test {
    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        payload::Payload,
        request::frame::RequestFrame,
    };

    #[tokio::test]
    async fn encode() {
        let frame = RequestFrame {
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
        let frame = RequestFrame {
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
    async fn codec(frame: RequestFrame) {
        assert_encode_decode(&frame, ()).await;
    }
}

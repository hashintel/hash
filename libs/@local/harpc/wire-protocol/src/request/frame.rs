use std::io;

use error_stack::{Result, ResultExt};
use tokio::io::{AsyncRead, AsyncWrite};

use super::codec::EncodeError;
use crate::{
    codec::{Decode, Encode},
    payload::Payload,
};

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct RequestFrame {
    pub payload: Payload,
}

impl Encode for RequestFrame {
    type Error = EncodeError;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        self.payload.encode(write).await.change_context(EncodeError)
    }
}

impl Decode for RequestFrame {
    type Context = ();
    type Error = io::Error;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        Ok(Self {
            payload: Payload::decode(read, ()).await?,
        })
    }
}

#[cfg(test)]
mod test {
    use expect_test::expect;

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        payload::Payload,
        request::frame::RequestFrame,
    };

    #[tokio::test]
    async fn encode() {
        assert_encode(
            &RequestFrame {
                payload: Payload::new(b"hello world" as &[_]),
            },
            expect![[""]],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        assert_decode::<RequestFrame>(
            &[
                0x00, 0x0B, b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
            ],
            expect![[""]],
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(frame: RequestFrame) {
        assert_codec(&frame, ()).await;
    }
}

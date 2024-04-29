use std::io;

use error_stack::{Result, ResultExt};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    pin,
};

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
        pin!(write);

        // write 19 empty bytes (reserved for future use)
        write
            .write_all(&[0; 19])
            .await
            .change_context(EncodeError)?;

        self.payload.encode(write).await.change_context(EncodeError)
    }
}

impl Decode for RequestFrame {
    type Context = ();
    type Error = io::Error;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        pin!(read);

        // skip 19 bytes (reserved for future use)
        read.read_exact(&mut [0; 19]).await?;

        Ok(Self {
            payload: Payload::decode(read, ()).await?,
        })
    }
}

#[cfg(test)]
mod test {
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
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
            expect![[r#"
                0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 0x0B b'h' b'e' b'l' b'l' b'o' b' ' b'w' b'o' b'r' b'l' b'd'
            "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        assert_decode(
            &[
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0B, b'h', b'e', b'l', b'l', b'o', b' ', b'w',
                b'o', b'r', b'l', b'd',
            ],
            &RequestFrame {
                payload: Payload::from_static(b"hello world" as &[_]),
            },
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(frame: RequestFrame) {
        assert_codec(&frame, ()).await;
    }
}

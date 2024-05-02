use error_stack::{Result, ResultExt};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    pin,
};

use super::kind::ResponseKind;
use crate::{
    codec::{Decode, Encode},
    payload::Payload,
    request::codec::{DecodeError, EncodeError},
};

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ResponseBegin {
    pub kind: ResponseKind,

    pub payload: Payload,
}

impl Encode for ResponseBegin {
    type Error = EncodeError;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

        // 17 bytes of reserved space
        write
            .write_all(&[0; 17])
            .await
            .change_context(EncodeError)?;

        self.kind
            .encode(&mut write)
            .await
            .change_context(EncodeError)?;

        self.payload.encode(write).await.change_context(EncodeError)
    }
}

impl Decode for ResponseBegin {
    type Context = ();
    type Error = DecodeError;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        pin!(read);

        // skip 17 bytes of reserved space
        read.read_exact(&mut [0; 17])
            .await
            .change_context(DecodeError)?;

        let kind = ResponseKind::decode(&mut read, ())
            .await
            .change_context(DecodeError)?;

        let payload = Payload::decode(read, ())
            .await
            .change_context(DecodeError)?;

        Ok(Self { kind, payload })
    }
}

#[cfg(test)]
mod test {
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use expect_test::expect;

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        payload::Payload,
        response::{begin::ResponseBegin, kind::ResponseKind},
    };

    #[tokio::test]
    async fn encode() {
        let frame = ResponseBegin {
            kind: ResponseKind::Ok,
            payload: Payload::new(b"hello world" as &[_]),
        };

        assert_encode(
            &frame,
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
                0x00, 0x00, 0x00, // Reserved
                0x00, 0x00, // ResponseKind::Ok
                0x00, 0x0B, b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
            ],
            &ResponseBegin {
                kind: ResponseKind::Ok,
                payload: Payload::new(b"hello world" as &[_]),
            },
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    #[cfg_attr(miri, ignore)]
    async fn codec(frame: ResponseBegin) {
        assert_codec(&frame, ()).await;
    }
}

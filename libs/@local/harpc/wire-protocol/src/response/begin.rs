use bytes::{Buf, BufMut};
use error_stack::{Report, ResultExt};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    pin,
};

use super::kind::ResponseKind;
use crate::{
    codec::{Buffer, BufferError, BytesEncodeError, Decode, Encode},
    payload::Payload,
};

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ResponseBegin {
    pub kind: ResponseKind,

    pub payload: Payload,
}

impl Encode for ResponseBegin {
    type Error = Report<BytesEncodeError>;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        // 17 bytes of reserved space
        buffer.push_repeat(0, 17);

        let Ok(()) = self.kind.encode(buffer);

        self.payload.encode(buffer)
    }
}

impl Decode for ResponseBegin {
    type Context = ();
    type Error = Report<BufferError>;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        // skip 17 bytes of reserved space
        buffer.next_discard(17)?;

        let kind = ResponseKind::decode(buffer, ())?;

        let payload = Payload::decode(buffer, ())?;

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
    async fn codec(frame: ResponseBegin) {
        assert_codec(&frame, ()).await;
    }
}

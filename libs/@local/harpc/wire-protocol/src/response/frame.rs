use bytes::{Buf, BufMut};
use error_stack::{Result, ResultExt as _};

use crate::{
    codec::{Buffer, BufferError, Decode, Encode},
    payload::Payload,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("unable to encode response frame")]
pub struct ResponseFrameEncodeError;

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ResponseFrame {
    pub payload: Payload,
}

impl Encode for ResponseFrame {
    type Error = ResponseFrameEncodeError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        // 19 bytes of reserved space
        buffer
            .push_repeat(0, 19)
            .change_context(ResponseFrameEncodeError)?;

        self.payload
            .encode(buffer)
            .change_context(ResponseFrameEncodeError)
    }
}

impl Decode for ResponseFrame {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        // skip 19 bytes of reserved space
        buffer.discard(19)?;

        let payload = Payload::decode(buffer, ())?;

        Ok(Self { payload })
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::needless_raw_strings)]
    use expect_test::expect;

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        payload::Payload,
        response::frame::ResponseFrame,
    };

    #[test]
    fn encode() {
        let frame = ResponseFrame {
            payload: Payload::new(b"hello world" as &[_]),
        };

        assert_encode(&frame, expect![[r#"
                0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 0x0B b'h' b'e' b'l' b'l' b'o' b' ' b'w' b'o' b'r' b'l' b'd'
            "#]]);
    }

    #[test]
    fn decode() {
        assert_decode(
            &[
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0B, b'h', b'e', b'l', b'l', b'o', b' ', b'w',
                b'o', b'r', b'l', b'd',
            ] as &[_],
            &ResponseFrame {
                payload: Payload::from_static(b"hello world" as &[_]),
            },
            (),
        );
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec(frame: ResponseFrame) {
        assert_codec(&frame, ());
    }
}

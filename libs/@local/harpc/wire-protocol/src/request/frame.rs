use bytes::{Buf, BufMut};
use error_stack::{Result, ResultExt};

use crate::{
    codec::{Buffer, BufferError, Decode, Encode},
    payload::Payload,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("unable to encode request frame")]
pub struct RequestFrameEncodeError;

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct RequestFrame {
    pub payload: Payload,
}

impl Encode for RequestFrame {
    type Error = RequestFrameEncodeError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        // write 19 empty bytes (reserved for future use)
        buffer
            .push_repeat(0, 19)
            .change_context(RequestFrameEncodeError)?;

        self.payload
            .encode(buffer)
            .change_context(RequestFrameEncodeError)
    }
}

impl Decode for RequestFrame {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        // skip 19 bytes (reserved for future use)
        buffer.discard(19)?;

        let payload = Payload::decode(buffer, ())?;

        Ok(Self { payload })
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

    #[test]
    fn encode() {
        assert_encode(
            &RequestFrame {
                payload: Payload::new(b"hello world" as &[_]),
            },
            expect![[r#"
                0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00
                0x00 0x00 0x00 0x00 0x0B b'h' b'e' b'l' b'l' b'o' b' ' b'w' b'o' b'r' b'l' b'd'
            "#]],
        );
    }

    #[test]
    fn decode() {
        assert_decode(
            &[
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0B, b'h', b'e', b'l', b'l', b'o', b' ', b'w',
                b'o', b'r', b'l', b'd',
            ] as &[_],
            &RequestFrame {
                payload: Payload::from_static(b"hello world" as &[_]),
            },
            (),
        );
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec(frame: RequestFrame) {
        assert_codec(&frame, ());
    }
}

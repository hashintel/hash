use bytes::{Buf, BufMut};
use error_stack::{Result, ResultExt};

use super::kind::ResponseKind;
use crate::{
    codec::{Buffer, BufferError, Decode, Encode},
    payload::Payload,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("unable to encode response begin frame")]
pub struct ResponseBeginEncodeError;

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ResponseBegin {
    pub kind: ResponseKind,

    pub payload: Payload,
}

impl Encode for ResponseBegin {
    type Error = ResponseBeginEncodeError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        // 17 bytes of reserved space
        buffer
            .push_repeat(0, 17)
            .change_context(ResponseBeginEncodeError)?;

        self.kind
            .encode(buffer)
            .change_context(ResponseBeginEncodeError)?;

        self.payload
            .encode(buffer)
            .change_context(ResponseBeginEncodeError)
    }
}

impl Decode for ResponseBegin {
    type Context = ();
    type Error = BufferError;

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

    #[test]
    fn encode() {
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
        );
    }

    #[test]
    fn decode() {
        assert_decode(
            &[
                0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, // Reserved
                0x00, 0x00, // ResponseKind::Ok
                0x00, 0x0B, b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
            ] as &[_],
            &ResponseBegin {
                kind: ResponseKind::Ok,
                payload: Payload::new(b"hello world" as &[_]),
            },
            (),
        );
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec(frame: ResponseBegin) {
        assert_codec(&frame, ());
    }
}

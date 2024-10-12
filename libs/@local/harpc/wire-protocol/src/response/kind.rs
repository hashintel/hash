use bytes::{Buf, BufMut};
use error_stack::Result;
use harpc_types::response_kind::ResponseKind;

use crate::codec::{Buffer, BufferError, Decode, Encode};

impl Encode for ResponseKind {
    type Error = BufferError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        u16::from(*self).encode(buffer)
    }
}

impl Decode for ResponseKind {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        u16::decode(buffer, ()).map(Self::from)
    }
}

#[cfg(test)]
mod test {
    #![expect(clippy::needless_raw_strings)]
    use core::num::NonZero;

    use expect_test::expect;
    use harpc_types::{error_code::ErrorCode, response_kind::ResponseKind};

    use crate::codec::test::{assert_codec, assert_decode, assert_encode};

    #[test]
    fn encode() {
        assert_encode::<ResponseKind>(&ResponseKind::Ok, expect![[r#"
                0x00 0x00
            "#]]);
    }

    #[test]
    fn decode() {
        assert_decode(&[0x00_u8, 0x00] as &[_], &ResponseKind::Ok, ());

        assert_decode(
            &[0x00_u8, 0x01] as &[_],
            &ResponseKind::Err(ErrorCode::new(NonZero::new(1).expect("infallible"))),
            (),
        );

        assert_decode(
            &[0x12_u8, 0x34] as &[_],
            &ResponseKind::Err(ErrorCode::new(NonZero::new(0x1234).expect("infallible"))),
            (),
        );
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec(kind: ResponseKind) {
        assert_codec(&kind, ());
    }
}

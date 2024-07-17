use core::num::NonZero;

use bytes::{Buf, BufMut};
use error_stack::Result;

use crate::codec::{Buffer, BufferError, Decode, Encode};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ErrorCode(NonZero<u16>);

impl ErrorCode {
    // 0xFF_D0..=0xFF_DF are client layer errors
}

impl ErrorCode {
    // 0xFF_E0..=0xFF_EF are session layer errors
    pub const CONNECTION_CLOSED: Self = Self(NonZero::new(0xFF_E0).expect("infallible"));
    pub const CONNECTION_SHUTDOWN: Self = Self(NonZero::new(0xFF_E1).expect("infallible"));
    pub const CONNECTION_TRANSACTION_LIMIT_REACHED: Self =
        Self(NonZero::new(0xFF_E2).expect("infallible"));
    pub const INSTANCE_TRANSACTION_LIMIT_REACHED: Self =
        Self(NonZero::new(0xFF_E3).expect("infallible"));
    pub const TRANSACTION_LAGGING: Self = Self(NonZero::new(0xFF_E4).expect("infallible"));
}

impl ErrorCode {
    // 0xFF_F0..=0xFF_FF are generic errors
    pub const INTERNAL_SERVER_ERROR: Self = Self(NonZero::new(0xFF_F0).expect("infallible"));
}

impl ErrorCode {
    #[must_use]
    pub const fn new(value: NonZero<u16>) -> Self {
        Self(value)
    }

    #[must_use]
    pub const fn value(self) -> NonZero<u16> {
        self.0
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub enum ResponseKind {
    Ok,
    Err(ErrorCode),
}

impl ResponseKind {
    #[must_use]
    pub const fn is_ok(self) -> bool {
        matches!(self, Self::Ok)
    }

    #[must_use]
    pub const fn is_err(self) -> bool {
        matches!(self, Self::Err(_))
    }
}

impl From<u16> for ResponseKind {
    fn from(value: u16) -> Self {
        NonZero::new(value).map_or(Self::Ok, |value| Self::Err(ErrorCode(value)))
    }
}

impl AsRef<Self> for ResponseKind {
    fn as_ref(&self) -> &Self {
        self
    }
}

impl From<!> for ResponseKind {
    fn from(never: !) -> Self {
        never
    }
}

impl From<ResponseKind> for u16 {
    fn from(kind: ResponseKind) -> Self {
        match kind {
            ResponseKind::Ok => 0,
            ResponseKind::Err(code) => code.value().get(),
        }
    }
}

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

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        response::kind::{ErrorCode, ResponseKind},
    };

    #[test]
    fn encode() {
        assert_encode::<ResponseKind>(
            &ResponseKind::Ok,
            expect![[r#"
                0x00 0x00
            "#]],
        );
    }

    #[test]
    fn decode() {
        assert_decode(&[0x00_u8, 0x00] as &[_], &ResponseKind::Ok, ());

        assert_decode(
            &[0x00_u8, 0x01] as &[_],
            &ResponseKind::Err(ErrorCode(NonZero::new(1).expect("infallible"))),
            (),
        );

        assert_decode(
            &[0x12_u8, 0x34] as &[_],
            &ResponseKind::Err(ErrorCode(NonZero::new(0x1234).expect("infallible"))),
            (),
        );
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn codec(kind: ResponseKind) {
        assert_codec(&kind, ());
    }
}

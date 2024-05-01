use core::num::NonZero;
use std::io;

use bytes::{Buf, BufMut};
use error_stack::Report;
use tokio::io::{AsyncRead, AsyncWrite};

use crate::codec::{Buffer, BufferError, Decode, Encode};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ErrorCode(NonZero<u16>);

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

impl From<u16> for ResponseKind {
    fn from(value: u16) -> Self {
        NonZero::new(value).map_or(Self::Ok, |value| Self::Err(ErrorCode(value)))
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
    type Error = !;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        u16::from(*self).encode(buffer)
    }
}

impl Decode for ResponseKind {
    type Context = ();
    type Error = Report<BufferError>;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        u16::decode(buffer, ()).map(Self::from)
    }
}

#[cfg(test)]
mod test {
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use core::num::NonZero;

    use expect_test::expect;

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        response::kind::{ErrorCode, ResponseKind},
    };

    #[tokio::test]
    async fn encode() {
        assert_encode::<ResponseKind>(
            &ResponseKind::Ok,
            expect![[r#"
                0x00 0x00
            "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        assert_decode(&[0x00, 0x00], &ResponseKind::Ok, ()).await;

        assert_decode(
            &[0x00, 0x01],
            &ResponseKind::Err(ErrorCode(NonZero::new(1).expect("infallible"))),
            (),
        )
        .await;

        assert_decode(
            &[0x12, 0x34],
            &ResponseKind::Err(ErrorCode(NonZero::new(0x1234).expect("infallible"))),
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(kind: ResponseKind) {
        assert_codec(&kind, ()).await;
    }
}

use std::io;

use bytes::{Buf, BufMut, Bytes};
use error_stack::Report;
use tokio::io::{AsyncRead, AsyncWrite};

use crate::codec::{Buffer, BufferError, BytesEncodeError, Decode, Encode};

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct Payload(
    // 1024 ensures that we spill over into the second length byte while still having a good
    // runtime performance.
    #[cfg_attr(
        test,
        any(proptest::collection::size_range(0..1024).lift()),
        map(|bytes: Vec<u8>| Bytes::from(bytes))
    )]
    Bytes,
);

impl Payload {
    pub fn new(bytes: impl Into<Bytes>) -> Self {
        Self(bytes.into())
    }

    #[must_use]
    pub const fn from_static(bytes: &'static [u8]) -> Self {
        Self(Bytes::from_static(bytes))
    }

    pub const fn as_bytes(&self) -> &Bytes {
        &self.0
    }
}

impl Encode for Payload {
    type Error = Report<BytesEncodeError>;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        Bytes::encode(&self.0, buffer)
    }
}

impl Decode for Payload {
    type Context = ();
    type Error = Report<BufferError>;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        Bytes::decode(buffer, ()).map(Self)
    }
}

#[cfg(test)]
mod test {
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use bytes::Bytes;
    use expect_test::expect;

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        payload::Payload,
    };

    #[tokio::test]
    async fn encode() {
        assert_encode(
            &Payload(Bytes::from_static(b"hello world")),
            expect![[r#"
                0x00 0x0B b'h' b'e' b'l' b'l' b'o' b' ' b'w' b'o' b'r' b'l' b'd'
            "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        assert_decode(
            &[
                0x00, 0x0B, b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
            ],
            &Payload::from_static(b"hello world"),
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn encode_decode(payload: Payload) {
        assert_codec(&payload, ()).await;
    }
}

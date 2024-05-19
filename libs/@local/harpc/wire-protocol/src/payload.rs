use bytes::{Buf, BufMut, Bytes};
use error_stack::Result;

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
    pub const MAX_SIZE: usize = (u16::MAX as usize) - 32;

    pub fn new(bytes: impl Into<Bytes>) -> Self {
        Self(bytes.into())
    }

    #[must_use]
    pub const fn from_static(bytes: &'static [u8]) -> Self {
        Self(Bytes::from_static(bytes))
    }

    #[must_use]
    pub const fn len(&self) -> usize {
        self.0.len()
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub const fn as_bytes(&self) -> &Bytes {
        &self.0
    }

    pub fn into_bytes(self) -> Bytes {
        self.0
    }
}

impl Encode for Payload {
    type Error = BytesEncodeError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        Bytes::encode(&self.0, buffer)
    }
}

impl Decode for Payload {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        Bytes::decode(buffer, ()).map(Self)
    }
}

impl AsRef<[u8]> for Payload {
    fn as_ref(&self) -> &[u8] {
        self.0.as_ref()
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

    #[test]
    fn encode() {
        assert_encode(
            &Payload(Bytes::from_static(b"hello world")),
            expect![[r#"
                0x00 0x0B b'h' b'e' b'l' b'l' b'o' b' ' b'w' b'o' b'r' b'l' b'd'
            "#]],
        );
    }

    #[test]
    fn decode() {
        assert_decode(
            &[
                0x00, 0x0B, b'h', b'e', b'l', b'l', b'o', b' ', b'w', b'o', b'r', b'l', b'd',
            ] as &[_],
            &Payload::from_static(b"hello world"),
            (),
        );
    }

    #[test_strategy::proptest]
    #[cfg_attr(miri, ignore)]
    fn encode_decode(payload: Payload) {
        assert_codec(&payload, ());
    }
}

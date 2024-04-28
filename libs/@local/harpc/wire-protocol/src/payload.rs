use std::io;

use bytes::Bytes;
use error_stack::Result;
use tokio::io::{AsyncRead, AsyncWrite};

use crate::codec::{BytesEncodeError, Decode, Encode};

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
    type Error = BytesEncodeError;

    fn encode(
        &self,
        write: impl AsyncWrite + Send,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send {
        Bytes::encode(&self.0, write)
    }
}

impl Decode for Payload {
    type Context = ();
    type Error = io::Error;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        Bytes::decode(read, ()).await.map(Self)
    }
}

#[cfg(test)]
mod test {
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
                0x00 0x0B  'h'  'e'  'l'  'l'  'o'  ' '  'w'  'o'  'r'  'l'  'd'
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

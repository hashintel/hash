use std::io;

use enumflags2::BitFlags;
use error_stack::Result;
use tokio::io::AsyncWrite;

use super::body::ResponseBody;
use crate::{
    codec::{Decode, Encode},
    flags::BitFlagsOp,
};

#[enumflags2::bitflags]
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u8)]
pub enum ResponseFlag {
    // Computed flags
    BeginOfResponse = 0b1000_0000,
    // Controlled flags
    EndOfResponse = 0b0000_0001,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ResponseFlags(
    #[cfg_attr(test, strategy(proptest::arbitrary::any::<u8>()))]
    #[cfg_attr(test, map(BitFlags::from_bits_truncate))]
    BitFlags<ResponseFlag>,
);

impl ResponseFlags {
    pub(crate) fn apply_body(self, body: &ResponseBody) -> Self {
        self.set(
            ResponseFlag::BeginOfResponse,
            matches!(body, ResponseBody::Begin(_)),
        )
    }
}

impl BitFlagsOp for ResponseFlags {
    type Flag = ResponseFlag;

    const EMPTY: Self = Self(BitFlags::EMPTY);

    fn value(&self) -> BitFlags<Self::Flag> {
        self.0
    }
}

impl From<BitFlags<ResponseFlag>> for ResponseFlags {
    fn from(flags: BitFlags<ResponseFlag>) -> Self {
        Self(flags)
    }
}

impl From<ResponseFlag> for ResponseFlags {
    fn from(flag: ResponseFlag) -> Self {
        Self::from(BitFlags::from(flag))
    }
}

impl Encode for ResponseFlags {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        self.0.bits().encode(write).await
    }
}

impl Decode for ResponseFlags {
    type Context = ();
    type Error = io::Error;

    async fn decode(read: impl tokio::io::AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        u8::decode(read, ())
            .await
            .map(BitFlags::from_bits_truncate)
            .map(Self)
    }
}

#[cfg(test)]
mod test {
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use expect_test::expect;

    use super::ResponseFlags;
    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        flags::BitFlagsOp,
        request::flags::{RequestFlag, RequestFlags},
        response::flags::ResponseFlag,
    };

    #[tokio::test]
    async fn encode() {
        let flags = RequestFlags::from(RequestFlag::BeginOfRequest);

        assert_encode(
            &flags,
            expect![[r#"
            0x80
        "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        assert_decode(&[0x00], &RequestFlags::EMPTY, ()).await;

        assert_decode(
            &[0x01],
            &ResponseFlags::from(ResponseFlag::EndOfResponse),
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    #[cfg_attr(miri, ignore)]
    async fn codec(flags: ResponseFlags) {
        assert_codec(&flags, ()).await;
    }
}

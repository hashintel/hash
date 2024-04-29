use std::io;

use enumflags2::BitFlags;
use error_stack::Result;
use tokio::io::{AsyncRead, AsyncWrite};

use super::body::RequestBody;
use crate::{
    codec::{Decode, Encode},
    flags::BitFlagsOp,
};

#[enumflags2::bitflags]
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u8)]
pub enum RequestFlag {
    // Computed flags
    BeginOfRequest = 0b1000_0000,
    // Controlled flags
    EndOfRequest = 0b0000_0001,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct RequestFlags(
    #[cfg_attr(test, strategy(proptest::arbitrary::any::<u8>()))]
    #[cfg_attr(test, map(BitFlags::from_bits_truncate))]
    BitFlags<RequestFlag>,
);

impl RequestFlags {
    pub(super) fn apply_body(self, body: &RequestBody) -> Self {
        self.set(RequestFlag::BeginOfRequest, body.begin_of_request())
    }
}

impl BitFlagsOp for RequestFlags {
    type Flag = RequestFlag;

    const EMPTY: Self = Self(BitFlags::EMPTY);

    fn value(&self) -> BitFlags<Self::Flag> {
        self.0
    }
}

impl From<BitFlags<RequestFlag>> for RequestFlags {
    fn from(flags: BitFlags<RequestFlag>) -> Self {
        Self(flags)
    }
}

impl From<RequestFlag> for RequestFlags {
    fn from(flag: RequestFlag) -> Self {
        Self::from(BitFlags::from(flag))
    }
}

impl Encode for RequestFlags {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        self.0.bits().encode(write).await
    }
}

impl Decode for RequestFlags {
    type Context = ();
    type Error = io::Error;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        u8::decode(read, ())
            .await
            .map(BitFlags::from_bits_truncate)
            .map(From::from)
    }
}

#[cfg(test)]
mod test {
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use expect_test::expect;

    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        flags::BitFlagsOp,
        request::flags::{RequestFlag, RequestFlags},
    };

    #[tokio::test]
    async fn encode() {
        assert_encode(
            &RequestFlags::EMPTY,
            expect![[r#"
            0x00
        "#]],
        )
        .await;

        assert_encode(
            &RequestFlags::from(RequestFlag::BeginOfRequest),
            expect![[r#"
                0x80
            "#]],
        )
        .await;

        assert_encode(
            &RequestFlags::from(RequestFlag::BeginOfRequest | RequestFlag::EndOfRequest),
            expect![[r#"
                0x81
            "#]],
        )
        .await;

        assert_encode(
            &RequestFlags::from(RequestFlag::EndOfRequest),
            expect![[r#"
                0x01
            "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn decode() {
        assert_decode(&[0b0000_0000], &RequestFlags::EMPTY, ()).await;

        assert_decode::<RequestFlags>(
            &[0b1100_0001],
            &RequestFlags::from(RequestFlag::EndOfRequest | RequestFlag::BeginOfRequest),
            (),
        )
        .await;

        assert_decode::<RequestFlags>(
            &[0b1000_0001],
            &RequestFlags::from(RequestFlag::EndOfRequest | RequestFlag::BeginOfRequest),
            (),
        )
        .await;

        assert_decode(
            &[0b0100_0001],
            &RequestFlags::from(RequestFlag::EndOfRequest),
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(flags: RequestFlags) {
        assert_codec(&flags, ()).await;
    }
}

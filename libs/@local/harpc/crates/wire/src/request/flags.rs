use std::io;

use enumflags2::BitFlags;
use error_stack::Result;
use tokio::io::{AsyncRead, AsyncWrite};

use super::body::RequestBody;
use crate::{
    codec::{DecodePure, Encode},
    flags::BitFlagsOp,
};

#[enumflags2::bitflags]
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u8)]
pub enum RequestFlag {
    // Computed flags
    BeginOfRequest = 0b1000_0000,
    ContainsAuthorization = 0b0100_0000,
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
        self.set(
            RequestFlag::ContainsAuthorization,
            body.contains_authorization(),
        )
        .set(RequestFlag::BeginOfRequest, body.begin_of_request())
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

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.0.bits().encode(write).await
    }
}

impl DecodePure for RequestFlags {
    type Error = io::Error;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        u8::decode_pure(read)
            .await
            .map(BitFlags::from_bits_truncate)
            .map(From::from)
    }
}

#[cfg(test)]
mod test {
    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        request::flags::{RequestFlag, RequestFlags},
    };

    #[tokio::test]
    async fn encode() {
        let flags = RequestFlag::BeginOfRequest
            | RequestFlag::ContainsAuthorization
            | RequestFlag::EndOfRequest;
        let flags = RequestFlags::from(flags);

        assert_encode(&flags, &[0b1100_0001]).await;

        let flags = RequestFlag::BeginOfRequest | RequestFlag::ContainsAuthorization;
        let flags = RequestFlags::from(flags);

        assert_encode(&flags, &[0b1100_0000]).await;

        let flags = RequestFlag::BeginOfRequest | RequestFlag::EndOfRequest;
        let flags = RequestFlags::from(flags);

        assert_encode(&flags, &[0b1000_0001]).await;

        let flags = RequestFlag::ContainsAuthorization | RequestFlag::EndOfRequest;
        let flags = RequestFlags::from(flags);

        assert_encode(&flags, &[0b0100_0001]).await;
    }

    #[tokio::test]
    async fn decode() {
        let flags = RequestFlag::BeginOfRequest
            | RequestFlag::ContainsAuthorization
            | RequestFlag::EndOfRequest;
        let flags = RequestFlags::from(flags);

        assert_decode(&[0b1100_0001], &flags, ()).await;

        let flags = RequestFlag::BeginOfRequest | RequestFlag::ContainsAuthorization;
        let flags = RequestFlags::from(flags);

        assert_decode(&[0b1100_0000], &flags, ()).await;

        let flags = RequestFlag::BeginOfRequest | RequestFlag::EndOfRequest;
        let flags = RequestFlags::from(flags);

        assert_decode(&[0b1000_0001], &flags, ()).await;

        let flags = RequestFlag::ContainsAuthorization | RequestFlag::EndOfRequest;
        let flags = RequestFlags::from(flags);

        assert_decode(&[0b0100_0001], &flags, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(flags: RequestFlags) {
        assert_encode_decode(&flags, ()).await;
    }
}

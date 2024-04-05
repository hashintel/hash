use std::io;

use enumflags2::BitFlags;
use error_stack::Result;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use crate::codec::{DecodePure, Encode};

#[enumflags2::bitflags]
#[repr(u8)]
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
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
    pub fn new(flags: impl Into<BitFlags<RequestFlag>>) -> Self {
        Self(flags.into())
    }

    pub fn contains(&self, flag: RequestFlag) -> bool {
        self.0.contains(flag)
    }

    pub fn flags(&self) -> BitFlags<RequestFlag> {
        self.0
    }

    pub fn remove(self, other: impl Into<BitFlags<RequestFlag>>) -> Self {
        Self(self.0 & !other.into())
    }

    pub fn insert(self, other: impl Into<BitFlags<RequestFlag>>) -> Self {
        Self(self.0 | other.into())
    }

    pub fn toggle(self, other: impl Into<BitFlags<RequestFlag>>) -> Self {
        Self(self.0 ^ other.into())
    }

    pub fn set(self, other: impl Into<BitFlags<RequestFlag>>, condition: bool) -> Self {
        if condition {
            self.insert(other)
        } else {
            self.remove(other)
        }
    }
}

impl From<BitFlags<RequestFlag>> for RequestFlags {
    fn from(flags: BitFlags<RequestFlag>) -> Self {
        Self(flags)
    }
}

impl Encode for RequestFlags {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.0.bits().encode(&mut write).await
    }
}

impl DecodePure for RequestFlags {
    type Error = io::Error;

    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        u8::decode_pure(read)
            .await
            .map(BitFlags::from_bits_truncate)
            .map(From::from)
    }
}

#[cfg(test)]
mod test {
    use enumflags2::BitFlags;

    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        request::flags::{RequestFlag, RequestFlags},
    };

    #[test]
    fn remove() {
        let flags = RequestFlags::new(
            RequestFlag::BeginOfRequest
                | RequestFlag::ContainsAuthorization
                | RequestFlag::EndOfRequest,
        );

        let flags = flags.remove(RequestFlag::BeginOfRequest);

        assert_eq!(
            flags.flags(),
            RequestFlag::ContainsAuthorization | RequestFlag::EndOfRequest
        );

        // if we remove the flag again, nothing should change
        let flags = flags.remove(RequestFlag::BeginOfRequest);

        assert_eq!(
            flags.flags(),
            RequestFlag::ContainsAuthorization | RequestFlag::EndOfRequest
        );
    }

    #[test]
    fn insert() {
        let flags = RequestFlags::new(RequestFlag::ContainsAuthorization);

        let flags = flags.insert(RequestFlag::BeginOfRequest);

        assert_eq!(
            flags.flags(),
            RequestFlag::BeginOfRequest | RequestFlag::ContainsAuthorization
        );

        // if we insert the flag again, nothing should change
        let flags = flags.insert(RequestFlag::BeginOfRequest);

        assert_eq!(
            flags.flags(),
            RequestFlag::BeginOfRequest | RequestFlag::ContainsAuthorization
        );
    }

    #[test]
    fn toggle() {
        let flags = RequestFlags::new(RequestFlag::BeginOfRequest);

        let flags = flags.toggle(RequestFlag::BeginOfRequest);

        assert_eq!(flags.flags(), BitFlags::empty());

        // if we toggle the flag again, the flag should be set
        let flags = flags.toggle(RequestFlag::BeginOfRequest);

        assert_eq!(flags.flags(), RequestFlag::BeginOfRequest);
    }

    #[test]
    fn set() {
        let flags = RequestFlags::new(RequestFlag::BeginOfRequest);

        let flags = flags.set(RequestFlag::BeginOfRequest, false);

        assert_eq!(flags.flags(), BitFlags::empty());

        // if we remove the flag again, nothing should change
        let flags = flags.set(RequestFlag::BeginOfRequest, false);

        assert_eq!(flags.flags(), BitFlags::empty());

        // if we set the flag again, the flag should be set
        let flags = flags.set(RequestFlag::BeginOfRequest, true);

        assert_eq!(flags.flags(), RequestFlag::BeginOfRequest);

        // if we set the flag again, the flag should be set, nothing should change
        let flags = flags.set(RequestFlag::BeginOfRequest, true);

        assert_eq!(flags.flags(), RequestFlag::BeginOfRequest);
    }

    #[tokio::test]
    async fn encode() {
        let flags = RequestFlag::BeginOfRequest
            | RequestFlag::ContainsAuthorization
            | RequestFlag::EndOfRequest;
        let flags = RequestFlags::new(flags);

        assert_encode(&flags, &[0b1100_0001]).await;

        let flags = RequestFlag::BeginOfRequest | RequestFlag::ContainsAuthorization;
        let flags = RequestFlags::new(flags);

        assert_encode(&flags, &[0b1100_0000]).await;

        let flags = RequestFlag::BeginOfRequest | RequestFlag::EndOfRequest;
        let flags = RequestFlags::new(flags);

        assert_encode(&flags, &[0b1000_0001]).await;

        let flags = RequestFlag::ContainsAuthorization | RequestFlag::EndOfRequest;
        let flags = RequestFlags::new(flags);

        assert_encode(&flags, &[0b0100_0001]).await;
    }

    #[tokio::test]
    async fn decode() {
        let flags = RequestFlag::BeginOfRequest
            | RequestFlag::ContainsAuthorization
            | RequestFlag::EndOfRequest;
        let flags = RequestFlags::new(flags);

        assert_decode(&[0b1100_0001], &flags, ()).await;

        let flags = RequestFlag::BeginOfRequest | RequestFlag::ContainsAuthorization;
        let flags = RequestFlags::new(flags);

        assert_decode(&[0b1100_0000], &flags, ()).await;

        let flags = RequestFlag::BeginOfRequest | RequestFlag::EndOfRequest;
        let flags = RequestFlags::new(flags);

        assert_decode(&[0b1000_0001], &flags, ()).await;

        let flags = RequestFlag::ContainsAuthorization | RequestFlag::EndOfRequest;
        let flags = RequestFlags::new(flags);

        assert_decode(&[0b0100_0001], &flags, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn encode_decode(flags: RequestFlags) {
        assert_encode_decode(&flags, ()).await;
    }
}

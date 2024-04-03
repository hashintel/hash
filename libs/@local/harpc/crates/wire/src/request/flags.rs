use std::io;

use enumflags2::BitFlags;
use error_stack::Result;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use crate::codec::{DecodePure, Encode};

#[enumflags2::bitflags]
#[repr(u8)]
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum RequestFlags {
    // Computed flags
    BeginOfRequest = 0b1000_0000,
    ContainsAuthorization = 0b0100_0000,
    // Controlled flags
    EndOfRequest = 0b0000_0001,
}

impl Encode for BitFlags<RequestFlags> {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        write.write_u8(self.bits()).await.map_err(From::from)
    }
}

impl DecodePure for BitFlags<RequestFlags> {
    type Error = io::Error;

    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        read.read_u8()
            .await
            .map(BitFlags::from_bits_truncate)
            .map_err(From::from)
    }
}

#[cfg(test)]
mod test {
    use crate::{
        codec::test::{assert_decode, assert_encode},
        request::flags::RequestFlags,
    };

    #[tokio::test]
    async fn encode() {
        let flags = RequestFlags::BeginOfRequest
            | RequestFlags::ContainsAuthorization
            | RequestFlags::EndOfRequest;

        assert_encode(&flags, &[0b1100_0001]).await;

        let flags = RequestFlags::BeginOfRequest | RequestFlags::ContainsAuthorization;

        assert_encode(&flags, &[0b1100_0000]).await;

        let flags = RequestFlags::BeginOfRequest | RequestFlags::EndOfRequest;

        assert_encode(&flags, &[0b1000_0001]).await;

        let flags = RequestFlags::ContainsAuthorization | RequestFlags::EndOfRequest;

        assert_encode(&flags, &[0b0100_0001]).await;
    }

    #[tokio::test]
    async fn decode() {
        let flags = RequestFlags::BeginOfRequest
            | RequestFlags::ContainsAuthorization
            | RequestFlags::EndOfRequest;

        assert_decode(&[0b1100_0001], &flags, ()).await;

        let flags = RequestFlags::BeginOfRequest | RequestFlags::ContainsAuthorization;

        assert_decode(&[0b1100_0000], &flags, ()).await;

        let flags = RequestFlags::BeginOfRequest | RequestFlags::EndOfRequest;

        assert_decode(&[0b1000_0001], &flags, ()).await;

        let flags = RequestFlags::ContainsAuthorization | RequestFlags::EndOfRequest;

        assert_decode(&[0b0100_0001], &flags, ()).await;
    }
}

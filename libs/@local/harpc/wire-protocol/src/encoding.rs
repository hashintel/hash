use std::io;

use enumflags2::BitFlags;
use error_stack::{Report, Result, ResultExt};
use tokio::io::{AsyncRead, AsyncWrite};

use crate::codec::{DecodePure, Encode};

// TODO: this might be problematic in the future, as it only allows for 16 different encodings.
// we could also use a more packed encoding, in that case `Accept` would need to not be `BitFlag`
// but instead a `ItemOrVec` that's encoded, which is a bit more messy.
#[enumflags2::bitflags]
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
#[repr(u16)]
pub enum Encoding {
    Raw = 1 << 0,
    Json = 1 << 1,
    Cbor = 1 << 2,
}

impl Encode for Encoding {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        (*self as u16).encode(write).await
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum EncodingDecodeError {
    #[error("unknown encoding")]
    Unknown,
    #[error("ambiguous, either multiple or no encoding was provided")]
    Ambiguous,
    #[error("io error")]
    Io,
}

impl DecodePure for Encoding {
    type Error = EncodingDecodeError;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let value = u16::decode_pure(read)
            .await
            .change_context(EncodingDecodeError::Io)?;

        let flags = BitFlags::from_bits(value).change_context(EncodingDecodeError::Unknown)?;

        let Some(flag) = flags.exactly_one() else {
            return Err(Report::new(EncodingDecodeError::Ambiguous));
        };

        Ok(flag)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct AcceptEncoding(
    #[cfg_attr(test, strategy(proptest::arbitrary::any::<u16>()))]
    #[cfg_attr(test, map(BitFlags::from_bits_truncate))]
    BitFlags<Encoding>,
);

impl AcceptEncoding {
    pub fn new(flags: impl Into<BitFlags<Encoding>>) -> Self {
        Self(flags.into())
    }

    #[must_use]
    pub const fn from_flags(flags: BitFlags<Encoding>) -> Self {
        Self(flags)
    }

    #[must_use]
    pub const fn empty() -> Self {
        Self(BitFlags::EMPTY)
    }
}

impl Encode for AcceptEncoding {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.0.bits().encode(write).await
    }
}

impl DecodePure for AcceptEncoding {
    type Error = EncodingDecodeError;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let value = u16::decode_pure(read)
            .await
            .change_context(EncodingDecodeError::Io)?;

        Ok(Self(BitFlags::from_bits_truncate(value)))
    }
}

#[cfg(test)]
mod test {
    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        encoding::{AcceptEncoding, Encoding},
    };

    #[tokio::test]
    async fn encode_encoding() {
        assert_encode(&Encoding::Raw, &[0x00, 0x01]).await;
    }

    #[tokio::test]
    async fn decode_encoding() {
        assert_decode(&[0x00, 0x01], &Encoding::Raw, ()).await;
    }

    #[tokio::test]
    async fn encode_accept_encoding() {
        assert_encode(
            &AcceptEncoding::new(Encoding::Raw | Encoding::Json),
            &[0x00, 0x03],
        )
        .await;
    }

    #[tokio::test]
    async fn decode_accept_encoding() {
        assert_decode(
            &[0x00, 0x03],
            &AcceptEncoding::new(Encoding::Raw | Encoding::Json),
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec_encoding(encoding: Encoding) {
        assert_encode_decode(&encoding, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec_accept_encoding(encoding: AcceptEncoding) {
        assert_encode_decode(&encoding, ()).await;
    }
}

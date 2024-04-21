use std::io;

use error_stack::{Report, Result, ResultExt};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use crate::codec::{DecodePure, Encode};

const MAGIC_LEN: usize = 5;
const MAGIC: &[u8; MAGIC_LEN] = b"harpc";

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ProtocolVersion(u8);

impl ProtocolVersion {
    pub const V1: Self = Self(1);
}

impl Encode for ProtocolVersion {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.0.encode(write).await
    }
}

impl DecodePure for ProtocolVersion {
    type Error = io::Error;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        u8::decode_pure(read).await.map(Self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct Protocol {
    pub version: ProtocolVersion,
}

impl Encode for Protocol {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        write.write_all(MAGIC).await?;
        self.version.encode(write).await
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum ProtocolDecodeError {
    #[error("invalid packet identifier: expected {expected:?}, actual {actual:?}")]
    InvalidIdentifier {
        expected: &'static [u8],
        actual: [u8; MAGIC_LEN],
    },
    #[error("io error")]
    Io,
}

impl DecodePure for Protocol {
    type Error = ProtocolDecodeError;

    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let mut buffer = [0_u8; MAGIC_LEN];
        read.read_exact(&mut buffer)
            .await
            .change_context(ProtocolDecodeError::Io)?;

        if buffer != *MAGIC {
            return Err(Report::new(ProtocolDecodeError::InvalidIdentifier {
                expected: MAGIC,
                actual: buffer,
            }));
        }

        let version = ProtocolVersion::decode_pure(read)
            .await
            .change_context(ProtocolDecodeError::Io)?;

        Ok(Self { version })
    }
}

#[cfg(test)]
mod test {
    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        protocol::ProtocolVersion,
    };

    #[tokio::test]
    async fn encode_version() {
        assert_encode(&ProtocolVersion::V1, &[0x01_u8]).await;
    }

    #[tokio::test]
    async fn decode_version() {
        assert_decode(&[0x01], &ProtocolVersion::V1, ()).await;
    }

    #[tokio::test]
    async fn encode_protocol() {
        assert_encode(
            &crate::protocol::Protocol {
                version: ProtocolVersion::V1,
            },
            &[b'h', b'a', b'r', b'p', b'c', 0x01],
        )
        .await;
    }

    #[tokio::test]
    async fn decode_protocol() {
        assert_decode(
            &[b'h', b'a', b'r', b'p', b'c', 0x01],
            &crate::protocol::Protocol {
                version: ProtocolVersion::V1,
            },
            (),
        )
        .await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec_version(version: ProtocolVersion) {
        assert_encode_decode(&version, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec_protocol(protocol: crate::protocol::Protocol) {
        assert_encode_decode(&protocol, ()).await;
    }
}

use std::io;

use error_stack::{Report, Result, ResultExt};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    pin,
};

use crate::codec::{Decode, Encode};

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

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        self.0.encode(write).await
    }
}

impl Decode for ProtocolVersion {
    type Context = ();
    type Error = io::Error;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        u8::decode(read, ()).await.map(Self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct Protocol {
    pub version: ProtocolVersion,
}

impl Encode for Protocol {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

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

impl Decode for Protocol {
    type Context = ();
    type Error = ProtocolDecodeError;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        pin!(read);

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

        let version = ProtocolVersion::decode(read, ())
            .await
            .change_context(ProtocolDecodeError::Io)?;

        Ok(Self { version })
    }
}

#[cfg(test)]
mod test {
    use expect_test::expect;

    use super::Protocol;
    use crate::{
        codec::test::{assert_codec, assert_decode, assert_encode},
        protocol::ProtocolVersion,
    };

    #[tokio::test]
    async fn encode_version() {
        assert_encode(&ProtocolVersion::V1, expect!["01"]).await;
    }

    #[tokio::test]
    async fn decode_version() {
        assert_decode::<ProtocolVersion>(&[0x01], expect![[r#"
            ProtocolVersion(
                1,
            )
        "#]], ()).await;
    }

    #[tokio::test]
    async fn encode_protocol() {
        assert_encode(
            &crate::protocol::Protocol {
                version: ProtocolVersion::V1,
            },
            expect!["686172706301"],
        )
        .await;
    }

    #[tokio::test]
    async fn decode_protocol() {
        assert_decode::<Protocol>(&[b'h', b'a', b'r', b'p', b'c', 0x01], expect![[r#"
            Protocol {
                version: ProtocolVersion(
                    1,
                ),
            }
        "#]], ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec_version(version: ProtocolVersion) {
        assert_codec(&version, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec_protocol(protocol: crate::protocol::Protocol) {
        assert_codec(&protocol, ()).await;
    }
}

use core::fmt::Display;
use std::io;

use error_stack::{Report, Result, ResultExt};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    pin,
};

use crate::codec::{Decode, Encode};

const MAGIC_LEN: usize = 5;
const MAGIC: &[u8; MAGIC_LEN] = b"harpc";

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum ProtocolVersionDecodeError {
    #[error("unsupported version {actual}, expected {expected}")]
    Unsupported {
        actual: ProtocolVersion,
        expected: ProtocolVersion,
    },
    #[error("io error")]
    Io,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ProtocolVersion(#[cfg_attr(test, strategy(1..=1_u8))] u8);

impl ProtocolVersion {
    pub const V1: Self = Self(1);
}

impl Display for ProtocolVersion {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        let Self(version) = self;

        write!(f, "v{version}")
    }
}

impl Encode for ProtocolVersion {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        self.0.encode(write).await
    }
}

impl Decode for ProtocolVersion {
    type Context = ();
    type Error = ProtocolVersionDecodeError;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        let version = u8::decode(read, ())
            .await
            .map(Self)
            .change_context(ProtocolVersionDecodeError::Io)?;

        if version != Self::V1 {
            return Err(Report::new(ProtocolVersionDecodeError::Unsupported {
                actual: version,
                expected: Self::V1,
            }));
        }

        Ok(version)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum ProtocolDecodeError {
    #[error("invalid packet identifier: expected {expected:?}, actual {actual:?}")]
    InvalidIdentifier {
        expected: &'static [u8],
        actual: [u8; MAGIC_LEN],
    },
    #[error("indalid protocol version")]
    InvalidVersion,
    #[error("io error")]
    Io,
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
            .change_context(ProtocolDecodeError::InvalidVersion)?;

        Ok(Self { version })
    }
}

#[cfg(test)]
mod test {
    use expect_test::expect;

    use super::Protocol;
    use crate::{
        codec::{
            test::{assert_codec, assert_decode, assert_encode},
            Decode,
        },
        protocol::{ProtocolVersion, ProtocolVersionDecodeError},
    };

    #[tokio::test]
    async fn encode_version() {
        assert_encode(&ProtocolVersion::V1, expect![[r#"
            0x01
        "#]]).await;
    }

    #[tokio::test]
    async fn decode_version() {
        assert_decode(&[0x01], &ProtocolVersion::V1, ()).await;
    }

    #[tokio::test]
    async fn decode_version_invalid() {
        let report = ProtocolVersion::decode(&[0x02_u8] as &[_], ())
            .await
            .expect_err("should fail to decode");

        let context = *report.current_context();

        assert_eq!(
            context,
            ProtocolVersionDecodeError::Unsupported {
                actual: ProtocolVersion(2),
                expected: ProtocolVersion::V1
            }
        );
    }

    #[tokio::test]
    async fn encode_protocol() {
        assert_encode(
            &crate::protocol::Protocol {
                version: ProtocolVersion::V1,
            },
            expect![[r#"
                 'h'  'a'  'r'  'p'  'c' 0x01
            "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn decode_protocol() {
        assert_decode(
            &[b'h', b'a', b'r', b'p', b'c', 0x01],
            &Protocol {
                version: ProtocolVersion::V1,
            },
            (),
        )
        .await;
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

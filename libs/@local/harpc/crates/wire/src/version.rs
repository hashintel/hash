use std::io;

use error_stack::{Report, Result};
use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt};

use crate::codec::{DecodePure, Encode};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct Version {
    pub major: u8,
    pub minor: u8,
}

impl Encode for Version {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        write.write_u8(self.major).await.map_err(Report::from)?;
        write.write_u8(self.minor).await.map_err(Report::from)
    }
}

impl DecodePure for Version {
    type Error = io::Error;

    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let major = u8::decode_pure(&mut read).await?;
        let minor = u8::decode_pure(read).await?;
        Ok(Self { major, minor })
    }
}

#[cfg(test)]
mod test {
    use super::Version;
    use crate::codec::test::assert_encode;

    #[tokio::test]
    async fn encode() {
        let version = Version { major: 1, minor: 2 };
        assert_encode(&version, &[1, 2]).await;
    }
}

use std::io;

use error_stack::{Report, Result};
use tokio::io::{AsyncWrite, AsyncWriteExt};

use crate::codec::Encode;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
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

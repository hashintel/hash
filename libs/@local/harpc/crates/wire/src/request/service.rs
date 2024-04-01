use std::io;

use error_stack::Result;
use tokio::io::{AsyncWrite, AsyncWriteExt};

use crate::{encode::Encode, version::Version};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ServiceId(u16);

impl ServiceId {
    #[must_use]
    pub const fn new(value: u16) -> Self {
        Self(value)
    }

    #[must_use]
    pub const fn value(self) -> u16 {
        self.0
    }

    #[must_use]
    pub const fn is_reserved(self) -> bool {
        // 0xFxxx are reserved for internal use
        self.0 & 0xF000 == 0xF000
    }
}

impl Encode for ServiceId {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        write.write_u16(self.0).await.map_err(From::from)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ServiceVersion(Version);

impl ServiceVersion {
    #[must_use]
    pub const fn new(major: u8, minor: u8) -> Self {
        Self(Version { major, minor })
    }

    #[must_use]
    pub const fn major(self) -> u8 {
        self.0.major
    }

    #[must_use]
    pub const fn minor(self) -> u8 {
        self.0.minor
    }
}

impl Encode for ServiceVersion {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.0.encode(write).await
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Service {
    pub id: ServiceId,
    pub version: ServiceVersion,
}

impl Encode for Service {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.id.encode(&mut write).await?;
        self.version.encode(write).await
    }
}

#[cfg(test)]
mod test {
    use crate::{
        encode::test::{assert_encode, encode_value},
        request::service::{Service, ServiceId, ServiceVersion},
        version::Version,
    };

    #[tokio::test]
    async fn encode_id() {
        let id = ServiceId::new(0x1234);
        // value should be encoded in big-endian
        assert_encode(&id, &[0x12, 0x34]).await;
    }

    #[tokio::test]
    async fn encode_version() {
        let version = ServiceVersion::new(1, 2);

        assert_encode(&version, &[1, 2]).await;

        // encoding should match that of Version
        let expected = encode_value(&Version {
            major: version.major(),
            minor: version.minor(),
        })
        .await;

        assert_encode(&version, &expected).await;
    }

    #[tokio::test]
    async fn encode() {
        let service = Service {
            id: ServiceId::new(0x1234),
            version: ServiceVersion::new(0x56, 0x78),
        };

        assert_encode(&service, &[0x12, 0x34, 0x56, 0x78]).await;
    }
}

use std::io;

use error_stack::Result;
use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt};

use crate::{
    codec::{DecodePure, Encode},
    version::Version,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
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

impl DecodePure for ServiceId {
    type Error = io::Error;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        u16::decode_pure(read).await.map(Self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
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

impl DecodePure for ServiceVersion {
    type Error = io::Error;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        Version::decode_pure(read).await.map(Self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
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

impl DecodePure for Service {
    type Error = io::Error;

    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let id = ServiceId::decode_pure(&mut read).await?;
        let version = ServiceVersion::decode_pure(read).await?;

        Ok(Self { id, version })
    }
}

#[cfg(test)]
mod test {
    use crate::{
        codec::test::{assert_decode, assert_encode, assert_encode_decode},
        request::service::{Service, ServiceId, ServiceVersion},
    };

    #[tokio::test]
    async fn encode_id() {
        let id = ServiceId::new(0x1234);
        // value should be encoded in big-endian
        assert_encode(&id, &[0x12, 0x34]).await;
    }

    #[tokio::test]
    async fn decode_id() {
        // value should be decoded in big-endian
        assert_decode(&[0x12, 0x34], &ServiceId::new(0x1234), ()).await;
    }

    #[tokio::test]
    async fn encode_version() {
        let version = ServiceVersion::new(0x56, 0x78);
        assert_encode(&version, &[0x56, 0x78]).await;
    }

    #[tokio::test]
    async fn decode_version() {
        assert_decode(&[0x56, 0x78], &ServiceVersion::new(0x56, 0x78), ()).await;
    }

    #[tokio::test]
    async fn encode() {
        let service = Service {
            id: ServiceId::new(0x1234),
            version: ServiceVersion::new(0x56, 0x78),
        };

        assert_encode(&service, &[0x12, 0x34, 0x56, 0x78]).await;
    }

    #[tokio::test]
    async fn decode() {
        let service = Service {
            id: ServiceId::new(0x1234),
            version: ServiceVersion::new(0x56, 0x78),
        };

        assert_decode(&[0x12, 0x34, 0x56, 0x78], &service, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn encode_decode(service: Service) {
        assert_encode_decode(&service, ()).await;
    }
}

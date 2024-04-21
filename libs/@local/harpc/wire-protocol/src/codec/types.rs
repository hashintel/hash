use std::io;

use error_stack::{Report, Result};
use harpc_types::{
    procedure::ProcedureId,
    service::{ServiceId, ServiceVersion},
    version::Version,
};
use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt};

use crate::codec::{DecodePure, Encode};

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

impl Encode for ProcedureId {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.value().encode(&mut write).await
    }
}

impl DecodePure for ProcedureId {
    type Error = io::Error;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        u16::decode_pure(read).await.map(Self::new)
    }
}

impl Encode for ServiceId {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.value().encode(&mut write).await
    }
}

impl DecodePure for ServiceId {
    type Error = io::Error;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        u16::decode_pure(read).await.map(Self::new)
    }
}

impl Encode for ServiceVersion {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.value().encode(write).await
    }
}

impl DecodePure for ServiceVersion {
    type Error = io::Error;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        Version::decode_pure(read).await.map(From::from)
    }
}

#[cfg(test)]
mod test {

    use harpc_types::{
        service::{ServiceId, ServiceVersion},
        version::Version,
    };

    use crate::codec::test::{assert_decode, assert_encode, assert_encode_decode};

    #[tokio::test]
    async fn encode_version() {
        let version = Version { major: 1, minor: 2 };
        assert_encode(&version, &[1, 2]).await;
    }

    #[tokio::test]
    async fn decode_version() {
        assert_decode(&[0x01, 0x02], &Version { major: 1, minor: 2 }, ()).await;
    }

    #[tokio::test]
    async fn encode_service_id() {
        let id = ServiceId::new(0x1234);
        // value should be encoded in big-endian
        assert_encode(&id, &[0x12, 0x34]).await;
    }

    #[tokio::test]
    async fn decode_service_id() {
        // value should be decoded in big-endian
        assert_decode(&[0x12, 0x34], &ServiceId::new(0x1234), ()).await;
    }

    #[tokio::test]
    async fn encode_service_version() {
        let version = ServiceVersion::new(0x56, 0x78);
        assert_encode(&version, &[0x56, 0x78]).await;
    }

    #[tokio::test]
    async fn decode_service_version() {
        assert_decode(&[0x56, 0x78], &ServiceVersion::new(0x56, 0x78), ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec_service_id(id: ServiceId) {
        assert_encode_decode(&id, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec_service_version(version: ServiceVersion) {
        assert_encode_decode(&version, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec_version(version: Version) {
        assert_encode_decode(&version, ()).await;
    }
}

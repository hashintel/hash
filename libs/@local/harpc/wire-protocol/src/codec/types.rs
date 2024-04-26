use std::io;

use error_stack::{Report, Result};
use harpc_types::{procedure::ProcedureId, service::ServiceId, version::Version};
use tokio::{
    io::{AsyncRead, AsyncWrite, AsyncWriteExt},
    pin,
};

use super::Decode;
use crate::codec::Encode;

impl Encode for Version {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

        write.write_u8(self.major).await.map_err(Report::from)?;
        write.write_u8(self.minor).await.map_err(Report::from)
    }
}

impl Decode for Version {
    type Context = ();
    type Error = io::Error;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        pin!(read);

        let major = u8::decode(&mut read, ()).await?;
        let minor = u8::decode(read, ()).await?;
        Ok(Self { major, minor })
    }
}

impl Encode for ProcedureId {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        self.value().encode(write).await
    }
}

impl Decode for ProcedureId {
    type Context = ();
    type Error = io::Error;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        u16::decode(read, ()).await.map(Self::new)
    }
}

impl Encode for ServiceId {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        self.value().encode(write).await
    }
}

impl Decode for ServiceId {
    type Context = ();
    type Error = io::Error;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        u16::decode(read, ()).await.map(Self::new)
    }
}

#[cfg(test)]
mod test {

    use harpc_types::{
        service::{ServiceId, ServiceVersion},
        version::Version,
    };

    use crate::codec::test::{assert_codec, assert_decode, assert_encode};

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
        assert_codec(&id, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec_service_version(version: ServiceVersion) {
        assert_codec(&version, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec_version(version: Version) {
        assert_codec(&version, ()).await;
    }
}

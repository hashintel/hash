use const_fnv1a_hash::fnv1a_hash_str_64;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};

use crate::harpc::transport::codec::{
    decode, decode::DecodeBinary, encode, encode::EncodeBinary, Limit,
};

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ServiceId(u64);

impl ServiceId {
    #[must_use]
    pub const fn new(value: u64) -> Self {
        Self(value)
    }

    #[must_use]
    pub const fn derive(value: &str) -> Self {
        Self(fnv1a_hash_str_64(value))
    }
}

impl EncodeBinary for ServiceId {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        encode::write_varint(self.0, io).await
    }
}

impl DecodeBinary for ServiceId {
    async fn decode_binary<T>(io: &mut T, _: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        let value = decode::read_varint(io).await?;
        let value = Self::new(value);

        Ok(value)
    }
}

// TODO: semver (major, minor, patch) ~> u8, u8, u8 ~> only unique on major service version
// TODO: service should have tag: availableSince, deprecatedSince
// TODO: introspection for what services are available and which versions through a service
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub struct ServiceVersion(u8);

impl ServiceVersion {
    pub(crate) const fn new(value: u8) -> Self {
        Self(value)
    }
}

impl EncodeBinary for ServiceVersion {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        io.write_u8(self.0).await
    }
}

impl DecodeBinary for ServiceVersion {
    async fn decode_binary<T>(io: &mut T, _: Limit) -> std::io::Result<Self>
    where
        T: AsyncRead + Unpin + Send,
    {
        let value = io.read_u8().await?;
        let value = Self::new(value);

        Ok(value)
    }
}

pub trait Service: Send + Sync {
    type Procedures;

    const ID: ServiceId;
    const VERSION: ServiceVersion;
}

#[cfg(test)]
mod test {
    use crate::harpc::{
        service::{ServiceId, ServiceVersion},
        transport::codec::test::assert_binary,
    };

    assert_binary![
        binary_service_id_zero(ServiceId::new(0x00), &[0x00]),
        binary_service_id_varint(ServiceId::new(0x80), &[0x80, 0x01]),
    ];

    assert_binary![binary_service_version(ServiceVersion::new(0xFF), &[0xFF]),];
}

use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::harpc::transport::codec::{decode::DecodeBinary, encode::EncodeBinary};

/// # Version
///
/// ## Binary Packet Layout
///
/// ```text
///  0                   1                   2                   3
///  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |T|F. |P|
/// +-+-+-+-+
///
/// * TransportVersion (1 byte)
/// * Flags (2 bytes)
/// * ServiceVersion (1 byte)
/// total 4 bytes
/// ```
///
/// `Flags` is specified in the [`RequestHeader`], [`TransportVersion`] and [`ServiceVersion`] are
/// fixed size integers. This allows for 256 different transport versions, and 256 different
/// protocol versions.
///
/// [`RequestHeader`]: crate::harpc::transport::message::request::RequestHeader
#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub(crate) struct Version {
    pub(crate) transport: TransportVersion,
    pub(crate) service: ServiceVersion,
}

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub(crate) struct TransportVersion(u8);

impl TransportVersion {
    pub(crate) const fn new(value: u8) -> Self {
        Self(value)
    }
}

impl EncodeBinary for TransportVersion {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        io.write_u8(self.0).await
    }
}

impl DecodeBinary for TransportVersion {
    async fn decode_binary<T>(
        io: &mut T,
        _: crate::harpc::transport::codec::Limit,
    ) -> std::io::Result<Self>
    where
        T: tokio::io::AsyncRead + Unpin + Send,
    {
        let value = io.read_u8().await?;
        let value = Self::new(value);

        Ok(value)
    }
}

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub(crate) struct ServiceVersion(u8);

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
    async fn decode_binary<T>(
        io: &mut T,
        _: crate::harpc::transport::codec::Limit,
    ) -> std::io::Result<Self>
    where
        T: tokio::io::AsyncRead + Unpin + Send,
    {
        let value = io.read_u8().await?;
        let value = Self::new(value);

        Ok(value)
    }
}

#[cfg(test)]
mod test {
    use crate::harpc::transport::{
        codec::test::assert_binary,
        message::version::{ServiceVersion, TransportVersion},
    };
    assert_binary![
        binary_transport_version(TransportVersion::new(0xFE), &[0xFE]),
        binary_service_version(ServiceVersion::new(0xFF), &[0xFF]),
    ];
}

use crate::harpc::transport::codec::{decode::DecodeBinary, encode::EncodeBinary};

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub(crate) struct PayloadSize(u64);

impl PayloadSize {
    pub(crate) const fn new(value: u64) -> Self {
        Self(value)
    }

    #[must_use]
    pub(crate) const fn len(value: &[u8]) -> Self {
        Self(value.len() as u64)
    }

    pub(crate) const fn into_u64(self) -> u64 {
        self.0
    }

    #[must_use]
    #[allow(clippy::cast_possible_truncation)]
    pub(crate) const fn into_usize(self) -> usize {
        self.0 as usize
    }
}

impl PayloadSize {
    pub(crate) const fn exceeds(self, limit: u64) -> bool {
        self.0 > limit
    }
}

impl EncodeBinary for PayloadSize {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        crate::harpc::transport::codec::encode::write_varint(self.0, io).await
    }
}

impl DecodeBinary for PayloadSize {
    async fn decode_binary<T>(
        io: &mut T,
        _: crate::harpc::transport::codec::Limit,
    ) -> std::io::Result<Self>
    where
        T: tokio::io::AsyncRead + Unpin + Send,
    {
        let value = crate::harpc::transport::codec::decode::read_varint(io).await?;
        let value = Self::new(value);

        Ok(value)
    }
}

#[cfg(test)]
mod test {
    use crate::harpc::transport::{codec::test::assert_binary, message::size::PayloadSize};

    assert_binary![
        binary_payload_size_zero(PayloadSize::new(0x00), &[0x00]),
        binary_payload_size_varint(PayloadSize::new(0x80), &[0x80, 0x01]),
    ];
}

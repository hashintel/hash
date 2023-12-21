use tokio::io::{AsyncReadExt, AsyncWriteExt};
use uuid::Uuid;

use crate::harpc::transport::codec::{decode::DecodeBinary, encode::EncodeBinary};

#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
#[cfg_attr(target_arch = "wasm32", derive(tsify::Tsify))]
#[cfg_attr(target_arch = "wasm32", tsify(into_wasm_abi, from_wasm_abi))]
pub struct ActorId(#[cfg_attr(target_arch = "wasm32", tsify(type = "string"))] Uuid);

impl ActorId {
    #[must_use]
    pub const fn new(value: Uuid) -> Self {
        Self(value)
    }
}

impl From<Uuid> for ActorId {
    fn from(value: Uuid) -> Self {
        Self(value)
    }
}

impl EncodeBinary for ActorId {
    async fn encode_binary<T>(&self, io: &mut T) -> std::io::Result<()>
    where
        T: tokio::io::AsyncWrite + Unpin + Send,
    {
        io.write_all(self.0.as_bytes()).await
    }
}

impl DecodeBinary for ActorId {
    async fn decode_binary<T>(
        io: &mut T,
        _: crate::harpc::transport::codec::Limit,
    ) -> std::io::Result<Self>
    where
        T: tokio::io::AsyncRead + Unpin + Send,
    {
        let mut bytes = [0_u8; 16];
        io.read_exact(&mut bytes).await?;
        let value = Uuid::from_bytes(bytes);
        let value = Self::new(value);

        Ok(value)
    }
}

#[cfg(test)]
mod test {
    use uuid::Uuid;

    use crate::harpc::transport::{
        codec::test::{assert_binary, EXAMPLE_UUID},
        message::actor::ActorId,
    };

    assert_binary![
        binary_actor_id_nil(ActorId::new(Uuid::nil()), &[0_u8; 16]),
        binary_actor_id_example(ActorId::new(EXAMPLE_UUID), EXAMPLE_UUID.as_bytes()),
    ];
}

use std::io;

use error_stack::{Context, Result};
use futures::Future;
use graph_types::account::AccountId;
use tokio::io::{AsyncWrite, AsyncWriteExt};

pub trait Encode: Send + Sync {
    type Error: Context;

    fn encode(
        &self,
        write: impl AsyncWrite + Unpin + Send,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send;
}

impl Encode for AccountId {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        let buffer = self.into_uuid();

        write.write_all(buffer.as_bytes()).await.map_err(From::from)
    }
}

#[cfg(test)]
pub(crate) mod test {
    use super::Encode;

    #[track_caller]
    pub(crate) async fn encode_value<T>(value: &T) -> Vec<u8>
    where
        T: Encode,
    {
        let mut buffer = Vec::new();
        value
            .encode(&mut buffer)
            .await
            .expect("able to encode value");
        buffer
    }

    #[track_caller]
    pub(crate) async fn assert_encode<T>(value: &T, expected: &[u8])
    where
        T: Encode,
    {
        let buffer = encode_value(value).await;
        assert_eq!(buffer, expected);
    }
}

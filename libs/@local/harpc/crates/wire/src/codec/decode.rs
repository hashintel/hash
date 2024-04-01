use std::io;

use bytes::Bytes;
use error_stack::Context;
use graph_types::account::AccountId;
use tokio::io::{AsyncRead, AsyncReadExt};
use uuid::Uuid;

pub trait Decode: Send + Sync + Sized {
    type Error: Context;

    fn decode(
        read: impl AsyncRead + Unpin + Send,
    ) -> impl Future<Output = Result<Self, Self::Error>> + Send;
}

impl Decode for u16 {
    type Error = io::Error;

    #[expect(
        clippy::big_endian_bytes,
        reason = "u16 is encoded in big-endian format"
    )]
    async fn decode(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let mut buffer = [0; 2];
        read.read_exact(&mut buffer).await?;
        Ok(Self::from_be_bytes(buffer))
    }
}

impl Decode for Uuid {
    type Error = io::Error;

    async fn decode(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let mut buffer = [0; 16];
        read.read_exact(&mut buffer).await?;

        Ok(Self::from_bytes(buffer))
    }
}

impl Decode for AccountId {
    type Error = io::Error;

    async fn decode(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        Uuid::decode(read).await.map(Self::new)
    }
}

impl Decode for Bytes {
    type Error = io::Error;

    async fn decode(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let length = u16::decode(&mut read).await?;

        let mut buffer = vec![0; usize::from(length)];
        read.read_exact(&mut buffer).await?;

        Ok(Self::from(buffer))
    }
}

#[cfg(test)]
pub(crate) mod test {
    use core::fmt::Debug;

    use super::Decode;
    use crate::codec::{encode::test::encode_value, Encode};

    #[track_caller]
    pub(crate) async fn decode_value<T>(buffer: &[u8]) -> T
    where
        T: Decode,
    {
        let mut reader = std::io::Cursor::new(buffer);

        T::decode(&mut reader).await.expect("able to decode value")
    }

    #[track_caller]
    pub(crate) async fn assert_decode<T>(buffer: &[u8], expected: &T)
    where
        T: Debug + PartialEq + Decode,
    {
        let value: T = decode_value(buffer).await;

        assert_eq!(value, *expected);
    }

    #[track_caller]
    pub(crate) async fn assert_encode_decode<T>(value: &T)
    where
        T: Debug + PartialEq + Decode + Encode,
    {
        let buffer = encode_value(value).await;
        assert_decode(&buffer, value).await;
    }
}

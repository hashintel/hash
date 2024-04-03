use std::io;

use bytes::Bytes;
use error_stack::{Context, Result, ResultExt};
use graph_types::account::AccountId;
use tokio::io::{AsyncWrite, AsyncWriteExt};
use uuid::Uuid;

pub trait Encode: Send + Sync {
    type Error: Context;

    fn encode(
        &self,
        write: impl AsyncWrite + Unpin + Send,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send;
}

impl Encode for u8 {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        write.write_u8(*self).await.map_err(From::from)
    }
}

impl Encode for u16 {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        write.write_u16(*self).await.map_err(From::from)
    }
}

impl Encode for Uuid {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        write.write_all(self.as_bytes()).await.map_err(From::from)
    }
}

impl Encode for AccountId {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.as_uuid().encode(write).await
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum BytesEncodeError {
    #[error("io error")]
    Io,
    #[error("buffer exceeds 64KiB")]
    TooLarge,
}

impl Encode for Bytes {
    type Error = BytesEncodeError;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        // write the length in u16 (this is ok because we never send more than 64KiB).
        let length = u16::try_from(self.len()).change_context(BytesEncodeError::TooLarge)?;

        length
            .encode(&mut write)
            .await
            .change_context(BytesEncodeError::Io)?;

        write
            .write_all(self)
            .await
            .change_context(BytesEncodeError::Io)
    }
}

#[cfg(test)]
pub(crate) mod test {
    use core::fmt::Debug;

    use bytes::Bytes;
    use graph_types::account::AccountId;
    use uuid::Uuid;

    use super::{BytesEncodeError, Encode};

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

    #[track_caller]
    pub(crate) async fn assert_encode_error<T>(value: &T, expected: T::Error)
    where
        T: Encode,
        T::Error: Debug + PartialEq,
    {
        let result = value
            .encode(Vec::new())
            .await
            .expect_err("should fail to encode");

        let context = result.current_context();

        assert_eq!(*context, expected);
    }

    #[tokio::test]
    async fn encode_u16() {
        // BE encoding, u16 are small enough to not require varint encoding.
        assert_encode(&42_u16, &[0x00, 0x2A]).await;
        assert_encode(&0_u16, &[0x00, 0x00]).await;
        assert_encode(&u16::MAX, &[0xFF, 0xFF]).await;
    }

    #[tokio::test]
    async fn encode_uuid() {
        let uuid = Uuid::new_v4();
        assert_encode(&uuid, uuid.as_bytes()).await;
    }

    #[tokio::test]
    async fn encode_account_id() {
        let uuid = Uuid::new_v4();
        let id = AccountId::new(uuid);

        assert_encode(&id, uuid.as_bytes()).await;
    }

    #[tokio::test]
    async fn encode_bytes() {
        let bytes: Bytes = b"hello".to_vec().into();
        assert_encode(&bytes, &[0, 5, b'h', b'e', b'l', b'l', b'o']).await;
    }

    #[tokio::test]
    async fn encode_bytes_too_large() {
        let bytes: Bytes = vec![0; 64 * 1024 + 1].into();

        assert_encode_error(&bytes, BytesEncodeError::TooLarge).await;
    }
}

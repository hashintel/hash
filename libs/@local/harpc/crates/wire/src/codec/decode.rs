use std::io;

use bytes::Bytes;
use error_stack::{Context, Result};
use graph_types::account::AccountId;
use tokio::io::{AsyncRead, AsyncReadExt};
use uuid::Uuid;

pub trait DecodePure: Send + Sync + Sized {
    type Error: Context;

    fn decode_pure(
        read: impl AsyncRead + Unpin + Send,
    ) -> impl Future<Output = Result<Self, Self::Error>> + Send;
}

pub trait Decode: Send + Sync + Sized {
    type Context: Send + Sync = ();
    type Error: Context;

    fn decode(
        read: impl AsyncRead + Unpin + Send,
        context: Self::Context,
    ) -> impl Future<Output = Result<Self, Self::Error>> + Send;
}

impl<T> Decode for T
where
    T: DecodePure,
{
    type Context = ();
    type Error = T::Error;

    fn decode(
        read: impl AsyncRead + Unpin + Send,
        (): Self::Context,
    ) -> impl Future<Output = Result<Self, Self::Error>> + Send {
        T::decode_pure(read)
    }
}

impl DecodePure for u8 {
    type Error = io::Error;

    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        read.read_u8().await.map_err(From::from)
    }
}

impl DecodePure for u16 {
    type Error = io::Error;

    #[expect(
        clippy::big_endian_bytes,
        reason = "u16 is encoded in big-endian format"
    )]
    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let mut buffer = [0; 2];
        read.read_exact(&mut buffer).await?;
        Ok(Self::from_be_bytes(buffer))
    }
}

impl DecodePure for Uuid {
    type Error = io::Error;

    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let mut buffer = [0; 16];
        read.read_exact(&mut buffer).await?;

        Ok(Self::from_bytes(buffer))
    }
}

impl DecodePure for AccountId {
    type Error = io::Error;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        Uuid::decode_pure(read).await.map(Self::new)
    }
}

impl DecodePure for Bytes {
    type Error = io::Error;

    async fn decode_pure(mut read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        let length = u16::decode_pure(&mut read).await?;

        let mut buffer = vec![0; usize::from(length)];
        read.read_exact(&mut buffer).await?;

        Ok(Self::from(buffer))
    }
}

#[cfg(test)]
pub(crate) mod test {
    use core::fmt::Debug;

    use bytes::Bytes;
    use graph_types::account::AccountId;
    use uuid::Uuid;

    use super::Decode;
    use crate::codec::{encode::test::encode_value, Encode};

    #[track_caller]
    pub(crate) async fn decode_value<T>(buffer: &[u8], context: T::Context) -> T
    where
        T: Decode,
    {
        let mut reader = std::io::Cursor::new(buffer);

        let value = T::decode(&mut reader, context)
            .await
            .expect("able to decode value");

        // ensure that the entire buffer was consumed
        assert_eq!(reader.position(), buffer.len() as u64);

        value
    }

    #[track_caller]
    pub(crate) async fn assert_decode<T>(buffer: &[u8], expected: &T, context: T::Context)
    where
        T: Debug + PartialEq + Decode,
    {
        let value: T = decode_value(buffer, context).await;

        assert_eq!(value, *expected);
    }

    #[track_caller]
    pub(crate) async fn assert_encode_decode<T>(value: &T, context: T::Context)
    where
        T: Debug + PartialEq + Decode + Encode,
    {
        let buffer = encode_value(value).await;
        assert_decode(&buffer, value, context).await;
    }

    #[tokio::test]
    async fn decode_u16() {
        assert_decode(&[0x12, 0x23], &0x1223_u16, ()).await;
        assert_decode(&[0x00, 0x00], &u16::MIN, ()).await;
        assert_decode(&[0xFF, 0xFF], &u16::MAX, ()).await;
    }

    #[tokio::test]
    async fn decode_uuid() {
        let expected = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").expect("valid uuid");

        assert_decode(expected.as_bytes(), &expected, ()).await;
    }

    #[tokio::test]
    async fn decode_account_id() {
        let expected = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").expect("valid uuid");

        assert_decode(expected.as_bytes(), &AccountId::new(expected), ()).await;
    }

    #[tokio::test]
    async fn decode_bytes() {
        assert_decode(
            &[0x00, 0x05, 0x01, 0x02, 0x03, 0x04, 0x05],
            &Bytes::from(vec![1, 2, 3, 4, 5]),
            (),
        )
        .await;
    }
}

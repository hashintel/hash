use std::io;

use bytes::Bytes;
use error_stack::{Context, Result};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    pin,
};

pub trait Decode: Sized {
    type Context: Send + Sync = ();
    type Error: Context;

    fn decode(
        read: impl AsyncRead + Send,
        context: Self::Context,
    ) -> impl Future<Output = Result<Self, Self::Error>> + Send;
}

impl Decode for u8 {
    type Context = ();
    type Error = io::Error;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        pin!(read);

        read.read_u8().await.map_err(From::from)
    }
}

impl Decode for u16 {
    type Context = ();
    type Error = io::Error;

    #[expect(
        clippy::big_endian_bytes,
        reason = "u16 is encoded in big-endian format"
    )]
    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        pin!(read);

        let mut buffer = [0; 2];
        read.read_exact(&mut buffer).await?;
        Ok(Self::from_be_bytes(buffer))
    }
}

impl Decode for u32 {
    type Context = ();
    type Error = io::Error;

    #[expect(
        clippy::big_endian_bytes,
        reason = "u32 is encoded in big-endian format"
    )]
    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        pin!(read);

        let mut buffer = [0; 4];
        read.read_exact(&mut buffer).await?;
        Ok(Self::from_be_bytes(buffer))
    }
}

impl Decode for Bytes {
    type Context = ();
    type Error = io::Error;

    async fn decode(read: impl AsyncRead + Send, (): ()) -> Result<Self, Self::Error> {
        pin!(read);

        let length = u16::decode(&mut read, ()).await?;

        let mut buffer = vec![0; usize::from(length)];
        read.read_exact(&mut buffer).await?;

        Ok(Self::from(buffer))
    }
}

#[cfg(test)]
pub(crate) mod test {
    use core::fmt::Debug;

    use bytes::Bytes;

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
        T: Debug + PartialEq + Sync + Decode,
    {
        let value: T = decode_value(buffer, context).await;

        similar_asserts::assert_eq!(&value, expected);
    }

    #[track_caller]
    pub(crate) async fn assert_codec<T>(value: &T, context: T::Context)
    where
        T: Debug + PartialEq + Decode + Encode + Sync,
    {
        let buffer = encode_value(value).await;
        let decoded = decode_value(&buffer, context).await;

        assert_eq!(*value, decoded);
    }

    #[tokio::test]
    async fn decode_u16() {
        assert_decode(&[0x12, 0x23], &0x1223_u16, ()).await;
        assert_decode(&[0x00, 0x00], &0x0000_u16, ()).await;
        assert_decode(&[0xFF, 0xFF], &0xFFFF_u16, ()).await;
    }

    #[tokio::test]
    async fn decode_bytes() {
        assert_decode::<Bytes>(
            &[0x00, 0x05, 0x01, 0x02, 0x03, 0x04, 0x05],
            &Bytes::from_static(&[0x01, 0x02, 0x03, 0x04, 0x05]),
            (),
        )
        .await;
    }
}

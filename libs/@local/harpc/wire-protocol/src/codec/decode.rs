use std::io;

use bytes::{Buf, Bytes, BytesMut};
use error_stack::{Context, Report};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    pin,
};

use super::buffer::{Buffer, BufferError};

pub trait Decode: Sized {
    type Context: Send + Sync;
    type Error;

    fn decode<B>(buffer: &mut Buffer<B>, context: Self::Context) -> Result<Self, Self::Error>
    where
        B: Buf;
}

impl Decode for u8 {
    type Context = ();
    type Error = Report<BufferError>;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        buffer.next_number()
    }
}

impl Decode for u16 {
    type Context = ();
    type Error = Report<BufferError>;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        buffer.next_number()
    }
}

impl Decode for u32 {
    type Context = ();
    type Error = Report<BufferError>;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        buffer.next_number()
    }
}

impl Decode for Bytes {
    type Context = ();
    type Error = Report<BufferError>;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        let length = buffer.next_number::<u16>()?;

        buffer.next_bytes(length as usize)
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

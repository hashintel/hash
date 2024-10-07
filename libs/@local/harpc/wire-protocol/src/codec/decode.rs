use bytes::{Buf, Bytes};
use error_stack::{Context, Result};

use super::buffer::{Buffer, BufferError};

pub trait Decode: Sized {
    type Context: Send + Sync;
    type Error: Context;

    /// Decode a value from the buffer.
    ///
    /// # Errors
    ///
    /// Returns an error if the contained value is invalid, or the buffer is too short.
    fn decode<B>(buffer: &mut Buffer<B>, context: Self::Context) -> Result<Self, Self::Error>
    where
        B: Buf;
}

impl Decode for u8 {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        buffer.next_number()
    }
}

impl Decode for u16 {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        buffer.next_number()
    }
}

impl Decode for u32 {
    type Context = ();
    type Error = BufferError;

    fn decode<B>(buffer: &mut Buffer<B>, (): ()) -> Result<Self, Self::Error>
    where
        B: Buf,
    {
        buffer.next_number()
    }
}

impl Decode for Bytes {
    type Context = ();
    type Error = BufferError;

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
    use crate::codec::{Buffer, Encode, encode::test::encode_value};

    #[track_caller]
    pub(crate) fn decode_value<T>(bytes: impl Into<Bytes>, context: T::Context) -> T
    where
        T: Decode,
    {
        let mut bytes = bytes.into();
        let mut buffer = Buffer::new(&mut bytes);

        let value = T::decode(&mut buffer, context).expect("able to decode value");

        assert!(bytes.is_ascii());

        value
    }

    #[track_caller]
    pub(crate) fn assert_decode<T>(bytes: impl Into<Bytes>, expected: &T, context: T::Context)
    where
        T: Debug + PartialEq + Decode,
    {
        let value: T = decode_value(bytes, context);

        similar_asserts::assert_eq!(&value, expected);
    }

    #[track_caller]
    pub(crate) fn assert_decode_error<T>(
        bytes: impl Into<Bytes>,
        expected: &T::Error,
        context: T::Context,
    ) where
        T: Decode + Debug,
        T::Error: PartialEq,
    {
        let mut bytes = bytes.into();
        let mut buffer = Buffer::new(&mut bytes);

        let result = T::decode(&mut buffer, context).expect_err("should fail to encode");

        let context = result.current_context();

        assert_eq!(*context, *expected);
    }

    #[track_caller]
    pub(crate) fn assert_codec<T>(value: &T, context: T::Context)
    where
        T: Debug + PartialEq + Decode + Encode,
    {
        let bytes = encode_value(value);
        let decoded = decode_value(bytes, context);

        assert_eq!(*value, decoded);
    }

    #[test]
    fn decode_u16() {
        assert_decode(&[0x12_u8, 0x23] as &[_], &0x1223_u16, ());
        assert_decode(&[0x00_u8, 0x00] as &[_], &0x0000_u16, ());
        assert_decode(&[0xFF_u8, 0xFF] as &[_], &0xFFFF_u16, ());
    }

    #[test]
    fn decode_bytes() {
        assert_decode(
            &[0x00_u8, 0x05, 0x01, 0x02, 0x03, 0x04, 0x05] as &[_],
            &Bytes::from_static(&[0x01, 0x02, 0x03, 0x04, 0x05]),
            (),
        );
    }
}

use core::fmt::Debug;

use bytes::{BufMut, Bytes};
use error_stack::{Context, Report, Result, ResultExt};

use super::{buffer::Buffer, BufferError};

pub trait Encode {
    type Error: Context;

    /// Encode the value into the buffer.
    ///
    /// # Errors
    ///
    /// Returns an error if the buffer is not large enough or if the to be encoded value is invalid.
    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut;
}

impl Encode for u8 {
    type Error = BufferError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        buffer.push_number(*self)
    }
}

impl Encode for u16 {
    type Error = BufferError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        buffer.push_number(*self)
    }
}

impl Encode for u32 {
    type Error = BufferError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        buffer.push_number(*self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum BytesEncodeError {
    #[error("buffer exceeds 64 KiB")]
    TooLarge,
    #[error("buffer error")]
    Buffer,
}

impl Encode for Bytes {
    type Error = BytesEncodeError;

    fn encode<B>(&self, buffer: &mut Buffer<B>) -> Result<(), Self::Error>
    where
        B: BufMut,
    {
        // write the length in u16 (this is ok because we never send more than 64 KiB).
        let length = u16::try_from(self.len()).change_context(BytesEncodeError::TooLarge)?;

        // 32 bytes are always used for the request/response header
        if length > (u16::MAX - 32) {
            return Err(Report::new(BytesEncodeError::TooLarge));
        }

        buffer
            .push_number(length)
            .change_context(BytesEncodeError::Buffer)?;
        buffer
            .push_bytes(self)
            .change_context(BytesEncodeError::Buffer)?;

        Ok(())
    }
}

#[cfg(test)]
pub(crate) mod test {
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use core::fmt::Write;

    use bytes::{Bytes, BytesMut};
    use expect_test::{expect, Expect};

    use super::{BytesEncodeError, Encode};
    use crate::codec::Buffer;

    #[track_caller]
    pub(crate) fn encode_value<T>(value: &T) -> Bytes
    where
        T: Encode,
    {
        let mut bytes = BytesMut::new();
        let mut buffer = Buffer::new(&mut bytes);

        value
            .encode(&mut buffer)
            .expect("should be able to encode value");

        bytes.freeze()
    }

    #[track_caller]
    #[expect(clippy::needless_pass_by_value)]
    pub(crate) fn assert_encode<T>(value: &T, expected: Expect)
    where
        T: Encode + Sync,
    {
        let buffer = encode_value(value);

        // every line has 16 bytes, each byte at most is represented by 5 characters. With an
        // additional newline.
        let lines = buffer.len().div_ceil(16);
        let capacity = (lines * (16 * 5)) + lines;

        let mut output = String::with_capacity(capacity);

        // first section into lines (of size 16)
        let chunks = buffer.chunks(16);

        for chunk in chunks {
            for (index, &byte) in chunk.iter().enumerate() {
                if index > 0 {
                    output.push(' ');
                }

                if byte.is_ascii_graphic() || byte.is_ascii_whitespace() {
                    // at most is 4 characters, align to the right
                    let escaped = byte.escape_ascii();
                    // we never generate \xNN and never an empty string
                    assert!(escaped.len() <= 2 && escaped.len() > 0);

                    let padding = 2 - escaped.len();

                    match padding {
                        0 => {}
                        1 => output.push('b'),
                        _ => unreachable!(),
                    }

                    output.push('\'');
                    for char in escaped {
                        output.push(char as char);
                    }
                    output.push('\'');
                } else {
                    write!(output, "{byte:#04X}").expect("infallible");
                }
            }

            output.push('\n');
        }

        expected.assert_eq(&output);
    }

    #[track_caller]
    pub(crate) fn assert_encode_error<T>(value: &T, expected: &T::Error)
    where
        T: Encode,
        T::Error: PartialEq,
    {
        let mut bytes = BytesMut::new();
        let mut buffer = Buffer::new(&mut bytes);

        let result = value
            .encode(&mut buffer)
            .expect_err("should fail to encode");

        let context = result.current_context();

        assert_eq!(*context, *expected);
    }

    #[test]
    fn encode_u16() {
        assert_encode(
            &42_u16,
            expect![[r#"
                0x00 b'*'
            "#]],
        );

        assert_encode(
            &0_u16,
            expect![[r#"
            0x00 0x00
        "#]],
        );

        assert_encode(
            &u16::MAX,
            expect![[r#"
            0xFF 0xFF
        "#]],
        );
    }

    #[test]
    fn encode_bytes() {
        assert_encode(
            &Bytes::from_static(&[0x68, 0x65, 0x6C, 0x6C, 0x6F]),
            expect![[r#"
                0x00 0x05 b'h' b'e' b'l' b'l' b'o'
            "#]],
        );
    }

    #[test]
    fn encode_bytes_too_large() {
        let bytes: Bytes = vec![0; u16::MAX as usize + 1].into();

        assert_encode_error(&bytes, &BytesEncodeError::TooLarge);
    }

    #[test]
    fn encode_bytes_too_large_u16() {
        // 32 bytes are header, so this is still to large
        let bytes: Bytes = vec![0; u16::MAX as usize + 16].into();

        assert_encode_error(&bytes, &BytesEncodeError::TooLarge);
    }

    #[test]
    fn encode_bytes_full() {
        let bytes: Bytes = vec![0; u16::MAX as usize - 32].into();

        let value = encode_value(&bytes);
        assert_eq!(value.len(), (u16::MAX as usize) - 32 + 2);
    }
}

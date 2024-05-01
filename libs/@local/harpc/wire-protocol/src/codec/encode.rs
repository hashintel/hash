use std::io;

use bytes::Bytes;
use error_stack::{Context, Report, Result, ResultExt};
use tokio::{
    io::{AsyncWrite, AsyncWriteExt},
    pin,
};

pub trait Encode {
    type Error: Context;

    fn encode(
        &self,
        write: impl AsyncWrite + Send,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send;
}

impl Encode for u8 {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

        write.write_u8(*self).await.map_err(From::from)
    }
}

impl Encode for u16 {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

        write.write_u16(*self).await.map_err(From::from)
    }
}

impl Encode for u32 {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

        write.write_u32(*self).await.map_err(From::from)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum BytesEncodeError {
    #[error("io error")]
    Io,
    #[error("buffer exceeds 64 KiB")]
    TooLarge,
}

impl Encode for Bytes {
    type Error = BytesEncodeError;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

        // write the length in u16 (this is ok because we never send more than 64 KiB).
        let length = u16::try_from(self.len()).change_context(BytesEncodeError::TooLarge)?;

        // 32 bytes are always used for the request/response header
        if length > (u16::MAX - 32) {
            return Err(Report::new(BytesEncodeError::TooLarge));
        }

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
    #![allow(clippy::needless_raw_strings, clippy::needless_raw_string_hashes)]
    use core::fmt::{Debug, Write};

    use bytes::Bytes;
    use expect_test::{expect, Expect};

    use super::{BytesEncodeError, Encode};

    #[track_caller]
    pub(crate) async fn encode_value<T>(value: &T) -> Vec<u8>
    where
        T: Encode + Sync,
    {
        let mut buffer = Vec::new();
        value
            .encode(&mut buffer)
            .await
            .expect("should be able to encode value");
        buffer
    }

    #[track_caller]
    pub(crate) async fn assert_encode<T>(value: &T, expected: Expect)
    where
        T: Encode + Sync,
    {
        let buffer = Bytes::from(encode_value(value).await);

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
    pub(crate) async fn assert_encode_error<T>(value: &T, expected: T::Error)
    where
        T: Encode + Sync,
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
        assert_encode(
            &42_u16,
            expect![[r#"
                0x00 b'*'
            "#]],
        )
        .await;
        assert_encode(
            &0_u16,
            expect![[r#"
            0x00 0x00
        "#]],
        )
        .await;
        assert_encode(
            &u16::MAX,
            expect![[r#"
            0xFF 0xFF
        "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn encode_bytes() {
        assert_encode(
            &Bytes::from_static(&[0x68, 0x65, 0x6C, 0x6C, 0x6F]),
            expect![[r#"
                0x00 0x05 b'h' b'e' b'l' b'l' b'o'
            "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn encode_bytes_too_large() {
        let bytes: Bytes = vec![0; u16::MAX as usize + 1].into();

        assert_encode_error(&bytes, BytesEncodeError::TooLarge).await;
    }

    #[tokio::test]
    async fn encode_bytes_too_large_u16() {
        // 32 bytes are header, so this is still to large
        let bytes: Bytes = vec![0; u16::MAX as usize + 16].into();

        assert_encode_error(&bytes, BytesEncodeError::TooLarge).await;
    }

    #[tokio::test]
    async fn encode_bytes_full() {
        let bytes: Bytes = vec![0; u16::MAX as usize - 32].into();

        let value = encode_value(&bytes).await;
        assert_eq!(value.len(), (u16::MAX as usize) - 32 + 2);
    }
}

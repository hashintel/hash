use std::io;

use bytes::Bytes;
use error_stack::{Context, Result, ResultExt};
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
    #[error("buffer exceeds 64KiB")]
    TooLarge,
}

impl Encode for Bytes {
    type Error = BytesEncodeError;

    async fn encode(&self, write: impl AsyncWrite + Send) -> Result<(), Self::Error> {
        pin!(write);

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

        expected.assert_debug_eq(&buffer);
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
        assert_encode(&42_u16, expect![[r#"
            b"\0*"
        "#]]).await;
        assert_encode(&0_u16, expect![[r#"
            b"\0\0"
        "#]]).await;
        assert_encode(&u16::MAX, expect![[r#"
            b"\xff\xff"
        "#]]).await;
    }

    #[tokio::test]
    async fn encode_bytes() {
        assert_encode(
            &Bytes::from_static(&[0x68, 0x65, 0x6C, 0x6C, 0x6F]),
            expect![[r#"
                b"\0\x05hello"
            "#]],
        )
        .await;
    }

    #[tokio::test]
    async fn encode_bytes_too_large() {
        let bytes: Bytes = vec![0; 64 * 1024 + 1].into();

        assert_encode_error(&bytes, BytesEncodeError::TooLarge).await;
    }
}

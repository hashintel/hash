use std::io;

use error_stack::{Report, Result, ResultExt};

use crate::codec::{DecodePure, Encode};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub enum ResponseKind {
    Ok,
    Err,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
#[error("Unknown response kind")]
pub struct UnknownResponseKind;

impl TryFrom<u8> for ResponseKind {
    type Error = Report<UnknownResponseKind>;

    fn try_from(value: u8) -> core::result::Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Ok),
            1 => Ok(Self::Err),
            _ => Err(Report::new(UnknownResponseKind)),
        }
    }
}

impl From<ResponseKind> for u8 {
    fn from(kind: ResponseKind) -> Self {
        match kind {
            ResponseKind::Ok => 0,
            ResponseKind::Err => 1,
        }
    }
}

impl Encode for ResponseKind {
    type Error = io::Error;

    async fn encode(
        &self,
        write: impl tokio::io::AsyncWrite + Unpin + Send,
    ) -> Result<(), Self::Error> {
        u8::from(*self).encode(write).await
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, thiserror::Error)]
pub enum ResponseKindDecodeError {
    #[error("Unknown response kind")]
    Unknown,
    #[error("IO error")]
    Io,
}

impl DecodePure for ResponseKind {
    type Error = ResponseKindDecodeError;

    async fn decode_pure(
        read: impl tokio::io::AsyncRead + Unpin + Send,
    ) -> Result<Self, Self::Error> {
        let value = u8::decode_pure(read)
            .await
            .change_context(ResponseKindDecodeError::Io)?;

        Self::try_from(value).change_context(ResponseKindDecodeError::Unknown)
    }
}

#[cfg(test)]
mod test {
    use std::io::Cursor;

    use crate::{
        codec::{
            test::{assert_decode, assert_encode, assert_encode_decode},
            DecodePure,
        },
        response::kind::{ResponseKind, ResponseKindDecodeError},
    };

    #[tokio::test]
    async fn encode() {
        assert_encode(&ResponseKind::Ok, &[0x00]).await;
    }

    #[tokio::test]
    async fn decode() {
        assert_decode(&[0x00], &ResponseKind::Ok, ()).await;
    }

    #[tokio::test]
    async fn decode_unknown() {
        let mut cursor = Cursor::new([0x02_u8]);

        let report = ResponseKind::decode_pure(&mut cursor)
            .await
            .expect_err("unknown response kind");

        let context = report.current_context();

        assert_eq!(*context, ResponseKindDecodeError::Unknown);
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn codec(kind: ResponseKind) {
        assert_encode_decode(&kind, ()).await;
    }
}

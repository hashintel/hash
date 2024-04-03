use std::io;

use error_stack::{Report, Result};
use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt};

use crate::codec::{DecodePure, Encode};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct ProcedureId(u16);

impl ProcedureId {
    #[must_use]
    pub const fn new(value: u16) -> Self {
        Self(value)
    }

    #[must_use]
    pub const fn value(self) -> u16 {
        self.0
    }

    #[must_use]
    pub const fn is_reserved(self) -> bool {
        // 0xFxxx are reserved for internal use
        self.0 & 0xF000 == 0xF000
    }
}

impl Encode for ProcedureId {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        write.write_u16(self.0).await.map_err(Report::from)
    }
}

impl DecodePure for ProcedureId {
    type Error = io::Error;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        u16::decode_pure(read).await.map(Self)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(test, derive(test_strategy::Arbitrary))]
pub struct Procedure {
    pub id: ProcedureId,
}

impl Encode for Procedure {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.id.encode(write).await
    }
}

impl DecodePure for Procedure {
    type Error = io::Error;

    async fn decode_pure(read: impl AsyncRead + Unpin + Send) -> Result<Self, Self::Error> {
        Ok(Self {
            id: ProcedureId::decode_pure(read).await?,
        })
    }
}

#[cfg(test)]
mod test {
    use super::{Procedure, ProcedureId};
    use crate::codec::test::{assert_decode, assert_encode, assert_encode_decode};

    #[tokio::test]
    async fn encode_id() {
        let id = ProcedureId::new(0x1234);

        // encoding should be BE
        assert_encode(&id, &[0x12, 0x34]).await;
    }

    #[tokio::test]
    async fn decode_id() {
        let id = ProcedureId::new(0x1234);

        // decoding should be BE
        assert_decode(&[0x12, 0x34], &id, ()).await;
    }

    #[tokio::test]
    async fn encode() {
        let id = ProcedureId::new(0x1234);
        let procedure = super::Procedure { id };

        // encoding should be BE
        assert_encode(&procedure, &[0x12, 0x34]).await;
    }

    #[tokio::test]
    async fn decode() {
        let id = ProcedureId::new(0x1234);
        let procedure = super::Procedure { id };

        // decoding should be BE
        assert_decode(&[0x12, 0x34], &procedure, ()).await;
    }

    #[test_strategy::proptest(async = "tokio")]
    async fn encode_decode(id: Procedure) {
        assert_encode_decode(&id, ()).await;
    }
}

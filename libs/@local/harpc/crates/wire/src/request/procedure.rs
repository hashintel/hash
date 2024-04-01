use std::io;

use error_stack::{Report, Result};
use tokio::io::{AsyncWrite, AsyncWriteExt};

use crate::codec::Encode;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Procedure {
    pub id: ProcedureId,
}

impl Encode for Procedure {
    type Error = io::Error;

    async fn encode(&self, write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.id.encode(write).await
    }
}

#[cfg(test)]
mod test {
    use super::ProcedureId;
    use crate::codec::test::assert_encode;

    #[tokio::test]
    async fn encode_id() {
        let id = ProcedureId::new(0x1234);

        // encoding should be BE
        assert_encode(&id, &[0x12, 0x34]).await;
    }

    #[tokio::test]
    async fn encode() {
        let id = ProcedureId::new(0x1234);
        let procedure = super::Procedure { id };

        // encoding should be BE
        assert_encode(&procedure, &[0x12, 0x34]).await;
    }
}

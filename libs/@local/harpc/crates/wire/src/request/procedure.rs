use std::io;

use error_stack::{Report, Result};
use tokio::io::{AsyncWrite, AsyncWriteExt};

use crate::encode::Encode;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ProcedureId(u16);

impl ProcedureId {
    pub fn new(value: u16) -> Self {
        Self(value)
    }

    pub fn value(&self) -> u16 {
        self.0
    }

    pub fn is_reserved(&self) -> bool {
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

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.id.encode(write).await
    }
}

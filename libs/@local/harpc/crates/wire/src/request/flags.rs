use std::io;

use enumflags2::BitFlags;
use error_stack::{Report, Result};
use tokio::io::{AsyncWrite, AsyncWriteExt};

use crate::encode::Encode;

#[enumflags2::bitflags]
#[repr(u8)]
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum RequestFlags {
    // Computed flags
    BeginOfRequest = 0b1000_0000,
    ContainsAuthorization = 0b0100_0000,
    // Controlled flags
    EndOfRequest = 0b0000_0001,
}

impl Encode for BitFlags<RequestFlags> {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        write.write_u8(self.bits()).await.map_err(Report::from)
    }
}

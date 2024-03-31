use std::io;

use error_stack::Result;
use tokio::io::{AsyncWrite, AsyncWriteExt};

use crate::{encode::Encode, version::Version};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ServiceId(u16);

impl ServiceId {
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

impl Encode for ServiceId {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        write.write_u16(self.0).await.map_err(From::from)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ServiceVersion(Version);

impl ServiceVersion {
    pub fn new(major: u8, minor: u8) -> Self {
        Self(Version { major, minor })
    }

    pub fn major(&self) -> u8 {
        self.0.major
    }

    pub fn minor(&self) -> u8 {
        self.0.minor
    }
}

impl Encode for ServiceVersion {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.0.encode(write).await
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Service {
    pub id: ServiceId,
    pub version: ServiceVersion,
}

impl Encode for Service {
    type Error = io::Error;

    async fn encode(&self, mut write: impl AsyncWrite + Unpin + Send) -> Result<(), Self::Error> {
        self.id.encode(&mut write).await?;
        self.version.encode(write).await
    }
}

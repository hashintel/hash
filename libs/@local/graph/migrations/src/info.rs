use alloc::borrow::Cow;
use core::{error::Error, fmt};
use std::path::PathBuf;

use bytes::BytesMut;
use postgres_types::{FromSql, IsNull, ToSql, Type};

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum InvalidMigrationFile {
    #[display("Could not load file: {}", _0.display())]
    IoError(#[error(ignore)] PathBuf),
    #[display("Missing file name in ipath: {}", _0.display())]
    MissingFileName(#[error(ignore)] PathBuf),
    #[display("invalid file name `{_0}`. expected format: v{{number}}__{{name}}.rs")]
    InvalidFileName(#[error(ignore)] String),
}

#[derive(Copy, Clone, PartialEq, Eq, Hash)]
pub struct Digest([u8; 32]);

impl From<[u8; 32]> for Digest {
    fn from(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }
}

impl fmt::Debug for Digest {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        for byte in &self.0 {
            write!(fmt, "{byte:02x}")?;
        }
        Ok(())
    }
}

impl<'a> FromSql<'a> for Digest {
    postgres_types::accepts!(BYTEA);

    fn from_sql(ty: &Type, raw: &'a [u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        Ok(Self(<&[u8]>::from_sql(ty, raw)?.try_into()?))
    }
}

impl ToSql for Digest {
    postgres_types::to_sql_checked!();

    postgres_types::accepts!(BYTEA);

    fn to_sql(
        &self,
        ty: &Type,
        out: &mut BytesMut,
    ) -> Result<IsNull, Box<dyn Error + Sync + Send>> {
        self.0.as_slice().to_sql(ty, out)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MigrationInfo {
    pub number: u32,
    pub name: Cow<'static, str>,
    pub size: usize,
    pub digest: Digest,
}

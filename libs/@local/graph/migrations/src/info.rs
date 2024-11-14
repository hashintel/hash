use core::{error::Error, fmt};
use std::{
    fs,
    path::{Path, PathBuf},
};

use bytes::BytesMut;
use error_stack::{Report, ResultExt as _};
use postgres_types::{FromSql, IsNull, ToSql, Type};
use sha2::{Digest as _, Sha256};

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
    pub name: String,
    pub size: usize,
    pub digest: Digest,
}

impl MigrationInfo {
    /// Load the `MigrationInfo` from a file.
    ///
    /// A migration file is expected to have the following format `v{{number}}__{{name}}.rs` where
    /// `{{number}}` is the migration number, and `{{name}}` is the migration name.
    ///
    /// # Errors
    ///
    /// - [`IoError`] if the file could not be read
    /// - [`MissingFileName`] if the file name is missing
    /// - [`InvalidFileName`] if the file name is not in the expected format
    ///
    /// [`IoError`]: InvalidMigrationFile::IoError
    /// [`MissingFileName`]: InvalidMigrationFile::MissingFileName
    /// [`InvalidFileName`]: InvalidMigrationFile::InvalidFileName
    #[expect(
        clippy::needless_pass_by_value,
        reason = "False positive, the path is used as a reference"
    )]
    pub fn from_path<P>(path: P) -> Result<Self, Report<InvalidMigrationFile>>
    where
        P: AsRef<Path> + Send,
    {
        let path = path.as_ref();

        let file_content = fs::read_to_string(path)
            .change_context_lazy(|| InvalidMigrationFile::IoError(path.to_path_buf()))?;

        let file_name = path
            .file_name()
            .ok_or_else(|| InvalidMigrationFile::MissingFileName(path.to_path_buf()))?
            .to_string_lossy();

        let (number, name) = file_name
            .split_once("__")
            .ok_or_else(|| InvalidMigrationFile::InvalidFileName(file_name.clone().into_owned()))?;

        Ok(Self {
            number: number
                .strip_prefix('v')
                .ok_or_else(|| {
                    InvalidMigrationFile::InvalidFileName(file_name.clone().into_owned())
                })?
                .parse::<u32>()
                .change_context_lazy(|| {
                    InvalidMigrationFile::InvalidFileName(file_name.clone().into_owned())
                })?,
            name: name
                .strip_suffix(".rs")
                .ok_or_else(|| {
                    InvalidMigrationFile::InvalidFileName(file_name.clone().into_owned())
                })?
                .to_owned(),
            size: file_content.len(),
            digest: Digest(Sha256::digest(file_content.as_bytes()).into()),
        })
    }
}

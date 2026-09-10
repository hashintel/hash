//! File access through explicitly configured storage backends.
//!
//! Local paths use the filesystem. An S3 path requires a loaded [`s3::S3`] backend in [`Storage`].

use camino::Utf8PathBuf;

use self::{error::StorageError, s3::S3};

pub(crate) mod error;
pub(crate) mod path;
pub(crate) mod s3;
#[cfg(test)]
mod tests;

pub(crate) struct Storage {
    s3: Option<S3>,

    scratch: Utf8PathBuf,
}

impl Storage {
    pub(crate) const fn new(s3: Option<S3>, scratch: Utf8PathBuf) -> Self {
        Self { s3, scratch }
    }

    /// Requires the configured S3 backend.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::S3Unavailable`] when the configuration has no S3 backend.
    pub(crate) const fn s3(&self) -> Result<&S3, StorageError> {
        match &self.s3 {
            Some(backend) => Ok(backend),
            None => Err(StorageError::S3Unavailable),
        }
    }
}

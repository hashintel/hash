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

pub struct Storage {
    s3: Option<S3>,

    scratch: Utf8PathBuf,
}

impl Storage {
    pub const fn new(scratch: Utf8PathBuf) -> Self {
        Self { s3: None, scratch }
    }

    pub fn in_temp_dir() -> Self {
        let scratch = std::env::temp_dir();
        let scratch = Utf8PathBuf::from_path_buf(scratch).expect("paths should be utf-8");

        Self::new(scratch)
    }

    pub fn set_s3(&mut self, s3: aws_sdk_s3::Client) {
        self.s3 = Some(S3::new(s3));
    }

    pub fn with_s3(self, s3: aws_sdk_s3::Client) -> Self {
        Self {
            s3: Some(S3::new(s3)),
            scratch: self.scratch,
        }
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

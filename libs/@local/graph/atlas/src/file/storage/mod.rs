//! File access through explicitly configured storage backends.
//!
//! Local paths use the filesystem. An S3 path requires a loaded [`s3::S3`] backend in [`Storage`].

use camino::Utf8PathBuf;

use self::{error::StorageError, s3::S3};
use crate::integrity::Sha256Digest;

pub(crate) mod error;
mod local;
pub(crate) mod path;
pub(crate) mod s3;

#[derive(Debug)]
enum RevisionKind {
    Local(Sha256Digest),
    Bucket(s3::ETag),
}

/// A backend-specific content identity captured with an opened file.
///
/// Local revisions identify the complete file contents by SHA-256. S3 revisions retain the
/// response's opaque entity tag. Use the revision only with the path that produced it.
#[derive(Debug)]
pub(crate) struct Revision(RevisionKind);

/// A precondition checked atomically with destination replacement.
#[derive(Debug)]
pub(crate) enum WriteCondition {
    /// Replaces the destination regardless of its current contents.
    Any,
    /// Creates the destination only when it does not exist.
    Absent,
    /// Replaces the destination only when its content identity matches the captured revision.
    Match(Revision),
}

impl WriteCondition {
    fn as_s3(&self) -> Result<s3::WriteCondition<'_>, StorageError> {
        match self {
            Self::Any => Ok(s3::WriteCondition::Any),
            Self::Absent => Ok(s3::WriteCondition::Absent),
            Self::Match(Revision(RevisionKind::Bucket(etag))) => {
                Ok(s3::WriteCondition::Match(etag.as_ref()))
            }
            Self::Match(Revision(RevisionKind::Local(_))) => Err(StorageError::RevisionMismatch),
        }
    }
}

#[derive(Debug)]
pub struct Storage {
    s3: Option<S3>,

    scratch: Utf8PathBuf,
}

impl Storage {
    /// Create a new [`Storage`] with the specified scratch directory.
    pub const fn new(scratch: Utf8PathBuf) -> Self {
        Self { s3: None, scratch }
    }

    /// Create a new [`Storage`] with a temporary scratch directory.
    ///
    /// # Panics
    ///
    /// Panics if the scratch directory is not a valid UTF-8 path.
    #[must_use]
    pub fn in_temp_dir() -> Self {
        let scratch = std::env::temp_dir();
        let scratch = Utf8PathBuf::from_path_buf(scratch).expect("paths should be utf-8");

        Self::new(scratch)
    }

    /// Set the S3 client for this [`Storage`].
    pub fn set_s3(&mut self, s3: aws_sdk_s3::Client) {
        self.s3 = Some(S3::new(s3));
    }

    /// Set the S3 client for this [`Storage`].
    #[must_use]
    pub fn with_s3(self, s3: aws_sdk_s3::Client) -> Self {
        Self {
            s3: Some(S3::new(s3)),
            scratch: self.scratch,
        }
    }

    pub(crate) const fn s3(&self) -> Result<&S3, StorageError> {
        match &self.s3 {
            Some(backend) => Ok(backend),
            None => Err(StorageError::S3Unavailable),
        }
    }
}

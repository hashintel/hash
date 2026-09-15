//! File access through explicitly configured storage backends.
//!
//! Local paths use the filesystem. An S3 path requires a loaded [`s3::S3`] backend in [`Storage`].

use std::io;

use camino::Utf8PathBuf;
use tokio::fs;
use uuid::Uuid;

use self::{error::StorageError, s3::S3};
use super::generation::ScratchDirectory;
use crate::integrity::Sha256Digest;

pub(crate) mod error;
mod local;
pub(crate) mod path;
pub(crate) mod s3;

/// A content identity in the form the backend that produced it reports.
#[derive(Debug)]
enum RevisionKind {
    /// The complete file contents, hashed on open.
    Local(Sha256Digest),
    /// The entity tag the object response carried.
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

impl<'this> TryFrom<&'this WriteCondition> for s3::WriteCondition<'this> {
    type Error = StorageError;

    fn try_from(value: &'this WriteCondition) -> Result<Self, Self::Error> {
        match value {
            WriteCondition::Any => Ok(s3::WriteCondition::Any),
            WriteCondition::Absent => Ok(s3::WriteCondition::Absent),
            WriteCondition::Match(Revision(RevisionKind::Bucket(etag))) => {
                Ok(s3::WriteCondition::Match(etag.as_ref()))
            }
            WriteCondition::Match(Revision(RevisionKind::Local(_))) => {
                Err(StorageError::RevisionMismatch)
            }
        }
    }
}

impl TryFrom<&WriteCondition> for local::WriteCondition {
    type Error = StorageError;

    fn try_from(value: &WriteCondition) -> Result<Self, Self::Error> {
        match value {
            WriteCondition::Any => Ok(Self::Any),
            WriteCondition::Absent => Ok(Self::Absent),
            WriteCondition::Match(Revision(RevisionKind::Bucket(_))) => {
                Err(StorageError::RevisionMismatch)
            }
            &WriteCondition::Match(Revision(RevisionKind::Local(digest))) => {
                Ok(Self::Match(digest))
            }
        }
    }
}

/// The backends and the scratch directory a file path resolves against.
///
/// [`Self::set_s3`] and [`Self::with_s3`] supply the client. Downloading an object writes into
/// the scratch directory this value carries.
#[derive(Debug)]
pub struct Storage {
    s3: Option<S3>,

    scratch: ScratchDirectory,
}

impl Storage {
    /// Create a new [`Storage`] with the specified scratch directory.
    ///
    /// The directory must already exist when a remote download resolves through it. By default
    /// the value carries no S3 backend.
    #[must_use]
    pub const fn new(scratch: Utf8PathBuf) -> Self {
        Self {
            s3: None,
            scratch: ScratchDirectory::new(scratch),
        }
    }
}

impl Storage {
    /// Create a new [`Storage`] with a temporary scratch directory.
    ///
    /// # Errors
    ///
    /// Returns an error if the scratch directory could not be created.
    ///
    /// # Panics
    ///
    /// Panics if the scratch directory is not a valid UTF-8 path.
    pub async fn in_temp_dir() -> io::Result<Self> {
        let scratch = std::env::temp_dir();
        let scratch = Utf8PathBuf::from_path_buf(scratch).expect("paths should be utf-8");
        let scratch = scratch.join(format!("atlas-{}", Uuid::now_v7()));
        fs::create_dir_all(&scratch).await?;

        Ok(Self::new(scratch))
    }

    /// Set the S3 client for this [`Storage`].
    pub fn set_s3(&mut self, s3: aws_sdk_s3::Client) {
        self.s3 = Some(S3::new(s3));
    }

    /// Set the S3 client and return the updated [`Storage`].
    #[must_use]
    pub fn with_s3(self, s3: aws_sdk_s3::Client) -> Self {
        Self {
            s3: Some(S3::new(s3)),
            scratch: self.scratch,
        }
    }

    /// Borrow the configured S3 backend.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::S3Unavailable`] when the configuration carries no client.
    pub(crate) const fn s3(&self) -> Result<&S3, StorageError> {
        match &self.s3 {
            Some(backend) => Ok(backend),
            None => Err(StorageError::S3Unavailable),
        }
    }
}

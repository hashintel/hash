//! File access through explicitly configured storage backends.
//!
//! Local paths use the filesystem. An S3 path requires a loaded [`s3::S3`] backend in [`Storage`].

use std::io;

use camino::Utf8PathBuf;
use tokio::fs;
use uuid::Uuid;

use self::{error::StorageError, s3::S3};
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

impl WriteCondition {
    /// Restates the condition as the object-write precondition an S3 request carries.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::RevisionMismatch`] if the captured revision is a local one, which
    /// no object write can check.
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

// cannot use `has_significant_drop` (even though it does), because it tracks through references.
#[derive(Debug)]
struct ScratchStorage {
    directory: Utf8PathBuf,

    delete_on_drop: bool,
}

impl Drop for ScratchStorage {
    fn drop(&mut self) {
        if !self.delete_on_drop {
            return;
        }

        let directory = self.directory.clone();
        tokio::task::spawn(async move {
            if let Err(error) = tokio::fs::remove_dir_all(directory).await
                && error.kind() != core::io::ErrorKind::NotFound
            {
                tracing::error!(%error, "failed to remove scratch directory");
            }
        });
    }
}

/// The backends and the scratch directory a file path resolves against.
///
/// [`Self::set_s3`] and [`Self::with_s3`] supply the client. Downloading an object writes into
/// the scratch directory this value carries.
#[derive(Debug)]
pub struct Storage {
    s3: Option<S3>,

    scratch: ScratchStorage,
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
            scratch: ScratchStorage {
                directory: scratch,
                delete_on_drop: false,
            },
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

        let mut this = Self::new(scratch);
        this.scratch.delete_on_drop = true;
        Ok(this)
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

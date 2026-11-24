mod file;
mod namespace;
mod s3;
#[cfg(test)]
mod tests;
mod versioned;

use alloc::sync::Arc;

use error_stack::{Report, ResultExt as _};
use object_store::{ObjectStore, path::Path as Location};

pub use self::{namespace::IntegrationNamespace, s3::S3Bucket};
pub(crate) use self::{s3::open_bucket, versioned::CasVersion};

/// Reports why a file in the bucket could not be read or written.
#[derive(Debug, Clone, Copy, derive_more::Display, derive_more::Error)]
pub enum StorageError {
    #[display("the bucket's settings are invalid")]
    InvalidBucket,
    #[display("the key is not a path in the bucket")]
    InvalidKey,
    #[display("the file is larger than a versioned file may be")]
    TooLarge,
    #[display("the local file could not be read or written")]
    LocalFile,
    #[display("the bucket could not be read")]
    Read,
    #[display("the bucket could not be written")]
    Write,
}

/// One integration's place in the bucket, which holds everything its runs produce.
#[derive(Debug)]
pub struct Storage {
    store: Arc<dyn ObjectStore>,
    /// The bucket's settings with the namespace in its URI, or `None` for the in-memory store.
    bucket: Option<S3Bucket>,
}

impl Storage {
    /// Opens the place of `namespace` in `bucket`, below the prefix in the bucket's URI.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::InvalidBucket`] if the bucket's URI is not an `s3://` URI or its
    /// secret is not UTF-8. Credentials are checked by the first request, not here.
    pub fn s3(
        bucket: S3Bucket,
        namespace: &IntegrationNamespace,
    ) -> Result<Self, Report<StorageError>> {
        let bucket = S3Bucket {
            uri: format!("{}/{}", bucket.uri.trim_end_matches('/'), namespace.root()).into(),
            ..bucket
        };
        Ok(Self {
            store: s3::open(&bucket)?,
            bucket: Some(bucket),
        })
    }

    /// The bucket's settings, with the namespace in its URI, for code that opens its own
    /// connection to the bucket. `None` for the in-memory store.
    pub(crate) const fn bucket(&self) -> Option<&S3Bucket> {
        self.bucket.as_ref()
    }

    /// The in-memory store of `object_store`, for tests. It has no bucket.
    #[cfg(test)]
    pub(crate) fn memory() -> Self {
        Self {
            store: Arc::new(object_store::memory::InMemory::new()),
            bucket: None,
        }
    }
}

/// Parses `key` as the location of a file in the bucket.
///
/// # Errors
///
/// Returns [`StorageError::InvalidKey`] if `key` is empty, starts or ends with `/`, or has an
/// empty, `.` or `..` segment or a control character.
fn location(key: &str) -> Result<Location, Report<StorageError>> {
    let location = Location::parse(key).change_context(StorageError::InvalidKey)?;
    if location.as_ref().is_empty() || location.as_ref() != key {
        return Err(Report::new(StorageError::InvalidKey));
    }
    Ok(location)
}

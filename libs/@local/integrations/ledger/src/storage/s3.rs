use alloc::sync::Arc;
use core::{pin::Pin, str};

use error_stack::{Report, ResultExt as _};
use hash_crypto::Secret;
use object_store::{ObjectStore, aws::AmazonS3Builder, prefix::PrefixStore};

use super::StorageError;

/// An S3 bucket and the credentials to reach it.
#[derive(Debug)]
pub struct S3Bucket {
    /// The bucket and prefix files are stored under, as `s3://bucket/prefix`.
    pub uri: Box<str>,
    pub region: Box<str>,
    /// An S3-compatible endpoint such as MinIO, addressed with path-style URLs.
    pub endpoint: Option<Box<str>>,
    pub use_ssl: bool,
    pub key_id: Box<str>,
    pub secret: Pin<Box<Secret<[u8]>>>,
}

// Origin: `ArtifactStore::from_url` for `s3://` URLs in labs `pocs/integrations_rs/src/blob.rs`,
// configured from `S3Bucket` instead of environment variables.
/// Opens `bucket` as an object store rooted at the bucket, without the prefix in its URI, for
/// callers that add their own path.
///
/// # Errors
///
/// Returns [`StorageError::InvalidBucket`] if the bucket's URI is not an `s3://` URI, its secret is
/// not UTF-8, or the store cannot be built.
pub(crate) fn open_bucket(bucket: &S3Bucket) -> Result<Arc<dyn ObjectStore>, Report<StorageError>> {
    let location = BucketLocation::of(bucket)?;
    let secret =
        str::from_utf8(bucket.secret.expose()).change_context(StorageError::InvalidBucket)?;
    let mut builder = AmazonS3Builder::new()
        .with_bucket_name(location.name)
        .with_region(&*bucket.region)
        .with_access_key_id(&*bucket.key_id)
        .with_secret_access_key(secret);
    if let Some(endpoint) = &bucket.endpoint {
        let scheme = if bucket.use_ssl { "https" } else { "http" };
        builder = builder
            .with_endpoint(format!("{scheme}://{endpoint}"))
            .with_allow_http(!bucket.use_ssl)
            .with_virtual_hosted_style_request(false);
    }
    Ok(Arc::new(
        builder
            .build()
            .change_context(StorageError::InvalidBucket)?,
    ))
}

/// Opens `bucket` as an object store, scoped to the prefix in its URI.
pub(super) fn open(bucket: &S3Bucket) -> Result<Arc<dyn ObjectStore>, Report<StorageError>> {
    let location = BucketLocation::of(bucket)?;
    let store = open_bucket(bucket)?;
    Ok(if location.prefix.is_empty() {
        store
    } else {
        Arc::new(PrefixStore::new(store, location.prefix))
    })
}

/// The parts of a bucket's `s3://bucket/prefix` URI.
struct BucketLocation<'uri> {
    name: &'uri str,
    prefix: &'uri str,
}

impl<'uri> BucketLocation<'uri> {
    fn of(bucket: &'uri S3Bucket) -> Result<Self, Report<StorageError>> {
        let path = bucket
            .uri
            .strip_prefix("s3://")
            .ok_or_else(|| Report::new(StorageError::InvalidBucket))?;
        let (name, prefix) = path.split_once('/').unwrap_or((path, ""));
        Ok(Self { name, prefix })
    }
}

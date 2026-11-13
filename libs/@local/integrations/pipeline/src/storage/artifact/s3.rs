use alloc::sync::Arc;
use core::str;

use error_stack::{Report, ResultExt as _};
use object_store::{ObjectStore, aws::AmazonS3Builder, prefix::PrefixStore};

use crate::storage::{ArtifactError, S3Bucket};

// Origin: `ArtifactStore::from_url` for `s3://` URLs in labs `pocs/integrations_rs/src/blob.rs`,
// configured from `S3Bucket` instead of environment variables.
/// Opens `bucket` as an object store, scoped to the prefix in its URI.
pub(super) fn open(bucket: &S3Bucket) -> Result<Arc<dyn ObjectStore>, Report<ArtifactError>> {
    let (name, prefix) = bucket
        .uri
        .strip_prefix("s3://")
        .map(|path| path.split_once('/').unwrap_or((path, "")))
        .ok_or_else(|| Report::new(ArtifactError::Read))?;
    let secret = str::from_utf8(bucket.secret.expose()).change_context(ArtifactError::Read)?;
    let mut builder = AmazonS3Builder::new()
        .with_bucket_name(name)
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
    let store = builder.build().change_context(ArtifactError::Read)?;
    Ok(if prefix.is_empty() {
        Arc::new(store)
    } else {
        Arc::new(PrefixStore::new(store, prefix))
    })
}

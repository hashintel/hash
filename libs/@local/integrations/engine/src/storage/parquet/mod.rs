mod local;
mod s3;

use alloc::sync::Arc;
use std::{fs, path::PathBuf};

use error_stack::{Report, ResultExt as _};
use tempfile::TempDir;
use tokio::sync::Mutex;

use super::{ArtifactError, ArtifactKey, S3Bucket};
use crate::SourceCapture;

/// The outcome of storing an artifact.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Stored {
    /// The artifact was stored.
    Created,
    /// An artifact was already stored at the key and was kept.
    Exists,
}

/// Stores Parquet artifacts through DuckDB: files written once and never replaced.
///
/// New artifacts are published in a staging directory and then stored. Dropping the storage
/// deletes the staging directory, so staged and downloaded artifacts can be read only while the
/// storage exists.
#[derive(Debug)]
pub struct ParquetStorage {
    staging: TempDir,
    backend: Backend,
}

#[derive(Debug)]
enum Backend {
    Local(PathBuf),
    S3 {
        bucket: Arc<S3Bucket>,
        /// Makes checking for an artifact and uploading one a single step within this process.
        stores: Mutex<()>,
    },
}

impl ParquetStorage {
    /// Keeps artifacts in the local directory `root`.
    ///
    /// # Errors
    ///
    /// Returns [`ArtifactError::Write`] if `root` or its staging directory cannot be created.
    pub fn local(root: PathBuf) -> Result<Self, Report<ArtifactError>> {
        fs::create_dir_all(&root).change_context(ArtifactError::Write)?;
        // Staging inside the root keeps it on the same file system, so storing is a hard link.
        let staging = tempfile::Builder::new()
            .prefix(".staging")
            .tempdir_in(&root)
            .change_context(ArtifactError::Write)?;
        Ok(Self {
            staging,
            backend: Backend::Local(root),
        })
    }

    /// Keeps artifacts in `bucket`, staged in `staging` on their way in and out.
    ///
    /// Storing checks for an existing artifact and then uploads, which is a single step only
    /// within this process. Across processes it relies on one writer per key, which one run per
    /// integration provides.
    #[must_use]
    pub fn s3(bucket: S3Bucket, staging: TempDir) -> Self {
        Self {
            staging,
            backend: Backend::S3 {
                bucket: Arc::new(bucket),
                stores: Mutex::new(()),
            },
        }
    }

    // Origin: the capture directory check of `CaptureStore::new` in `sources/mod.rs`
    // (hashintel/hash#10133).
    /// Returns the canonical path of the local directory artifacts are kept or staged in.
    pub(crate) fn directory(&self) -> Result<PathBuf, Report<ArtifactError>> {
        match &self.backend {
            Backend::Local(root) => root.as_path(),
            Backend::S3 { .. } => self.staging.path(),
        }
        .canonicalize()
        .change_context(ArtifactError::Read)
    }

    // Origin: `CaptureStore::path` in `sources/mod.rs` (hashintel/hash#10133), moved into staging.
    /// Returns the path a new artifact for `key` is published to before it is stored.
    pub(crate) fn staging(&self, key: &ArtifactKey) -> Result<PathBuf, Report<ArtifactError>> {
        local::path(self.staging.path(), key)
    }

    /// Returns the artifact stored at `key` as a local file, if there is one.
    pub(crate) async fn load(
        &self,
        key: &ArtifactKey,
    ) -> Result<Option<SourceCapture>, Report<ArtifactError>> {
        match &self.backend {
            Backend::Local(root) => local::load(root, key),
            Backend::S3 { bucket, .. } => {
                let (key, target) = (key.clone(), self.staging(key)?);
                Arc::clone(bucket)
                    .blocking(ArtifactError::Read, move |bucket| {
                        bucket.download(&key, &target)
                    })
                    .await
            }
        }
    }

    /// Stores `artifact` at `key` unless an artifact is already stored there.
    pub(crate) async fn store(
        &self,
        key: &ArtifactKey,
        artifact: &SourceCapture,
    ) -> Result<Stored, Report<ArtifactError>> {
        match &self.backend {
            Backend::Local(root) => local::store(root, key, artifact),
            Backend::S3 { bucket, stores } => {
                let _store = stores.lock().await;
                let (key, artifact) = (key.clone(), artifact.clone());
                Arc::clone(bucket)
                    .blocking(ArtifactError::Write, move |bucket| {
                        bucket.store(&key, &artifact)
                    })
                    .await
            }
        }
    }
}

mod local;
mod reference;
mod s3;

use alloc::sync::Arc;
use std::{
    fs::{self, File},
    io::{self, Read as _},
    path::{Path, PathBuf},
};

use error_stack::{Report, ResultExt as _};
use futures_util::StreamExt as _;
use hash_crypto::digest::{Sha256, Sha256Digest};
use object_store::{ObjectStore, WriteMultipart};
use tempfile::{NamedTempFile, TempDir};
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};

pub use self::reference::{ArtifactRef, ArtifactRefV1, Format};
use super::{ArtifactError, ArtifactKey, S3Bucket};

/// How many bytes are read, hashed and uploaded at a time.
pub(in crate::storage) const CHUNK_SIZE: usize = 8 * 1024 * 1024;
/// How many parts of one artifact are uploaded at the same time.
const UPLOAD_CONCURRENCY: usize = 4;

/// Stores artifacts: files written once and addressed by their content.
///
/// An artifact's key is derived from its SHA-256 digest, so two writers of one key write the
/// same bytes, and storing needs no conditional write. Dropping the storage deletes the staging
/// directory, so materialized artifacts can be read only while the storage exists.
#[derive(Debug)]
pub struct ArtifactStorage {
    store: Arc<dyn ObjectStore>,
    staging: TempDir,
}

impl ArtifactStorage {
    /// Keeps artifacts in the local directory `root`.
    ///
    /// # Errors
    ///
    /// Returns [`ArtifactError::Write`] if `root` or its staging directory cannot be created.
    pub fn local(root: &Path) -> Result<Self, Report<ArtifactError>> {
        let (store, staging) = local::open(root)?;
        Ok(Self {
            store: Arc::new(store),
            staging,
        })
    }

    /// Keeps artifacts in `bucket`, materialized into `staging`.
    ///
    /// # Errors
    ///
    /// Returns [`ArtifactError::Read`] if the bucket's URI or credentials are invalid.
    pub fn s3(bucket: &S3Bucket, staging: TempDir) -> Result<Self, Report<ArtifactError>> {
        Ok(Self {
            store: s3::open(bucket)?,
            staging,
        })
    }

    // Origin: `ArtifactStore::publish` in labs `pocs/integrations_rs/src/blob.rs`, without its
    // write-through cache and read-back verification.
    /// Stores the file at `path` under `prefix` and returns its reference.
    ///
    /// If the artifact is already stored, nothing is uploaded.
    ///
    /// # Errors
    ///
    /// Returns [`ArtifactError::Read`] if the file or the store cannot be read,
    /// [`ArtifactError::Write`] if the upload fails, or [`ArtifactError::Mismatch`] if the file
    /// changed while it was uploaded or a different object is stored under its key.
    pub async fn publish(
        &self,
        prefix: &ArtifactKey,
        path: &Path,
        format: Format,
    ) -> Result<ArtifactRef, Report<ArtifactError>> {
        let file = path.to_owned();
        let (sha256, size) = tokio::task::spawn_blocking(move || digest(&file))
            .await
            .change_context(ArtifactError::Read)??;
        let artifact = ArtifactRef::new(prefix, sha256, size, format);
        match self.store.head(&artifact.location()).await {
            Ok(stored) if stored.size == artifact.size() => return Ok(artifact),
            Ok(_) => return Err(Report::new(ArtifactError::Mismatch)),
            Err(object_store::Error::NotFound { .. }) => {}
            Err(error) => return Err(Report::new(error).change_context(ArtifactError::Read)),
        }
        self.upload(path, &artifact).await?;
        Ok(artifact)
    }

    // Origin: `ArtifactStore::materialize_guarded` in labs `pocs/integrations_rs/src/blob.rs`,
    // without its shared cache, eviction locks and disk limits.
    /// Downloads the artifact to a local file, checks it against its reference, and returns the
    /// file's path.
    ///
    /// # Errors
    ///
    /// Returns [`ArtifactError::Read`] if the artifact cannot be downloaded,
    /// [`ArtifactError::Write`] if the local file cannot be written, or
    /// [`ArtifactError::Mismatch`] if the reference's key is not addressed by its digest or the
    /// downloaded bytes do not match the reference.
    pub async fn materialize(
        &self,
        artifact: &ArtifactRef,
    ) -> Result<PathBuf, Report<ArtifactError>> {
        if !artifact.is_addressed() {
            return Err(Report::new(ArtifactError::Mismatch));
        }
        let target = self.staging.path().join(artifact.key());
        // Only verified downloads are kept, so a file at the target is the artifact.
        if target.is_file() {
            return Ok(target);
        }
        let directory = target
            .parent()
            .ok_or_else(|| Report::new(ArtifactError::Write))?;
        fs::create_dir_all(directory).change_context(ArtifactError::Write)?;
        let partial = NamedTempFile::new_in(directory).change_context(ArtifactError::Write)?;
        let mut file =
            tokio::fs::File::from_std(partial.reopen().change_context(ArtifactError::Write)?);
        let mut stream = self
            .store
            .get(&artifact.location())
            .await
            .change_context(ArtifactError::Read)?
            .into_stream();
        let mut hash = Sha256::new();
        let mut size = 0_u64;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.change_context(ArtifactError::Read)?;
            hash.update(&chunk);
            size += chunk.len() as u64;
            file.write_all(&chunk)
                .await
                .change_context(ArtifactError::Write)?;
        }
        file.sync_all().await.change_context(ArtifactError::Write)?;
        if !artifact.matches(hash.finalize(), size) {
            return Err(Report::new(ArtifactError::Mismatch));
        }
        match partial.persist_noclobber(&target) {
            Ok(_) => Ok(target),
            // Another materialization of the same artifact finished first.
            Err(error) if error.error.kind() == io::ErrorKind::AlreadyExists => Ok(target),
            Err(error) => Err(Report::new(error.error).change_context(ArtifactError::Write)),
        }
    }

    // Origin: the multipart upload with a streaming digest in `ArtifactStore::publish` in
    // labs `pocs/integrations_rs/src/blob.rs`.
    /// Uploads the file at `path` as `artifact`, checking that its bytes did not change.
    async fn upload(
        &self,
        path: &Path,
        artifact: &ArtifactRef,
    ) -> Result<(), Report<ArtifactError>> {
        let upload = self
            .store
            .put_multipart(&artifact.location())
            .await
            .change_context(ArtifactError::Write)?;
        let mut upload = WriteMultipart::new_with_chunk_size(upload, CHUNK_SIZE);
        let mut file = tokio::fs::File::open(path)
            .await
            .change_context(ArtifactError::Read)?;
        let mut buffer = vec![0; CHUNK_SIZE];
        let mut hash = Sha256::new();
        let mut size = 0_u64;
        let copied: Result<(), Report<ArtifactError>> = async {
            loop {
                let read = file
                    .read(&mut buffer)
                    .await
                    .change_context(ArtifactError::Read)?;
                let Some(chunk) = buffer.get(..read).filter(|chunk| !chunk.is_empty()) else {
                    return Ok(());
                };
                hash.update(chunk);
                size += read as u64;
                upload
                    .wait_for_capacity(UPLOAD_CONCURRENCY)
                    .await
                    .change_context(ArtifactError::Write)?;
                upload.write(chunk);
            }
        }
        .await;
        // The upload becomes visible only when it finishes, so an aborted upload stores nothing.
        if let Err(error) = copied {
            let _aborted = upload.abort().await;
            return Err(error);
        }
        if !artifact.matches(hash.finalize(), size) {
            let _aborted = upload.abort().await;
            return Err(Report::new(ArtifactError::Mismatch));
        }
        upload.finish().await.change_context(ArtifactError::Write)?;
        Ok(())
    }
}

// Origin: `hash_and_sync` in labs `pocs/integrations_rs/src/blob.rs`.
/// Returns the SHA-256 digest and size of the file at `path`.
fn digest(path: &Path) -> Result<(Sha256Digest, u64), Report<ArtifactError>> {
    let mut file = File::open(path).change_context(ArtifactError::Read)?;
    let mut buffer = vec![0; CHUNK_SIZE];
    let mut hash = Sha256::new();
    let mut size = 0_u64;
    loop {
        let read = file.read(&mut buffer).change_context(ArtifactError::Read)?;
        let Some(chunk) = buffer.get(..read).filter(|chunk| !chunk.is_empty()) else {
            return Ok((hash.finalize(), size));
        };
        hash.update(chunk);
        size += read as u64;
    }
}

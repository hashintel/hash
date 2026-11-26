use alloc::sync::Arc;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

use error_stack::{Report, ResultExt as _};
use futures_util::StreamExt as _;
use object_store::{ObjectStoreExt as _, buffered::BufWriter};
use tempfile::NamedTempFile;
use tokio::io::AsyncWriteExt as _;

use super::{Storage, StorageError, location};

/// How many bytes are uploaded in one request: a smaller file in one, a larger one in parts of
/// this size.
pub(super) const CHUNK_SIZE: usize = 8 * 1024 * 1024;
/// How many parts of one file are uploaded at the same time.
const UPLOAD_CONCURRENCY: usize = 4;

impl Storage {
    // Origin: the multipart upload in `ArtifactStore::publish` in labs
    // `pocs/integrations_rs/src/blob.rs`.
    /// Uploads the file at `path` to `key` and returns its size.
    ///
    /// A file already stored under `key` is replaced.
    ///
    /// # Errors
    ///
    /// - [`StorageError::InvalidKey`] if `key` is not a path in the bucket
    /// - [`StorageError::LocalFile`] if the file cannot be read
    /// - [`StorageError::Write`] if the upload fails
    pub(crate) async fn upload(&self, path: &Path, key: &str) -> Result<u64, Report<StorageError>> {
        let location = location(key)?;
        let mut file = tokio::fs::File::open(path)
            .await
            .change_context(StorageError::LocalFile)?;
        let mut upload = BufWriter::with_capacity(Arc::clone(&self.store), location, CHUNK_SIZE)
            .with_max_concurrency(UPLOAD_CONCURRENCY);
        let size = match tokio::io::copy(&mut file, &mut upload).await {
            Ok(size) => size,
            Err(error) => {
                // The upload becomes visible only when it finishes, so an aborted upload stores
                // nothing.
                let _aborted = upload.abort().await;
                return Err(copy_error(error));
            }
        };
        upload
            .shutdown()
            .await
            .change_context(StorageError::Write)?;
        Ok(size)
    }

    // Origin: `ArtifactStore::materialize_guarded` in labs `pocs/integrations_rs/src/blob.rs`.
    /// Downloads `key` to the same path under `directory` and returns that path.
    ///
    /// A file already at that path is replaced. A failed download leaves no file behind.
    ///
    /// # Errors
    ///
    /// - [`StorageError::InvalidKey`] if `key` is not a path in the bucket
    /// - [`StorageError::Read`] if `key` is missing or cannot be downloaded
    /// - [`StorageError::LocalFile`] if the local file cannot be written
    #[cfg_attr(
        not(test),
        expect(dead_code, reason = "the stages read their data through the lake")
    )]
    pub(crate) async fn download(
        &self,
        key: &str,
        directory: &Path,
    ) -> Result<PathBuf, Report<StorageError>> {
        let location = location(key)?;
        let mut target = directory.to_path_buf();
        for part in location.parts() {
            target.push(part.as_ref());
        }
        let mut stream = self
            .store
            .get(&location)
            .await
            .change_context(StorageError::Read)?
            .into_stream();
        let parent = target
            .parent()
            .expect("a key with at least one segment should have a parent below `directory`");
        fs::create_dir_all(parent).change_context(StorageError::LocalFile)?;
        let partial = NamedTempFile::new_in(parent).change_context(StorageError::LocalFile)?;
        let mut file =
            tokio::fs::File::from_std(partial.reopen().change_context(StorageError::LocalFile)?);
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.change_context(StorageError::Read)?;
            file.write_all(&chunk)
                .await
                .change_context(StorageError::LocalFile)?;
        }
        // `sync_all` drops the error of a write that has not finished, so the last write is
        // finished first.
        file.flush().await.change_context(StorageError::LocalFile)?;
        file.sync_all()
            .await
            .change_context(StorageError::LocalFile)?;
        partial
            .persist(&target)
            .map_err(|error| Report::new(error.error).change_context(StorageError::LocalFile))?;
        Ok(target)
    }
}

/// Tells a failed upload from a file that could not be read, which `tokio::io::copy` returns as
/// the same type. The upload wraps the error of the bucket.
fn copy_error(error: io::Error) -> Report<StorageError> {
    match error.downcast::<object_store::Error>() {
        Ok(error) => Report::new(error).change_context(StorageError::Write),
        Err(error) => Report::new(error).change_context(StorageError::LocalFile),
    }
}

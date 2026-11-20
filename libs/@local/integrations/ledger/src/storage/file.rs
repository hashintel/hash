use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use error_stack::{Report, ResultExt as _};
use futures_util::StreamExt as _;
use object_store::{WriteMultipart, path::Path as Location};
use tempfile::NamedTempFile;
use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};

use super::{Storage, StorageError};

/// How many bytes are read and uploaded at a time.
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
    /// Returns [`StorageError::Read`] if the file cannot be read, or [`StorageError::Write`] if
    /// the upload fails.
    pub(crate) async fn upload(&self, path: &Path, key: &str) -> Result<u64, Report<StorageError>> {
        let mut file = tokio::fs::File::open(path)
            .await
            .change_context(StorageError::Read)?;
        let upload = self
            .store
            .put_multipart(&Location::from(key))
            .await
            .change_context(StorageError::Write)?;
        let mut upload = WriteMultipart::new_with_chunk_size(upload, CHUNK_SIZE);
        let mut buffer = vec![0; CHUNK_SIZE];
        let mut size = 0_u64;
        let copied: Result<(), Report<StorageError>> = async {
            loop {
                let read = file
                    .read(&mut buffer)
                    .await
                    .change_context(StorageError::Read)?;
                let Some(chunk) = buffer.get(..read).filter(|chunk| !chunk.is_empty()) else {
                    return Ok(());
                };
                size += read as u64;
                upload
                    .wait_for_capacity(UPLOAD_CONCURRENCY)
                    .await
                    .change_context(StorageError::Write)?;
                upload.write(chunk);
            }
        }
        .await;
        // The upload becomes visible only when it finishes, so an aborted upload stores nothing.
        if let Err(error) = copied {
            let _aborted = upload.abort().await;
            return Err(error);
        }
        upload.finish().await.change_context(StorageError::Write)?;
        Ok(size)
    }

    // Origin: `ArtifactStore::materialize_guarded` in labs `pocs/integrations_rs/src/blob.rs`.
    /// Downloads `key` to the same path under `directory` and returns that path.
    ///
    /// A file already at that path is replaced. A failed download leaves no file behind.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError::Read`] if `key` is missing or cannot be downloaded, or
    /// [`StorageError::Write`] if `key` would leave `directory` or the local file cannot be
    /// written.
    pub(crate) async fn download(
        &self,
        key: &str,
        directory: &Path,
    ) -> Result<PathBuf, Report<StorageError>> {
        if !Path::new(key)
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
        {
            return Err(Report::new(StorageError::Write));
        }
        let mut stream = self
            .store
            .get(&Location::from(key))
            .await
            .change_context(StorageError::Read)?
            .into_stream();
        let target = directory.join(key);
        let parent = target
            .parent()
            .ok_or_else(|| Report::new(StorageError::Write))?;
        fs::create_dir_all(parent).change_context(StorageError::Write)?;
        let partial = NamedTempFile::new_in(parent).change_context(StorageError::Write)?;
        let mut file =
            tokio::fs::File::from_std(partial.reopen().change_context(StorageError::Write)?);
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.change_context(StorageError::Read)?;
            file.write_all(&chunk)
                .await
                .change_context(StorageError::Write)?;
        }
        // `sync_all` drops the error of a write that has not finished, so the last write is
        // finished first.
        file.flush().await.change_context(StorageError::Write)?;
        file.sync_all().await.change_context(StorageError::Write)?;
        partial
            .persist(&target)
            .map_err(|error| Report::new(error.error).change_context(StorageError::Write))?;
        Ok(target)
    }
}

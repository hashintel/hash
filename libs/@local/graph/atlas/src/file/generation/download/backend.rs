use core::future::Future;

use tokio::io::AsyncBufRead;

use crate::file::storage::{Storage, error::StorageError, path::FilePath};

/// Read operations required to acquire a complete generation.
pub(crate) trait GenerationDownloadBackend {
    /// Opens the contents for incremental reading.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if opening fails. Later failures propagate through the reader.
    fn read(
        &self,
        path: &FilePath,
    ) -> impl Future<Output = Result<impl AsyncBufRead + Send, StorageError>> + Send;
}

impl GenerationDownloadBackend for Storage {
    async fn read(&self, path: &FilePath) -> Result<impl AsyncBufRead + Send, StorageError> {
        path.read(self).await
    }
}

impl GenerationDownloadBackend for &Storage {
    async fn read(&self, path: &FilePath) -> Result<impl AsyncBufRead + Send, StorageError> {
        path.read(self).await
    }
}

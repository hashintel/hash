use bytes::Bytes;
use camino::Utf8Path;
use tokio::io::AsyncBufRead;

use crate::file::storage::{
    Storage, WriteCondition,
    error::StorageError,
    path::{FileContents, FilePath},
};

/// File operations required to complete and select a generation.
pub(crate) trait GenerationUploadBackend {
    /// Opens the contents together with their revision for conditional replacement.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if opening the file or obtaining its revision fails.
    ///
    /// # Implementation Note
    ///
    /// The revision must identify the returned contents.
    async fn get(&self, path: &FilePath) -> Result<FileContents<impl AsyncBufRead>, StorageError>;

    /// Opens the contents for incremental reading.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if opening fails. Later failures propagate through the reader.
    async fn read(&self, path: &FilePath) -> Result<impl AsyncBufRead, StorageError>;

    /// Writes `body` atomically under `condition`.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if the condition fails or writing fails. A lost response can leave
    /// the write's outcome unknown.
    ///
    /// # Implementation Note
    ///
    /// Check `condition` atomically with the write. Make at most one request attempt. Return the
    /// underlying request error after a lost response.
    async fn put(
        &self,
        path: &FilePath,
        body: Bytes,
        condition: WriteCondition,
    ) -> Result<(), StorageError>;

    /// Streams a local artifact under a destination precondition.
    ///
    /// The source must remain unchanged until transfer completes.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if reading, the destination condition or transfer fails.
    ///
    /// # Implementation Note
    ///
    /// Destination replacement must be atomic. A failed transfer must await required cleanup
    /// before returning its original error.
    async fn upload(
        &self,
        destination: &FilePath,
        source: &Utf8Path,
        condition: WriteCondition,
    ) -> Result<(), StorageError>;

    /// Copies a complete source under a destination precondition.
    ///
    /// Local sources must remain unchanged until transfer completes.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if reading, the destination condition or transfer fails.
    ///
    /// # Implementation Note
    ///
    /// Destination replacement must be atomic. A failed transfer must await required cleanup
    /// before returning its original error.
    async fn copy(
        &self,
        source: &FilePath,
        destination: &FilePath,
        condition: WriteCondition,
    ) -> Result<(), StorageError>;
}

impl GenerationUploadBackend for &Storage {
    async fn get(&self, path: &FilePath) -> Result<FileContents<impl AsyncBufRead>, StorageError> {
        path.get(self).await
    }

    async fn read(&self, path: &FilePath) -> Result<impl AsyncBufRead, StorageError> {
        path.read(self).await
    }

    async fn put(
        &self,
        path: &FilePath,
        body: Bytes,
        condition: WriteCondition,
    ) -> Result<(), StorageError> {
        path.put(self, body, condition).await
    }

    async fn upload(
        &self,
        destination: &FilePath,
        source: &Utf8Path,
        condition: WriteCondition,
    ) -> Result<(), StorageError> {
        destination.upload(self, source, condition).await
    }

    async fn copy(
        &self,
        source: &FilePath,
        destination: &FilePath,
        condition: WriteCondition,
    ) -> Result<(), StorageError> {
        destination.copy_from(self, source, condition).await
    }
}

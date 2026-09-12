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
    /// # Implementation Note
    ///
    /// The revision must identify the returned contents.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if opening the file or obtaining its revision fails.
    async fn get(&self, path: &FilePath) -> Result<FileContents<impl AsyncBufRead>, StorageError>;

    /// Opens the contents for incremental reading.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if opening fails. Later failures propagate through the reader.
    async fn read(&self, path: &FilePath) -> Result<impl AsyncBufRead, StorageError>;

    /// Writes `body` atomically under `condition`.
    ///
    /// # Implementation Note
    ///
    /// Check `condition` atomically with the write. Make at most one request attempt. Return the
    /// underlying request error after a lost response.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if the condition fails or writing fails. A lost response can leave
    /// the write's outcome unknown.
    async fn put(
        &self,
        path: &FilePath,
        body: Bytes,
        condition: WriteCondition<'_>,
    ) -> Result<(), StorageError>;

    /// Streams a local artifact under a destination precondition.
    ///
    /// The source must remain unchanged until transfer completes.
    ///
    /// # Implementation Note
    ///
    /// Destination replacement must be atomic. A failed transfer must await required cleanup before
    /// returning its original error.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if reading, the destination condition or transfer fails.
    async fn upload(
        &self,
        destination: &FilePath,
        source: &Utf8Path,
        condition: WriteCondition<'_>,
    ) -> Result<(), StorageError>;

    /// Copies a complete source under a destination precondition.
    ///
    /// Local sources must remain unchanged until transfer completes.
    ///
    /// # Implementation Note
    ///
    /// Destination replacement must be atomic. A failed transfer must await required cleanup before
    /// returning its original error.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if reading, the destination condition or transfer fails.
    async fn copy(
        &self,
        source: &FilePath,
        destination: &FilePath,
        condition: WriteCondition<'_>,
    ) -> Result<(), StorageError>;

    /// Removes one file.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if removal fails. A backend may report absence as a not-found
    /// error.
    async fn remove(&self, path: &FilePath) -> Result<(), StorageError>;

    /// Removes the contents beneath a directory and the local directory itself.
    ///
    /// S3 paths delimit descendants with a slash. A key equal to the path without a trailing slash
    /// lies outside that prefix.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if listing or removal fails, including partial removal. A backend
    /// may report an absent directory as a not-found error.
    async fn remove_dir_all(&self, path: &FilePath) -> Result<(), StorageError>;
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
        condition: WriteCondition<'_>,
    ) -> Result<(), StorageError> {
        path.put(self, body, condition).await
    }

    async fn upload(
        &self,
        destination: &FilePath,
        source: &Utf8Path,
        condition: WriteCondition<'_>,
    ) -> Result<(), StorageError> {
        destination.upload(self, source, condition).await
    }

    async fn copy(
        &self,
        source: &FilePath,
        destination: &FilePath,
        condition: WriteCondition<'_>,
    ) -> Result<(), StorageError> {
        destination.copy_from(self, source, condition).await
    }

    async fn remove(&self, path: &FilePath) -> Result<(), StorageError> {
        path.remove(self).await
    }

    async fn remove_dir_all(&self, path: &FilePath) -> Result<(), StorageError> {
        path.remove_dir_all(self).await
    }
}

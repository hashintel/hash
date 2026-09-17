//! Multipart publication with awaited cleanup after a transfer failure.

use aws_sdk_s3::types::{CompletedMultipartUpload, CompletedPart};

use self::parts::{Part, Parts};
use crate::file::storage::error::StorageError;

pub(crate) mod backend;
pub(crate) mod parts;
#[cfg(test)]
mod tests;

/// The operations needed to transfer, publish and abandon one multipart upload.
pub(crate) trait Backend {
    /// The handle identifying an upload until completion or cleanup.
    type Upload;

    /// Creates an upload and returns its handle.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if creation fails or its response omits the upload handle.
    async fn start(&mut self) -> Result<Self::Upload, StorageError>;

    /// Transfers one interval and returns its completion metadata.
    ///
    /// # Implementation Note
    ///
    /// The returned metadata must retain the requested part's number.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if transfer fails or required completion metadata is missing.
    async fn part(
        &mut self,
        upload: &Self::Upload,
        part: Part,
    ) -> Result<CompletedPart, StorageError>;

    /// Publishes the destination using the transferred parts' completion metadata.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if publication fails, including a rejected write precondition.
    async fn complete(
        &mut self,
        upload: &Self::Upload,
        parts: CompletedMultipartUpload,
    ) -> Result<(), StorageError>;

    /// Attempts to discard the unfinished upload and reports any cleanup failure.
    ///
    /// # Implementation Note
    ///
    /// Await the cleanup attempt before returning. Report cleanup failures without replacing the
    /// transfer's original error.
    async fn abort(&mut self, upload: &Self::Upload);
}

/// A planned transfer retaining its backend until publication or cleanup completes.
pub(crate) struct Multipart<B> {
    backend: B,
    parts: Parts,
}

impl<B: Backend> Multipart<B> {
    /// Plans a transfer within the multipart size and part-count bounds.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if the object exceeds multipart bounds.
    pub(crate) fn new(backend: B, length: u64) -> Result<Self, StorageError> {
        let parts = Parts::new(length)?;
        Ok(Self { backend, parts })
    }

    /// Transfers every part and completes the upload, awaiting abort after a failure.
    ///
    /// # Errors
    ///
    /// Returns the original [`StorageError`] if starting, transferring or completing fails.
    pub(crate) async fn transfer(mut self) -> Result<(), StorageError> {
        let upload = self.backend.start().await?;

        let result = async {
            let mut completed = CompletedMultipartUpload::builder();
            for part in self.parts.iter() {
                completed = completed.parts(self.backend.part(&upload, part).await?);
            }
            self.backend.complete(&upload, completed.build()).await
        }
        .await;

        if result.is_err() {
            self.backend.abort(&upload).await;
        }

        result
    }
}

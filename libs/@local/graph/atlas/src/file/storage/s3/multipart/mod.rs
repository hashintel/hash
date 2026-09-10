use aws_sdk_s3::types::{CompletedMultipartUpload, CompletedPart};

use self::parts::{Part, Parts};
use crate::file::storage::error::StorageError;

pub(crate) mod backend;
pub(crate) mod parts;
#[cfg(test)]
mod tests;

pub(crate) trait Backend {
    type Upload;

    async fn start(&mut self) -> Result<Self::Upload, StorageError>;

    async fn part(
        &mut self,
        upload: &Self::Upload,
        part: Part,
    ) -> Result<CompletedPart, StorageError>;

    async fn complete(
        &mut self,
        upload: &Self::Upload,
        parts: CompletedMultipartUpload,
    ) -> Result<(), StorageError>;

    async fn abort(&mut self, upload: &Self::Upload);
}

pub(crate) struct Multipart<B> {
    backend: B,
    parts: Parts,
}

impl<B: Backend> Multipart<B> {
    /// Plans a transfer within the multipart size and part-count bounds.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if the object cannot be partitioned.
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

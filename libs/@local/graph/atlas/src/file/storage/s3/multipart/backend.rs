use aws_sdk_s3::types::{ChecksumAlgorithm, CompletedMultipartUpload, CompletedPart};
use camino::Utf8Path;

use super::{Backend, parts::Part};
use crate::file::storage::{
    error::StorageError,
    s3::{
        S3, WriteCondition,
        metadata::ETag,
        path::{BucketPath, CopySource},
    },
};

/// The local file or conditional remote copy supplying a multipart transfer.
pub(crate) enum Source<'source> {
    /// Reads each interval from this local file.
    File(&'source Utf8Path),
    /// Copies each interval while the source retains its captured entity tag.
    Copy {
        header: CopySource<'source>,
        etag: ETag,
    },
}

/// S3 request state for one multipart destination and its source.
pub(crate) struct Remote<'transfer> {
    pub backend: &'transfer S3,
    pub destination: &'transfer BucketPath,

    pub source: Source<'transfer>,
    pub condition: WriteCondition<'transfer>,
}

impl Backend for Remote<'_> {
    type Upload = String;

    async fn start(&mut self) -> Result<Self::Upload, StorageError> {
        // MinIO's copy handler does not attach the checksum selected at initiation.
        let checksum = match self.source {
            Source::File(_) => Some(ChecksumAlgorithm::Crc32),
            Source::Copy { .. } => None,
        };

        let output = self
            .backend
            .client
            .create_multipart_upload()
            .bucket(self.destination.bucket())
            .key(self.destination.key())
            .set_checksum_algorithm(checksum)
            .customize()
            .config_override(S3::single_attempt())
            .send()
            .await?;

        output.upload_id.ok_or(StorageError::MissingUploadId)
    }

    async fn part(
        &mut self,
        upload: &Self::Upload,
        part: Part,
    ) -> Result<CompletedPart, StorageError> {
        let (etag, checksum) = match &self.source {
            Source::File(path) => {
                let body = part.read(path).await?;
                let output = self
                    .backend
                    .client
                    .upload_part()
                    .bucket(self.destination.bucket())
                    .key(self.destination.key())
                    .upload_id(upload)
                    .part_number(part.number)
                    .checksum_algorithm(ChecksumAlgorithm::Crc32)
                    .body(body)
                    .send()
                    .await?;

                let etag = output.e_tag.ok_or(StorageError::MissingEntityTag)?;
                let checksum = output.checksum_crc32.ok_or(StorageError::MissingChecksum)?;
                (etag, Some(checksum))
            }
            Source::Copy { header, etag } => {
                let output = self
                    .backend
                    .client
                    .upload_part_copy()
                    .bucket(self.destination.bucket())
                    .key(self.destination.key())
                    .upload_id(upload)
                    .part_number(part.number)
                    .copy_source(header.to_string())
                    .copy_source_if_match(etag.clone())
                    .copy_source_range(part.copy_range())
                    .send()
                    .await?;

                let output = output
                    .copy_part_result
                    .ok_or(StorageError::MissingEntityTag)?;

                (output.e_tag.ok_or(StorageError::MissingEntityTag)?, None)
            }
        };

        Ok(CompletedPart::builder()
            .part_number(part.number)
            .e_tag(etag)
            .set_checksum_crc32(checksum)
            .build())
    }

    async fn complete(
        &mut self,
        upload: &Self::Upload,
        parts: CompletedMultipartUpload,
    ) -> Result<(), StorageError> {
        let request = self
            .backend
            .client
            .complete_multipart_upload()
            .bucket(self.destination.bucket())
            .key(self.destination.key())
            .upload_id(upload)
            .multipart_upload(parts)
            .set_if_match(self.condition.if_match().map(str::to_owned))
            .set_if_none_match(self.condition.if_none_match().map(str::to_owned));

        request
            .customize()
            .config_override(S3::single_attempt())
            .send()
            .await
            .map(|_| ())
            .map_err(From::from)
    }

    async fn abort(&mut self, upload: &Self::Upload) {
        if let Err(error) = self
            .backend
            .client
            .abort_multipart_upload()
            .bucket(self.destination.bucket())
            .key(self.destination.key())
            .upload_id(upload)
            .send()
            .await
        {
            tracing::warn!(destination = %self.destination, upload_id = %upload, %error, "could not abort the failed multipart upload");
        }
    }
}

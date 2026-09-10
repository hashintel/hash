use aws_sdk_s3::types::{ChecksumAlgorithm, CompletedMultipartUpload, CompletedPart};
use camino::Utf8Path;

use super::{Backend, parts::Part};
use crate::file::storage::{
    error::StorageError,
    s3::{
        S3, WriteCondition,
        path::{CopySource, S3Path},
    },
};

pub(crate) enum Source<'source> {
    File(&'source Utf8Path),
    Copy {
        header: CopySource<'source>,
        etag: String,
    },
}

pub(crate) struct Remote<'transfer> {
    pub backend: &'transfer S3,
    pub destination: &'transfer S3Path,

    pub source: Source<'transfer>,
    pub condition: WriteCondition<'transfer>,
}

impl Backend for Remote<'_> {
    type Upload = String;

    async fn start(&mut self) -> Result<Self::Upload, StorageError> {
        let output = self
            .backend
            .client
            .create_multipart_upload()
            .bucket(self.destination.bucket())
            .key(self.destination.key())
            .checksum_algorithm(ChecksumAlgorithm::Crc32)
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

                (output.e_tag, output.checksum_crc32)
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
                    .copy_source_if_match(etag)
                    .copy_source_range(part.copy_range())
                    .send()
                    .await?;

                let output = output
                    .copy_part_result
                    .ok_or(StorageError::MissingEntityTag)?;
                (output.e_tag, output.checksum_crc32)
            }
        };

        part.complete(etag, checksum)
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
            tracing::warn!(destination = %self.destination, upload_id = %upload, ?error, "could not abort the failed multipart upload");
        }
    }
}

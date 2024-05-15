use std::borrow::Cow;

use aws_config::SdkConfig;
use aws_sdk_s3::operation::put_object::PutObjectOutput;
use error_stack::{Report, ResultExt};
use serde::Serialize;

use crate::benches::report::Measurement;

#[derive(Debug, thiserror::Error)]
pub enum UploadError {
    #[error("could not serialize file.")]
    Serialize,
    #[error("Upload failed.")]
    Upload,
}

#[derive(Debug, thiserror::Error)]
pub enum DownloadError {
    #[error("could not deserialize file.")]
    Deserialize,
    #[error("Download failed.")]
    Download,
}

pub struct S3Storage {
    client: aws_sdk_s3::Client,
    bucket: Cow<'static, str>,
}

impl S3Storage {
    pub fn new(config: &SdkConfig, bucket: impl Into<Cow<'static, str>>) -> Self {
        Self {
            client: aws_sdk_s3::Client::new(config),
            bucket: bucket.into(),
        }
    }

    async fn put_text_file(
        &self,
        key: &str,
        body: &(impl Serialize + Sync),
    ) -> Result<PutObjectOutput, Report<UploadError>> {
        self.client
            .put_object()
            .bucket(self.bucket.to_string())
            .key(key)
            .content_type("application/json")
            .body(
                serde_json::to_vec_pretty(body)
                    .change_context(UploadError::Serialize)?
                    .into(),
            )
            .send()
            .await
            .change_context(UploadError::Upload)
    }

    async fn put_json_file(
        &self,
        key: &str,
        body: &(impl Serialize + Sync),
    ) -> Result<PutObjectOutput, Report<UploadError>> {
        self.client
            .put_object()
            .bucket(self.bucket.to_string())
            .key(key)
            .content_type("application/json")
            .body(
                serde_json::to_vec_pretty(body)
                    .change_context(UploadError::Serialize)?
                    .into(),
            )
            .send()
            .await
            .change_context(UploadError::Upload)
    }

    /// Uploads the given benchmark to the storage.
    ///
    /// # Errors
    ///
    /// Returns an error if the upload fails.
    pub async fn put_measurement(
        &self,
        measurement: &Measurement,
        name: &str,
    ) -> Result<(), Report<UploadError>> {
        self.put_json_file(
            &format!("{name}/{}/benchmark.json", measurement.info.directory_name),
            &measurement.info,
        )
        .await?;
        self.put_json_file(
            &format!("{name}/{}/estimates.json", measurement.info.directory_name),
            &measurement.estimates,
        )
        .await?;
        self.put_json_file(
            &format!("{name}/{}/sample.json", measurement.info.directory_name),
            &measurement.sample,
        )
        .await?;
        self.put_json_file(
            &format!("{name}/{}/tukey.json", measurement.info.directory_name),
            &measurement.tukey,
        )
        .await?;

        Ok(())
    }
}

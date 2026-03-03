use alloc::borrow::Cow;

use aws_config::SdkConfig;
use aws_sdk_s3::{
    operation::put_object::{PutObjectOutput, builders::PutObjectFluentBuilder},
    types::ObjectCannedAcl,
};
use bytes::Bytes;
use error_stack::{Report, ResultExt as _};
use inferno::flamegraph;
use serde::Serialize;

use crate::benches::{analyze::BenchmarkAnalysis, report::Measurement};

#[derive(Debug, thiserror::Error)]
pub(crate) enum UploadError {
    #[error("Failed to read input file.")]
    ReadInput,
    #[error("could not serialize file.")]
    Serialize,
    #[error("Upload failed.")]
    Upload,
    #[error("Flame graph is missing.")]
    FlameGraphMissing,
}

pub(crate) struct S3Storage {
    client: aws_sdk_s3::Client,
    bucket: Cow<'static, str>,
}

impl S3Storage {
    pub(crate) fn new(config: &SdkConfig, bucket: impl Into<Cow<'static, str>>) -> Self {
        Self {
            client: aws_sdk_s3::Client::new(config),
            bucket: bucket.into(),
        }
    }

    fn put_file(&self, key: &str, body: impl Into<Bytes> + Send) -> PutObjectFluentBuilder {
        self.client
            .put_object()
            .bucket(self.bucket.to_string())
            .key(key)
            .content_type("application/json")
            .body(body.into().into())
    }

    async fn put_json_file(
        &self,
        key: &str,
        body: &(impl Serialize + Sync),
    ) -> Result<PutObjectOutput, Report<UploadError>> {
        self.put_file(
            key,
            serde_json::to_vec(body).change_context(UploadError::Serialize)?,
        )
        .content_type("application/json")
        .send()
        .await
        .change_context(UploadError::Upload)
    }

    /// Uploads the given benchmark to the storage.
    ///
    /// # Errors
    ///
    /// Returns an error if the upload fails.
    pub(crate) async fn put_measurement(
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

    /// Uploads the given benchmark analysis to the storage.
    ///
    /// # Errors
    ///
    /// Returns an error if the upload fails.
    pub(crate) async fn put_benchmark_analysis(
        &self,
        analysis: BenchmarkAnalysis,
        name: &str,
    ) -> Result<(), Report<UploadError>> {
        self.put_measurement(&analysis.measurement, name).await?;

        if let Some(stacks) = analysis.folded_stacks {
            let mut flame_graph_options = flamegraph::Options::default();
            flame_graph_options
                .title
                .clone_from(&analysis.measurement.info.title);

            let flame_graph = stacks
                .create_flame_graph(flame_graph_options)
                .change_context(UploadError::Upload)?;

            self.put_file(
                &format!(
                    "{name}/{}/tracing.folded",
                    &analysis.measurement.info.directory_name
                ),
                stacks,
            )
            .content_type("plain/text")
            .send()
            .await
            .change_context(UploadError::Upload)?;

            self.put_file(
                &format!(
                    "{name}/{}/flamegraph.svg",
                    &analysis.measurement.info.directory_name
                ),
                flame_graph,
            )
            .content_type("image/svg+xml")
            .acl(ObjectCannedAcl::PublicRead)
            .send()
            .await
            .change_context(UploadError::Upload)?;
        }
        Ok(())
    }
}

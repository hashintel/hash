//! Isolated buckets for integration tests against the local S3 service.

use core::{error::Error, panic::AssertUnwindSafe, time::Duration};
use std::{io, panic::resume_unwind};

use aws_sdk_s3::{
    Client,
    config::{BehaviorVersion, Credentials, Region, retry::RetryConfig, timeout::TimeoutConfig},
    primitives::ByteStream,
};
use bytes::Bytes;
use futures::FutureExt as _;
use uuid::Uuid;

use crate::file::storage::path::FilePath;

/// An isolated namespace on the integration-test MinIO instance.
pub(crate) struct Bucket {
    pub client: Client,
    pub name: String,
}

impl Bucket {
    /// Creates a bucket on localhost:9000 with fixed test credentials.
    ///
    /// # Panics
    ///
    /// Panics if MinIO is unavailable or bucket creation fails.
    pub(crate) async fn new() -> Self {
        let client = Client::from_conf(
            aws_sdk_s3::Config::builder()
                .behavior_version(BehaviorVersion::latest())
                .region(Region::new("us-east-1"))
                .credentials_provider(Credentials::new(
                    "dev-s3-access-key-id",
                    "dev-s3-secret-access-key",
                    None,
                    None,
                    "atlas-integration-test",
                ))
                .endpoint_url("http://localhost:9000")
                .force_path_style(true)
                .retry_config(RetryConfig::standard().with_max_attempts(3))
                .timeout_config(
                    TimeoutConfig::builder()
                        .connect_timeout(Duration::from_secs(2))
                        .operation_attempt_timeout(Duration::from_secs(10))
                        .operation_timeout(Duration::from_secs(30))
                        .build(),
                )
                .build(),
        );

        let name = format!("atlas-integration-{}", Uuid::now_v7());
        client
            .create_bucket()
            .bucket(&name)
            .send()
            .await
            .unwrap_or_else(|error| {
                panic!("should create test bucket {name} on MinIO at localhost:9000: {error:?}")
            });

        Self { client, name }
    }

    /// Addresses a literal object key through Atlas storage.
    ///
    /// # Panics
    ///
    /// Panics if `key` is empty or allocating the path fails.
    pub(crate) fn path(&self, key: &str) -> FilePath {
        format!("s3://{}/{key}", self.name)
            .parse()
            .expect("should construct the test object path")
    }

    /// Seeds an object independently of Atlas publication.
    ///
    /// # Panics
    ///
    /// Panics if the object write fails.
    pub(crate) async fn write(&self, key: &str, bytes: impl Into<Bytes>) {
        self.client
            .put_object()
            .bucket(&self.name)
            .key(key)
            .body(ByteStream::from(bytes.into()))
            .send()
            .await
            .expect("should seed the test object");
    }

    /// Reads published bytes independently of Atlas acquisition.
    ///
    /// # Panics
    ///
    /// Panics if opening the object or reading its body fails.
    pub(crate) async fn read(&self, key: &str) -> Bytes {
        self.client
            .get_object()
            .bucket(&self.name)
            .key(key)
            .send()
            .await
            .expect("should open the test object")
            .body
            .collect()
            .await
            .expect("should read the test object")
            .into_bytes()
    }

    /// Checks that no object exists at the literal key.
    ///
    /// # Panics
    ///
    /// Panics if the object exists or the request fails for another reason.
    #[track_caller]
    pub(crate) async fn assert_absent(&self, key: &str) {
        let error = self
            .client
            .get_object()
            .bucket(&self.name)
            .key(key)
            .send()
            .await
            .expect_err("should have no published object");

        assert!(
            error
                .as_service_error()
                .is_some_and(aws_sdk_s3::operation::get_object::GetObjectError::is_no_such_key),
            "should report a missing object, not another service failure: {error:?}"
        );
    }

    /// Removes incomplete uploads and objects, then deletes this test's bucket.
    ///
    /// # Errors
    ///
    /// Returns a request error or an incomplete listing entry.
    async fn cleanup(&self) -> Result<(), Box<dyn Error + Send + Sync>> {
        loop {
            let page = self
                .client
                .list_multipart_uploads()
                .bucket(&self.name)
                .send()
                .await?;

            if page.uploads().is_empty() {
                break;
            }

            for upload in page.uploads() {
                self.client
                    .abort_multipart_upload()
                    .bucket(&self.name)
                    .key(
                        upload
                            .key()
                            .ok_or_else(|| io::Error::other("missing object key"))?,
                    )
                    .upload_id(
                        upload
                            .upload_id()
                            .ok_or_else(|| io::Error::other("missing upload id"))?,
                    )
                    .send()
                    .await?;
            }
        }

        loop {
            let page = self
                .client
                .list_objects_v2()
                .bucket(&self.name)
                .send()
                .await?;

            if page.contents().is_empty() {
                break;
            }

            for object in page.contents() {
                self.client
                    .delete_object()
                    .bucket(&self.name)
                    .key(
                        object
                            .key()
                            .ok_or_else(|| io::Error::other("missing object key"))?,
                    )
                    .send()
                    .await?;
            }
        }

        self.client
            .delete_bucket()
            .bucket(&self.name)
            .send()
            .await?;

        Ok(())
    }

    /// Runs the case and awaits remote cleanup, including after an assertion panic.
    ///
    /// # Panics
    ///
    /// Resumes the case's panic after cleanup. Panics on cleanup failure after a successful case.
    pub(crate) async fn run(self, case: impl AsyncFnOnce(&Self)) {
        let result = Box::pin(AssertUnwindSafe(case(&self)).catch_unwind()).await;
        let cleanup = self.cleanup().await;

        match result {
            Ok(()) => cleanup.expect("should remove the test bucket"),
            Err(panic) => {
                if let Err(error) = cleanup {
                    tracing::subscriber::with_default(
                        tracing_subscriber::fmt().with_test_writer().finish(),
                        || tracing::error!(bucket = %self.name, %error, "failed to clean up test bucket"),
                    );
                }

                resume_unwind(panic);
            }
        }
    }
}

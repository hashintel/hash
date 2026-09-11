//! MinIO composition checks in fresh, test-owned buckets.
//!
//! Run these checks after changes to generation transfer or S3 storage. Start MinIO separately on `http://localhost:9000`, then run:
//!
//! ```sh
//! yarn workspace @rust/hash-graph-atlas test:integration --test generation_transfer --run-ignored only
//! ```
//!
//! The client uses `AWS_S3_UPLOADS_ACCESS_KEY_ID` and `AWS_S3_UPLOADS_SECRET_ACCESS_KEY`, falling
//! back to the compose stack's development credentials.
//!
//! Every case creates an `atlas-storage-test-<UUID>` bucket. Cleanup awaits multipart aborts and
//! object deletion before deleting that bucket. Assertion unwinding also follows this cleanup path,
//! preserving the assertion panic and reporting any cleanup error to test output.

use core::{error::Error, panic::AssertUnwindSafe, time::Duration};
use std::{env, io, panic::resume_unwind};

use aws_sdk_s3::{
    Client,
    config::{BehaviorVersion, Credentials, Region, retry::RetryConfig, timeout::TimeoutConfig},
    error::ProvideErrorMetadata as _,
    primitives::ByteStream,
};
use futures::FutureExt as _;
use hash_graph_atlas::test_utils;
use uuid::Uuid;

struct Bucket {
    client: Client,
    name: String,
}

impl Bucket {
    async fn new() -> Self {
        let credentials = Credentials::new(
            env::var("AWS_S3_UPLOADS_ACCESS_KEY_ID")
                .unwrap_or_else(|_| "dev-s3-access-key-id".to_owned()),
            env::var("AWS_S3_UPLOADS_SECRET_ACCESS_KEY")
                .unwrap_or_else(|_| "dev-s3-secret-access-key".to_owned()),
            None,
            None,
            "atlas-minio-integration",
        );

        let client = Client::from_conf(
            aws_sdk_s3::Config::builder()
                .behavior_version(BehaviorVersion::latest())
                .region(Region::new("us-east-1"))
                .credentials_provider(credentials)
                .endpoint_url("http://localhost:9000")
                .force_path_style(true)
                .retry_config(RetryConfig::standard().with_max_attempts(3))
                .timeout_config(
                    TimeoutConfig::builder()
                        .connect_timeout(Duration::from_secs(5))
                        .read_timeout(Duration::from_secs(10))
                        .operation_attempt_timeout(Duration::from_secs(15))
                        .operation_timeout(Duration::from_secs(45))
                        .build(),
                )
                .build(),
        );
        let name = format!("atlas-storage-test-{}", Uuid::now_v7());
        client
            .create_bucket()
            .bucket(&name)
            .customize()
            .config_override(
                aws_sdk_s3::config::Builder::new()
                    .retry_config(RetryConfig::standard().with_max_attempts(1)),
            )
            .send()
            .await
            .unwrap_or_else(|error| panic!("should create fresh bucket {name}: {error}"));
        Self { client, name }
    }

    fn destination(&self) -> String {
        format!("s3://{}/transfer prefix%2f", self.name)
    }

    async fn clear(&self) -> Result<(), Box<dyn Error + Send + Sync>> {
        // deleting each first page avoids retaining continuation tokens for removed objects.
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
                let key = upload
                    .key()
                    .ok_or_else(|| io::Error::other("multipart listing has no key"))?;
                let id = upload
                    .upload_id()
                    .ok_or_else(|| io::Error::other("multipart listing has no upload id"))?;
                self.client
                    .abort_multipart_upload()
                    .bucket(&self.name)
                    .key(key)
                    .upload_id(id)
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
                let key = object
                    .key()
                    .ok_or_else(|| io::Error::other("object listing has no key"))?;
                self.client
                    .delete_object()
                    .bucket(&self.name)
                    .key(key)
                    .send()
                    .await?;
            }
        }
        Ok(())
    }

    async fn cleanup(&self) -> Result<(), Box<dyn Error + Send + Sync>> {
        self.clear().await?;
        self.client
            .delete_bucket()
            .bucket(&self.name)
            .send()
            .await?;
        Ok(())
    }

    fn report_cleanup_error(&self, error: &dyn Error) {
        // cleanup diagnostics must remain visible without a global subscriber.
        tracing::subscriber::with_default(
            tracing_subscriber::fmt()
                .without_time()
                .with_ansi(false)
                .with_test_writer()
                .with_max_level(tracing::Level::ERROR)
                .finish(),
            || {
                tracing::error!(bucket = %self.name, ?error, "failed to clean up test bucket");
            },
        );
    }

    async fn run<T>(&self, operation: impl Future<Output = T>) -> T {
        let result = AssertUnwindSafe(operation).catch_unwind().await;
        let cleanup = self.cleanup().await;
        match result {
            Ok(value) => {
                cleanup.unwrap_or_else(|error| {
                    panic!("should remove test bucket {}: {error}", self.name)
                });
                value
            }
            Err(payload) => {
                if let Err(error) = cleanup {
                    self.report_cleanup_error(error.as_ref());
                }
                resume_unwind(payload)
            }
        }
    }
}

/// The publisher's namespace is readable by the downloader, preserving the original bytes.
#[tokio::test]
#[ignore = "requires MinIO on localhost:9000"]
async fn generation_round_trip() {
    let bucket = Bucket::new().await;
    let destination = bucket.destination();
    Box::pin(bucket.run(test_utils::generation_round_trip(
        bucket.client.clone(),
        &destination,
    )))
    .await;
}

/// Corrupt remote bytes leave local current absent and remove incomplete staging.
#[tokio::test]
#[ignore = "requires MinIO on localhost:9000"]
async fn generation_corrupt_artifact() {
    let bucket = Bucket::new().await;
    let destination = bucket.destination();
    Box::pin(bucket.run(test_utils::generation_corrupt_artifact(
        bucket.client.clone(),
        &destination,
    )))
    .await;
}

/// Assertion unwinding removes completed objects and incomplete multipart uploads.
#[tokio::test]
#[ignore = "requires MinIO on localhost:9000"]
async fn cleanup_assertion() {
    let bucket = Bucket::new().await;
    let result = Box::pin(
        AssertUnwindSafe(bucket.run(async {
            bucket
                .client
                .put_object()
                .bucket(&bucket.name)
                .key("completed")
                .body(ByteStream::from_static(b"cleanup fixture"))
                .send()
                .await
                .expect("should seed the cleanup object");
            bucket
                .client
                .create_multipart_upload()
                .bucket(&bucket.name)
                .key("incomplete")
                .send()
                .await
                .expect("should seed an incomplete upload");
            panic!("cleanup assertion sentinel");
        }))
        .catch_unwind(),
    )
    .await;
    let payload = result.expect_err("should resume the assertion panic after cleanup");
    assert_eq!(
        payload.downcast_ref::<&str>(),
        Some(&"cleanup assertion sentinel")
    );
    let observed = bucket
        .client
        .head_bucket()
        .bucket(&bucket.name)
        .send()
        .await;
    if observed.is_ok()
        && let Err(error) = bucket.cleanup().await
    {
        bucket.report_cleanup_error(error.as_ref());
    }
    let error = observed.expect_err("should remove the fresh bucket before resuming the panic");
    assert_eq!(
        error
            .raw_response()
            .map(|response| response.status().as_u16()),
        Some(404)
    );
}

/// A seeded multipart upload becomes inaccessible while its bucket still exists.
#[tokio::test]
#[ignore = "requires MinIO on localhost:9000"]
async fn cleanup_multipart() {
    let bucket = Bucket::new().await;
    Box::pin(bucket.run(async {
        let upload = bucket
            .client
            .create_multipart_upload()
            .bucket(&bucket.name)
            .key("incomplete")
            .send()
            .await
            .expect("should initiate the multipart upload");
        let id = upload
            .upload_id()
            .expect("should receive the upload identity");
        bucket
            .client
            .upload_part()
            .bucket(&bucket.name)
            .key("incomplete")
            .upload_id(id)
            .part_number(1)
            .body(ByteStream::from_static(b"incomplete part"))
            .send()
            .await
            .expect("should seed the multipart part");
        let before = bucket
            .client
            .list_parts()
            .bucket(&bucket.name)
            .key("incomplete")
            .upload_id(id)
            .send()
            .await
            .expect("should observe the seeded upload");
        assert_eq!(before.parts().len(), 1, "should observe the seeded part");

        bucket
            .clear()
            .await
            .expect("should clear the bucket contents");
        bucket
            .client
            .head_bucket()
            .bucket(&bucket.name)
            .send()
            .await
            .expect("should retain the bucket until cleanup completes");
        let error = bucket
            .client
            .list_parts()
            .bucket(&bucket.name)
            .key("incomplete")
            .upload_id(id)
            .send()
            .await
            .expect_err("should abort the upload before deleting its bucket");
        assert_eq!(
            error.as_service_error().and_then(|error| error.code()),
            Some("NoSuchUpload"),
            "should invalidate the seeded upload identity"
        );
    }))
    .await;
}

/// A cleanup request failure preserves the assertion payload and reports the bucket name.
#[tokio::test]
#[ignore = "requires MinIO on localhost:9000"]
async fn cleanup_missing_bucket() {
    let bucket = Bucket::new().await;
    let result = AssertUnwindSafe(bucket.run(async {
        bucket
            .client
            .delete_bucket()
            .bucket(&bucket.name)
            .send()
            .await
            .expect("should delete the bucket before cleanup");
        panic!("cleanup request failure sentinel");
    }))
    .catch_unwind()
    .await;
    let payload = result.expect_err("should resume the assertion panic after cleanup fails");
    assert_eq!(
        payload.downcast_ref::<&str>(),
        Some(&"cleanup request failure sentinel"),
        "should preserve the original assertion payload"
    );
}

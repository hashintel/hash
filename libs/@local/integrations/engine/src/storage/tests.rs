use alloc::sync::Arc;
use std::path::{Path, PathBuf};

use duckdb::Connection;
use error_stack::{Report, ResultExt as _};
use hash_crypto::Secret;
use hash_integrations_definition::SourceName;
use tempfile::TempDir;
use testcontainers::{
    ContainerAsync, ImageExt as _,
    core::{CmdWaitFor, ExecCommand},
    runners::AsyncRunner as _,
};
use testcontainers_modules::minio::MinIO;
use uuid::Uuid;

use super::{CaptureStorage, S3Bucket};
use crate::{CaptureRun, SourceCapture, SourceError, sql::literal};

/// Starts MinIO with an empty `captures` bucket and returns it with its API port.
pub(crate) async fn minio() -> (ContainerAsync<MinIO>, u16) {
    let minio = MinIO::default()
        .with_name("ghcr.io/hashdeps/minio")
        .with_tag("RELEASE.2025-09-07T16-13-09Z")
        .start()
        .await
        .expect("the MinIO fixture should start");
    minio
        .exec(
            ExecCommand::new([
                "sh",
                "-c",
                "mc alias set local http://localhost:9000 minioadmin minioadmin && mc mb \
                 local/captures",
            ])
            .with_cmd_ready_condition(CmdWaitFor::exit_code(0)),
        )
        .await
        .expect("should create the bucket");
    let port = minio
        .get_host_port_ipv4(9000)
        .await
        .expect("the MinIO port should be mapped");
    (minio, port)
}

fn bucket(port: u16) -> S3Bucket {
    S3Bucket {
        uri: "s3://captures/tenants".into(),
        region: "us-east-1".into(),
        endpoint: Some(format!("localhost:{port}").into()),
        use_ssl: false,
        key_id: "minioadmin".into(),
        secret: Secret::from_vec(b"minioadmin".to_vec()),
    }
}

/// S3 storage that stages in a new temporary directory under `parent`.
pub(crate) fn s3_storage(port: u16, parent: &Path) -> CaptureStorage {
    CaptureStorage::S3 {
        staging: TempDir::new_in(parent).expect("should create the staging directory"),
        bucket: Arc::new(bucket(port)),
    }
}

fn run() -> CaptureRun {
    CaptureRun {
        web: Uuid::new_v4(),
        actor: Uuid::new_v4(),
        id: Uuid::new_v4(),
    }
}

fn items() -> SourceName {
    "items".parse().expect("should be a source name")
}

/// A writer that publishes `rows` rows.
fn write(rows: u64) -> impl AsyncFnOnce(PathBuf) -> Result<SourceCapture, Report<SourceError>> {
    async move |target: PathBuf| {
        let partial = SourceCapture::stage(&target).change_context(SourceError::Write)?;
        let path = partial.path().to_str().expect("the path should be UTF-8");
        Connection::open_in_memory()
            .and_then(|connection| {
                connection.execute_batch(&format!(
                    "COPY (SELECT range AS id FROM range({rows})) TO {} (FORMAT PARQUET)",
                    literal(path)
                ))
            })
            .change_context(SourceError::Write)?;
        SourceCapture::publish(partial, &target, rows).change_context(SourceError::Write)
    }
}

/// A writer for a source that cannot be reached.
fn unreachable_source() -> impl AsyncFnOnce(PathBuf) -> Result<SourceCapture, Report<SourceError>> {
    async |_target: PathBuf| Err(Report::new(SourceError::Query))
}

#[tokio::test]
async fn local_reuses_a_stored_capture() {
    let directory = TempDir::new().expect("should create a directory");
    let root = directory.path().join("captures");
    let run = run();
    CaptureStorage::Local(root.clone())
        .capture(run, &items(), write(3))
        .await
        .expect("should store the capture");

    let restore = CaptureStorage::Local(root);
    let capture = restore
        .capture(run, &items(), unreachable_source())
        .await
        .expect("should reuse the stored capture");
    assert_eq!(capture.rows(), 3);

    let error = restore
        .capture(
            CaptureRun {
                id: Uuid::new_v4(),
                ..run
            },
            &items(),
            unreachable_source(),
        )
        .await
        .expect_err("another run should not reuse the capture");
    assert!(matches!(error.current_context(), SourceError::Query));
}

#[tokio::test]
async fn local_uses_a_capture_published_while_writing_fails() {
    let directory = TempDir::new().expect("should create a directory");
    // Stands in for another attempt that publishes the capture while this one fails.
    let publish_then_fail = async |target: PathBuf| {
        write(4)(target).await?;
        Err(Report::new(SourceError::Query))
    };

    let capture = CaptureStorage::Local(directory.path().to_owned())
        .capture(run(), &items(), publish_then_fail)
        .await
        .expect("should use the published capture");
    assert_eq!(capture.rows(), 4);
}

#[tokio::test]
async fn s3_restores_into_new_staging() {
    let directory = TempDir::new().expect("should create a directory");
    let (_minio, port) = minio().await;
    let run = run();
    s3_storage(port, directory.path())
        .capture(run, &items(), write(3))
        .await
        .expect("should store the capture");

    let restore = s3_storage(port, directory.path());
    let capture = restore
        .capture(run, &items(), unreachable_source())
        .await
        .expect("should download the stored capture");
    assert_eq!(capture.rows(), 3);

    let error = restore
        .capture(
            CaptureRun {
                id: Uuid::new_v4(),
                ..run
            },
            &items(),
            unreachable_source(),
        )
        .await
        .expect_err("another run should not reuse the capture");
    assert!(matches!(error.current_context(), SourceError::Query));
}

#[tokio::test]
async fn s3_errors_are_not_missing_captures() {
    let directory = TempDir::new().expect("should create a directory");
    let (_minio, port) = minio().await;
    let storage = CaptureStorage::S3 {
        staging: TempDir::new_in(directory.path()).expect("should create the staging directory"),
        bucket: Arc::new(S3Bucket {
            secret: Secret::from_vec(b"wrong".to_vec()),
            ..bucket(port)
        }),
    };

    let error = storage
        .capture(run(), &items(), write(1))
        .await
        .expect_err("should not capture when the bucket cannot be read");
    assert!(matches!(error.current_context(), SourceError::Read));
}

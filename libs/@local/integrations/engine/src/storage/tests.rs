use alloc::sync::Arc;
use std::path::Path;

use duckdb::Connection;
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
use crate::{CaptureRun, SourceCapture, sql::literal};

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

/// Publishes a capture of `rows` rows for `run` and stores it.
async fn store(storage: &CaptureStorage, run: CaptureRun, rows: u64) {
    let target = storage
        .target(run, &items())
        .expect("should return the capture target");
    let partial = SourceCapture::stage(&target).expect("should stage the capture");
    let path = partial.path().to_str().expect("the path should be UTF-8");
    Connection::open_in_memory()
        .and_then(|connection| {
            connection.execute_batch(&format!(
                "COPY (SELECT range AS id FROM range({rows})) TO {} (FORMAT PARQUET)",
                literal(path)
            ))
        })
        .expect("should write the capture");
    let capture =
        SourceCapture::publish(partial, &target, rows).expect("should publish the capture");
    storage
        .store(run, &items(), &capture)
        .await
        .expect("should store the capture");
}

async fn rows(storage: &CaptureStorage, run: CaptureRun) -> Option<u64> {
    storage
        .load(run, &items())
        .await
        .expect("should load from the storage")
        .map(|capture| capture.rows())
}

fn other(run: CaptureRun) -> CaptureRun {
    CaptureRun {
        id: Uuid::new_v4(),
        ..run
    }
}

#[tokio::test]
async fn local_loads_a_stored_capture() {
    let directory = TempDir::new().expect("should create a directory");
    let root = directory.path().join("captures");
    let run = run();
    store(&CaptureStorage::Local(root.clone()), run, 3).await;

    let restore = CaptureStorage::Local(root);
    assert_eq!(
        rows(&restore, run).await,
        Some(3),
        "should load the stored capture"
    );
    assert_eq!(
        rows(&restore, other(run)).await,
        None,
        "another run should have no capture"
    );
}

#[tokio::test]
async fn s3_restores_into_new_staging() {
    let directory = TempDir::new().expect("should create a directory");
    let (_minio, port) = minio().await;
    let run = run();
    store(&s3_storage(port, directory.path()), run, 3).await;

    let restore = s3_storage(port, directory.path());
    assert_eq!(
        rows(&restore, run).await,
        Some(3),
        "should download the stored capture"
    );
    assert_eq!(
        rows(&restore, other(run)).await,
        None,
        "another run should have no capture"
    );
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

    let _report = storage
        .load(run(), &items())
        .await
        .expect_err("should fail when the bucket cannot be read");
}

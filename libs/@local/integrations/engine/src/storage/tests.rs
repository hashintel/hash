use std::path::Path;

use duckdb::Connection;
use hash_crypto::Secret;
use hash_integrations_definition::SourceName;
use rstest::rstest;
use tempfile::TempDir;
use testcontainers::{
    ContainerAsync, ImageExt as _,
    core::{CmdWaitFor, ExecCommand},
    runners::AsyncRunner as _,
};
use testcontainers_modules::minio::MinIO;
use uuid::Uuid;

use super::{ArtifactKey, ArtifactStorage, S3Bucket, Stored, layout};
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
pub(crate) fn s3_storage(port: u16, parent: &Path) -> ArtifactStorage {
    ArtifactStorage::s3(
        bucket(port),
        TempDir::new_in(parent).expect("should create the staging directory"),
    )
}

/// Local storage under `directory`, or S3 storage staging there if MinIO runs on `port`.
fn storage(port: Option<u16>, directory: &Path) -> ArtifactStorage {
    port.map_or_else(
        || {
            ArtifactStorage::local(directory.join("artifacts"))
                .expect("should create local storage")
        },
        |port| s3_storage(port, directory),
    )
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

/// Publishes an artifact of `rows` rows for `key` and stores it.
async fn store(storage: &ArtifactStorage, key: &ArtifactKey, rows: u64) -> Stored {
    let target = storage
        .staging(key)
        .expect("should return the staging path");
    let partial = SourceCapture::stage(&target).expect("should stage the artifact");
    let path = partial.path().to_str().expect("the path should be UTF-8");
    Connection::open_in_memory()
        .and_then(|connection| {
            connection.execute_batch(&format!(
                "COPY (SELECT range AS id FROM range({rows})) TO {} (FORMAT PARQUET)",
                literal(path)
            ))
        })
        .expect("should write the artifact");
    let artifact =
        SourceCapture::publish(partial, &target, rows).expect("should publish the artifact");
    storage
        .store(key, &artifact)
        .await
        .expect("should store the artifact")
}

async fn rows(storage: &ArtifactStorage, key: &ArtifactKey) -> Option<u64> {
    storage
        .load(key)
        .await
        .expect("should read from the storage")
        .map(|artifact| artifact.rows())
}

#[rstest]
#[case::local(false)]
#[case::s3(true)]
#[tokio::test]
async fn restores_in_new_staging(#[case] s3: bool) {
    let directory = TempDir::new().expect("should create a directory");
    let minio = if s3 { Some(minio().await) } else { None };
    let port = minio.as_ref().map(|(_, port)| *port);
    let run = run();
    let key = layout::capture(run, &items());
    store(&storage(port, directory.path()), &key, 3).await;

    let restore = storage(port, directory.path());
    assert_eq!(
        rows(&restore, &key).await,
        Some(3),
        "should load the stored artifact"
    );
    let other = layout::capture(
        CaptureRun {
            id: Uuid::new_v4(),
            ..run
        },
        &items(),
    );
    assert_eq!(
        rows(&restore, &other).await,
        None,
        "another run should have no artifact"
    );
}

#[rstest]
#[case::local(false)]
#[case::s3(true)]
#[tokio::test]
async fn keeps_the_first_stored_artifact(#[case] s3: bool) {
    let directory = TempDir::new().expect("should create a directory");
    let minio = if s3 { Some(minio().await) } else { None };
    let port = minio.as_ref().map(|(_, port)| *port);
    let key = layout::capture(run(), &items());
    assert_eq!(
        store(&storage(port, directory.path()), &key, 3).await,
        Stored::Created,
        "the first attempt should store its artifact"
    );

    let retry = storage(port, directory.path());
    assert_eq!(
        store(&retry, &key, 5).await,
        Stored::Exists,
        "a later attempt should not replace the artifact"
    );
    assert_eq!(
        rows(&retry, &key).await,
        Some(3),
        "the first artifact should remain"
    );
}

#[tokio::test]
async fn s3_errors_are_not_missing_artifacts() {
    let directory = TempDir::new().expect("should create a directory");
    let (_minio, port) = minio().await;
    let storage = ArtifactStorage::s3(
        S3Bucket {
            secret: Secret::from_vec(b"wrong".to_vec()),
            ..bucket(port)
        },
        TempDir::new_in(directory.path()).expect("should create the staging directory"),
    );

    let _report = storage
        .load(&layout::capture(run(), &items()))
        .await
        .expect_err("should fail when the bucket cannot be read");
}

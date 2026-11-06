use std::{fs, path::Path};

use duckdb::Connection;
use hash_crypto::{Secret, digest::Sha256Digest};
use hash_integrations_definition::SourceName;
use rstest::rstest;
use serde_json::{Value, json};
use tempfile::TempDir;
use testcontainers::{
    ContainerAsync, ImageExt as _,
    core::{CmdWaitFor, ExecCommand},
    runners::AsyncRunner as _,
};
use testcontainers_modules::minio::MinIO;
use uuid::Uuid;

use super::{
    ArtifactError, ArtifactKey, ArtifactNamespace, ArtifactRef, ArtifactStorage, Format,
    ParquetStorage, S3Bucket, Stored, artifact::CHUNK_SIZE,
};
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
pub(crate) fn s3_storage(port: u16, parent: &Path) -> ParquetStorage {
    ParquetStorage::s3(
        bucket(port),
        TempDir::new_in(parent).expect("should create the staging directory"),
    )
}

/// Local storage under `directory`, or S3 storage staging there if MinIO runs on `port`.
fn storage(port: Option<u16>, directory: &Path) -> ParquetStorage {
    port.map_or_else(
        || ParquetStorage::local(directory.join("artifacts")).expect("should create local storage"),
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

/// The key of the `items` capture in `run`.
fn capture(run: CaptureRun) -> ArtifactKey {
    ArtifactNamespace::new(run.web).capture(run.id, &items())
}

/// Publishes an artifact of `rows` rows for `key` and stores it.
async fn store(storage: &ParquetStorage, key: &ArtifactKey, rows: u64) -> Stored {
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

async fn rows(storage: &ParquetStorage, key: &ArtifactKey) -> Option<u64> {
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
    let key = capture(run);
    store(&storage(port, directory.path()), &key, 3).await;

    let restore = storage(port, directory.path());
    assert_eq!(
        rows(&restore, &key).await,
        Some(3),
        "should load the stored artifact"
    );
    let other = ArtifactNamespace::new(run.web).capture(Uuid::new_v4(), &items());
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
    let key = capture(run());
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
    let storage = ParquetStorage::s3(
        S3Bucket {
            secret: Secret::from_vec(b"wrong".to_vec()),
            ..bucket(port)
        },
        TempDir::new_in(directory.path()).expect("should create the staging directory"),
    );

    let _report = storage
        .load(&capture(run()))
        .await
        .expect_err("should fail when the bucket cannot be read");
}

/// Local artifact storage under `directory`, or S3 storage staging there if MinIO runs on `port`.
fn artifact_storage(port: Option<u16>, directory: &Path) -> ArtifactStorage {
    port.map_or_else(
        || {
            ArtifactStorage::local(&directory.join("artifacts"))
                .expect("should create local storage")
        },
        |port| {
            ArtifactStorage::s3(
                &bucket(port),
                TempDir::new_in(directory).expect("should create the staging directory"),
            )
            .expect("should create S3 storage")
        },
    )
}

/// Writes `bytes` to a new file under `directory` and returns its path.
fn file(directory: &Path, bytes: &[u8]) -> std::path::PathBuf {
    let path = directory.join(format!("{}.bin", Uuid::new_v4()));
    fs::write(&path, bytes).expect("should write the file");
    path
}

#[rstest]
#[case::local(false)]
#[case::s3(true)]
#[tokio::test]
async fn artifacts_round_trip_through_new_staging(#[case] s3: bool) {
    let directory = TempDir::new().expect("should create a directory");
    let minio = if s3 { Some(minio().await) } else { None };
    let port = minio.as_ref().map(|(_, port)| *port);
    // Larger than two upload parts, so the upload has several parts and a shorter last one.
    let bytes: Vec<u8> = (0..=u8::MAX).cycle().take(2 * CHUNK_SIZE + 3).collect();

    let artifact = artifact_storage(port, directory.path())
        .publish(
            &ArtifactNamespace::new(Uuid::new_v4()).artifacts("test"),
            &file(directory.path(), &bytes),
            Format::Binary,
        )
        .await
        .expect("should publish the artifact");
    assert_eq!(
        artifact.size(),
        bytes.len() as u64,
        "should record the size"
    );
    assert_eq!(
        artifact.sha256(),
        Sha256Digest::of(&bytes).to_bytes(),
        "should record the digest"
    );

    let restore = artifact_storage(port, directory.path());
    let path = restore
        .materialize(&artifact)
        .await
        .expect("should materialize the artifact");
    assert!(
        fs::read(path).expect("should read the artifact") == bytes,
        "should materialize the published bytes"
    );
}

#[rstest]
#[case::local(false)]
#[case::s3(true)]
#[tokio::test]
async fn publishing_the_same_bytes_returns_the_same_reference(#[case] s3: bool) {
    let directory = TempDir::new().expect("should create a directory");
    let minio = if s3 { Some(minio().await) } else { None };
    let port = minio.as_ref().map(|(_, port)| *port);
    let prefix = ArtifactNamespace::new(Uuid::new_v4()).artifacts("test");
    let publish = async |storage: ArtifactStorage| {
        storage
            .publish(&prefix, &file(directory.path(), b"{}"), Format::Json)
            .await
            .expect("should publish the artifact")
    };

    assert_eq!(
        publish(artifact_storage(port, directory.path())).await,
        publish(artifact_storage(port, directory.path())).await,
        "the same bytes should be stored once under one key"
    );
}

#[tokio::test]
async fn materialize_rejects_a_changed_artifact() {
    let directory = TempDir::new().expect("should create a directory");
    let root = directory.path().join("artifacts");
    let artifact = ArtifactStorage::local(&root)
        .expect("should create local storage")
        .publish(
            &ArtifactNamespace::new(Uuid::new_v4()).artifacts("test"),
            &file(directory.path(), b"original"),
            Format::Binary,
        )
        .await
        .expect("should publish the artifact");
    fs::write(root.join(artifact.key()), b"replaced").expect("should replace the stored bytes");

    let error = ArtifactStorage::local(&root)
        .expect("should create local storage")
        .materialize(&artifact)
        .await
        .expect_err("should reject bytes that do not match the reference");
    assert!(
        matches!(error.current_context(), ArtifactError::Mismatch),
        "should report the mismatch"
    );
}

/// Publishes a small JSON artifact to local storage under `directory` and returns its reference.
async fn published(directory: &Path) -> ArtifactRef {
    ArtifactStorage::local(&directory.join("artifacts"))
        .expect("should create local storage")
        .publish(
            &ArtifactNamespace::new(Uuid::new_v4()).artifacts("test"),
            &file(directory, b"{}"),
            Format::Json,
        )
        .await
        .expect("should publish the artifact")
}

#[tokio::test]
async fn references_round_trip_through_json() {
    let directory = TempDir::new().expect("should create a directory");
    let artifact = published(directory.path()).await;

    let stored = serde_json::to_value(&artifact).expect("should serialize the reference");
    assert_eq!(stored["version"], json!("v1"), "should be versioned");
    assert_eq!(
        stored["value"]["format"],
        json!("json"),
        "should record the format"
    );
    let restored: ArtifactRef =
        serde_json::from_value(stored).expect("should deserialize the reference");
    assert_eq!(restored, artifact, "should read back the same reference");

    let restore = ArtifactStorage::local(&directory.path().join("artifacts"))
        .expect("should create local storage");
    let path = restore
        .materialize(&restored)
        .await
        .expect("should materialize the read-back reference");
    assert_eq!(fs::read(path).expect("should read the artifact"), b"{}");
}

#[rstest]
#[case::unknown_version(|reference: &mut Value| reference["version"] = json!("v2"))]
#[case::unknown_field(|reference: &mut Value| reference["value"]["eTag"] = json!("etag"))]
#[case::uppercase_digest(|reference: &mut Value| {
    let digest = reference["value"]["sha256"].as_str().expect("should be a string").to_uppercase();
    reference["value"]["sha256"] = json!(digest);
})]
#[tokio::test]
async fn rejects_malformed_references(#[case] tamper: fn(&mut Value)) {
    let directory = TempDir::new().expect("should create a directory");
    let mut stored = serde_json::to_value(published(directory.path()).await)
        .expect("should serialize the reference");
    tamper(&mut stored);

    serde_json::from_value::<ArtifactRef>(stored).expect_err("should reject the reference");
}

#[rstest]
#[case::digest_of_other_bytes(|reference: &mut Value| {
    reference["value"]["sha256"] = json!("0".repeat(64));
})]
#[case::other_format(|reference: &mut Value| reference["value"]["format"] = json!("parquet"))]
#[case::parent_segment(|reference: &mut Value| {
    let key = reference["value"]["key"].as_str().expect("should be a string");
    reference["value"]["key"] = json!(format!("../{key}"));
})]
#[tokio::test]
async fn materialize_rejects_unaddressed_references(#[case] tamper: fn(&mut Value)) {
    let directory = TempDir::new().expect("should create a directory");
    let mut stored = serde_json::to_value(published(directory.path()).await)
        .expect("should serialize the reference");
    tamper(&mut stored);
    let artifact: ArtifactRef =
        serde_json::from_value(stored).expect("should deserialize the reference");

    let error = ArtifactStorage::local(&directory.path().join("artifacts"))
        .expect("should create local storage")
        .materialize(&artifact)
        .await
        .expect_err("should reject a key not addressed by the reference");
    assert!(
        matches!(error.current_context(), ArtifactError::Mismatch),
        "should report the mismatch"
    );
}

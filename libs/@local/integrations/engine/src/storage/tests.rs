use std::{fs, path::Path};

use hash_crypto::{Secret, digest::Sha256Digest};
use hash_integrations_definition::{ConnectorId, SourceName};
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
    ArtifactError, ArtifactKey, ArtifactNamespace, ArtifactRef, ArtifactStorage, Bound, Format,
    S3Bucket, artifact::CHUNK_SIZE,
};
use crate::CaptureRun;

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

pub(crate) fn bucket(port: u16) -> S3Bucket {
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
        &bucket(port),
        TempDir::new_in(parent).expect("should create the staging directory"),
    )
    .expect("should create S3 storage")
}

/// Local storage under `directory`, or S3 storage staging there if MinIO runs on `port`.
fn storage(port: Option<u16>, directory: &Path) -> ArtifactStorage {
    port.map_or_else(
        || {
            ArtifactStorage::local(&directory.join("artifacts"))
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

/// Stands in for the fingerprint of a source definition.
const FINGERPRINT: &str = "fingerprint";

fn connector() -> ConnectorId {
    "aviation".parse().expect("should be a connector ID")
}

fn namespace(web: Uuid) -> ArtifactNamespace {
    ArtifactNamespace::new(web, &connector())
}

fn items() -> SourceName {
    "items".parse().expect("should be a source name")
}

/// The key of the `items` capture in `run`.
fn capture(run: CaptureRun) -> ArtifactKey {
    namespace(run.web).capture(run.id, &items(), FINGERPRINT)
}

/// Publishes `bytes` as an artifact through `storage` and returns its reference.
async fn publish(storage: &ArtifactStorage, directory: &Path, bytes: &[u8]) -> ArtifactRef {
    storage
        .publish(
            &namespace(Uuid::new_v4()).artifacts(),
            &file(directory, bytes),
            Format::Binary,
        )
        .await
        .expect("should publish the artifact")
}

#[rstest]
#[case::local(false)]
#[case::s3(true)]
#[tokio::test]
async fn bound_returns_the_bound_reference(#[case] s3: bool) {
    let directory = TempDir::new().expect("should create a directory");
    let minio = if s3 { Some(minio().await) } else { None };
    let port = minio.as_ref().map(|(_, port)| *port);
    let run = run();
    let first = storage(port, directory.path());
    let artifact = publish(&first, directory.path(), b"capture").await;
    assert_eq!(
        first
            .bind(&capture(run), &artifact)
            .await
            .expect("should bind the reference"),
        Bound::Created,
        "the first binding should be created"
    );

    let restore = storage(port, directory.path());
    assert_eq!(
        restore
            .bound(&capture(run))
            .await
            .expect("should read the binding"),
        Some(artifact),
        "a new storage should read the bound reference"
    );
    let other = namespace(run.web).capture(Uuid::new_v4(), &items(), FINGERPRINT);
    assert_eq!(
        restore
            .bound(&other)
            .await
            .expect("should read the binding"),
        None,
        "another run should have no binding"
    );
}

#[rstest]
#[case::local(false)]
#[case::s3(true)]
#[tokio::test]
async fn bind_keeps_the_first_reference(#[case] s3: bool) {
    let directory = TempDir::new().expect("should create a directory");
    let minio = if s3 { Some(minio().await) } else { None };
    let port = minio.as_ref().map(|(_, port)| *port);
    let key = capture(run());
    let first = storage(port, directory.path());
    let artifact = publish(&first, directory.path(), b"first").await;
    assert_eq!(
        first
            .bind(&key, &artifact)
            .await
            .expect("should bind the first reference"),
        Bound::Created,
        "the first binding should be created"
    );

    let retry = storage(port, directory.path());
    let other = publish(&retry, directory.path(), b"second").await;
    assert_eq!(
        retry.bind(&key, &other).await.expect("should try to bind"),
        Bound::Exists,
        "a later attempt should not replace the binding"
    );
    assert_eq!(
        retry.bound(&key).await.expect("should read the binding"),
        Some(artifact),
        "the first reference should remain bound"
    );
}

#[tokio::test]
async fn s3_errors_are_not_missing_bindings() {
    let directory = TempDir::new().expect("should create a directory");
    let (_minio, port) = minio().await;
    let storage = ArtifactStorage::s3(
        &S3Bucket {
            secret: Secret::from_vec(b"wrong".to_vec()),
            ..bucket(port)
        },
        TempDir::new_in(directory.path()).expect("should create the staging directory"),
    )
    .expect("should create S3 storage");

    let _report = storage
        .bound(&capture(run()))
        .await
        .expect_err("should fail when the bucket cannot be read");
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

    let artifact = storage(port, directory.path())
        .publish(
            &namespace(Uuid::new_v4()).artifacts(),
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

    let restore = storage(port, directory.path());
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
    let prefix = namespace(Uuid::new_v4()).artifacts();
    let publish = async |storage: ArtifactStorage| {
        storage
            .publish(&prefix, &file(directory.path(), b"{}"), Format::Json)
            .await
            .expect("should publish the artifact")
    };

    assert_eq!(
        publish(storage(port, directory.path())).await,
        publish(storage(port, directory.path())).await,
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
            &namespace(Uuid::new_v4()).artifacts(),
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
            &namespace(Uuid::new_v4()).artifacts(),
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

#[test]
fn namespace_keys_are_stable() {
    let web = Uuid::from_u128(1);
    let namespace = ArtifactNamespace::new(web, &connector());
    let root = "tenants/00000000-0000-0000-0000-000000000001/integrations/\
                a290c6f051d0a83cd0663dd31819fb8d9b8fac2705e6e0618c3b0c11142d7477";

    assert_eq!(
        namespace
            .capture(Uuid::from_u128(2), &items(), FINGERPRINT)
            .to_string(),
        format!("{root}/captures/00000000-0000-0000-0000-000000000002/items.fingerprint.json"),
        "the capture key is a storage format"
    );
    assert_eq!(
        namespace.artifacts().to_string(),
        format!("{root}/artifacts"),
        "the artifact prefix is a storage format"
    );
    assert_ne!(
        ArtifactNamespace::new(web, &"linear".parse().expect("should be a connector ID")),
        namespace,
        "each connector of a web should have its own root"
    );
}

#[tokio::test]
async fn s3_errors_are_not_missing_or_mismatching_artifacts() {
    let directory = TempDir::new().expect("should create a directory");
    let (_minio, port) = minio().await;
    let artifact = storage(Some(port), directory.path())
        .publish(
            &namespace(Uuid::new_v4()).artifacts(),
            &file(directory.path(), b"{}"),
            Format::Json,
        )
        .await
        .expect("should publish the artifact");
    let storage = ArtifactStorage::s3(
        &S3Bucket {
            secret: Secret::from_vec(b"wrong".to_vec()),
            ..bucket(port)
        },
        TempDir::new_in(directory.path()).expect("should create the staging directory"),
    )
    .expect("should create S3 storage");

    let error = storage
        .publish(
            &namespace(Uuid::new_v4()).artifacts(),
            &file(directory.path(), b"[]"),
            Format::Json,
        )
        .await
        .expect_err("should fail when the bucket cannot be reached");
    assert!(
        matches!(error.current_context(), ArtifactError::Read),
        "a failed existence check should be a read error, not a missing artifact"
    );
    let error = storage
        .materialize(&artifact)
        .await
        .expect_err("should fail when the bucket cannot be read");
    assert!(
        matches!(error.current_context(), ArtifactError::Read),
        "a failed download should be a read error, not a mismatch"
    );
}

#[test]
fn staging_files_are_unique() {
    let directory = TempDir::new().expect("should create a directory");
    let storage = storage(None, directory.path());

    assert_ne!(
        storage.staging_file(Format::Parquet),
        storage.staging_file(Format::Parquet),
        "a file left by a failed attempt should not block the next attempt"
    );
}

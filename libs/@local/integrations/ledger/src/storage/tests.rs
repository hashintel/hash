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
    ArtifactError, ArtifactKey, ArtifactNamespace, ArtifactRef, ArtifactStorage, Bound, CasVersion,
    Format, S3Bucket, artifact::CHUNK_SIZE,
};
use crate::CaptureRun;


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

fn connector() -> ConnectorId {
    "aviation".parse().expect("should be a connector ID")
}

fn namespace(web: Uuid) -> ArtifactNamespace {
    ArtifactNamespace::new(web, &connector())
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
        &directory.path().join("staging"),
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
    let staging = restore.stage().expect("should create the run's staging");
    let path = restore
        .materialize(&artifact, staging.path())
        .await
        .expect("should materialize the artifact");
    assert!(
        fs::read(path).expect("should read the artifact") == bytes,
        "should materialize the published bytes"
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
    assert_eq!(
        namespace.run(Uuid::from_u128(2)).to_string(),
        format!("{root}/runs/00000000-0000-0000-0000-000000000002/run.json"),
        "the run key is a storage format"
    );
    assert_eq!(
        namespace.current().to_string(),
        format!("{root}/current.json"),
        "the current run key is a storage format"
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
        &directory.path().join("staging"),
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
        .materialize(&artifact, directory.path())
        .await
        .expect_err("should fail when the bucket cannot be read");
    assert!(
        matches!(error.current_context(), ArtifactError::Read),
        "a failed download should be a read error, not a mismatch"
    );
}

fn json_bytes(value: &Value) -> Vec<u8> {
    serde_json::to_vec(value).expect("should serialize the value")
}

/// Reads the JSON value at `key` and its version.
async fn read_json(storage: &ArtifactStorage, key: &ArtifactKey) -> (Value, CasVersion) {
    let (bytes, version) = storage
        .read_versioned(key)
        .await
        .expect("should read the file")
        .expect("the file should exist");
    (
        serde_json::from_slice(&bytes).expect("should be JSON"),
        version,
    )
}

#[rstest]
#[case::local(false)]
#[case::s3(true)]
#[tokio::test]
async fn replace_if_conditional_put(#[case] s3: bool) {
    let directory = TempDir::new().expect("should create a directory");
    let minio = if s3 { Some(minio().await) } else { None };
    let port = minio.as_ref().map(|(_, port)| *port);
    let storage = storage(port, directory.path());
    let key = namespace(Uuid::new_v4()).current();
    let first = json!({"generation": 1, "writer": "first"});
    let second = json!({"generation": 2, "writer": "second"});

    assert!(
        storage
            .replace_if(&key, None, json_bytes(&first))
            .await
            .expect("should create the file"),
        "a create under a fresh key should write"
    );
    let (observed, version) = read_json(&storage, &key).await;
    assert_eq!(observed, first, "the created value should be readable");
    assert!(
        !storage
            .replace_if(&key, None, json_bytes(&second))
            .await
            .expect("should try to create the file"),
        "a second create should conflict"
    );
    assert!(
        storage
            .replace_if(&key, Some(&version), json_bytes(&second))
            .await
            .expect("should replace the file"),
        "a replace with the current version should write"
    );
    assert!(
        !storage
            .replace_if(&key, Some(&version), json_bytes(&first))
            .await
            .expect("should try to replace the file"),
        "a replace with a stale version should conflict"
    );
    assert_eq!(
        read_json(&storage, &key).await.0,
        second,
        "the conflict should keep the second writer's value"
    );
}

#[tokio::test]
async fn versioned_size_limit() {
    let directory = TempDir::new().expect("should create a directory");
    let storage = storage(None, directory.path());
    let key = namespace(Uuid::new_v4()).current();
    let bytes = vec![b' '; 1024 * 1024 + 1];

    let error = storage
        .replace_if(&key, None, bytes.clone())
        .await
        .expect_err("should refuse to write more than 1 MiB");
    assert!(
        matches!(error.current_context(), ArtifactError::Write),
        "an oversized write should be a write error"
    );
    assert_eq!(
        storage
            .read_versioned(&key)
            .await
            .expect("should read the key"),
        None,
        "the refused write should leave the key missing"
    );

    let path = directory.path().join("artifacts").join(key.to_string());
    fs::create_dir_all(path.parent().expect("the key should have a parent"))
        .expect("should create the key's directory");
    fs::write(&path, &bytes).expect("should write the file");
    let error = storage
        .read_versioned(&key)
        .await
        .expect_err("should refuse to read more than 1 MiB");
    assert!(
        matches!(error.current_context(), ArtifactError::Read),
        "an oversized read should be a read error"
    );
}

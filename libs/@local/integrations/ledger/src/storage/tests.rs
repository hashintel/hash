use std::{fs, path::PathBuf};

use hash_crypto::Secret;
use object_store::{ObjectStore as _, PutPayload, path::Path as Location};
use rstest::rstest;
use tempfile::TempDir;
use testcontainers::ContainerAsync;
use testcontainers_modules::minio::MinIO;
use uuid::Uuid;

use super::{
    IntegrationNamespace, S3Bucket, Storage, StorageError, file::CHUNK_SIZE,
    versioned::MAX_VERSIONED_BYTES,
};
use crate::testing::{bucket, minio, namespace};

const KEY: &str = "runs/run/capture/items.parquet";

/// The in-memory store, or a bucket on a new MinIO container that lives as long as the
/// returned container.
async fn storage(s3: bool) -> (Option<ContainerAsync<MinIO>>, Storage) {
    if s3 {
        let (minio, port) = minio().await;
        let storage = Storage::s3(bucket(port), &namespace()).expect("should open the bucket");
        (Some(minio), storage)
    } else {
        (None, Storage::memory())
    }
}

const ROOT: &str = "tenants/00000000-0000-0000-0000-000000000001/integrations/\
                    a290c6f051d0a83cd0663dd31819fb8d9b8fac2705e6e0618c3b0c11142d7477";

#[test]
fn namespace_is_stable() {
    assert_eq!(
        namespace().root(),
        ROOT,
        "the namespace should not change, because it is a storage format"
    );
}

#[test]
fn s3_namespace_below_prefix() {
    assert_eq!(
        &*Storage::s3(
            S3Bucket {
                uri: "s3://captures/prefix/".into(),
                ..bucket(9000)
            },
            &namespace()
        )
        .expect("should open the bucket")
        .bucket()
        .expect("should have a bucket")
        .uri,
        format!("s3://captures/prefix/{ROOT}"),
        "the namespace should be below the bucket's prefix"
    );
}

#[tokio::test]
async fn namespaces_keep_integrations_apart() {
    let (_minio, port) = minio().await;
    let aviation = Storage::s3(bucket(port), &namespace()).expect("should open the bucket");
    let linear = Storage::s3(
        bucket(port),
        &IntegrationNamespace::new(
            Uuid::from_u128(1),
            &"linear".parse().expect("should be a connector ID"),
        ),
    )
    .expect("should open the bucket");

    aviation
        .replace_if("current.json", None, b"aviation".to_vec())
        .await
        .expect("should create the file");
    assert_eq!(
        linear
            .read_versioned("current.json")
            .await
            .expect("should read the key"),
        None,
        "another integration should not see the file"
    );
    let stored = super::s3::open(&bucket(port))
        .expect("should open the bucket")
        .get(&Location::from(format!("{ROOT}/current.json")))
        .await
        .expect("the file should be stored under the namespace")
        .bytes()
        .await
        .expect("should read the file");
    assert_eq!(
        &*stored, b"aviation",
        "should store the file under the namespace"
    );
}

/// Writes `bytes` to a new file in `directory` and returns its path.
fn file(directory: &TempDir, name: &str, bytes: &[u8]) -> PathBuf {
    let path = directory.path().join(name);
    fs::write(&path, bytes).expect("should write the file");
    path
}

#[rstest]
#[case::memory(false)]
#[case::s3(true)]
#[tokio::test]
async fn files_round_trip(#[case] s3: bool) {
    let (_minio, storage) = storage(s3).await;
    let uploads = TempDir::new().expect("should create a directory");
    let downloads = TempDir::new().expect("should create a directory");
    // Larger than two upload parts, so the upload has several parts and a shorter last one.
    let bytes: Vec<u8> = (0..=u8::MAX).cycle().take(2 * CHUNK_SIZE + 3).collect();

    let size = storage
        .upload(&file(&uploads, "upload.bin", &bytes), KEY)
        .await
        .expect("should upload the file");
    assert_eq!(size, bytes.len() as u64, "should return the size");

    let path = storage
        .download(KEY, downloads.path())
        .await
        .expect("should download the file");
    assert_eq!(
        path,
        downloads.path().join(KEY),
        "should keep the key's path"
    );
    assert!(
        fs::read(path).expect("should read the file") == bytes,
        "should download the uploaded bytes"
    );
}

#[tokio::test]
async fn upload_replaces_existing() {
    let (_minio, storage) = storage(true).await;
    let uploads = TempDir::new().expect("should create a directory");
    let downloads = TempDir::new().expect("should create a directory");

    for (name, bytes) in [("first.bin", b"first"), ("second.bin", b"other")] {
        storage
            .upload(&file(&uploads, name, bytes), KEY)
            .await
            .expect("should upload the file");
        let path = storage
            .download(KEY, downloads.path())
            .await
            .expect("should download the file");
        assert_eq!(
            fs::read(path).expect("should read the file"),
            bytes,
            "should download the last upload"
        );
    }
}

#[tokio::test]
async fn download_missing_key() {
    let (_minio, storage) = storage(true).await;
    let downloads = TempDir::new().expect("should create a directory");

    let error = storage
        .download(KEY, downloads.path())
        .await
        .expect_err("should fail for a missing key");
    assert!(
        matches!(error.current_context(), StorageError::Read),
        "a missing key should be a read error"
    );
    assert_eq!(
        fs::read_dir(downloads.path())
            .expect("should read the directory")
            .count(),
        0,
        "should leave the directory empty"
    );
}

#[tokio::test]
async fn upload_missing_file() {
    let directory = TempDir::new().expect("should create a directory");

    let error = Storage::memory()
        .upload(&directory.path().join("missing.bin"), KEY)
        .await
        .expect_err("should fail for a missing file");
    assert!(
        matches!(error.current_context(), StorageError::Read),
        "a missing file should be a read error"
    );
}

#[tokio::test]
async fn download_keeps_inside_directory() {
    let storage = Storage::memory();
    let downloads = TempDir::new().expect("should create a directory");

    for key in ["../escape.bin", "runs/../../escape.bin", "/escape.bin"] {
        let error = storage
            .download(key, downloads.path())
            .await
            .expect_err("should refuse a key that leaves the directory");
        assert!(
            matches!(error.current_context(), StorageError::Write),
            "the key {key} should be a write error"
        );
    }
}

#[tokio::test]
async fn s3_errors_are_not_missing_files() {
    let (_minio, port) = minio().await;
    let downloads = TempDir::new().expect("should create a directory");
    let storage = Storage::s3(
        S3Bucket {
            secret: Secret::from_vec(b"wrong".to_vec()),
            ..bucket(port)
        },
        &namespace(),
    )
    .expect("should open the bucket");

    let error = storage
        .read_versioned(KEY)
        .await
        .expect_err("should fail when the bucket cannot be read");
    assert!(
        matches!(error.current_context(), StorageError::Read),
        "a failed read should be a read error, not a missing file"
    );
    let error = storage
        .download(KEY, downloads.path())
        .await
        .expect_err("should fail when the bucket cannot be read");
    assert!(
        matches!(error.current_context(), StorageError::Read),
        "a failed download should be a read error"
    );
    let error = storage
        .replace_if(KEY, None, b"bytes".to_vec())
        .await
        .expect_err("should fail when the bucket cannot be written");
    assert!(
        matches!(error.current_context(), StorageError::Write),
        "a failed write should be a write error, not a conflict"
    );
}

#[rstest]
#[case::memory(false)]
#[case::s3(true)]
#[tokio::test]
async fn replace_if_conditional_put(#[case] s3: bool) {
    let (_minio, storage) = storage(s3).await;
    let key = "current.json";
    let first = b"first".to_vec();
    let second = b"second".to_vec();

    assert!(
        storage
            .replace_if(key, None, first.clone())
            .await
            .expect("should create the file"),
        "a create under a fresh key should write"
    );
    let (observed, version) = storage
        .read_versioned(key)
        .await
        .expect("should read the file")
        .expect("the file should exist");
    assert_eq!(observed, first, "the created value should be readable");
    assert!(
        !storage
            .replace_if(key, None, second.clone())
            .await
            .expect("should try to create the file"),
        "a second create should conflict"
    );
    assert!(
        storage
            .replace_if(key, Some(&version), second.clone())
            .await
            .expect("should replace the file"),
        "a replace with the current version should write"
    );
    assert!(
        !storage
            .replace_if(key, Some(&version), first)
            .await
            .expect("should try to replace the file"),
        "a replace with a stale version should conflict"
    );
    assert_eq!(
        storage
            .read_versioned(key)
            .await
            .expect("should read the file")
            .expect("the file should exist")
            .0,
        second,
        "the conflict should keep the second writer's value"
    );
}

#[tokio::test]
async fn versioned_size_limit() {
    let storage = Storage::memory();
    let key = "current.json";

    assert!(
        storage
            .replace_if(key, None, vec![b' '; MAX_VERSIONED_BYTES])
            .await
            .expect("should write a file at the limit"),
        "a create under a fresh key should write"
    );
    assert!(
        storage
            .read_versioned(key)
            .await
            .expect("should read a file at the limit")
            .is_some(),
        "the file at the limit should exist"
    );

    let key = "run.json";
    let bytes = vec![b' '; MAX_VERSIONED_BYTES + 1];

    let error = storage
        .replace_if(key, None, bytes.clone())
        .await
        .expect_err("should refuse to write more than 16 MiB");
    assert!(
        matches!(error.current_context(), StorageError::Write),
        "an oversized write should be a write error"
    );
    assert_eq!(
        storage
            .read_versioned(key)
            .await
            .expect("should read the key"),
        None,
        "the refused write should leave the key missing"
    );

    storage
        .store
        .put(&Location::from(key), PutPayload::from(bytes))
        .await
        .expect("should store the file");
    let error = storage
        .read_versioned(key)
        .await
        .expect_err("should refuse to read more than 16 MiB");
    assert!(
        matches!(error.current_context(), StorageError::Read),
        "an oversized read should be a read error"
    );
}

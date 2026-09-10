use alloc::borrow::Cow;
use core::assert_matches;
use std::fs;

use super::FilePath;
use crate::file::storage::{
    Storage,
    error::StorageError,
    path::error::{FilePathError, PathComponent},
    tests as fixtures,
};

#[test]
fn parse_local() {
    let path: FilePath = "relative/file.bin"
        .parse()
        .expect("should parse a local path");
    assert_matches!(path.as_s3(), None);
    assert_eq!(path.to_string(), "relative/file.bin");
}

#[test]
fn parse_s3() {
    let path: FilePath = "s3://bucket/key".parse().expect("should parse an S3 path");
    let remote = path.as_s3().expect("should retain the S3 variant");
    assert_eq!((remote.bucket(), remote.key()), ("bucket", "key"));
}

#[test]
fn parse_embedded_scheme() {
    let path: FilePath = "not-s3://bucket/key"
        .parse()
        .expect("should parse a local path");
    assert_matches!(path.as_s3(), None);
}

#[test]
fn parse_empty_bucket() {
    assert_matches!(
        "s3:///key".parse::<FilePath>(),
        Err(FilePathError::Empty {
            component: PathComponent::Bucket
        })
    );
}

#[tokio::test]
async fn read_local() {
    let directory = fixtures::TemporaryDirectory::new();
    let file = directory.path().join("input.bin");
    fs::write(&file, b"local contents").expect("should write the source file");
    let path: FilePath = file.as_str().parse().expect("should parse a local path");
    let storage = Storage::new(None);
    assert_eq!(
        path.read(&storage).await.expect("should read without S3"),
        b"local contents"
    );
}

#[tokio::test]
async fn read_s3_unconfigured() {
    let path: FilePath = "s3://bucket/key".parse().expect("should parse an S3 path");
    let error = path
        .read(&Storage::new(None))
        .await
        .expect_err("should require an S3 backend");
    assert_matches!(error, StorageError::S3Unavailable);
}

#[tokio::test]
async fn sync_local() {
    let source = fixtures::TemporaryDirectory::new();
    let file = source.path().join("input.bin");
    fs::write(&file, b"local contents").expect("should write the source file");
    let path: FilePath = file.as_str().parse().expect("should parse a local path");
    let destination = fixtures::TemporaryDirectory::new();
    let resolved = path
        .sync_to_local(&Storage::new(None), destination.path())
        .await
        .expect("should resolve the local path without S3");
    assert_matches!(resolved, Cow::Borrowed(value) if value == file);
    assert_eq!(destination.entry_count(), 0);
}

#[tokio::test]
async fn sync_s3_unconfigured() {
    let path: FilePath = "s3://bucket/key".parse().expect("should parse an S3 path");
    let destination = fixtures::TemporaryDirectory::new();
    let missing = destination.path().join("missing");
    for directory in [destination.path(), missing.as_path()] {
        let error = path
            .sync_to_local(&Storage::new(None), directory)
            .await
            .expect_err("should require S3 before accessing the destination");
        assert_matches!(error, StorageError::S3Unavailable);
    }
    assert_eq!(destination.entry_count(), 0);
}

#[tokio::test]
async fn sync_s3_unique() {
    let path: FilePath = "s3://bucket/key".parse().expect("should parse an S3 path");
    let destination = fixtures::TemporaryDirectory::new();
    let first_server =
        fixtures::LoopbackServer::start(fixtures::ok_response(b"first body", None)).await;
    let first_storage = fixtures::storage(&first_server.endpoint_url());
    let first = path
        .sync_to_local(&first_storage, destination.path())
        .await
        .expect("should download the first object");
    assert_eq!(first_server.finish().await.len(), 1);

    let second_server =
        fixtures::LoopbackServer::start(fixtures::ok_response(b"second body", None)).await;
    let second_storage = fixtures::storage(&second_server.endpoint_url());
    let second = path
        .sync_to_local(&second_storage, destination.path())
        .await
        .expect("should download the second object");
    assert_eq!(second_server.finish().await.len(), 1);

    assert_ne!(first, second);
    assert_eq!(
        fs::read(first.as_ref()).expect("should read the first download"),
        b"first body"
    );
    assert_eq!(
        fs::read(second.as_ref()).expect("should read the second download"),
        b"second body"
    );
    assert_eq!(destination.entry_count(), 2);
}

#[tokio::test]
async fn sync_s3_truncated() {
    let path: FilePath = "s3://bucket/key".parse().expect("should parse an S3 path");
    let destination = fixtures::TemporaryDirectory::new();
    let sentinel = destination.path().join("retained.bin");
    fs::write(&sentinel, b"retained").expect("should write an unrelated file");
    let server =
        fixtures::LoopbackServer::start(fixtures::short_body_response(1000, b"short")).await;
    let storage = fixtures::storage(&server.endpoint_url());
    let error = path
        .sync_to_local(&storage, destination.path())
        .await
        .expect_err("should refuse the truncated body");
    assert_eq!(server.finish().await.len(), 1);
    assert_matches!(error, StorageError::Body(_));
    assert_eq!(destination.entry_count(), 1);
    assert_eq!(
        fs::read(sentinel).expect("should retain the unrelated file"),
        b"retained"
    );
}

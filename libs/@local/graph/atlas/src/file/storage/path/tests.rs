use alloc::borrow::Cow;
use core::{assert_matches, pin::pin};
use std::{fs, io};

use tokio::io::AsyncReadExt as _;

use super::{FilePath, FilePathVariant};
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
    let reader = {
        let path: FilePath = file.as_str().parse().expect("should parse a local path");
        let storage = Storage::new(None, directory.path().join("unused"));
        path.read(&storage).await.expect("should open without S3")
    };
    let mut reader = pin!(reader);
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .await
        .expect("should read the local file");
    assert_eq!(bytes, b"local contents");
}

#[tokio::test]
async fn read_local_missing() {
    let directory = fixtures::TemporaryDirectory::new();
    let file = directory.path().join("missing.bin");
    let path: FilePath = file.as_str().parse().expect("should parse a local path");
    let storage = Storage::new(None, directory.path().to_owned());
    let error = path
        .read(&storage)
        .await
        .err()
        .expect("should report the missing file");
    assert_matches!(error, StorageError::Io(error) if error.kind() == io::ErrorKind::NotFound);
}

#[tokio::test]
async fn read_s3() {
    let directory = fixtures::TemporaryDirectory::new();
    let server =
        fixtures::LoopbackServer::start(fixtures::ok_response(b"remote contents", None)).await;
    let reader = {
        let path: FilePath = "s3://bucket/key".parse().expect("should parse an S3 path");
        let storage = fixtures::storage(&server.endpoint_url(), directory.path().join("unused"));
        path.read(&storage)
            .await
            .expect("should open the remote file")
    };
    let mut reader = pin!(reader);
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .await
        .expect("should read the remote file");
    assert_eq!(bytes, b"remote contents");
    assert_eq!(directory.entry_count(), 0);
    assert_eq!(server.finish().await.len(), 1);
}

#[tokio::test]
async fn read_s3_unconfigured() {
    let directory = fixtures::TemporaryDirectory::new();
    let path: FilePath = "s3://bucket/key".parse().expect("should parse an S3 path");
    let storage = Storage::new(None, directory.path().to_owned());
    let error = path
        .read(&storage)
        .await
        .err()
        .expect("should require an S3 backend");
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
        .sync_to_local(&Storage::new(None, destination.path().to_owned()))
        .await
        .expect("should resolve the local path without S3");
    assert_matches!(resolved, Cow::Borrowed(value) if value == file);
    assert_eq!(destination.entry_count(), 0);
}

#[tokio::test]
async fn into_local_missing() {
    let directory = fixtures::TemporaryDirectory::new();
    let file = directory.path().join("missing.bin");
    let allocation = file.as_str().as_ptr();
    let path = FilePath {
        variant: FilePathVariant::Local(file),
    };
    let storage = Storage::new(None, directory.path().join("unused"));
    let resolved = path
        .into_local_file(&storage)
        .await
        .expect("should return the local path without opening it");
    assert_eq!(resolved, directory.path().join("missing.bin"));
    assert_eq!(resolved.as_str().as_ptr(), allocation);
    assert_eq!(directory.entry_count(), 0);
}

#[tokio::test]
async fn into_local_s3() {
    let destination = fixtures::TemporaryDirectory::new();
    let server =
        fixtures::LoopbackServer::start(fixtures::ok_response(b"owned contents", None)).await;
    let storage = fixtures::storage(&server.endpoint_url(), destination.path().to_owned());
    let path: FilePath = "s3://bucket/key".parse().expect("should parse an S3 path");
    let resolved = path
        .into_local_file(&storage)
        .await
        .expect("should download the owned input");
    drop(storage);
    assert_eq!(resolved.parent(), Some(destination.path()));
    assert_eq!(
        fs::read(&resolved).expect("should read the completed download"),
        b"owned contents"
    );
    assert_eq!(destination.entry_count(), 1);
    assert_eq!(server.finish().await.len(), 1);
}

#[tokio::test]
async fn into_local_unconfigured() {
    let destination = fixtures::TemporaryDirectory::new();
    let storage = Storage::new(None, destination.path().join("missing"));
    let path: FilePath = "s3://bucket/key".parse().expect("should parse an S3 path");
    let error = path
        .into_local_file(&storage)
        .await
        .expect_err("should require S3 before creating a destination");
    assert_matches!(error, StorageError::S3Unavailable);
    assert_eq!(destination.entry_count(), 0);
}

#[tokio::test]
async fn sync_s3_unconfigured() {
    let path: FilePath = "s3://bucket/key".parse().expect("should parse an S3 path");
    let destination = fixtures::TemporaryDirectory::new();
    let missing = destination.path().join("missing");
    for directory in [destination.path(), missing.as_path()] {
        let error = path
            .sync_to_local(&Storage::new(None, directory.to_owned()))
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
    let first_storage =
        fixtures::storage(&first_server.endpoint_url(), destination.path().to_owned());
    let first = path
        .sync_to_local(&first_storage)
        .await
        .expect("should download the first object");
    assert_eq!(first_server.finish().await.len(), 1);

    let second_server =
        fixtures::LoopbackServer::start(fixtures::ok_response(b"second body", None)).await;
    let second_storage =
        fixtures::storage(&second_server.endpoint_url(), destination.path().to_owned());
    let second = path
        .sync_to_local(&second_storage)
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
    let storage = fixtures::storage(&server.endpoint_url(), destination.path().to_owned());
    let error = path
        .sync_to_local(&storage)
        .await
        .expect_err("should refuse the truncated body");
    assert_eq!(server.finish().await.len(), 1);
    assert_matches!(error, StorageError::Io(_));
    assert_eq!(destination.entry_count(), 1);
    assert_eq!(
        fs::read(sentinel).expect("should retain the unrelated file"),
        b"retained"
    );
}

use alloc::borrow::Cow;
use core::{assert_matches, pin::pin};
use std::{fs, io};

use tokio::io::AsyncReadExt as _;

use super::{FilePath, FilePathVariant};
use crate::file::{
    generation::scratch::tests::{entry_count, root, scratch},
    storage::{
        Storage,
        error::StorageError,
        path::error::{FilePathError, PathComponent},
    },
};

mod mutation;

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
    let directory = scratch();
    let file = root(&directory).join("input.bin");
    fs::write(&file, b"local contents").expect("should write the source file");
    let reader = {
        let path: FilePath = file.as_str().parse().expect("should parse a local path");
        let storage = Storage::new(root(&directory).join("unused"));
        path.read(&storage).await.expect("should open without S3")
    };
    let mut reader = pin!(reader);
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .await
        .expect("should read the local file");
    assert_eq!(bytes, b"local contents");
    drop(directory);
}

#[tokio::test]
async fn read_local_missing() {
    let directory = scratch();
    let file = root(&directory).join("missing.bin");
    let path: FilePath = file.as_str().parse().expect("should parse a local path");
    let storage = Storage::new(root(&directory).to_owned());
    let error = path
        .read(&storage)
        .await
        .err()
        .expect("should report the missing file");
    assert_matches!(error, StorageError::Io(error) if error.kind() == io::ErrorKind::NotFound);
    drop(directory);
}

#[tokio::test]
async fn read_s3_unconfigured() {
    let directory = scratch();
    let path: FilePath = "s3://bucket/key".parse().expect("should parse an S3 path");
    let storage = Storage::new(root(&directory).to_owned());
    let error = path
        .read(&storage)
        .await
        .err()
        .expect("should require an S3 backend");
    assert_matches!(error, StorageError::S3Unavailable);
    drop(directory);
}

#[tokio::test]
async fn sync_local() {
    let source = scratch();
    let file = root(&source).join("input.bin");
    fs::write(&file, b"local contents").expect("should write the source file");
    let path: FilePath = file.as_str().parse().expect("should parse a local path");
    let destination = scratch();
    let resolved = path
        .sync_to_local(&Storage::new(root(&destination).to_owned()))
        .await
        .expect("should resolve the local path without S3");
    assert_matches!(resolved, Cow::Borrowed(value) if value == file);
    assert_eq!(entry_count(root(&destination)), 0);
    drop(source);
}

#[tokio::test]
async fn into_local_missing() {
    let directory = scratch();
    let file = root(&directory).join("missing.bin");
    let allocation = file.as_str().as_ptr();
    let path = FilePath {
        variant: FilePathVariant::Local(file),
    };
    let storage = Storage::new(root(&directory).join("unused"));
    let resolved = path
        .into_local_file(&storage)
        .await
        .expect("should return the local path without opening it");
    assert_eq!(resolved, root(&directory).join("missing.bin"));
    assert_eq!(resolved.as_str().as_ptr(), allocation);
    assert_eq!(entry_count(root(&directory)), 0);
}

#[tokio::test]
async fn into_local_unconfigured() {
    let destination = scratch();
    let storage = Storage::new(root(&destination).join("missing"));
    let path: FilePath = "s3://bucket/key".parse().expect("should parse an S3 path");
    let error = path
        .into_local_file(&storage)
        .await
        .expect_err("should require S3 before creating a destination");
    assert_matches!(error, StorageError::S3Unavailable);
    assert_eq!(entry_count(root(&destination)), 0);
}

#[tokio::test]
async fn sync_s3_unconfigured() {
    let path: FilePath = "s3://bucket/key".parse().expect("should parse an S3 path");
    let destination = scratch();
    let missing = root(&destination).join("missing");
    for directory in [root(&destination), missing.as_path()] {
        let error = path
            .sync_to_local(&Storage::new(directory.to_owned()))
            .await
            .expect_err("should require S3 before accessing the destination");
        assert_matches!(error, StorageError::S3Unavailable);
    }
    assert_eq!(entry_count(root(&destination)), 0);
}

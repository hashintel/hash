use core::{assert_matches, pin::pin};
use std::fs;

use bytes::Bytes;
use tokio::io::AsyncReadExt as _;

use crate::file::{
    generation::scratch::tests::{entry_count, root, scratch},
    storage::{
        Storage, WriteCondition,
        error::StorageError,
        path::{FilePath, FilePathVariant},
    },
};

/// A local join appends a multi-segment suffix under one separator and keeps the variant.
#[test]
fn join_local_nested() {
    let path: FilePath = "output".parse().expect("should parse the local prefix");
    let joined = path
        .join("generations/current")
        .expect("should join the suffix");
    assert_eq!(joined.to_string(), "output/generations/current");
    assert_matches!(&joined.variant, FilePathVariant::Local(_));
}

/// Joining appends an S3 suffix as literal key text, with exactly one separating slash.
#[test]
fn join_s3_literal() {
    for prefix in ["s3://bucket/prefix", "s3://bucket/prefix/"] {
        let path: FilePath = prefix.parse().expect("should parse the S3 prefix");
        let joined = path
            .join("nested/%2F space")
            .expect("should join the literal suffix");
        let FilePathVariant::Bucket(remote) = &joined.variant else {
            panic!("should preserve the S3 backend");
        };
        assert_eq!(
            (remote.bucket(), remote.key()),
            ("bucket", "prefix/nested/%2F space")
        );
    }
}

/// An opened reader retains the old contents after conditional replacement.
#[tokio::test]
async fn get_replaced_contents() {
    let directory = scratch();
    let storage = Storage::new(root(&directory).to_owned());
    let file = root(&directory).join("current");
    let path: FilePath = file.as_str().parse().expect("should parse the destination");
    path.put(&storage, Bytes::from_static(b"old"), WriteCondition::Absent)
        .await
        .expect("should create the initial contents");
    let (reader, revision) = path
        .get(&storage)
        .await
        .expect("should open the initial contents")
        .into_parts();
    path.put(
        &storage,
        Bytes::from_static(b"new"),
        WriteCondition::Match(&revision),
    )
    .await
    .expect("should replace the observed contents");
    let mut body = Vec::new();
    let mut reader = pin!(reader);
    reader
        .read_to_end(&mut body)
        .await
        .expect("should read the opened contents");
    assert_eq!(body, b"old");
    assert_eq!(
        fs::read(&file).expect("should read the destination"),
        b"new"
    );
    drop(directory);
}

/// A refused absent write leaves the existing contents in place.
#[tokio::test]
async fn put_absent_existing() {
    let directory = scratch();
    let storage = Storage::new(root(&directory).to_owned());
    let file = root(&directory).join("current");
    let path: FilePath = file.as_str().parse().expect("should parse the destination");
    fs::write(&file, b"retained").expect("should seed the destination");
    let error = path
        .put(
            &storage,
            Bytes::from_static(b"replacement"),
            WriteCondition::Absent,
        )
        .await
        .expect_err("should refuse an existing destination");
    assert_matches!(error, StorageError::PreconditionFailed);
    assert_eq!(
        fs::read(&file).expect("should read the destination"),
        b"retained"
    );
    drop(directory);
}

/// Conditional replacement of a removed destination fails without recreating it.
#[tokio::test]
async fn put_match_missing() {
    let directory = scratch();
    let storage = Storage::new(root(&directory).to_owned());
    let file = root(&directory).join("current");
    let path: FilePath = file.as_str().parse().expect("should parse the destination");
    fs::write(&file, b"old").expect("should seed the destination");
    let (_, revision) = path
        .get(&storage)
        .await
        .expect("should capture a revision")
        .into_parts();
    fs::remove_file(&file).expect("should remove the destination");
    let error = path
        .put(
            &storage,
            Bytes::from_static(b"new"),
            WriteCondition::Match(&revision),
        )
        .await
        .expect_err("should refuse the missing revision");
    assert_matches!(error, StorageError::PreconditionFailed);
    assert!(!file.exists(), "should leave the destination absent");
    drop(directory);
}

/// Repeated replacement leaves the destination and the persistent lock, and no staging residue.
#[tokio::test]
async fn put_any_nested() {
    let directory = scratch();
    let storage = Storage::new(root(&directory).to_owned());
    let file = root(&directory).join("nested/current");
    let path: FilePath = file.as_str().parse().expect("should parse the destination");
    for bytes in [b"first".as_slice(), b"replacement"] {
        path.put(&storage, Bytes::copy_from_slice(bytes), WriteCondition::Any)
            .await
            .expect("should replace the complete file");
        assert_eq!(fs::read(&file).expect("should read the destination"), bytes);
    }
    assert_eq!(
        entry_count(file.parent().expect("should have a parent")),
        2,
        "should retain only the destination and persistent lock"
    );
    drop(directory);
}

/// Competing absent writes select exactly the successful write's body.
#[tokio::test]
async fn put_absent_competing() {
    let directory = scratch();
    let storage = Storage::new(root(&directory).to_owned());
    let file = root(&directory).join("current");
    let path: FilePath = file.as_str().parse().expect("should parse the destination");
    let (first, second) = tokio::join!(
        path.put(
            &storage,
            Bytes::from_static(b"first"),
            WriteCondition::Absent
        ),
        path.put(
            &storage,
            Bytes::from_static(b"second"),
            WriteCondition::Absent
        ),
    );
    let expected = match (first, second) {
        (Ok(()), Err(StorageError::PreconditionFailed)) => b"first".as_slice(),
        (Err(StorageError::PreconditionFailed), Ok(())) => b"second".as_slice(),
        results => panic!("should select one competing writer: {results:?}"),
    };
    assert_eq!(
        fs::read(&file).expect("should read the selected body"),
        expected
    );
    drop(directory);
}

/// Competing writes against one revision select exactly the successful write's body.
#[tokio::test]
async fn put_match_competing() {
    let directory = scratch();
    let storage = Storage::new(root(&directory).to_owned());
    let file = root(&directory).join("current");
    let path: FilePath = file.as_str().parse().expect("should parse the destination");
    fs::write(&file, b"initial").expect("should seed the destination");
    let (_, first_revision) = path
        .get(&storage)
        .await
        .expect("should capture the first revision")
        .into_parts();
    let (_, second_revision) = path
        .get(&storage)
        .await
        .expect("should capture the second revision")
        .into_parts();
    let (first, second) = tokio::join!(
        path.put(
            &storage,
            Bytes::from_static(b"first"),
            WriteCondition::Match(&first_revision)
        ),
        path.put(
            &storage,
            Bytes::from_static(b"second"),
            WriteCondition::Match(&second_revision)
        ),
    );
    let expected = match (first, second) {
        (Ok(()), Err(StorageError::PreconditionFailed)) => b"first".as_slice(),
        (Err(StorageError::PreconditionFailed), Ok(())) => b"second".as_slice(),
        results => panic!("should select one competing writer: {results:?}"),
    };
    assert_eq!(
        fs::read(&file).expect("should read the selected body"),
        expected
    );
    drop(directory);
}

/// A write refuses a destination inside the `.storage-` namespace and creates nothing.
#[tokio::test]
async fn put_reserved_destination() {
    let directory = scratch();
    let storage = Storage::new(root(&directory).to_owned());
    for suffix in ["missing/.storage-lock", "missing/.storage-stage/contents"] {
        let path: FilePath = root(&directory)
            .join(suffix)
            .as_str()
            .parse()
            .expect("should parse the reserved path");
        let error = path
            .put(&storage, Bytes::new(), WriteCondition::Any)
            .await
            .expect_err("should refuse the temporary storage namespace");
        assert_matches!(error, StorageError::InvalidLocalDestination);
    }
    assert_eq!(entry_count(root(&directory)), 0);
    drop(directory);
}

/// Copying creates missing parents and preserves the first body against a later absent-only copy.
#[tokio::test]
async fn copy_local_nested() {
    let directory = scratch();
    let storage = Storage::new(root(&directory).to_owned());
    let file = root(&directory).join("source");
    fs::write(&file, b"complete artifact").expect("should seed the source");
    let source: FilePath = file.as_str().parse().expect("should parse the source");
    let target = root(&directory).join("nested/target");
    let destination: FilePath = target
        .as_str()
        .parse()
        .expect("should parse the destination");
    destination
        .copy_from(&storage, &source, WriteCondition::Absent)
        .await
        .expect("should copy the complete file");
    assert_eq!(
        fs::read(&target).expect("should read the destination"),
        b"complete artifact"
    );
    fs::write(&file, b"changed source").expect("should change the source");
    let error = destination
        .copy_from(&storage, &source, WriteCondition::Absent)
        .await
        .expect_err("should preserve the existing destination");
    assert_matches!(error, StorageError::PreconditionFailed);
    assert_eq!(
        fs::read(&target).expect("should read the retained destination"),
        b"complete artifact"
    );
    drop(directory);
}

/// Every mutation reports the missing backend without touching the filesystem.
#[tokio::test]
async fn mutations_s3_unconfigured() {
    let directory = scratch();
    let storage = Storage::new(root(&directory).to_owned());
    let path: FilePath = "s3://bucket/key".parse().expect("should parse the S3 path");
    let missing = root(&directory).join("missing");
    assert_matches!(
        path.put(&storage, Bytes::new(), WriteCondition::Absent)
            .await,
        Err(StorageError::S3Unavailable)
    );
    assert_matches!(
        path.upload(&storage, &missing, WriteCondition::Absent)
            .await,
        Err(StorageError::S3Unavailable)
    );
    assert_matches!(
        path.copy_from(&storage, &path, WriteCondition::Absent)
            .await,
        Err(StorageError::S3Unavailable)
    );
    assert_eq!(entry_count(root(&directory)), 0);
    drop(directory);
}

//! Real-service cases for file transfers and prefix deletion.

use core::pin::pin;
use std::{fs, io::Write as _};

use camino::Utf8PathBuf;
use tokio::io::AsyncReadExt as _;
use uuid::Uuid;

use super::{
    ETag, S3, WriteCondition,
    multipart::{
        Multipart,
        backend::{Remote, Source},
    },
    path::BucketPath,
};
use crate::{
    file::{generation::ScratchDirectory, storage::Storage},
    test_utils::s3::Bucket,
};

/// Allocates a directory owned by one integration case.
///
/// # Panics
///
/// Panics if the temporary path is not UTF-8 or directory creation fails.
fn scratch() -> ScratchDirectory {
    let path = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("should have a UTF-8 temporary path")
        .join(format!("atlas-storage-integration-{}", Uuid::now_v7()));
    fs::create_dir_all(&path).expect("should create the scratch directory");
    ScratchDirectory::new(path)
}

/// Produces unequal part contents and a short final interval.
fn payload() -> Vec<u8> {
    // the minimum multipart interval is 5 MiB. High offset bits distinguish the short final part.
    (0_usize..5 * 1024 * 1024 + 137)
        .map(|offset| {
            u8::try_from((offset ^ (offset >> 16)) & 0xFF).expect("should fit the masked byte")
        })
        .collect()
}

/// Checks incremental reads and local materialization through the file-input API.
///
/// # Panics
///
/// Panics if either input path loses bytes or uses the wrong scratch directory.
pub async fn file_input_materialization() {
    Bucket::new()
        .await
        .run(async |bucket| {
            let scratch = scratch();
            let directory = scratch
                .directory("inputs")
                .expect("should create input scratch");

            let storage = Storage::new(directory.clone()).with_s3(bucket.client.clone());
            let key = "input directory/literal%2f \u{e9}.json";
            let bytes = payload();

            bucket.write(key, bytes.clone()).await;

            let path = bucket.path(key);
            let mut reader = pin!(
                path.read(&storage)
                    .await
                    .expect("should open the remote input")
            );

            let mut actual = Vec::new();
            reader
                .read_to_end(&mut actual)
                .await
                .expect("should read the remote input");
            assert_eq!(actual, bytes);

            let local = path
                .into_local_file(&storage)
                .await
                .expect("should materialize the input");
            assert_eq!(
                local.parent(),
                Some(directory.as_path()),
                "should use this run's scratch directory"
            );
            assert_eq!(
                fs::read(&local).expect("should read the local input"),
                bytes
            );

            let again = bucket
                .path(key)
                .into_local_file(&storage)
                .await
                .expect("should materialize another input");
            assert_ne!(local, again, "should allocate independent input files");
            assert_eq!(
                fs::read(again).expect("should read the second local input"),
                bytes
            );
            drop(storage);
            drop(scratch);
        })
        .await;
}

/// Checks recursive deletion across S3 listing pages and deletion batches.
///
/// # Panics
///
/// Panics if removal leaves a descendant, deletes an adjacent key or fails on an empty prefix.
pub async fn remove_prefix_batches() {
    Bucket::new()
        .await
        .run(async |bucket| {
            let scratch = scratch();
            let storage = Storage::new(
                scratch
                    .directory("storage")
                    .expect("should create storage scratch"),
            )
            .with_s3(bucket.client.clone());
            let prefix = "remove prefix%2f/\u{e9}";
            let adjacent = format!("{prefix}-retained/object");
            bucket.write(prefix, "exact key").await;
            bucket.write(&adjacent, "adjacent key").await;
            bucket
                .write(&format!("{prefix}/"), "directory marker")
                .await;

            // more than one listing page and one delete batch, including nested keys and a
            // directory marker.
            for index in 0..1001 {
                bucket
                    .write(&format!("{prefix}/nested/{index:04}"), "descendant")
                    .await;
            }

            bucket
                .path(prefix)
                .remove_dir_all(&storage)
                .await
                .expect("should remove the descendants");
            let remaining = bucket
                .client
                .list_objects_v2()
                .bucket(&bucket.name)
                .prefix(format!("{prefix}/"))
                .max_keys(1)
                .send()
                .await
                .expect("should list the removed prefix");
            assert!(
                remaining.contents().is_empty(),
                "should delete every descendant across batch boundaries"
            );
            assert_eq!(bucket.read(prefix).await.as_ref(), b"exact key");
            assert_eq!(bucket.read(&adjacent).await.as_ref(), b"adjacent key");

            let trailing_prefix = "trailing prefix%2f/\u{e9}/";
            let trailing = bucket.path(trailing_prefix);
            trailing
                .remove_dir_all(&storage)
                .await
                .expect("should accept an empty prefix");
            let descendant = format!("{trailing_prefix}new-object");
            bucket.write(&descendant, "new descendant").await;
            trailing
                .remove_dir_all(&storage)
                .await
                .expect("should preserve the trailing slash boundary");
            bucket.assert_absent(&descendant).await;
            bucket
                .path(&adjacent)
                .remove(&storage)
                .await
                .expect("should remove one object");
            bucket.assert_absent(&adjacent).await;
            bucket
                .path(&adjacent)
                .remove(&storage)
                .await
                .expect("should accept an absent object");
            assert_eq!(bucket.read(prefix).await.as_ref(), b"exact key");
            drop(storage);
            drop(scratch);
        })
        .await;
}

/// Checks local-file intervals and completion metadata against the stored object.
///
/// # Panics
///
/// Panics if multipart transfer changes any byte or leaves an incomplete upload.
pub async fn multipart_file() {
    Bucket::new()
        .await
        .run(async |bucket| {
            let scratch = scratch();
            let bytes = payload();

            let (path, mut file) = scratch
                .file("source.bin")
                .expect("should create the source file");
            file.write_all(&bytes)
                .expect("should write the source bytes");
            drop(file);

            let backend = S3::new(bucket.client.clone());
            let key = "multipart file/destination%2f \u{e9}";
            let destination: Box<BucketPath> = format!("s3://{}/{key}", bucket.name)
                .parse()
                .expect("should parse the destination");
            let remote = Remote {
                backend: &backend,
                destination: &destination,
                source: Source::File(&path),
                condition: WriteCondition::Absent,
            };

            Multipart::new(remote, bytes.len() as u64)
                .expect("should plan the multipart upload")
                .transfer()
                .await
                .expect("should complete the multipart upload");
            assert_eq!(bucket.read(key).await.as_ref(), bytes);

            let uploads = bucket
                .client
                .list_multipart_uploads()
                .bucket(&bucket.name)
                .send()
                .await
                .expect("should list remaining uploads");
            assert!(
                uploads.uploads().is_empty(),
                "should finish the multipart upload before returning"
            );

            drop(scratch);
        })
        .await;
}

/// Checks multipart copy ranges and literal copy-source key encoding.
///
/// # Panics
///
/// Panics if copying loses bytes or leaves an incomplete upload.
pub async fn multipart_copy() {
    Bucket::new()
        .await
        .run(async |bucket| {
            let bytes = payload();
            let source_key = "copy source/literal%2f \u{e9}";
            bucket.write(source_key, bytes.clone()).await;

            let head = bucket
                .client
                .head_object()
                .bucket(&bucket.name)
                .key(source_key)
                .send()
                .await
                .expect("should stat the source");

            let source: Box<BucketPath> = format!("s3://{}/{source_key}", bucket.name)
                .parse()
                .expect("should parse the source");

            let destination_key = "multipart copy/destination";
            let destination: Box<BucketPath> = format!("s3://{}/{destination_key}", bucket.name)
                .parse()
                .expect("should parse the destination");

            let backend = S3::new(bucket.client.clone());
            let remote = Remote {
                backend: &backend,
                destination: &destination,
                source: Source::Copy {
                    header: source.copy_source(),
                    etag: ETag::new(head.e_tag.expect("should have a source entity tag")),
                },
                condition: WriteCondition::Absent,
            };

            Multipart::new(remote, bytes.len() as u64)
                .expect("should plan the multipart copy")
                .transfer()
                .await
                .expect("should complete the multipart copy");
            assert_eq!(bucket.read(destination_key).await.as_ref(), bytes);

            let uploads = bucket
                .client
                .list_multipart_uploads()
                .bucket(&bucket.name)
                .send()
                .await
                .expect("should list remaining uploads");
            assert!(
                uploads.uploads().is_empty(),
                "should finish the multipart copy before returning"
            );
        })
        .await;
}

/// Checks cleanup after a real multipart completion precondition failure.
///
/// # Panics
///
/// Panics if the conflicting destination changes or the failed upload remains open.
pub async fn multipart_destination_conflict() {
    Bucket::new()
        .await
        .run(async |bucket| {
            let scratch = scratch();
            let bytes = payload();
            let (path, mut file) = scratch
                .file("source.bin")
                .expect("should create the source file");
            file.write_all(&bytes)
                .expect("should write the source bytes");
            drop(file);
            let key = "multipart conflict/destination";
            bucket.write(key, "winning object").await;
            let destination: Box<BucketPath> = format!("s3://{}/{key}", bucket.name)
                .parse()
                .expect("should parse the destination");
            let backend = S3::new(bucket.client.clone());
            let remote = Remote {
                backend: &backend,
                destination: &destination,
                source: Source::File(&path),
                condition: WriteCondition::Absent,
            };
            let error = Multipart::new(remote, bytes.len() as u64)
                .expect("should plan the multipart upload")
                .transfer()
                .await
                .expect_err("should reject the occupied destination");
            assert!(
                error.is_precondition_failed(),
                "should retain the completion precondition failure: {error}"
            );
            assert_eq!(bucket.read(key).await.as_ref(), b"winning object");
            let uploads = bucket
                .client
                .list_multipart_uploads()
                .bucket(&bucket.name)
                .send()
                .await
                .expect("should list remaining uploads");
            assert!(
                uploads.uploads().is_empty(),
                "should await abort before returning the completion failure"
            );
            drop(scratch);
        })
        .await;
}

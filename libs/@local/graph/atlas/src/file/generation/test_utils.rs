//! Transfer scenarios over byte-bound publications and an explicitly supplied S3 client.

use core::{assert_matches, pin::pin};
use std::fs;

use aws_sdk_s3::Client;
use bytes::Bytes;
use tokio::io::AsyncReadExt as _;

use super::{
    GenerationId, GenerationRoot,
    download::{Download, DownloadError},
    fixture::{publish_noncanonical, repository, root},
    remote::RemoteRoot,
    upload::{Upload, UploadError},
};
use crate::{
    file::storage::{Storage, WriteCondition, path::FilePath},
    integrity::Sha256Digest,
};

/// Checks that `destination` selected `id` and holds the source's bytes for every file.
#[track_caller]
fn assert_publication(source: &GenerationRoot, destination: &GenerationRoot, id: GenerationId) {
    assert_eq!(
        destination.current().expect("should read local current"),
        Some(id)
    );

    let expected = source
        .open(id)
        .expect("should open the original publication");
    let actual = destination
        .open(id)
        .expect("should open the downloaded publication");

    assert_eq!(
        actual.document().bytes(),
        expected.document().bytes(),
        "should retain original metadata bytes"
    );

    for file in expected.repository().files.files() {
        assert_eq!(
            fs::read(actual.path_of(&file.name)).expect("should read downloaded artifact"),
            fs::read(expected.path_of(&file.name)).expect("should read original artifact"),
            "should retain artifact {}",
            file.name,
        );
    }
}

/// Exercises publication, conditional promotion and acquisition over the supplied S3 namespace.
///
/// The scenario compares complete downloaded publications with their original local bytes,
/// including noncanonical metadata. Competing promotions retain the winning current pointer and its
/// advisory previous identity. `destination` names the parent of `generations/` in an empty,
/// test-owned bucket. The caller owns remote cleanup and must retain this future until completion.
///
/// # Panics
///
/// Panics if fixture setup, a transfer or a content assertion fails.
pub async fn generation_round_trip(client: Client, destination: &str) {
    let (source_scratch, source) = root();
    let (_destination_scratch, local) = root();

    let scratch = source_scratch
        .directory("input")
        .expect("should create storage scratch");

    let storage = Storage::new(scratch).with_s3(client);
    let destination: FilePath = destination
        .parse()
        .expect("should parse the remote namespace");

    let first = publish_noncanonical(&source, &repository());
    let mut second_repository = repository();
    second_repository.metadata.reproducibility.config.seed = 8;

    let second = publish_noncanonical(&source, &second_repository);
    assert_ne!(first, second, "should publish distinct metadata identities");

    let upload = Upload::prepare(&storage, &source, &destination)
        .await
        .expect("should prepare the absent current pointer");

    upload
        .upload(first)
        .await
        .expect("should upload the first publication");
    upload
        .upload(first)
        .await
        .expect("should verify and reuse existing repository objects");

    let promotion = upload
        .promote(first)
        .await
        .expect("should promote the first publication");

    assert_eq!(promotion.id, first);
    assert!(
        promotion.previous_error.is_none(),
        "should have no previous pointer failure"
    );

    let mut download = Download::new(&storage, local.clone(), destination.clone());
    assert_eq!(
        download
            .synchronize()
            .await
            .expect("should acquire the first publication"),
        Some(first)
    );
    assert_publication(&source, &local, first);

    let winner = Upload::prepare(&storage, &source, &destination)
        .await
        .expect("should capture current for the winner");
    let stale = Upload::prepare(&storage, &source, &destination)
        .await
        .expect("should capture the same current for the stale writer");
    winner
        .upload(second)
        .await
        .expect("should upload the second publication");
    let promotion = winner
        .promote(second)
        .await
        .expect("should select the second publication");
    assert_eq!(promotion.id, second);
    assert!(
        promotion.previous_error.is_none(),
        "should update the advisory previous pointer"
    );
    let result = stale.promote(first).await;
    assert_matches!(result, Err(UploadError::Conflict(error)) if error.is_precondition_failed());

    assert_eq!(
        download
            .synchronize()
            .await
            .expect("should acquire the winning publication"),
        Some(second)
    );
    assert_publication(&source, &local, second);
    assert_eq!(
        download
            .synchronize()
            .await
            .expect("should reuse the unchanged publication"),
        Some(second)
    );
    assert_publication(&source, &local, second);

    let previous = RemoteRoot::from_ref(&destination)
        .previous()
        .expect("should construct previous");
    let mut reader = pin!(previous.read(&storage).await.expect("should open previous"));
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .await
        .expect("should read previous");
    assert_eq!(
        bytes,
        first.to_string().as_bytes(),
        "should retain the replaced identity"
    );
}

/// Exercises artifact-integrity refusal before local activation.
///
/// `destination` names an empty, test-owned S3 namespace. A completed publication receives a
/// corrupt artifact before acquisition. The caller owns remote cleanup and must retain this future
/// until completion.
///
/// # Panics
///
/// Panics if fixture setup fails, acquisition accepts corrupt bytes, or local staging survives the
/// failed acquisition.
pub async fn generation_corrupt_artifact(client: Client, destination: &str) {
    let (scratch, source) = root();
    let (_local_scratch, local) = root();
    let storage = Storage::new(
        scratch
            .directory("input")
            .expect("should create storage scratch"),
    )
    .with_s3(client);
    let destination: FilePath = destination
        .parse()
        .expect("should parse the remote namespace");
    let repository = repository();
    let id = publish_noncanonical(&source, &repository);
    let upload = Upload::prepare(&storage, &source, &destination)
        .await
        .expect("should prepare publication");
    upload.upload(id).await.expect("should upload publication");
    upload
        .promote(id)
        .await
        .expect("should promote publication");
    let artifact = repository
        .files
        .files()
        .next()
        .expect("should have an artifact");
    let path = RemoteRoot::from_ref(&destination)
        .active(id)
        .expect("should locate active")
        .artifact(&artifact.name)
        .expect("should locate the artifact");
    path.put(
        &storage,
        Bytes::from_static(b"corrupt"),
        WriteCondition::Any,
    )
    .await
    .expect("should replace the artifact bytes");

    let mut download = Download::new(&storage, local.clone(), destination);
    let result = download.synchronize().await;
    assert_matches!(result, Err(DownloadError::Checksum { expected, actual, .. }) if expected == artifact.hash && actual == Sha256Digest::of(b"corrupt"));
    assert_eq!(local.current().expect("should read local current"), None);
    assert!(
        !local.generation_path(id).exists(),
        "should leave no published directory"
    );
    let names: Vec<_> = fs::read_dir(local.path())
        .expect("should list the local root")
        .map(|entry| entry.expect("should read a directory entry").file_name())
        .collect();
    assert_eq!(
        names,
        [".generation.lock"],
        "should remove incomplete staging before returning"
    );
}

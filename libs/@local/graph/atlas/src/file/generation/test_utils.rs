//! Publication and acquisition cases against real S3 object storage.

use alloc::collections::BTreeSet;
use core::assert_matches;
use std::fs;

use aws_sdk_s3::Client;

use super::{
    GenerationId, GenerationRoot, ScratchDirectory,
    download::{Download, DownloadError},
    fixture::{publish_noncanonical, repository, root},
    upload::{Upload, UploadError},
};
use crate::{file::storage::Storage, integrity::Sha256Digest, test_utils::s3::Bucket};

const PREFIX: &str = "transfer prefix%2f/\u{e9}";

/// Supplies scratch storage and the test's explicit S3 client.
///
/// # Panics
///
/// Panics if creating the scratch directory fails.
fn storage(scratch: &ScratchDirectory, client: Client) -> Storage {
    Storage::new(
        scratch
            .directory("storage")
            .expect("should create storage scratch"),
    )
    .with_s3(client)
}

/// Publishes a byte-distinct local generation with noncanonical metadata whitespace.
///
/// # Panics
///
/// Panics if writing or publishing the fixture fails.
fn publication(root: &GenerationRoot, seed: u64) -> GenerationId {
    let mut metadata = repository();
    metadata.metadata.reproducibility.config.seed = seed;

    publish_noncanonical(root, &metadata)
}

/// Checks every local artifact and the original metadata encoding after acquisition.
///
/// # Panics
///
/// Panics if activation, metadata or any artifact differs from the source.
#[track_caller]
fn assert_publication(source: &GenerationRoot, destination: &GenerationRoot, id: GenerationId) {
    assert_eq!(
        destination.current().expect("should read local current"),
        Some(id)
    );

    let expected = source.open(id).expect("should open the source generation");
    let actual = destination
        .open(id)
        .expect("should open the downloaded generation");

    assert_eq!(
        actual.document().bytes(),
        expected.document().bytes(),
        "should preserve the original metadata encoding"
    );

    for file in expected.repository().files.files() {
        assert_eq!(
            fs::read(actual.path_of(&file.name)).expect("should read the downloaded artifact"),
            fs::read(expected.path_of(&file.name)).expect("should read the source artifact"),
            "should preserve artifact {}",
            file.name
        );
    }
}

/// Checks an uploaded prefix using SDK reads of independently constructed object keys.
///
/// # Panics
///
/// Panics if any remote file differs from its local publication.
#[track_caller]
async fn assert_remote(
    bucket: &Bucket,
    source: &GenerationRoot,
    id: GenerationId,
    namespace: &str,
) {
    let generation = source.open(id).expect("should open the source generation");
    let prefix = format!("{PREFIX}/generations/{namespace}/{id}");

    assert_eq!(
        bucket
            .read(&format!("{prefix}/metadata.json"))
            .await
            .as_ref(),
        generation.document().bytes()
    );

    for file in generation.repository().files.files() {
        assert_eq!(
            bucket
                .read(&format!("{prefix}/{}", file.name))
                .await
                .as_ref(),
            fs::read(generation.path_of(&file.name)).expect("should read the source artifact"),
            "should publish artifact {}",
            file.name
        );
    }
}

/// Seeds the download layout without using the Atlas uploader.
///
/// # Panics
///
/// Panics if the local publication or a remote write fails.
async fn seed_active(bucket: &Bucket, source: &GenerationRoot, id: GenerationId) {
    let generation = source.open(id).expect("should open the source generation");
    let prefix = format!("{PREFIX}/generations/active/{id}");

    for file in generation.repository().files.files() {
        bucket
            .write(
                &format!("{prefix}/{}", file.name),
                fs::read(generation.path_of(&file.name)).expect("should read the source artifact"),
            )
            .await;
    }

    bucket
        .write(
            &format!("{prefix}/metadata.json"),
            generation.document().bytes().to_vec(),
        )
        .await;
    bucket
        .write(&format!("{PREFIX}/generations/current"), id.to_string())
        .await;
}

/// Checks repository publication and reuse before admission.
///
/// # Panics
///
/// Panics if upload changes bytes, fails to reuse them or selects a generation.
pub async fn upload_repository() {
    Bucket::new()
        .await
        .run(async |bucket| {
            let (scratch, source) = root();

            let storage = storage(&scratch, bucket.client.clone());
            let destination = bucket.path(PREFIX);

            let id = publication(&source, 7);
            let upload = Upload::prepare(&storage, &source, &destination)
                .await
                .expect("should prepare publication");

            upload
                .upload(id)
                .await
                .expect("should publish the repository");
            upload
                .upload(id)
                .await
                .expect("should reuse matching repository objects");

            assert_remote(bucket, &source, id, "repository").await;

            bucket
                .assert_absent(&format!("{PREFIX}/generations/current"))
                .await;
            bucket
                .assert_absent(&format!("{PREFIX}/generations/active/{id}/metadata.json"))
                .await;
        })
        .await;
}

/// Checks that promotion copies a complete active publication before selecting it.
///
/// # Panics
///
/// Panics if promotion loses bytes or writes an incorrect pointer.
pub async fn promotion_initial() {
    Bucket::new()
        .await
        .run(async |bucket| {
            let (scratch, source) = root();

            let storage = storage(&scratch, bucket.client.clone());
            let destination = bucket.path(PREFIX);

            let id = publication(&source, 7);
            let upload = Upload::prepare(&storage, &source, &destination)
                .await
                .expect("should prepare publication");

            upload
                .upload(id)
                .await
                .expect("should publish the repository");

            let promotion = upload
                .promote(id)
                .await
                .expect("should promote the publication");

            assert_eq!(promotion.id, id);
            assert!(
                promotion.previous_error.is_none(),
                "should have no previous-pointer error"
            );
            assert_remote(bucket, &source, id, "active").await;
            assert_eq!(
                bucket
                    .read(&format!("{PREFIX}/generations/current"))
                    .await
                    .as_ref(),
                id.to_string().as_bytes()
            );

            bucket
                .assert_absent(&format!("{PREFIX}/generations/previous"))
                .await;
        })
        .await;
}

/// Checks that a stale publisher cannot replace the winner or its previous pointer.
///
/// # Panics
///
/// Panics if the captured precondition fails to protect either pointer.
pub async fn promotion_stale_writer() {
    Bucket::new().await.run(async |bucket| {
        let (scratch, source) = root();

        let storage = storage(&scratch, bucket.client.clone());
        let destination = bucket.path(PREFIX);

        let initial = publication(&source, 7);
        let winner_id = publication(&source, 8);
        let loser_id = publication(&source, 9);

        let initial_upload = Upload::prepare(&storage, &source, &destination).await.expect("should prepare initial publication");
        initial_upload.upload(initial).await.expect("should upload initial publication");
        initial_upload.promote(initial).await.expect("should select initial publication");

        let winner = Upload::prepare(&storage, &source, &destination).await.expect("should capture current for the winner");
        let loser = Upload::prepare(&storage, &source, &destination).await.expect("should capture the same current for the loser");
        winner.upload(winner_id).await.expect("should upload the winning publication");
        loser.upload(loser_id).await.expect("should upload the losing publication");

        let promotion = winner.promote(winner_id).await.expect("should promote the winner");
        assert!(promotion.previous_error.is_none(), "should retain the replaced identity");
        assert_matches!(loser.promote(loser_id).await, Err(UploadError::Conflict(error)) if error.is_precondition_failed());
        assert_eq!(bucket.read(&format!("{PREFIX}/generations/current")).await.as_ref(), winner_id.to_string().as_bytes());
        assert_eq!(bucket.read(&format!("{PREFIX}/generations/previous")).await.as_ref(), initial.to_string().as_bytes());

        assert_remote(bucket, &source, winner_id, "active").await;
    }).await;
}

/// Checks that an existing corrupt artifact prevents completion of repository metadata.
///
/// # Panics
///
/// Panics if upload accepts the corrupt object or completes the publication.
pub async fn upload_existing_corrupt() {
    Bucket::new().await.run(async |bucket| {
        let (scratch, source) = root();

        let storage = storage(&scratch, bucket.client.clone());
        let destination = bucket.path(PREFIX);

        let id = publication(&source, 7);
        let generation = source.open(id).expect("should open the publication");

        let file = generation.repository().files.files().next().expect("should have an artifact");
        let key = format!("{PREFIX}/generations/repository/{id}/{}", file.name);
        bucket.write(&key, "corrupt").await;

        let upload = Upload::prepare(&storage, &source, &destination).await.expect("should prepare publication");
        assert_matches!(upload.upload(id).await, Err(UploadError::Checksum { expected, actual, .. })
            if expected == file.hash && actual == Sha256Digest::of(b"corrupt"));
        bucket.assert_absent(&format!("{PREFIX}/generations/repository/{id}/metadata.json")).await;
        bucket.assert_absent(&format!("{PREFIX}/generations/current")).await;

        assert_eq!(bucket.read(&key).await.as_ref(), b"corrupt", "should not overwrite the conflicting object");
    }).await;
}

/// Checks acquisition and replacement from independently seeded remote publications.
///
/// # Panics
///
/// Panics if either download changes bytes or fails to select the remote identity.
pub async fn download_replacement() {
    Bucket::new()
        .await
        .run(async |bucket| {
            let (scratch, source) = root();
            let (_local_scratch, local) = root();

            let storage = storage(&scratch, bucket.client.clone());

            let mut download = Download::new(&storage, local.clone(), bucket.path(PREFIX));
            for seed in [7, 8] {
                let id = publication(&source, seed);

                seed_active(bucket, &source, id).await;
                assert_eq!(
                    download
                        .synchronize()
                        .await
                        .expect("should acquire the selected publication"),
                    Some(id)
                );

                assert_publication(&source, &local, id);
                assert_eq!(
                    download
                        .synchronize()
                        .await
                        .expect("should reuse the unchanged publication"),
                    Some(id)
                );
                assert_publication(&source, &local, id);
            }
        })
        .await;
}

/// Checks that a missing remote pointer preserves an existing local selection.
///
/// # Panics
///
/// Panics if acquisition misclassifies the missing object or changes local current.
pub async fn download_missing_current() {
    Bucket::new()
        .await
        .run(async |bucket| {
            let (scratch, local) = root();

            let id = publication(&local, 7);
            local
                .activate_verified(id)
                .expect("should select the local publication");

            let storage = storage(&scratch, bucket.client.clone());
            let mut download = Download::new(&storage, local.clone(), bucket.path(PREFIX));
            assert_eq!(
                download
                    .synchronize()
                    .await
                    .expect("should accept an absent remote pointer"),
                None
            );

            assert_eq!(
                local.current().expect("should read local current"),
                Some(id)
            );
        })
        .await;
}

/// Checks failed acquisition cleanup, preservation of local current and recovery after repair.
///
/// # Panics
///
/// Panics if corrupt bytes become active or staging survives. Also panics if acquiring the repaired
/// source fails.
pub async fn download_corrupt_artifact() {
    Bucket::new().await.run(async |bucket| {
        let (scratch, source) = root();
        let (_local_scratch, local) = root();

        let old = publication(&local, 7);
        local.activate_verified(old).expect("should select the original local publication");

        let before: BTreeSet<_> = fs::read_dir(local.path()).expect("should list the local root")
            .map(|entry| entry.expect("should read a directory entry").file_name()).collect();

        let id = publication(&source, 8);
        seed_active(bucket, &source, id).await;

        let generation = source.open(id).expect("should open the remote source");
        let file = generation.repository().files.files().last().expect("should have an artifact");
        let key = format!("{PREFIX}/generations/active/{id}/{}", file.name);

        bucket.write(&key, "corrupt").await;

        let storage = storage(&scratch, bucket.client.clone());

        let mut download = Download::new(&storage, local.clone(), bucket.path(PREFIX));
        assert_matches!(download.synchronize().await, Err(DownloadError::Checksum { expected, actual, .. })
            if expected == file.hash && actual == Sha256Digest::of(b"corrupt"));

        assert_eq!(local.current().expect("should read local current"), Some(old));
        assert!(!local.generation_path(id).exists(), "should not publish corrupt bytes");

        let after: BTreeSet<_> = fs::read_dir(local.path()).expect("should list the local root")
            .map(|entry| entry.expect("should read a directory entry").file_name()).collect();

        assert_eq!(after, before, "should remove partially downloaded staging");
        bucket.write(&key, fs::read(generation.path_of(&file.name)).expect("should read the repair bytes")).await;

        assert_eq!(download.synchronize().await.expect("should retry after repairing the object"), Some(id));
        assert_publication(&source, &local, id);
    }).await;
}

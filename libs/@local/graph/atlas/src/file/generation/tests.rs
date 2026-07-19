#![expect(
    clippy::significant_drop_tightening,
    reason = "fixture stagings deliberately live to the end of their tests"
)]

use core::num::NonZero;
use std::{fs, io::Write as _};

use camino::Utf8PathBuf;

use super::{
    ActivateError, CurrentError, GenerationId, GenerationRoot, METADATA_FILE, SealError,
    StagedGeneration,
};
use crate::{
    file::{
        repository::{FileName, RepositoryFile, RepositoryVersion},
        salt::{
            SaltFiles, SaltRepository,
            metadata::{
                Evidence, LandmarkEvidence, Placement, Reproducibility, SaltMetadata, Snapshot,
            },
        },
    },
    integrity::{Sha256, Sha256Digest, Update as _},
    salt::{CardEmbeddingStats, EmbedderFingerprint, NormSpotCheck, RecallSpotCheck},
};

fn scratch(name: &str) -> Utf8PathBuf {
    let dir = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-generation-{}-{name}",
            std::process::id(),
        ));
    let _: Result<(), std::io::Error> = fs::remove_dir_all(&dir);
    dir
}

fn digest(seed: &str) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(seed.as_bytes());
    hasher.finalize()
}

fn name(name: &str) -> FileName {
    FileName::new(name.to_owned()).expect("the fixture name is a plain file name")
}

fn file(file_name: &str) -> RepositoryFile {
    RepositoryFile {
        name: name(file_name),
        hash: digest(file_name),
    }
}

fn repository() -> SaltRepository {
    SaltRepository {
        version: RepositoryVersion::V0,
        files: SaltFiles {
            representations: file("representations.arr"),
            card_embeddings: file("card-embeddings.arr"),
            card_hashes: file("card-hashes.arr"),
            knn: file("knn.sprs"),
            semantic: file("semantic.sprs"),
            landmarks: file("landmarks.lndm"),
            coordinates: file("coordinates.arr"),
        },
        metadata: SaltMetadata {
            snapshot: Snapshot {
                axes: None,
                nodes: 4,
                edges: 2,
                ontology_types: 3,
            },
            reproducibility: Reproducibility {
                seed: 7,
                embedder: EmbedderFingerprint::new(digest("embedder")),
            },
            placement: Placement::LandmarkBaseline,
            evidence: Evidence {
                cards: CardEmbeddingStats {
                    reused: 0,
                    embedded: 3,
                },
                norm: NormSpotCheck {
                    rows: 4,
                    sampled_rows: 4,
                    tolerance: 1.0e-4,
                    defect_rate: 0.01,
                    confidence: 0.999,
                    defects: Vec::new(),
                },
                recall: RecallSpotCheck {
                    sampled_rows: 4,
                    neighbours_per_row: 2,
                    matched: 8,
                    expected: 8,
                    minimum_recall: 0.89,
                },
                landmarks: LandmarkEvidence {
                    selected: 2,
                    retained: 1,
                    layout_epochs: NonZero::new(5).expect("the fixture epoch count is nonzero"),
                },
            },
        },
    }
}

fn stage_all(staging: &StagedGeneration, repository: &SaltRepository) {
    for entry in repository.files.files() {
        let mut file = staging
            .create(&entry.name)
            .expect("the staged file should create");
        file.write_all(entry.name.as_str().as_bytes())
            .expect("the staged file should write");
    }
}

#[test]
fn a_sealed_generation_is_complete_and_verifiable() {
    let root = GenerationRoot::new(scratch("publish")).expect("the root should open");
    let repository = repository();

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    let published = staging.seal(&repository).expect("the staging should seal");

    // The generation is where the root says it is.
    assert_eq!(published.path(), root.generation_path(published.id()));

    // Every manifest file is present with its staged bytes.
    for entry in repository.files.files() {
        let bytes = fs::read(published.path().join(entry.name.as_str()))
            .expect("a published file should read");
        assert_eq!(bytes, entry.name.as_str().as_bytes());
    }

    // The directory name is the SHA-256 of the metadata document, so the
    // identity is recomputable from the published bytes alone.
    let document =
        fs::read(published.path().join(METADATA_FILE)).expect("the document should read");
    let mut hasher = Sha256::new();
    hasher.update(&document);
    assert_eq!(hasher.finalize(), published.id().digest());

    // The document round-trips to the sealed value.
    let decoded: SaltRepository =
        serde_json::from_slice(&document).expect("the document should deserialize");
    assert_eq!(decoded, repository);
}

#[test]
fn seal_rejects_a_manifest_the_staging_disagrees_with() {
    let root = GenerationRoot::new(scratch("mismatch")).expect("the root should open");
    let repository = repository();

    // A manifest-listed file is absent.
    let staging = root.stage().expect("the staging should create");
    assert!(matches!(
        staging.seal(&repository),
        Err(SealError::Missing { .. })
    ));

    // A staged file is unlisted.
    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    drop(
        staging
            .create(&name("stray.arr"))
            .expect("the stray file should create"),
    );
    assert!(matches!(
        staging.seal(&repository),
        Err(SealError::Unlisted { .. })
    ));

    // A manifest that claims the document's name is rejected before any
    // filesystem comparison.
    let mut reserved = repository.clone();
    reserved.files.knn.name = name(METADATA_FILE);
    let staging = root.stage().expect("the staging should create");
    assert!(matches!(staging.seal(&reserved), Err(SealError::Reserved)));

    // One name for two roles is rejected.
    let mut duplicated = repository;
    duplicated.files.knn.name = name("semantic.sprs");
    let staging = root.stage().expect("the staging should create");
    assert!(matches!(
        staging.seal(&duplicated),
        Err(SealError::Duplicate { .. })
    ));

    // No failure published anything: the root holds no generation.
    let entries: Vec<_> = fs::read_dir(&root.path)
        .expect("the root should list")
        .map(|entry| entry.expect("the entry should read").file_name())
        .collect();
    assert!(
        entries.is_empty(),
        "a failed seal should leave no visible entry: {entries:?}"
    );
}

#[test]
fn an_identical_document_publishes_once() {
    let root = GenerationRoot::new(scratch("identical")).expect("the root should open");
    let repository = repository();

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    let published = staging.seal(&repository).expect("the staging should seal");

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    assert!(matches!(
        staging.seal(&repository),
        Err(SealError::AlreadyPublished(id)) if id == published.id()
    ));
}

#[test]
fn activation_flips_the_pointer_and_supports_rollback() {
    let root = GenerationRoot::new(scratch("activate")).expect("the root should open");
    assert!(
        root.current()
            .expect("an absent pointer should read")
            .is_none()
    );

    // Activating an unpublished generation is rejected and leaves the
    // pointer untouched.
    let unpublished = GenerationId(digest("unpublished"));
    assert!(matches!(
        root.activate(unpublished),
        Err(ActivateError::Unpublished(id)) if id == unpublished
    ));
    assert!(
        root.current()
            .expect("an absent pointer should read")
            .is_none()
    );

    let first = repository();
    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &first);
    let first = staging.seal(&first).expect("the staging should seal");

    let mut second = repository();
    second.metadata.reproducibility.seed = 8;
    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &second);
    let second = staging.seal(&second).expect("the staging should seal");

    root.activate(first.id())
        .expect("the first should activate");
    assert_eq!(
        root.current().expect("the pointer should read"),
        Some(first.id())
    );

    root.activate(second.id())
        .expect("the second should activate");
    assert_eq!(
        root.current().expect("the pointer should read"),
        Some(second.id())
    );

    // Rollback is re-activation of the older generation.
    root.activate(first.id())
        .expect("the first should activate");
    assert_eq!(
        root.current().expect("the pointer should read"),
        Some(first.id())
    );
}

#[test]
fn a_corrupt_pointer_is_rejected() {
    let root = GenerationRoot::new(scratch("corrupt")).expect("the root should open");
    fs::write(root.path.join("current"), "not a digest").expect("the pointer should write");

    assert!(matches!(root.current(), Err(CurrentError::Corrupt(_))));
}

#[test]
fn a_dropped_staging_leaves_nothing_behind() {
    let path = scratch("abandon");
    let root = GenerationRoot::new(&path).expect("the root should open");

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository());
    drop(staging);

    let entries: Vec<_> = fs::read_dir(&path)
        .expect("the root should list")
        .map(|entry| entry.expect("the entry should read").file_name())
        .collect();
    assert!(
        entries.is_empty(),
        "an abandoned staging should be removed: {entries:?}"
    );
}

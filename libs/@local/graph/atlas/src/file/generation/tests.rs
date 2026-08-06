#![expect(
    clippy::significant_drop_tightening,
    reason = "fixture stagings deliberately live to the end of their tests"
)]
use core::{assert_matches, num::NonZero};
use std::{fs, io::Write as _};

use camino::Utf8PathBuf;

use super::{
    ActivateError, CurrentError, GenerationId, GenerationRoot, METADATA_FILE, OpenError, SealError,
    StagedGeneration,
};
use crate::{
    file::{
        morton::SEGMENTS,
        repository::{FileName, RepositoryFile, RepositoryVersion},
        salt::{
            SaltFiles, SaltRepository,
            metadata::{
                ClassifierEvidence, Evidence, LandmarkEvidence, Placement, PolicyEvidence,
                RankingOrigin, Reproducibility, SaltMetadata, Snapshot,
            },
        },
    },
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{AffinityCurve, Bounds2, Vec2},
    morton::Depth,
    salt::{
        embedding::{CardEmbeddingStats, EmbedderFingerprint},
        fit::{FitConfig, prepare::norm::NormSpotCheck},
        knn::recall::RecallSpotCheck,
        landmark::select::SelectionOptions,
        lod::{quad::QuadMeasurements, stage::LodMeasurements},
        postings::build::PostingsMeasurements,
        relation::BuildMeasurements,
    },
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

fn config(seed: u64) -> FitConfig {
    FitConfig {
        seed,
        selection: SelectionOptions {
            maximum_count: NonZero::new(2).expect("the fixture capacity is nonzero"),
            ..
        },
        curve: AffinityCurve::new(1.577, 0.895)
            .expect("the fixture parameters are finite and strictly positive"),
        ..
    }
}

fn repository() -> SaltRepository {
    SaltRepository {
        version: RepositoryVersion::V2,
        files: SaltFiles {
            representations: file("representations.arr"),
            card_embeddings: file("card-embeddings.arr"),
            card_hashes: file("card-hashes.arr"),
            knn: file("knn.sprs"),
            semantic: file("semantic.sprs"),
            landmarks: file("landmarks.lndm"),
            classifier: file("classifier.clsf"),
            policy: file("policy.plcy"),
            attraction: file("attraction.atrc"),
            protection: file("protection.sprs"),
            coordinates: file("coordinates.arr"),
            morton: file("morton.mrtn"),
            quad: file("quadtree.quad"),
            postings: file("postings.post"),
            wire_coordinates: file("wire-coordinates.arr"),
            rank_of_position: file("rank-of-position.arr"),
            position_of_rank: file("position-of-rank.arr"),
            position_of_row: file("position-of-row.arr"),
            row_of_position: file("row-of-position.arr"),
            node_identities: file("node-identities.idnt"),
            edge_identities: file("edge-identities.idnt"),
            ontology_identities: file("ontology-identities.idnt"),
            edge_endpoints: file("edge-endpoints.arr"),
            adjacency: file("adjacency.sprs"),
            projector: None,
            reviewed_verdicts: Some(file("reviewed-verdicts.json")),
            annotation_corpus: None,
            annotation_embeddings: None,
            annotation_hashes: None,
        },
        metadata: SaltMetadata {
            snapshot: Snapshot {
                axes: None,
                nodes: 4,
                edges: 2,
                ontology_types: 3,
            },
            reproducibility: Reproducibility {
                config: config(7),
                embedder: EmbedderFingerprint::new(digest("embedder")),
                prior: None,
            },
            placement: Placement::LandmarkBaseline,
            ranking: RankingOrigin::ConstantColumns,
            evidence: evidence(),
        },
    }
}

fn evidence() -> Evidence {
    Evidence {
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
            deviation: 0.0,
            minimum_recall: 0.89,
            // The four-row fixture is a census of its corpus: an
            // exhaustive sample carries no sampling error to bound.
            resolution: 0.0,
            confidence: 0.99,
        },
        landmarks: LandmarkEvidence {
            selected: 2,
            retained: 1,
            layout_epochs: NonZero::new(5).expect("the fixture epoch count is nonzero"),
        },
        policy: PolicyEvidence {
            relations: 1,
            overridden: 0,
        },
        classifier: ClassifierEvidence::Supplied {
            source: digest("classifier.clsf"),
        },
        relations: BuildMeasurements {
            pruning_threshold: 0.0,
            retained_edges: 2,
            pruned_edges: 0,
            retained_mass: 1.5,
            pruned_mass: 0.0,
            self_references: 0,
            multi_typed_edges: vec![2],
            clamped_confidences: Some(0),
        },
        lod: LodMeasurements {
            world: Bounds2::new(Vec2::new(-1.0, -1.0), Vec2::new(1.0, 1.0))
                .expect("the fixture corners are finite and ordered"),
            bucket_histogram: {
                let mut histogram = [0; SEGMENTS];
                histogram[2] = 4;
                histogram
            },
            catch_all_population: 0,
            co_location_excess: 0,
            max_tile_delta: 2,
        },
        quad: QuadMeasurements {
            nodes: 1,
            leaves: 1,
            depth: Depth::new(0).expect("the root depth is within the key width"),
            type_entries: 3,
        },
        postings: PostingsMeasurements {
            types: 3,
            dense_types: 1,
            list_entries: 4,
            parent_edges: 2,
            direct_entries: 6,
        },
        projector: None,
    }
}

/// Restores the write permission a seal dropped, so a test can tamper with published bytes.
fn make_writable(path: &camino::Utf8Path) {
    let mut permissions = fs::metadata(path)
        .expect("a published file should stat")
        .permissions();
    #[expect(
        clippy::permissions_set_readonly_false,
        reason = "the test tampers with its own scratch files"
    )]
    permissions.set_readonly(false);
    fs::set_permissions(path, permissions).expect("the permissions should set");
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
fn sealed_generation_is_complete_and_verifiable() {
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
fn sealed_files_refuse_rewriting() {
    let root = GenerationRoot::new(scratch("readonly")).expect("the root should open");
    let repository = repository();

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    let published = staging.seal(&repository).expect("the staging should seal");

    // Every published file, the metadata document included, is read-only and
    // refuses a write handle: the permission drop turns a rewriting accident
    // into an OS error.
    let mut names: Vec<&str> = repository
        .files
        .files()
        .map(|entry| entry.name.as_str())
        .collect();
    names.push(METADATA_FILE);
    for name in names {
        let path = published.path().join(name);
        assert!(
            fs::metadata(&path)
                .expect("a published file should stat")
                .permissions()
                .readonly(),
            "{name} should be read-only"
        );
        assert!(
            fs::OpenOptions::new().write(true).open(&path).is_err(),
            "{name} should refuse a write handle"
        );
    }
}

#[test]
fn seal_rejects_a_manifest_the_staging_disagrees_with() {
    let root = GenerationRoot::new(scratch("mismatch")).expect("the root should open");
    let repository = repository();

    // A manifest-listed file is absent.
    let staging = root.stage().expect("the staging should create");
    assert_matches!(staging.seal(&repository), Err(SealError::Missing { .. }));

    // The manifest omits a staged file.
    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    drop(
        staging
            .create(&name("stray.arr"))
            .expect("the stray file should create"),
    );
    assert_matches!(staging.seal(&repository), Err(SealError::Unlisted { .. }));

    // Sealing rejects a manifest that claims the document's name before
    // any filesystem comparison.
    let mut reserved = repository.clone();
    reserved.files.knn.name = name(METADATA_FILE);
    let staging = root.stage().expect("the staging should create");
    assert_matches!(staging.seal(&reserved), Err(SealError::Reserved));

    // Sealing rejects one name used for two roles.
    let mut duplicated = repository;
    duplicated.files.knn.name = name("semantic.sprs");
    let staging = root.stage().expect("the staging should create");
    assert_matches!(staging.seal(&duplicated), Err(SealError::Duplicate { .. }));

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
fn identical_document_publishes_once() {
    let root = GenerationRoot::new(scratch("identical")).expect("the root should open");
    let repository = repository();

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    let published = staging.seal(&repository).expect("the staging should seal");

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    assert_matches!(
        staging.seal(&repository),
        Err(SealError::AlreadyPublished(id)) if id == published.id()
    );
}

#[test]
fn activation_flips_the_pointer_and_supports_rollback() {
    let root = GenerationRoot::new(scratch("activate")).expect("the root should open");
    assert!(
        root.current()
            .expect("an absent pointer should read")
            .is_none()
    );

    // Activation rejects an unpublished generation and leaves the
    // pointer untouched.
    let unpublished = GenerationId(digest("unpublished"));
    assert_matches!(
        root.activate(unpublished),
        Err(ActivateError::Unpublished(id)) if id == unpublished
    );
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
    second.metadata.reproducibility.config.seed = 8;
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
fn corrupt_pointer_is_rejected() {
    let root = GenerationRoot::new(scratch("corrupt")).expect("the root should open");
    fs::write(root.path.join("current"), "not a digest").expect("the pointer should write");

    assert_matches!(root.current(), Err(CurrentError::Corrupt(_)));
}

#[test]
fn activated_generation_opens_verified() {
    let root = GenerationRoot::new(scratch("open")).expect("the root should open");
    let repository = repository();

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    let published = staging.seal(&repository).expect("the staging should seal");
    root.activate(published.id())
        .expect("the generation should activate");

    // The serving entry resolves the pointer and opens what it names.
    let id = root
        .current()
        .expect("the pointer should read")
        .expect("a generation is active");
    let generation = root.open(id).expect("the active generation should open");

    assert_eq!(generation.id(), published.id());
    assert_eq!(generation.path(), published.path());
    assert_eq!(generation.repository(), &repository);

    // Every manifest file is where path_of points, with its bytes.
    for entry in repository.files.files() {
        let bytes =
            fs::read(generation.path_of(&entry.name)).expect("a published file should read");
        assert_eq!(bytes, entry.name.as_str().as_bytes());
    }
}

#[test]
fn open_rejects_missing_tampered_and_foreign_documents() {
    let root = GenerationRoot::new(scratch("open-reject")).expect("the root should open");

    // An unpublished generation.
    let unpublished = GenerationId(digest("unpublished"));
    assert_matches!(
        root.open(unpublished),
        Err(OpenError::Unpublished(id)) if id == unpublished
    );

    // A tampered document still parses but no longer hashes to the
    // directory-naming id.
    let repository = repository();
    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    let published = staging.seal(&repository).expect("the staging should seal");

    let document_path = published.path().join(METADATA_FILE);
    let mut document = fs::read(&document_path).expect("the document should read");
    document.push(b'\n');
    make_writable(&document_path);
    fs::write(&document_path, &document).expect("the document should write");

    assert_matches!(
        root.open(published.id()),
        Err(OpenError::Identity { id, .. }) if id == published.id()
    );

    // A hand-built directory whose document hashes to its name but is
    // no repository fails to parse. The seal path cannot produce this.
    let foreign = "not a repository";
    let id = GenerationId(digest(foreign));
    let path = root.generation_path(id);
    fs::create_dir_all(&path).expect("the foreign directory should create");
    fs::write(path.join(METADATA_FILE), foreign).expect("the foreign document should write");

    assert_matches!(root.open(id), Err(OpenError::Document(_)));
}

#[test]
fn open_reports_a_retired_version_before_interpreting_the_body() {
    let root = GenerationRoot::new(scratch("open-version")).expect("the root should open");

    // Serialized by this crate, so the keys arrive in the order the version gate
    // depends on.
    let document = serde_json::to_string(&repository()).expect("the repository should serialize");
    assert!(document.contains(r#""version":2"#));
    assert!(document.contains(r#""reproducibility""#));

    let publish = |document: &str| {
        let id = GenerationId(digest(document));
        let path = root.generation_path(id);
        fs::create_dir_all(&path).expect("the generation directory should create");
        fs::write(path.join(METADATA_FILE), document).expect("the document should write");
        id
    };

    // A body that no longer satisfies the current schema.
    let broken = document.replace(r#""reproducibility""#, r#""reproducibilty""#);

    // A retired version reports the version rather than the body, so the error
    // tells the operator of a superseded generation to refit.
    let retired = broken.replace(r#""version":2"#, r#""version":1"#);
    let error = root
        .open(publish(&retired))
        .expect_err("a retired version is rejected");
    assert!(
        error
            .to_string()
            .contains("unsupported repository version 1"),
        "the version decides the diagnosis: {error}",
    );

    // The same body under the accepted version fails on the body, so the
    // assertion above rests on the order and not on a document that parses.
    let error = root
        .open(publish(&broken))
        .expect_err("an invalid body is rejected");
    let message = error.to_string();
    assert!(
        !message.contains("unsupported repository version"),
        "the accepted version leaves the body to fail: {message}",
    );
}

#[test]
fn dropped_staging_leaves_nothing_behind() {
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

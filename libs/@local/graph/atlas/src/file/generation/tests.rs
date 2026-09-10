#![expect(
    clippy::significant_drop_tightening,
    reason = "fixture stagings deliberately live to the end of their tests"
)]
use core::{assert_matches, num::NonZero};
use std::{
    fs::{self, File},
    io::{self, Read as _, Write as _},
    process::Command,
};

use camino::Utf8PathBuf;
use uuid::Uuid;

use super::{
    ActivateError, CurrentError, GenerationId, GenerationRoot, LOCK_FILE, METADATA_FILE, OpenError,
    RemoveError, ScratchDirectory, SealError, StagedGeneration,
};
use crate::{
    dataset::DatasetOrigin,
    file::{
        morton::SEGMENTS,
        repository::{Artifact, Binding, FileName, RepositoryVersion},
        salt::{
            SaltFiles, SaltRepository,
            metadata::{
                ClassifierEvidence, Evidence, LandmarkEvidence, Placement, PolicyEvidence,
                RankingOrigin, Reproducibility, SaltMetadata, Snapshot,
            },
        },
    },
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{
        AffinityCurve, Bounds2, Vec2, d_non_negative, d_positive, non_negative, open_unit_fraction,
        unit_fraction,
    },
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

fn binding<A: Artifact>(seed: &str) -> Binding<A> {
    Binding::new(digest(seed))
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

fn evidence() -> Evidence {
    Evidence {
        cards: CardEmbeddingStats {
            reused: 0,
            embedded: 3,
        },
        norm: NormSpotCheck {
            rows: 4,
            sampled_rows: 4,
            tolerance: d_positive!(1.0e-4),
            defect_rate: open_unit_fraction!(0.01),
            confidence: open_unit_fraction!(0.999),
            defects: Vec::new(),
        },
        recall: RecallSpotCheck {
            sampled_rows: 4,
            neighbours_per_row: 2,
            matched: 8,
            expected: 8,
            deviation: d_non_negative!(0.0),
            minimum_recall: unit_fraction!(0.89),
            // The four-row fixture is a census of its corpus: an
            // exhaustive sample carries no sampling error to bound.
            resolution: d_non_negative!(0.0),
            confidence: open_unit_fraction!(0.99),
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
            pruning_threshold: non_negative!(0.0),
            retained_edges: 2,
            pruned_edges: 0,
            retained_mass: d_non_negative!(1.5),
            pruned_mass: d_non_negative!(0.0),
            self_references: 0,
            multi_typed_edges: vec![2],
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
            depth: Depth::try_new(0).expect("the root depth is within the key width"),
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

pub(super) fn repository() -> SaltRepository {
    SaltRepository {
        version: RepositoryVersion::V2,
        files: SaltFiles {
            representations: binding("representations.arr"),
            card_embeddings: binding("card-embeddings.arr"),
            card_hashes: binding("card-hashes.arr"),
            knn: binding("knn.sprs"),
            semantic: binding("semantic.sprs"),
            landmarks: binding("landmarks.lndm"),
            classifier: binding("classifier.clsf"),
            policy: binding("policy.plcy"),
            attraction: binding("attraction.atrc"),
            protection: binding("protection.sprs"),
            coordinates: binding("coordinates.arr"),
            morton: binding("morton.mrtn"),
            quad: binding("quadtree.quad"),
            postings: binding("postings.post"),
            wire_coordinates: binding("wire-coordinates.arr"),
            rank_of_position: binding("rank-of-position.arr"),
            position_of_rank: binding("position-of-rank.arr"),
            position_of_row: binding("position-of-row.arr"),
            row_of_position: binding("row-of-position.arr"),
            node_identities: binding("node-identities.idnt"),
            edge_identities: binding("edge-identities.idnt"),
            ontology_identities: binding("ontology-identities.idnt"),
            edge_endpoints: binding("edge-endpoints.arr"),
            adjacency: binding("adjacency.sprs"),
            projector: None,
            reviewed_verdicts: Some(binding("reviewed-verdicts.json")),
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
            dataset: Some(DatasetOrigin::Memory),
            placement: Placement::LandmarkBaseline,
            ranking: RankingOrigin::ConstantColumns,
            evidence: evidence(),
        },
    }
}

/// Restores write permission for tampering with published bytes.
#[expect(
    clippy::permissions_set_readonly_false,
    reason = "the test tampers with its own scratch files"
)]
pub(super) fn make_writable(path: &camino::Utf8Path) {
    let mut permissions = fs::metadata(path)
        .expect("a published file should stat")
        .permissions();
    permissions.set_readonly(false);
    fs::set_permissions(path, permissions).expect("the permissions should set");
}

pub(super) fn stage_all(staging: &StagedGeneration, repository: &SaltRepository) {
    for entry in repository.files.files() {
        let mut file = staging
            .create(&entry.name)
            .expect("the staged file should create");
        file.write_all(entry.name.as_str().as_bytes())
            .expect("the staged file should write");
    }
}

#[test]
fn seal_round_trip() {
    let root = GenerationRoot::new(scratch("publish")).expect("the root should open");
    let repository = repository();

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    let published = staging.seal(&repository).expect("the staging should seal");
    let published_path = root.generation_path(published.id());

    // Every manifest file is present with its staged bytes.
    for entry in repository.files.files() {
        let bytes = fs::read(published_path.join(entry.name.as_str()))
            .expect("a published file should read");
        assert_eq!(bytes, entry.name.as_str().as_bytes());
    }

    let document = fs::read(published_path.join(METADATA_FILE)).expect("the document should read");
    let mut hasher = Sha256::new();
    hasher.update(&document);
    assert_eq!(hasher.finalize(), published.id().digest());

    // The document round-trips to the sealed value.
    let decoded: SaltRepository =
        serde_json::from_slice(&document).expect("the document should deserialize");
    assert_eq!(decoded, repository);
}

#[test]
fn seal_read_only() {
    let root = GenerationRoot::new(scratch("readonly")).expect("the root should open");
    let repository = repository();

    let staging = root.stage().expect("the staging should create");
    stage_all(&staging, &repository);
    let published = staging.seal(&repository).expect("the staging should seal");
    let published_path = root.generation_path(published.id());

    // Every published file, the metadata document included, is read-only and
    // refuses a write handle: the permission drop turns a rewriting accident
    // into an OS error.
    let mut names: Vec<String> = repository
        .files
        .files()
        .map(|entry| entry.name.as_str().to_owned())
        .collect();
    names.push(METADATA_FILE.to_owned());
    for name in names {
        let path = published_path.join(&name);
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
fn seal_manifest_mismatch() {
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
fn seal_duplicate_document() {
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
fn activate_rollback() {
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
fn current_corrupt_pointer() {
    let root = GenerationRoot::new(scratch("corrupt")).expect("the root should open");
    fs::write(root.path.join("current"), "not a digest").expect("the pointer should write");

    assert_matches!(root.current(), Err(CurrentError::Corrupt(_)));
}

#[test]
fn open_active_generation() {
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
    assert_eq!(generation.path(), root.generation_path(published.id()));
    assert_eq!(generation.repository(), &repository);

    // Every manifest file is where path_of points, with its bytes.
    for entry in repository.files.files() {
        let bytes =
            fs::read(generation.path_of(&entry.name)).expect("a published file should read");
        assert_eq!(bytes, entry.name.as_str().as_bytes());
    }
}

#[test]
fn open_invalid_documents() {
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

    let document_path = root.generation_path(published.id()).join(METADATA_FILE);
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
fn open_version_precedence() {
    let root = GenerationRoot::new(scratch("open-version")).expect("the root should open");

    // Serializing the repository preserves the field order required by version checking.
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

    // A retired version takes precedence over an invalid body.
    let retired = broken.replace(r#""version":2"#, r#""version":1"#);
    let error = root
        .open(publish(&retired))
        .expect_err("a retired version should fail");
    assert!(
        error
            .to_string()
            .contains("unsupported repository version 1"),
        "the version decides the diagnosis: {error}",
    );

    // An accepted version exposes the same body's schema error.
    let error = root
        .open(publish(&broken))
        .expect_err("an invalid body should fail");
    let message = error.to_string();
    assert!(
        !message.contains("unsupported repository version"),
        "the accepted version leaves the body to fail: {message}",
    );
}

#[test]
fn staging_drop_cleanup() {
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
        "dropping an abandoned staging should leave no entries: {entries:?}"
    );
}

pub(super) fn root() -> (ScratchDirectory, GenerationRoot) {
    let path = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temporary directory should have a UTF-8 path")
        .join(format!("atlas-generation-lock-{}", Uuid::now_v7()));
    let scratch = ScratchDirectory::new(path.clone());
    let root = GenerationRoot::new(path).expect("the generation root should open");
    (scratch, root)
}

fn publish(root: &GenerationRoot, byte: u8) -> GenerationId {
    let id = format!("{byte:02x}")
        .repeat(32)
        .parse()
        .expect("the hexadecimal fixture should name a generation");
    fs::create_dir_all(root.generation_path(id)).expect("the generation directory should create");
    id
}

#[test]
fn remove_active() {
    let (_scratch, root) = root();
    let id = publish(&root, 1);
    root.activate(id).expect("the generation should activate");

    let error = root
        .remove(id)
        .expect_err("the active generation should remain");
    assert_matches!(error, RemoveError::Active(active) if active == id);
    assert!(root.generation_path(id).is_dir());
    assert_eq!(root.current().expect("the pointer should read"), Some(id));
}

#[test]
#[expect(
    clippy::verbose_file_reads,
    reason = "the test reads a retained descriptor after removing its path"
)]
fn remove_inactive() {
    let (_scratch, root) = root();
    let retired = publish(&root, 1);
    let active = publish(&root, 2);
    root.activate(active)
        .expect("the generation should activate");
    let path = root.generation_path(retired).join("artifact");
    fs::write(&path, "retained bytes").expect("the artifact should write");
    let mut reader = File::open(path).expect("the artifact should open");

    root.remove(retired)
        .expect("the inactive generation should remove");

    assert!(!root.generation_path(retired).exists());
    assert_eq!(
        root.current().expect("the pointer should read"),
        Some(active)
    );
    let mut content = String::new();
    reader
        .read_to_string(&mut content)
        .expect("the open descriptor should remain readable");
    assert_eq!(content, "retained bytes");
    assert_matches!(root.activate(retired), Err(ActivateError::Unpublished(id)) if id == retired);
    assert_eq!(
        root.current().expect("the pointer should read"),
        Some(active)
    );
}

#[test]
fn remove_corrupt_pointer() {
    let (_scratch, root) = root();
    let id = publish(&root, 1);
    fs::write(root.path().join("current"), "not a generation")
        .expect("the corrupt pointer should write");

    let error = root
        .remove(id)
        .expect_err("a corrupt pointer should prevent removal");

    assert_matches!(error, RemoveError::Current(CurrentError::Corrupt(_)));
    assert!(root.generation_path(id).is_dir());
}

#[test]
fn remove_missing() {
    let (_scratch, root) = root();
    let id = publish(&root, 1);
    root.remove(id)
        .expect("an inactive generation should remove without a current pointer");

    let error = root
        .remove(id)
        .expect_err("an absent directory should report its filesystem error");

    assert_matches!(error, RemoveError::Io(error) if error.kind() == io::ErrorKind::NotFound);
}

#[test]
fn lock_unavailable() {
    let (_scratch, root) = root();
    let id = publish(&root, 1);
    fs::create_dir_all(root.path().join(LOCK_FILE))
        .expect("the lock-path obstruction should create");

    assert_matches!(root.activate(id), Err(ActivateError::Io(_)));
    let error = root
        .remove(id)
        .expect_err("removal should require the root lock");
    assert_matches!(error, RemoveError::Io(_));
    assert!(root.generation_path(id).is_dir());
    assert_eq!(
        root.current().expect("the absent pointer should read"),
        None
    );
}

/// Independently opened descriptors contend across processes and release on close.
#[test]
#[cfg_attr(miri, ignore = "Miri cannot spawn a second test process")]
fn lock_exclusion() {
    const ROOT: &str = "HASH_ATLAS_LOCK_TEST_ROOT";
    const BLOCKED: &str = "HASH_ATLAS_LOCK_TEST_BLOCKED";
    if let Some(path) = std::env::var_os(ROOT) {
        let file = File::options()
            .read(true)
            .write(true)
            .open(std::path::Path::new(&path).join(LOCK_FILE))
            .expect("the parent's lock file should open independently");
        if std::env::var_os(BLOCKED).is_some() {
            assert_matches!(file.try_lock(), Err(fs::TryLockError::WouldBlock));
        } else {
            file.try_lock()
                .expect("the closed descriptor should release its lock");
        }
        return;
    }

    let (_scratch, root) = root();
    let lock = root.lock().expect("the root lock should acquire");
    let child = |blocked: bool| {
        let mut command =
            Command::new(std::env::current_exe().expect("the test binary should resolve"));
        command
            .args([
                "--exact",
                "file::generation::tests::lock_exclusion",
                "--nocapture",
            ])
            .env(ROOT, root.path())
            .env_remove(BLOCKED);
        if blocked {
            command.env(BLOCKED, "1");
        }
        let output = command
            .output()
            .expect("the lock-checking child should execute");
        assert!(
            output.status.success(),
            "the child should satisfy the lock assertion: {} {}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            String::from_utf8_lossy(&output.stdout).contains("1 passed"),
            "the child should execute its assertion"
        );
    };

    child(true);
    drop(lock);
    assert!(root.path().join(LOCK_FILE).is_file());
    child(false);
}

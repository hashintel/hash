//! Small byte-bound publications shared by unit and transfer integration tests.

use core::num::NonZero;
use std::{fs, io::Write as _};

use camino::Utf8PathBuf;
use uuid::Uuid;

use super::{GenerationId, GenerationRoot, METADATA_FILE, ScratchDirectory, StagedGeneration};
use crate::{
    dataset::DatasetOrigin,
    file::{
        morton::SEGMENTS,
        repository::{Artifact, Binding, RepositoryVersion},
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
        AffinityCurve, Bounds2, DNonNegative, Vec2, d_positive, non_negative, open_unit_fraction,
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

/// Hashes a fixture seed into an artifact digest.
pub(super) fn digest(seed: &str) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(seed.as_bytes());
    hasher.finalize()
}

/// Binds an artifact to the digest of `seed`.
fn binding<A: Artifact>(seed: &str) -> Binding<A> {
    Binding::new(digest(seed))
}

/// Builds the reproducibility configuration a fixture repository records.
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

/// Builds the spot checks and measurements a fixture repository records.
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
            deviation: DNonNegative::ZERO,
            minimum_recall: unit_fraction!(0.89),
            // the sample contains all four rows, leaving no sampling error to bound.
            resolution: DNonNegative::ZERO,
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
            retained_mass: const { DNonNegative::new(1.5).expect("should have finite nonnegative mass") },
            pruned_mass: DNonNegative::ZERO,
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

/// Builds the metadata document every generation fixture publishes.
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

/// Publishes the supplied repository with trailing metadata whitespace.
///
/// The whitespace preserves valid JSON while distinguishing the original encoding from a
/// reserialized document.
#[expect(
    clippy::significant_drop_tightening,
    reason = "the seal consumes the staging, and the suggested merge would skip staging the \
              artifacts between the two calls"
)]
pub(super) fn publish_noncanonical(
    root: &GenerationRoot,
    repository: &SaltRepository,
) -> GenerationId {
    let staging = root.stage().expect("should create the staging");
    stage_all(&staging, repository);
    let published = staging.seal(repository).expect("should seal the staging");

    let sealed_path = root.generation_path(published.id());
    let mut bytes =
        fs::read(sealed_path.join(METADATA_FILE)).expect("should read the sealed metadata");
    bytes.extend_from_slice(b" \n");
    let id = GenerationId::from_digest(Sha256Digest::of(&bytes));

    let published_path = root.generation_path(id);
    fs::rename(&sealed_path, &published_path)
        .expect("should rename the generation directory to its recomputed identity");

    let metadata_path = published_path.join(METADATA_FILE);
    make_writable(&metadata_path);
    fs::write(&metadata_path, &bytes).expect("should write the noncanonical metadata");
    let mut permissions = fs::metadata(&metadata_path)
        .expect("should stat the fixture metadata")
        .permissions();
    permissions.set_readonly(true);
    fs::set_permissions(&metadata_path, permissions)
        .expect("should restore the fixture metadata permissions");

    id
}

/// Stages every manifest file, writing each file's name as its content.
pub(super) fn stage_all(staging: &StagedGeneration, repository: &SaltRepository) {
    for entry in repository.files.files() {
        let mut file = staging
            .create(&entry.name)
            .expect("the staged file should create");
        file.write_all(entry.name.as_str().as_bytes())
            .expect("the staged file should write");
    }
}

/// Opens an empty generation root, returning the handle that removes its directory.
pub(super) fn root() -> (ScratchDirectory, GenerationRoot) {
    let path = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temporary directory should have a UTF-8 path")
        .join(format!("atlas-generation-lock-{}", Uuid::now_v7()));
    let scratch = ScratchDirectory::new(path.clone());
    let root = GenerationRoot::new(path).expect("the generation root should open");
    (scratch, root)
}

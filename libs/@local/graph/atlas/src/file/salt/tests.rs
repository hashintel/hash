use core::num::NonZero;

use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};

use super::{
    SaltFiles, SaltRepository,
    metadata::{Evidence, LandmarkEvidence, Reproducibility, SaltMetadata, Snapshot},
};
use crate::{
    dataset::{NodeRowId, postgres::TemporalAxes},
    file::repository::{FileName, RepositoryFile, RepositoryVersion},
    integrity::{Sha256, Sha256Digest, Update as _},
    salt::{EmbedderFingerprint, NormSpotCheck, RecallSpotCheck, RepresentationDefect},
};

fn digest(seed: &str) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(seed.as_bytes());
    hasher.finalize()
}

fn file(name: &str) -> RepositoryFile {
    RepositoryFile {
        name: FileName::new(name).expect("the fixture name is a plain file name"),
        hash: digest(name),
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
            protection: file("protection.sprs"),
        },
        metadata: SaltMetadata {
            snapshot: Snapshot {
                axes: Some(TemporalAxes {
                    transaction_time: "2026-07-19T08:30:00Z"
                        .parse::<Timestamp<TransactionTime>>()
                        .expect("fixture transaction time should parse"),
                    decision_time: "2026-07-19T08:30:00Z"
                        .parse::<Timestamp<DecisionTime>>()
                        .expect("fixture decision time should parse"),
                }),
                nodes: 1_000_000,
                edges: 8_800_000,
                ontology_types: 49,
            },
            reproducibility: Reproducibility {
                master_seed: 0x5A17_F17D,
                embedder: EmbedderFingerprint::new(digest("embedder contract")),
            },
            evidence: Evidence {
                norm: NormSpotCheck {
                    rows: 1_000_000,
                    sampled_rows: 688,
                    tolerance: 1.0e-4,
                    defect_rate: 0.01,
                    confidence: 0.999,
                    defects: Vec::new(),
                },
                recall: RecallSpotCheck {
                    sampled_rows: 688,
                    neighbours_per_row: 50,
                    matched: 34_000,
                    expected: 34_400,
                    minimum_recall: 0.89,
                },
                landmarks: LandmarkEvidence {
                    selected: 4_096,
                    retained: 1_024,
                    layout_epochs: NonZero::new(500).expect("the fixture epoch count is nonzero"),
                },
            },
        },
    }
}

#[test]
fn repository_round_trips_through_json() {
    let repository = repository();

    let json = serde_json::to_string(&repository).expect("the repository should serialize");
    let decoded: SaltRepository =
        serde_json::from_str(&json).expect("the serialized repository should deserialize");

    assert_eq!(decoded, repository);
}

#[test]
fn version_leads_the_document() {
    let json = serde_json::to_string(&repository()).expect("the repository should serialize");

    assert!(
        json.starts_with(r#"{"version":0"#),
        "the version should lead the document: {json}"
    );
}

#[test]
fn absent_axes_round_trip() {
    let mut repository = repository();
    repository.metadata.snapshot.axes = None;

    let json = serde_json::to_string(&repository).expect("the repository should serialize");
    let decoded: SaltRepository =
        serde_json::from_str(&json).expect("the serialized repository should deserialize");

    assert_eq!(decoded, repository);
}

#[test]
fn defects_serialize_rows_as_plain_integers() {
    let defect = RepresentationDefect::Norm {
        row: NodeRowId::new(7),
        squared_norm: 1.5,
    };

    let json = serde_json::to_string(&defect).expect("the defect should serialize");
    assert_eq!(json, r#"{"Norm":{"row":7,"squared_norm":1.5}}"#);

    let decoded: RepresentationDefect =
        serde_json::from_str(&json).expect("the serialized defect should deserialize");
    assert_eq!(decoded, defect);
}

use core::num::NonZero;

use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};

use super::{
    SaltFiles, SaltRepository,
    metadata::{
        Evidence, LandmarkEvidence, Placement, PolicyEvidence, Reproducibility, SaltMetadata,
        Snapshot,
    },
};
use crate::{
    dataset::{NodeRowId, OntologyRowId, TemporalAxes},
    file::repository::{FileName, RepositoryFile, RepositoryVersion},
    integrity::{Sha256, Sha256Digest, Update as _},
    math::AffinityCurve,
    salt::{
        CardEmbeddingStats, EmbedderFingerprint, FitConfig, NormSpotCheck, PolicyOptions,
        PolicyOverride, PolicySource, Posterior, RecallSpotCheck, RepresentationDefect,
        SelectionOptions,
    },
};

fn digest(seed: &str) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(seed.as_bytes());
    hasher.finalize()
}

fn file(name: &str) -> RepositoryFile {
    RepositoryFile {
        name: FileName::new(name.to_owned()).expect("the fixture name is a plain file name"),
        hash: digest(name),
    }
}

fn config() -> FitConfig {
    FitConfig {
        seed: 0x5A17_F17D,
        selection: SelectionOptions {
            maximum_count: NonZero::new(4_096).expect("the fixture capacity is nonzero"),
            ..
        },
        curve: AffinityCurve::new(1.577, 0.895)
            .expect("the fixture parameters are finite and strictly positive"),
        policy: PolicyOptions {
            overrides: vec![PolicyOverride {
                relation: OntologyRowId::new(7),
                source: PolicySource::Human,
                distribution: Posterior::new([0.25, 0.5, 0.25])
                    .expect("the fixture distribution sums to one"),
            }],
            ..
        },
        ..
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
            classifier: file("classifier.clsf"),
            policy: file("policy.plcy"),
            coordinates: file("coordinates.arr"),
            node_identities: file("node-identities.idnt"),
            edge_identities: file("edge-identities.idnt"),
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
                config: config(),
                embedder: EmbedderFingerprint::new(digest("embedder contract")),
                prior: None,
            },
            placement: Placement::LandmarkBaseline,
            evidence: Evidence {
                cards: CardEmbeddingStats {
                    reused: 30,
                    embedded: 19,
                },
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
                policy: PolicyEvidence {
                    relations: 49,
                    overridden: 1,
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
fn a_tampered_configuration_echo_refuses_to_deserialize() {
    // Each tampered value violates a construction invariant of its
    // field's type; the validating deserialization is what turns the
    // echo from a record into a contract.
    for (pointer, tampered) in [
        (
            "/metadata/reproducibility/config/selection/retained_fraction",
            serde_json::json!(1.5),
        ),
        (
            "/metadata/reproducibility/config/selection/maximum_count",
            serde_json::json!(0),
        ),
        (
            "/metadata/reproducibility/config/curve/a",
            serde_json::json!(-1.0),
        ),
        (
            "/metadata/reproducibility/config/layout/initial_learning_rate",
            serde_json::json!(0.0),
        ),
        (
            "/metadata/reproducibility/config/layout/repulsion_strength",
            serde_json::json!(-1.0),
        ),
        (
            "/metadata/reproducibility/config/layout/epochs",
            serde_json::json!(0),
        ),
        (
            "/metadata/reproducibility/config/policy/overrides/0/distribution",
            serde_json::json!([0.5, 0.5, 0.5]),
        ),
        (
            "/metadata/reproducibility/config/policy/admission/class_probability_threshold",
            serde_json::json!(1.5),
        ),
    ] {
        let mut document =
            serde_json::to_value(repository()).expect("the repository should serialize");
        *document
            .pointer_mut(pointer)
            .expect("the tampered field should exist in the document") = tampered;

        assert!(
            serde_json::from_value::<SaltRepository>(document).is_err(),
            "the tampered {pointer} should refuse to deserialize",
        );
    }
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

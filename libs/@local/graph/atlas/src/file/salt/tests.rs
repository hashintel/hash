use core::num::NonZero;

use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};

use super::{
    SaltFiles, SaltRepository,
    metadata::{
        ClassifierEvidence, ClassifierFitSummary, Evidence, FrozenRadiusEvidence, HoldoutEvidence,
        HoldoutRecord, LadderEvidence, LandmarkEvidence, Placement, PolicyEvidence,
        ProjectorEvidence, RankingOrigin, RegularizationReading, Reproducibility, RungEvidence,
        SaltMetadata, Snapshot,
    },
};
use crate::{
    dataset::TemporalAxes,
    file::{
        morton::Fenceposts,
        repository::{FileName, RepositoryFile, RepositoryVersion},
    },
    identity::{NodeRowId, OntologyRowId},
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{AffinityCurve, Bounds2, Rotation, Similarity, UnitFraction, Vec2},
    morton::Depth,
    salt::{
        AssemblyEvidence, BuildMeasurements, CardEmbeddingStats, EmbedderFingerprint, FitConfig,
        GeometryClass, HoldoutClass, LodMeasurements, NormSpotCheck, PolicyOptions, PolicyOverride,
        PolicySource, Posterior, PostingsMeasurements, QuadMeasurements, RecallSpotCheck,
        Relaxation, RepresentationDefect, SelectionOptions,
        fit::{PlacementOptions, ProjectorOptions},
        ladder::{Conditions, LadderOptions},
        projector::train::TrainingSchedule,
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

fn placement() -> PlacementOptions {
    let mut options = ProjectorOptions::ratified();
    options.schedule = TrainingSchedule::new(
        NonZero::new(12).expect("the fixture step count is nonzero"),
        6,
        NonZero::new(4).expect("the fixture cadence is nonzero"),
        const { UnitFraction::new(1.0e-3).expect("the fixture initial rate is a unit fraction") },
        const { UnitFraction::new(1.0e-5).expect("the fixture minimum rate is a unit fraction") },
    )
    .expect("the fixture schedule is valid");
    options.ladder = LadderOptions {
        conditions: Conditions::new(vec![0.0, 1.0]).expect("the fixture schedule is valid"),
        ..
    };

    PlacementOptions::Projector(options)
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
        placement: placement(),
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

fn files() -> SaltFiles {
    SaltFiles {
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
        projector: Some(file("projector.mpk")),
        reviewed_verdicts: Some(file("reviewed-verdicts.json")),
        annotation_corpus: Some(file("annotation-corpus.json")),
        annotation_embeddings: Some(file("annotation-embeddings.arr")),
        annotation_hashes: Some(file("annotation-hashes.arr")),
    }
}

fn repository() -> SaltRepository {
    SaltRepository {
        version: RepositoryVersion::V2,
        files: files(),
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
            placement: Placement::Projector,
            ranking: RankingOrigin::IncidentDegree,
            evidence: evidence(),
        },
    }
}

fn lod_measurements() -> LodMeasurements {
    LodMeasurements {
        world: Bounds2::new(Vec2::new(-4.0, -2.0), Vec2::new(8.0, 6.0))
            .expect("the fixture corners are finite and ordered"),
        bucket_histogram: {
            let mut histogram = [0; Fenceposts::SEGMENTS];
            histogram[4] = 900_000;
            histogram[Fenceposts::SEGMENTS - 1] = 100_000;
            histogram
        },
        catch_all_population: 100_000,
        co_location_excess: 4_096,
        max_tile_delta: 4_096,
    }
}

fn classifier_evidence() -> ClassifierEvidence {
    ClassifierEvidence::Fitted {
        corpus: digest("annotation-corpus.json"),
        assembly: Box::new(AssemblyEvidence {
            supplied: 1_684,
            shot_excluded: 14,
            holdouts_excluded: 6,
            zero_weight_dropped: 3,
            trained: 1_661,
            unique_texts: 1_667,
            severely_truncated: 0,
            fold_groups: 1_088,
            near_duplicate_pairs: 12,
            near_duplicate_epsilon: 2.0e-3,
            near_duplicate_void: [4.0e-4, 1.0e-2],
            near_duplicate_ceiling: 6.25e-2,
            subdivided_groups: 1,
            oversized_accepted: 0,
            deepest_relaxation: Relaxation::Family,
        }),
        fit: ClassifierFitSummary {
            folds: 5,
            regularization: 1.0,
            selection: vec![
                RegularizationReading {
                    regularization: 0.1,
                    cross_entropy: 0.63,
                },
                RegularizationReading {
                    regularization: 1.0,
                    cross_entropy: 0.61,
                },
                RegularizationReading {
                    regularization: 10.0,
                    cross_entropy: 0.66,
                },
            ],
            iterations: 137,
            raw_cross_entropy: 0.61,
            calibrated_cross_entropy: 0.58,
            raw_brier: 0.41,
            calibrated_brier: 0.39,
        },
        holdout: HoldoutEvidence {
            evaluated: 5,
            agreements: 4,
            cards: vec![HoldoutRecord {
                identity: "https://hash.ai/@h/types/entity-type/delivers/v/1".to_owned(),
                human: HoldoutClass::Proximal,
                predicted: GeometryClass::Proximal,
                agree: Some(true),
            }],
        },
    }
}

fn evidence() -> Evidence {
    Evidence {
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
            sampled_rows: 3_849,
            neighbours_per_row: 50,
            matched: 173_600,
            expected: 192_450,
            deviation: 0.32,
            minimum_recall: 0.89,
            // z(0.99) · 0.32 / sqrt(3849) over a corpus far larger than
            // the sample: the fixture reads as a build admitted at
            // 0.9021 - 0.012.
            resolution: 0.012,
            confidence: 0.99,
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
        classifier: Some(classifier_evidence()),
        relations: BuildMeasurements {
            pruning_threshold: 0.001,
            retained_edges: 8_700_000,
            pruned_edges: 100_000,
            retained_mass: 4_200_000.0,
            pruned_mass: 32.0,
            self_references: 1_024,
            multi_typed_edges: vec![8_799_998, 1],
            clamped_confidences: 3,
        },
        lod: lod_measurements(),
        quad: QuadMeasurements {
            nodes: 21_845,
            leaves: 16_000,
            depth: Depth::new(7).expect("the fixture depth is within the key width"),
            type_entries: 65_000,
        },
        postings: PostingsMeasurements {
            types: 49,
            dense_types: 3,
            membership_entries: 1_100_000,
            parent_edges: 48,
        },
        projector: Some(ProjectorEvidence {
            steps: 12,
            boundary: Some(FrozenRadiusEvidence::Measured { radius: 0.35 }),
            unresolved_verdicts: 1,
            ladder: Some(LadderEvidence {
                rungs: vec![
                    RungEvidence {
                        condition: 0.0,
                        relation_loss: 421.5,
                        alignment: Similarity::IDENTITY,
                        baseline_movement: 0.0,
                        adjacent_movement: 0.0,
                    },
                    RungEvidence {
                        condition: 1.0,
                        relation_loss: 397.25,
                        // (0.6, 0.8) lies exactly on the unit
                        // circle in f32.
                        alignment: Similarity::new(
                            1.25,
                            Rotation::from_cos_sin(0.6, 0.8),
                            Vec2::new(0.5, -0.25),
                        )
                        .expect("the fixture scale is finite, positive, and normal"),
                        baseline_movement: 0.125,
                        adjacent_movement: 0.125,
                    },
                ],
                canonical: 1.0,
                canonical_index: 1,
                persisted_relation_loss: 397.25,
            }),
        }),
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
        json.starts_with(r#"{"version":2"#),
        "the version should lead the document: {json}"
    );
}

#[test]
fn a_retired_layout_is_refused_by_its_version() {
    // `RepositoryVersion::V2` names exactly two differences from the
    // retired layout. Version 1's recall evidence recorded the configured
    // `margin` where version 2 records the achieved `resolution`, and its
    // configuration echo carried no sampling `budget`. Neither field
    // carries a serde default, so either difference alone kills a version
    // 2 decode. That is what turns the version's precedence into an
    // observable claim rather than a restatement.
    let mut document: serde_json::Value =
        serde_json::to_value(repository()).expect("the repository should serialize");

    let recall = document
        .pointer_mut("/metadata/evidence/recall")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the recall evidence should be an object");
    recall
        .remove("resolution")
        .expect("version 2's recall evidence records the achieved resolution");
    recall.insert("margin".to_owned(), serde_json::json!(0.012));

    let echo = document
        .pointer_mut("/metadata/reproducibility/config/recall_check")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the configuration echo should carry the recall check");
    echo.remove("budget")
        .expect("version 2's configuration echo carries the sampling budget");
    echo.insert("margin".to_owned(), serde_json::json!(0.012));

    // This control is what the precedence claim rests on, since the same
    // contents refuse on their own once the version stops shadowing them.
    // It leaves open which of the two fields the error names, because the
    // field a decode reaches first follows the map's iteration order, and
    // that order is a build-graph feature rather than a promise of this
    // crate.
    let error = serde_json::from_value::<SaltRepository>(document.clone())
        .expect_err("a version 1 shape should not decode as version 2");
    let error = error.to_string();
    assert!(
        error.contains("missing field")
            && (error.contains("budget") || error.contains("resolution")),
        "the retired contents should refuse without help from the version: {error}",
    );

    *document
        .pointer_mut("/version")
        .expect("the document should carry a version") = serde_json::json!(1);

    // Field order carries the guarantee, so this decode takes the bytes a
    // writer would produce rather than the value itself. The ordering is
    // the thing under test, and a value's key order falls outside what
    // this crate promises.
    let retired = serde_json::to_string(&document).expect("the document should serialize");
    assert!(
        retired.starts_with(r#"{"version":1"#),
        "the version should lead the retired document: {retired}",
    );

    let error = serde_json::from_str::<SaltRepository>(&retired)
        .expect_err("a retired layout should be rejected");
    assert!(
        error
            .to_string()
            .contains("unsupported repository version 1"),
        "the retired layout should be refused by its version, before its contents are \
         interpreted: {error}",
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
fn absent_verdicts_role_round_trips_as_explicit_null() {
    let mut repository = repository();
    repository.files.reviewed_verdicts = None;

    let json = serde_json::to_string(&repository).expect("the repository should serialize");
    // The document stays self-describing: the role's absence is a
    // recorded null, not a missing key.
    assert!(
        json.contains(r#""reviewed_verdicts":null"#),
        "the absent role should serialize as an explicit null: {json}"
    );

    let decoded: SaltRepository =
        serde_json::from_str(&json).expect("the serialized repository should deserialize");
    assert_eq!(decoded, repository);
}

#[test]
fn baseline_generation_records_projector_absence_as_explicit_null() {
    let mut repository = repository();
    repository.files.projector = None;
    repository.metadata.placement = Placement::LandmarkBaseline;
    repository.metadata.reproducibility.config.placement = PlacementOptions::LandmarkBaseline;
    repository.metadata.evidence.projector = None;

    let json = serde_json::to_string(&repository).expect("the repository should serialize");
    assert!(
        json.contains(r#""projector":null"#),
        "the absent role should serialize as an explicit null: {json}"
    );
    assert!(
        json.contains(r#""placement":"landmark-baseline""#),
        "the placement should record the baseline: {json}"
    );

    let decoded: SaltRepository =
        serde_json::from_str(&json).expect("the serialized repository should deserialize");
    assert_eq!(decoded, repository);
}

#[test]
fn a_document_without_the_clamp_count_decodes_as_zero() {
    let mut document: serde_json::Value =
        serde_json::to_value(repository()).expect("the repository should serialize");
    let mut expected = repository();
    expected.metadata.evidence.relations.clamped_confidences = 0;
    let relations = document
        .pointer_mut("/metadata/evidence/relations")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the relation evidence should be an object");

    // The key is physically removed, which is the shape every document
    // published before the drain counted its clamps actually has.
    assert!(
        relations.remove("clamped_confidences").is_some(),
        "the published shape should carry the clamp count: {relations:?}",
    );
    let decoded: SaltRepository =
        serde_json::from_value(document.clone()).expect("the older shape should deserialize");
    assert_eq!(decoded.metadata.evidence.relations.clamped_confidences, 0);
    assert_eq!(decoded, expected);

    // The control for the removal itself: a sibling count with no
    // default refuses, so the decode above passed on the default and
    // not on a tolerated-absence rule covering the whole record.
    let relations = document
        .pointer_mut("/metadata/evidence/relations")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the relation evidence should be an object");
    relations
        .remove("self_references")
        .expect("the published shape should carry the self-reference count");
    let error = serde_json::from_value::<SaltRepository>(document)
        .expect_err("a missing undefaulted field should refuse");
    assert!(
        error.to_string().contains("self_references"),
        "the refusal should name the missing field: {error}",
    );
}

#[test]
fn tampered_configuration_echo_refuses_to_deserialize() {
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
        // The boundary must lie within the run.
        (
            "/metadata/reproducibility/config/placement/projector/schedule/boundary",
            serde_json::json!(100),
        ),
        // The semantic coefficient anchors the budget and must be
        // strictly positive.
        (
            "/metadata/reproducibility/config/placement/projector/coefficients",
            serde_json::json!([0.0, 1.0, 1.0, 1.0, 0.0, 1.0]),
        ),
        // Rungs must ascend strictly from the exact zero baseline.
        (
            "/metadata/reproducibility/config/placement/projector/ladder/conditions",
            serde_json::json!([0.0, 0.5, 0.25]),
        ),
        (
            "/metadata/reproducibility/config/placement/projector/lens/temperature",
            serde_json::json!(0.0),
        ),
        // The rotation of a recorded alignment must lie on the unit
        // circle.
        (
            "/metadata/evidence/projector/ladder/rungs/1/alignment/rotation",
            serde_json::json!([2.0, 2.0]),
        ),
        (
            "/metadata/evidence/projector/ladder/rungs/1/alignment/scale",
            serde_json::json!(0.0),
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

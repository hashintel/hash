use core::num::NonZero;

use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};

use super::{
    SaltFiles, SaltRepository,
    metadata::{
        ClassifierEvidence, ClassifierFitSummary, Evidence, FrozenRadiusEvidence, HoldoutEvidence,
        HoldoutRecord, LadderEvidence, LandmarkEvidence, Placement, PolicyEvidence,
        ProjectorEvidence, ProximalCalibrationEvidence, RankingOrigin, RefreshFractionEvidence,
        RegularizationReading, Reproducibility, RungEvidence, SaltMetadata, Snapshot, StabilityArm,
        StabilityBoundEvidence, StabilityCertificateEvidence, TypeCalibrationEvidence,
        TypeRelationLoss,
    },
};
use crate::{
    dataset::TemporalAxes,
    file::{
        morton::SEGMENTS,
        repository::{Artifact, Binding, RepositoryVersion},
    },
    identity::{NodeRowId, OntologyRowId},
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{
        AffinityCurve, Bounds2, Rotation, Similarity, UnitFraction, Vec2, d_non_negative,
        d_positive, non_negative, open_unit_fraction, positive, unit_fraction,
    },
    morton::Depth,
    salt::{
        embedding::{CardEmbeddingStats, EmbedderFingerprint},
        fit::{
            FitConfig, PlacementOptions, PolicyOptions, ProjectorOptions,
            prepare::norm::{NormSpotCheck, RepresentationDefect},
        },
        knn::recall::RecallSpotCheck,
        ladder::{
            Conditions, LadderOptions,
            paired::{PairedMovementEvidence, RuleIdentity},
        },
        landmark::select::SelectionOptions,
        lod::{quad::QuadMeasurements, stage::LodMeasurements},
        policy::{
            GeometryClass, PolicyOverride, PolicySource, Posterior,
            annotation::{
                HoldoutClass,
                assembly::{AssemblyEvidence, Relaxation},
            },
        },
        postings::build::PostingsMeasurements,
        projector::train::TrainingSchedule,
        relation::BuildMeasurements,
    },
};

fn digest(seed: &str) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(seed.as_bytes());
    hasher.finalize()
}

fn binding<A: Artifact>(seed: &str) -> Binding<A> {
    Binding::new(digest(seed))
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
        conditions: Conditions::new(vec![non_negative!(0.0), non_negative!(1.0)])
            .expect("the fixture schedule is valid"),
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
        projector: Some(binding("projector.mpk")),
        reviewed_verdicts: Some(binding("reviewed-verdicts.json")),
        annotation_corpus: Some(binding("annotation-corpus.json")),
        annotation_embeddings: Some(binding("annotation-embeddings.arr")),
        annotation_hashes: Some(binding("annotation-hashes.arr")),
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
            let mut histogram = [0; SEGMENTS];
            histogram[4] = 900_000;
            histogram[SEGMENTS - 1] = 100_000;
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
            empty_cut_components: Some(0),
            deepest_relaxation: Relaxation::Family,
        }),
        fit: ClassifierFitSummary {
            folds: 5,
            regularization: d_positive!(1.0),
            selection: vec![
                RegularizationReading {
                    regularization: d_positive!(0.1),
                    cross_entropy: d_non_negative!(0.63),
                },
                RegularizationReading {
                    regularization: d_positive!(1.0),
                    cross_entropy: d_non_negative!(0.61),
                },
                RegularizationReading {
                    regularization: d_positive!(10.0),
                    cross_entropy: d_non_negative!(0.66),
                },
            ],
            iterations: 137,
            raw_cross_entropy: d_non_negative!(0.61),
            calibrated_cross_entropy: d_non_negative!(0.58),
            raw_brier: d_non_negative!(0.41),
            calibrated_brier: d_non_negative!(0.39),
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

/// The calibration body of the fixture's measured boundary.
///
/// Exact dyadic literals: the fixture exercises the wire shape, and the reader fixtures
/// downstream assert byte-stable decoding rather than cross-field theorems.
fn calibration() -> ProximalCalibrationEvidence {
    ProximalCalibrationEvidence {
        radius: non_negative!(0.35),
        types: vec![TypeCalibrationEvidence {
            relation: 5,
            pairs: 12,
            mass: d_non_negative!(6.0),
            quantiles: Some([non_negative!(0.35), non_negative!(0.5), non_negative!(0.75)]),
            radius_without: None,
        }],
        fractions: vec![RefreshFractionEvidence {
            step: 8,
            fraction: d_non_negative!(0.25),
        }],
        stability: StabilityCertificateEvidence {
            arm: StabilityArm::Reviews,
            quantile: open_unit_fraction!(0.25),
            delta: open_unit_fraction!(0.05),
            kappa: d_positive!(1.0),
            temperature: d_positive!(0.125),
            tau: d_positive!(0.125),
            effective_support: d_positive!(12.0),
            pairs: 12,
            mass: d_non_negative!(6.0),
            epsilon_zero: d_positive!(0.375),
            gap: d_non_negative!(0.0625),
            bound: StabilityBoundEvidence::Finite {
                support: d_positive!(30.5),
                attained: false,
            },
            pass: false,
            type_effective_support: d_positive!(1.0),
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
            tolerance: d_positive!(1.0e-4),
            defect_rate: open_unit_fraction!(0.01),
            confidence: open_unit_fraction!(0.999),
            defects: Vec::new(),
        },
        recall: RecallSpotCheck {
            sampled_rows: 3_849,
            neighbours_per_row: 50,
            matched: 173_600,
            expected: 192_450,
            deviation: d_non_negative!(0.32),
            minimum_recall: unit_fraction!(0.89),
            // z(0.99) · 0.32 / sqrt(3849) over a corpus far larger than
            // the sample: the fixture reads as a build admitted at
            // 0.9021 - 0.012.
            resolution: d_non_negative!(0.012),
            confidence: open_unit_fraction!(0.99),
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
        classifier: classifier_evidence(),
        relations: BuildMeasurements {
            pruning_threshold: non_negative!(0.001),
            retained_edges: 8_700_000,
            pruned_edges: 100_000,
            retained_mass: d_non_negative!(4_200_000.0),
            pruned_mass: d_non_negative!(32.0),
            self_references: 1_024,
            multi_typed_edges: vec![8_799_998, 1],
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
            list_entries: 1_100_000,
            parent_edges: 48,
            direct_entries: 1_400_000,
        },
        projector: Some(ProjectorEvidence {
            steps: 12,
            boundary: Some(FrozenRadiusEvidence::Measured {
                radius: non_negative!(0.35),
            }),
            proximal_calibration: Some(calibration()),
            unresolved_verdicts: 1,
            ladder: Some(LadderEvidence {
                rungs: vec![
                    RungEvidence {
                        condition: non_negative!(0.0),
                        relation_loss: d_non_negative!(421.5),
                        capped_relation_loss: Some(d_non_negative!(210.75)),
                        relation_losses: vec![TypeRelationLoss {
                            relation: OntologyRowId::new(5),
                            loss: d_non_negative!(421.5),
                        }],
                        alignment: Similarity::IDENTITY,
                        baseline_movement: d_non_negative!(0.0),
                        adjacent_movement: d_non_negative!(0.0),
                    },
                    RungEvidence {
                        condition: non_negative!(1.0),
                        relation_loss: d_non_negative!(397.25),
                        capped_relation_loss: Some(d_non_negative!(99.3125)),
                        relation_losses: vec![],
                        // (0.6, 0.8) lies exactly on the unit
                        // circle in f32.
                        alignment: Similarity::new(
                            positive!(1.25),
                            Rotation::from_cos_sin(0.6, 0.8),
                            Vec2::new(0.5, -0.25),
                        )
                        .expect("the fixture scale is finite, positive, and normal"),
                        baseline_movement: d_non_negative!(0.125),
                        adjacent_movement: d_non_negative!(0.125),
                    },
                ],
                canonical: non_negative!(1.0),
                canonical_index: 1,
                persisted_relation_loss: d_non_negative!(397.25),
                paired_movement: None,
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
    // has a serde default, so either difference alone kills a version
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

    // Field order is the guarantee, so this decode takes the bytes a
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
    // A self-describing document records the role's absence as a null
    // rather than dropping the key.
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
fn a_document_without_the_multi_typed_edge_histogram_refuses() {
    let mut document: serde_json::Value =
        serde_json::to_value(repository()).expect("the repository should serialize");
    let relations = document
        .pointer_mut("/metadata/evidence/relations")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the relation evidence should be an object");

    // Every published document carries the histogram, since the writer
    // derives it from the mixture and emits it unconditionally, so a
    // document without the key is a document this pipeline never wrote.
    relations
        .remove("multi_typed_edges")
        .expect("the published shape should carry the multi-typed edge histogram");

    let error = serde_json::from_value::<SaltRepository>(document)
        .expect_err("a missing undefaulted field should refuse");
    assert!(
        error.to_string().contains("multi_typed_edges"),
        "the refusal should name the missing field: {error}",
    );
}

#[test]
fn a_document_without_the_classifier_evidence_refuses() {
    let mut document: serde_json::Value =
        serde_json::to_value(repository()).expect("the repository should serialize");
    let evidence = document
        .pointer_mut("/metadata/evidence")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the evidence should be an object");

    // Every published document records where its classifier came from,
    // since the fit either receives one or trains one and emits the
    // evidence unconditionally, so a document without the block is a
    // document this pipeline never wrote.
    evidence
        .remove("classifier")
        .expect("the published shape should carry the classifier evidence");

    let error = serde_json::from_value::<SaltRepository>(document)
        .expect_err("a missing undefaulted field should refuse");
    assert!(
        error.to_string().contains("classifier"),
        "the refusal should name the missing field: {error}",
    );
}

#[test]
fn a_document_missing_an_assembly_reading_refuses() {
    let base: serde_json::Value =
        serde_json::to_value(repository()).expect("the repository should serialize");

    // The control for the removals below: the untouched document
    // decodes, so each refusal traces to its missing key alone.
    let _: SaltRepository =
        serde_json::from_value(base.clone()).expect("the complete document should deserialize");

    // The writer derives every assembly reading from the corpus it
    // trained on and emits each one unconditionally, so a document
    // without one is a document this pipeline never wrote.
    for key in [
        "near_duplicate_void",
        "near_duplicate_ceiling",
        "subdivided_groups",
        "oversized_accepted",
        "deepest_relaxation",
    ] {
        let mut document = base.clone();
        let assembly = document
            .pointer_mut("/metadata/evidence/classifier/assembly")
            .and_then(serde_json::Value::as_object_mut)
            .expect("the assembly evidence should be an object");
        assembly
            .remove(key)
            .expect("the published shape should carry every assembly reading");

        let error = serde_json::from_value::<SaltRepository>(document)
            .expect_err("a missing undefaulted field should refuse");
        assert!(
            error.to_string().contains(key),
            "the refusal should name the missing field {key}: {error}",
        );
    }
}

#[test]
fn a_document_without_the_empty_cut_count_decodes_as_absent() {
    let mut document: serde_json::Value =
        serde_json::to_value(repository()).expect("the repository should serialize");
    let assembly = document
        .pointer_mut("/metadata/evidence/classifier/assembly")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the assembly evidence should be an object");

    // The key is physically removed, the shape a document carries when
    // no assembly counted its empty cuts.
    assert!(
        assembly.remove("empty_cut_components").is_some(),
        "the published shape should carry the empty-cut count: {assembly:?}",
    );
    let decoded: SaltRepository =
        serde_json::from_value(document.clone()).expect("the older shape should deserialize");
    let ClassifierEvidence::Fitted { assembly, .. } = &decoded.metadata.evidence.classifier else {
        panic!("the fixture classifier evidence is fitted");
    };
    assert_eq!(
        assembly.empty_cut_components, None,
        "an absent key reads as an absent count rather than a measured zero"
    );
    let mut expected = repository();
    let ClassifierEvidence::Fitted { assembly, .. } = &mut expected.metadata.evidence.classifier
    else {
        panic!("the fixture classifier evidence is fitted");
    };
    assembly.empty_cut_components = None;
    assert_eq!(decoded, expected);

    // The control for the removal itself: a sibling count with no
    // default refuses, so the decode above passed on the optional key
    // and not on a tolerated-absence rule covering the whole record.
    let assembly = document
        .pointer_mut("/metadata/evidence/classifier/assembly")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the assembly evidence should be an object");
    assembly
        .remove("subdivided_groups")
        .expect("the published shape should carry the subdivision count");
    let error = serde_json::from_value::<SaltRepository>(document)
        .expect_err("a missing undefaulted field should refuse");
    assert!(
        error.to_string().contains("subdivided_groups"),
        "the refusal should name the missing field: {error}",
    );
}

#[test]
fn a_rung_without_the_capped_estimand_decodes_as_absent() {
    let mut document: serde_json::Value =
        serde_json::to_value(repository()).expect("the repository should serialize");
    let rung = document
        .pointer_mut("/metadata/evidence/projector/ladder/rungs/0")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the first rung should be an object");

    // The key is physically removed, the shape a ladder carries when
    // it was written before the capped readout existed.
    assert!(
        rung.remove("capped_relation_loss").is_some(),
        "the published shape should carry the capped estimand: {rung:?}",
    );
    let decoded: SaltRepository =
        serde_json::from_value(document.clone()).expect("the older shape should deserialize");
    let ladder = decoded
        .metadata
        .evidence
        .projector
        .as_ref()
        .and_then(|projector| projector.ladder.as_ref())
        .expect("the fixture carries a ladder");
    assert_eq!(
        ladder.rungs[0].capped_relation_loss, None,
        "an absent key reads as an absent reading rather than a measured zero"
    );
    let mut expected = repository();
    expected
        .metadata
        .evidence
        .projector
        .as_mut()
        .and_then(|projector| projector.ladder.as_mut())
        .expect("the fixture carries a ladder")
        .rungs[0]
        .capped_relation_loss = None;
    assert_eq!(decoded, expected);

    // The control for the removal itself: the retained uncapped key
    // has no default and refuses, so the decode above passed on the
    // optional key and not on a tolerated-absence rule covering the
    // whole rung.
    let rung = document
        .pointer_mut("/metadata/evidence/projector/ladder/rungs/0")
        .and_then(serde_json::Value::as_object_mut)
        .expect("the first rung should be an object");
    rung.remove("relation_loss")
        .expect("the published shape should carry the uncapped total");
    let error = serde_json::from_value::<SaltRepository>(document)
        .expect_err("a missing undefaulted field should refuse");
    assert!(
        error.to_string().contains("relation_loss"),
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
        // The semantic coefficient anchors the budget and must exceed
        // zero.
        (
            "/metadata/reproducibility/config/placement/projector/coefficients",
            serde_json::json!([0.0, 1.0, 1.0, 1.0, 0.0, 1.0]),
        ),
        // Each rung must exceed the one before it, from the exact zero
        // baseline up.
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

/// A body of each present paired-movement outcome kind, decoded through the production reader.
///
/// The bodies decode from the ruled serialized shapes, so the fixture cannot drift from the
/// wire form the pins in `salt::ladder::paired` hold.
fn paired_bodies(repository: &SaltRepository) -> [PairedMovementEvidence<NodeRowId>; 3] {
    let salt = RuleIdentity::INITIAL
        .recognize()
        .expect("the initial identity recognizes")
        .derive_salt(
            &repository.metadata.snapshot,
            &repository.metadata.reproducibility,
        )
        .expect("the fixture sections serialize");
    let family = serde_json::json!({
        "q05": -1.5, "q25": -0.5, "q50": 0.5, "q75": 1.5, "q95": 2.5, "mean": 0.5,
    });
    let counts = serde_json::json!({
        "rule": 1,
        "salt": salt,
        "rank_window": 256,
        "pair_candidates": 2,
        "pairs_selected": 2,
        "control_candidates": 3,
        "controls_selected": 2,
    });
    let with = |extension: serde_json::Value| {
        let mut body = counts.clone();
        body.as_object_mut()
            .expect("the counts are an object")
            .extend(
                extension
                    .as_object()
                    .expect("the extension is an object")
                    .clone(),
            );
        serde_json::from_value::<PairedMovementEvidence<NodeRowId>>(body)
            .expect("the ruled shape decodes through the production reader")
    };

    [
        with(serde_json::json!({
            "outcome": "measured",
            "pairs": {
                "count": 2,
                "distance": family,
                "rank": family,
                "contracting": 0.5,
                "rank_improving": 0.0,
            },
            "deciles": [
                {"upper": 1.5, "candidates": 3, "selected": 2, "displacement": family},
            ],
        })),
        with(serde_json::json!({"outcome": "vacuous"})),
        with(serde_json::json!({
            "outcome": "failed",
            "reason": {"cause": "endpoint", "edge": 0, "row": 9, "rows": 4},
        })),
    ]
}

#[test]
fn present_paired_outcomes_round_trip_through_the_document() {
    let mut repository = repository();

    for body in paired_bodies(&repository) {
        repository
            .metadata
            .evidence
            .projector
            .as_mut()
            .expect("the fixture records projector evidence")
            .ladder
            .as_mut()
            .expect("the fixture records a ladder")
            .paired_movement = Some(body);

        let document = serde_json::to_string(&repository).expect("the document serializes");
        let decoded: SaltRepository =
            serde_json::from_str(&document).expect("the document reads back");
        assert_eq!(decoded, repository);
    }
}

#[test]
fn a_decoded_document_carries_only_in_domain_readings() {
    // The evidence types validate at deserialization, so a tampered or corrupted reading
    // refuses the whole document instead of parsing into a value the aggregation could never
    // produce. The serializer cannot write a non-finite number, so the tamper edits the
    // serialized value tree directly.
    let mut repository = repository();
    let [measured, _, _] = paired_bodies(&repository);
    repository
        .metadata
        .evidence
        .projector
        .as_mut()
        .expect("the fixture records projector evidence")
        .ladder
        .as_mut()
        .expect("the fixture records a ladder")
        .paired_movement = Some(measured);

    let paired = "/metadata/evidence/projector/ladder/paired_movement";
    let calibration = "/metadata/evidence/projector/proximal_calibration";
    for (pointer, tampered) in [
        (
            format!("{paired}/pairs/distance/q95"),
            serde_json::Value::Null,
        ),
        (
            format!("{paired}/pairs/contracting"),
            serde_json::json!(1.5),
        ),
        (format!("{paired}/deciles/0/upper"), serde_json::json!(-1.0)),
        (
            format!("{calibration}/stability/gap"),
            serde_json::json!(-1.0),
        ),
        (
            format!("{calibration}/stability/effective_support"),
            serde_json::json!(0.0),
        ),
        (
            format!("{calibration}/types/0/mass"),
            serde_json::json!(-1.0),
        ),
        (
            format!("{calibration}/fractions/0/fraction"),
            serde_json::Value::Null,
        ),
        (
            "/metadata/evidence/projector/ladder/rungs/0/relation_losses/0/loss".to_owned(),
            serde_json::json!(-1.0),
        ),
        (
            "/metadata/evidence/classifier/fit/regularization".to_owned(),
            serde_json::json!(0.0),
        ),
        (
            "/metadata/evidence/classifier/fit/selection/1/cross_entropy".to_owned(),
            serde_json::json!(-0.1),
        ),
        (
            "/metadata/evidence/classifier/fit/calibrated_brier".to_owned(),
            serde_json::Value::Null,
        ),
        (
            "/metadata/evidence/relations/pruning_threshold".to_owned(),
            serde_json::json!(-1.0),
        ),
        (
            "/metadata/evidence/relations/retained_mass".to_owned(),
            serde_json::json!(-1.0),
        ),
        (
            "/metadata/evidence/norm/tolerance".to_owned(),
            serde_json::json!(0.0),
        ),
        (
            "/metadata/evidence/norm/confidence".to_owned(),
            serde_json::json!(1.0),
        ),
        (
            "/metadata/evidence/recall/deviation".to_owned(),
            serde_json::json!(-0.1),
        ),
        (
            "/metadata/evidence/recall/minimum_recall".to_owned(),
            serde_json::json!(1.5),
        ),
    ] {
        let mut value = serde_json::to_value(&repository).expect("the document serializes");
        *value
            .pointer_mut(&pointer)
            .expect("the fixture body carries the tampered field") = tampered;
        serde_json::from_value::<SaltRepository>(value)
            .expect_err("an out-of-domain reading refuses the document");
    }
}

#[test]
fn an_old_document_without_the_optional_keys_decodes_as_absent() {
    // Decode-from-old means a published-shape repository-version-2 document written before a
    // field existed decodes with that field absent, never zero.
    let repository = repository();
    let mut json = serde_json::to_value(&repository).expect("the repository should serialize");

    let projector = json["metadata"]["evidence"]["projector"]
        .as_object_mut()
        .expect("the projector evidence is an object");
    assert!(
        projector.remove("proximal_calibration").is_some(),
        "the writer emits the calibration key"
    );

    let rung = json["metadata"]["evidence"]["projector"]["ladder"]["rungs"][0]
        .as_object_mut()
        .expect("a rung is an object");
    assert!(
        rung.remove("relation_losses").is_some(),
        "the writer emits the per-type key"
    );

    let decoded: SaltRepository =
        serde_json::from_value(json).expect("an old document still decodes");
    let evidence = decoded
        .metadata
        .evidence
        .projector
        .expect("the projector evidence survives");
    assert_eq!(evidence.proximal_calibration, None);
    assert!(
        evidence.ladder.expect("the ladder survives").rungs[0]
            .relation_losses
            .is_empty()
    );
}

#[test]
fn a_missing_required_sibling_refuses_and_names_the_field() {
    // The control proves the optional keys' own absence rule decodes the old document rather
    // than record-wide permissiveness. Removing an undefaulted required sibling must refuse,
    // naming the field.
    let repository = repository();
    let mut json = serde_json::to_value(&repository).expect("the repository should serialize");

    let projector = json["metadata"]["evidence"]["projector"]
        .as_object_mut()
        .expect("the projector evidence is an object");
    assert!(
        projector.remove("unresolved_verdicts").is_some(),
        "the sibling exists to remove"
    );

    let error = serde_json::from_value::<SaltRepository>(json)
        .expect_err("a missing required field refuses");
    assert!(
        error.to_string().contains("unresolved_verdicts"),
        "the refusal names the field: {error}"
    );
}

#[test]
fn an_old_ladder_without_the_paired_movement_key_decodes_as_absent() {
    // A published-shape repository-version-2 ladder written before the readout existed
    // carries no `paired_movement` key and decodes the field as absent, never as a vacuous
    // or failed body.
    let repository = repository();
    let mut json = serde_json::to_value(&repository).expect("the repository should serialize");

    let ladder = json["metadata"]["evidence"]["projector"]["ladder"]
        .as_object_mut()
        .expect("the ladder evidence is an object");
    assert!(
        ladder.remove("paired_movement").is_some(),
        "the ladder record carries the readout key"
    );

    let decoded: SaltRepository =
        serde_json::from_value(json).expect("an old ladder still decodes");
    assert_eq!(
        decoded
            .metadata
            .evidence
            .projector
            .expect("the projector evidence survives")
            .ladder
            .expect("the ladder survives")
            .paired_movement,
        None
    );
}

#[test]
fn a_ladder_missing_a_required_sibling_refuses_and_names_the_field() {
    // The control for the ladder record: removing an undefaulted required sibling refuses,
    // so the readout key's decode rests on its own absence rule rather than record-wide
    // permissiveness.
    let repository = repository();
    let mut json = serde_json::to_value(&repository).expect("the repository should serialize");

    let ladder = json["metadata"]["evidence"]["projector"]["ladder"]
        .as_object_mut()
        .expect("the ladder evidence is an object");
    assert!(
        ladder.remove("persisted_relation_loss").is_some(),
        "the sibling exists to remove"
    );

    let error = serde_json::from_value::<SaltRepository>(json)
        .expect_err("a missing required field refuses");
    assert!(
        error.to_string().contains("persisted_relation_loss"),
        "the refusal names the field: {error}"
    );
}

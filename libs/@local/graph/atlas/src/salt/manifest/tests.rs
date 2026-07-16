use core::mem::size_of;
use std::{collections::HashMap, fs};

use burn::backend::{Candle, candle::CandleDevice};
use camino::{Utf8Path, Utf8PathBuf};
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use jiff::Timestamp as JiffTimestamp;
use tempfile::tempdir;

use super::*;
use crate::salt::{
    card::CARD_FORMAT_VERSION,
    evaluation::quantized_field_content_hash,
    format::{
        ANALYTIC_FORMAT, BASE_ARTIFACT_FORMAT, CLASSIFIER_FORMAT, LANDMARK_FORMAT,
        PERSISTENCE_REFERENCE_FORMAT, RELATION_FORMAT, REPRESENTATION_FORMAT,
        SEMANTIC_GRAPH_FORMAT,
    },
    generation::PersistenceComparisonReport,
    hash::{ContentHash, ContentHasher},
    projector::{
        ConditionedProjector, PROJECTOR_ARCHITECTURE_VERSION, ProjectorConfig,
        publish_projector_checkpoint,
    },
    representation::{
        AUDITED_PREFIX_DIMENSIONS, CANONICAL_DIMENSIONS, NORMALIZATION_EPSILON,
        PROJECTOR_DIMENSIONS, RepresentationAuditReport, TRANSFORM_VERSION, canonical_corpus_hash,
        prefix_corpus_hash, projector_corpus_hash, transform_contract_hash,
        transform_golden_vectors_hash,
    },
    revision::{AuthorizationRevision, BaseRevision, DeltaRevision, GenerationId, VariantId},
    storage::mmap::{
        ArtifactFormat, ArtifactScalar, ArtifactSection, PublishedArtifact, SectionId,
        publish_artifact,
    },
};

#[test]
fn canonical_identity_ignores_unordered_seed_and_wire_collections() {
    let first = manifest();
    let mut reordered = first.clone();
    reordered.serving.wire_versions.reverse();
    reordered.reproducibility.seeds.reverse();

    assert_eq!(
        first.content_hash().expect("manifest should hash"),
        reordered.content_hash().expect("manifest should hash")
    );
}

#[test]
fn execution_contract_rejects_a_property_not_bound_by_its_hash() {
    let mut manifest = manifest();
    manifest.reproducibility.execution_contract.training_backend = "autodiff<other>".to_owned();

    assert!(matches!(
        manifest.validate(),
        Err(ManifestError::InvalidInvariant {
            field: "reproducibility.execution_contract.contract_hash",
            ..
        })
    ));
}

#[test]
fn unpinned_companion_cannot_form_a_manifest_identity() {
    let mut manifest = manifest();
    manifest.serving.canvas_companion_version = " \tTbD ".to_owned();

    assert!(matches!(
        manifest.validate(),
        Err(ManifestError::MissingText {
            field: "serving.canvas_companion_version"
        })
    ));
}

#[test]
fn external_reports_cannot_alias_the_subjects_they_evaluate() {
    let mut relation = manifest();
    relation.relations.security_approval_report_hash = relation.relations.security_allow_list_hash;
    assert!(matches!(
        relation.validate(),
        Err(ManifestError::InvalidInvariant {
            field: "relations.external_report_hashes",
            ..
        })
    ));

    let mut companion = manifest();
    companion.serving.companion_compatibility_report_hash =
        companion.serving.canvas_companion_sha256;
    assert!(matches!(
        companion.validate(),
        Err(ManifestError::InvalidInvariant {
            field: "serving.companion_compatibility_report_hash",
            ..
        })
    ));
}

#[test]
fn manifest_rejects_an_ann_backend_below_the_exact_recall_gate() {
    let mut manifest = manifest();
    manifest.semantic_graph.recall_at_50 = 0.949;

    assert!(matches!(
        manifest.validate(),
        Err(ManifestError::InvalidInvariant {
            field: "semantic_graph.recall_at_50",
            ..
        })
    ));
}

#[test]
fn manifest_rejects_unbound_input_and_projector_transform_contracts() {
    let mut invalid_input = manifest();
    invalid_input.input_snapshot.frozen_input_hash = ContentHash::from_bytes([0; 32]);
    assert!(matches!(
        invalid_input.validate(),
        Err(ManifestError::InvalidInvariant {
            field: "input_snapshot.frozen_input_hash",
            ..
        })
    ));

    let mut invalid_transform = manifest();
    invalid_transform.embedding.transform_hash = ContentHash::digest(b"different-transform");
    assert!(matches!(
        invalid_transform.validate(),
        Err(ManifestError::InvalidInvariant {
            field: "embedding.transform_hash",
            ..
        })
    ));
}

#[test]
fn manifest_rejects_quality_measurements_below_release_policy() {
    let mut manifest = manifest();
    manifest.variants.entries[0].semantic_fidelity = 0.90;

    assert!(matches!(
        manifest.validate(),
        Err(ManifestError::InvalidInvariant {
            field: "variants.entries.semantic_fidelity",
            ..
        })
    ));
}

#[test]
fn manifest_rejects_clamp_metadata_not_derived_from_row_count() {
    let mut manifest = manifest();
    manifest.variants.entries[0].clamp_count = 1;
    manifest.variants.entries[0].clamp_rate = 0.0;

    assert!(matches!(
        manifest.validate(),
        Err(ManifestError::InvalidInvariant {
            field: "variants.entries.clamp_rate",
            ..
        })
    ));
}

#[test]
fn disabled_typed_deconflict_cannot_smuggle_repulsive_geometry() {
    let mut manifest = manifest();
    manifest.relations.typed_deconflict.geometry_coefficient = 0.25;

    assert!(matches!(
        manifest.validate(),
        Err(ManifestError::InvalidInvariant {
            field: "relations.typed_deconflict.geometry_coefficient",
            ..
        })
    ));
}

#[test]
fn initial_manifest_rejects_an_enabled_strength_head() {
    let mut manifest = manifest();
    manifest.relations.strength_head.enabled = true;

    assert!(matches!(
        manifest.validate(),
        Err(ManifestError::InvalidInvariant {
            field: "relations.strength_head.enabled",
            ..
        })
    ));
}

#[test]
fn initial_generation_has_exactly_one_canonical_variant() {
    let mut manifest = manifest();
    manifest.variants.published_variant_count = 2;
    manifest
        .variants
        .entries
        .push(manifest.variants.entries[0].clone());

    assert!(matches!(
        manifest.validate(),
        Err(ManifestError::VariantCount { .. })
    ));
}

#[test]
fn canonical_condition_rejects_negative_zero() {
    let mut manifest = manifest();
    manifest.variants.entries[0].global_relation_condition = -0.0;

    assert!(matches!(
        manifest.validate(),
        Err(ManifestError::InvalidInvariant {
            field: "variants.entries.global_relation_condition",
            ..
        })
    ));
}

#[test]
fn zero_condition_requires_the_unaligned_identity_transform() {
    let mut manifest = manifest();
    let canonical = &mut manifest.variants.entries[0];
    canonical.global_relation_condition = 0.0;
    canonical.procrustes_transform[3] = 1.0;

    assert!(matches!(
        manifest.validate(),
        Err(ManifestError::InvalidInvariant {
            field: "variants.entries.procrustes_transform.baseline",
            ..
        })
    ));
}

#[test]
fn immutable_manifest_publication_is_idempotent_but_not_replaceable() {
    let directory = tempdir().expect("temporary directory should exist");
    let path = Utf8PathBuf::from_path_buf(directory.path().join("manifest.json"))
        .expect("temporary path should be UTF-8");
    let mut first = manifest();
    publish_test_artifacts(
        Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8"),
        &mut first,
    );

    let published = publish_manifest(&path, &first).expect("manifest should publish");
    let repeated = publish_manifest(&path, &first).expect("publication should be idempotent");
    let mut different = first;
    different.reproducibility.code_revision = "different-revision".to_owned();

    assert!(!published.reused_existing);
    assert!(repeated.reused_existing);
    assert_eq!(published.content_hash, repeated.content_hash);
    assert!(matches!(
        publish_manifest(&path, &different),
        Err(ManifestPublishError::ExistingManifestMismatch { .. })
    ));
}

#[test]
fn manifest_publication_rejects_a_role_incompatible_mmap_schema() {
    let directory = tempdir().expect("temporary directory should exist");
    let root = Utf8Path::from_path(directory.path()).expect("temporary directory should be UTF-8");
    let mut manifest = manifest();
    publish_test_artifacts(root, &mut manifest);
    let semantic = manifest
        .artifacts
        .iter_mut()
        .find(|artifact| artifact.role == ArtifactRole::SemanticGraph)
        .expect("semantic artifact should exist");
    let path = root.join(&semantic.relative_path);
    fs::remove_file(&path).expect("valid fixture should be removable");
    let payloads = [[0_u8]; 6];
    let sections = payloads
        .iter()
        .enumerate()
        .map(|(index, payload)| {
            section(
                u16::try_from(index + 1).expect("section identifier should fit u16"),
                &[1],
                payload,
            )
        })
        .collect::<Vec<_>>();
    let published = publish_artifact(&path, SEMANTIC_GRAPH_FORMAT, &sections)
        .expect("malformed semantic artifact should publish structurally");
    *semantic = ArtifactManifest::mmap(
        ArtifactRole::SemanticGraph,
        semantic.relative_path.clone(),
        published,
    );
    manifest.semantic_graph.graph_hash = semantic.content_hash;

    assert!(matches!(
        publish_manifest(&root.join("manifest.json"), &manifest),
        Err(ManifestPublishError::Artifact(
            ArtifactVerificationError::Schema {
                role: ArtifactRole::SemanticGraph,
                ..
            }
        ))
    ));
}

#[test]
fn manifest_publication_rejects_coordinates_that_only_copy_the_embedded_field_hash() {
    let directory = tempdir().expect("temporary directory should exist");
    let root = Utf8Path::from_path(directory.path()).expect("temporary directory should be UTF-8");
    let mut manifest = manifest();
    publish_test_artifacts(root, &mut manifest);
    let rows =
        usize::try_from(manifest.storage.row_count).expect("fixture row count should fit usize");
    let canonical = manifest.variants.entries[0].clone();
    let artifact_index = manifest
        .artifacts
        .iter()
        .position(|artifact| artifact.role == ArtifactRole::CanonicalBase)
        .expect("canonical base should exist");
    let path = root.join(&manifest.artifacts[artifact_index].relative_path);
    fs::remove_file(&path).expect("valid base fixture should be removable");
    let mut coordinates = vec![0.0_f32; rows * 2];
    coordinates[0] = canonical.quantization_step as f32;
    let published = publish_test_mmap(
        &path,
        ArtifactRole::CanonicalBase,
        BASE_ARTIFACT_FORMAT,
        rows,
        manifest.semantic_graph.neighbors,
        manifest.landmarks.actual_count,
        &canonical,
        [
            manifest.embedding.canonical_corpus_hash,
            manifest.embedding.projector_corpus_hash,
        ],
        [
            manifest.semantic_graph.backend_hash,
            manifest.semantic_graph.configuration_hash,
            manifest.semantic_graph.weight_hash,
        ],
        [
            manifest.relations.policy_hash,
            manifest.relations.edge_snapshot_hash,
        ],
        manifest.storage.identity_directory_hash,
        manifest.landmarks.persistence_reference_source_hash,
        Some(&coordinates),
    );
    manifest.artifacts[artifact_index] = ArtifactManifest::mmap(
        ArtifactRole::CanonicalBase,
        manifest.artifacts[artifact_index].relative_path.clone(),
        published,
    );

    assert!(matches!(
        publish_manifest(&root.join("manifest.json"), &manifest),
        Err(ManifestPublishError::Artifact(
            ArtifactVerificationError::Schema {
                role: ArtifactRole::CanonicalBase,
                ..
            }
        ))
    ));
}

#[test]
fn manifest_publication_rejects_protection_state_hidden_behind_a_stale_snapshot_hash() {
    let directory = tempdir().expect("temporary directory should exist");
    let root = Utf8Path::from_path(directory.path()).expect("temporary directory should be UTF-8");
    let mut manifest = manifest();
    publish_test_artifacts(root, &mut manifest);
    let mut edge_snapshot = ContentHasher::new(b"hash.graph.atlas.salt.relation-edge-snapshot.v2");
    edge_snapshot.update(&0_u64.to_le_bytes());
    edge_snapshot.update(&1_u64.to_le_bytes());
    edge_snapshot.update(&0_u32.to_le_bytes());
    edge_snapshot.update(&1_u32.to_le_bytes());
    edge_snapshot.update(&0.75_f64.to_bits().to_le_bytes());
    edge_snapshot.update(&0.5_f64.to_bits().to_le_bytes());
    edge_snapshot.update(&[0b11]);
    let stale_edge_snapshot = edge_snapshot.finish();
    manifest.relations.edge_snapshot_hash = stale_edge_snapshot;
    let artifact_index = manifest
        .artifacts
        .iter()
        .position(|artifact| artifact.role == ArtifactRole::RelationIndexes)
        .expect("relation indexes should exist");
    let path = root.join(&manifest.artifacts[artifact_index].relative_path);
    fs::remove_file(&path).expect("valid relation fixture should be removable");
    let published = publish_protection_fixture(
        &path,
        manifest.relations.policy_hash,
        stale_edge_snapshot,
        0.7,
    );
    let relative_path = manifest.artifacts[artifact_index].relative_path.clone();
    manifest.artifacts[artifact_index] =
        ArtifactManifest::mmap(ArtifactRole::RelationIndexes, relative_path, published);

    assert!(matches!(
        publish_manifest(&root.join("manifest.json"), &manifest),
        Err(ManifestPublishError::Artifact(
            ArtifactVerificationError::Schema {
                role: ArtifactRole::RelationIndexes,
                ..
            }
        ))
    ));
}

#[test]
fn manifest_publication_rejects_a_hash_consistent_legacy_layout_mismatch() {
    let directory = tempdir().expect("temporary directory should exist");
    let root = Utf8Path::from_path(directory.path()).expect("temporary directory should be UTF-8");
    let mut manifest = manifest();
    publish_test_artifacts(root, &mut manifest);
    let layout = manifest
        .artifacts
        .iter_mut()
        .find(|artifact| artifact.role == ArtifactRole::LegacyLayout)
        .expect("legacy layout should exist");
    let path = root.join(&layout.relative_path);
    let mut bytes = fs::read(&path).expect("legacy layout should be readable");
    bytes[..size_of::<f32>()].copy_from_slice(&1.0_f32.to_le_bytes());
    fs::write(&path, &bytes).expect("legacy layout should be replaceable");
    layout.content_hash = ContentHash::digest(&bytes);
    let layout_hash = layout.content_hash;
    let export_artifact = manifest
        .artifacts
        .iter()
        .find(|artifact| artifact.role == ArtifactRole::LegacyExportManifest)
        .expect("legacy export manifest should exist");
    let export_bytes = fs::read(root.join(&export_artifact.relative_path))
        .expect("legacy export manifest should be readable");
    let mut export: FixtureLegacyExport =
        serde_json::from_slice(&export_bytes).expect("legacy export manifest should decode");
    export.layout_hash = layout_hash;
    publish_opaque_fixture(
        root,
        &mut manifest,
        ArtifactRole::LegacyExportManifest,
        &serde_json::to_vec(&export).expect("legacy export manifest should serialize"),
    );

    let error = publish_manifest(&root.join("manifest.json"), &manifest)
        .expect_err("mismatched legacy coordinates must fail publication");
    assert!(
        matches!(
            error,
            ManifestPublishError::Artifact(ArtifactVerificationError::Schema {
                role: ArtifactRole::LegacyLayout,
                ..
            })
        ),
        "unexpected publication error: {error:?}"
    );
}

fn manifest() -> GenerationManifest {
    fixture_manifest()
}

pub(crate) fn fixture_manifest() -> GenerationManifest {
    let hash = |name: &str| ContentHash::digest(name.as_bytes());
    let mut execution_contract = ExecutionContractManifest {
        version: 3,
        generator_version: "0.0.0".to_owned(),
        rustc_release: "nightly-fixture".to_owned(),
        rustc_commit: "fixture-commit".to_owned(),
        rustc_host: "fixture-host".to_owned(),
        target: "fixture-target".to_owned(),
        target_features: "fixture-feature".to_owned(),
        profile: "test".to_owned(),
        optimization_level: "0".to_owned(),
        debug: "true".to_owned(),
        rustflags_hex: String::new(),
        dependency_lock_hash: hash("dependency-lock"),
        training_backend: "autodiff<candle<cpu>>".to_owned(),
        rayon_threads: 1,
        operating_system: "fixture-os".to_owned(),
        math_runtime: "fixture-math".to_owned(),
        runtime_cpu_features: "fixture-cpu".to_owned(),
        floating_point_control: "fixture-fp-control".to_owned(),
        math_library_images: "fixture-math-library".to_owned(),
        candle_version: "burn-candle-0.21.0/candle-core-0.10.2".to_owned(),
        candle_cpu_threads: 1,
        gemm_version: "gemm-0.19.0".to_owned(),
        gemm_kernel: "fixture-kernel".to_owned(),
        gemm_cache_configuration: "fixture-cache".to_owned(),
        gemm_threading_threshold: 1,
        gemm_lhs_packing_threshold_single_thread: 1,
        gemm_lhs_packing_threshold_multi_thread: 1,
        gemm_rhs_packing_threshold: 1,
        salt_simd_mode: "portable-fma".to_owned(),
        usearch_version: "2.25.3".to_owned(),
        usearch_compiled_isa: "fixture-isa".to_owned(),
        usearch_available_isa: "fixture-isa".to_owned(),
        usearch_cosine_f32_isa: "fixture-isa".to_owned(),
        usearch_l2sq_f32_isa: "fixture-isa".to_owned(),
        contract_hash: ContentHash::from_bytes([0; 32]),
    };
    execution_contract.contract_hash = execution_contract.content_hash();
    let representation_rows = 52;
    let semantic_backend = hash("semantic-backend");
    let audit_sample = hash("exact-audit-sample");
    let canonical_values = vec![0.0; representation_rows * CANONICAL_DIMENSIONS];
    let projector_values = vec![0.0; representation_rows * PROJECTOR_DIMENSIONS];
    let canonical_corpus = canonical_corpus_hash(&canonical_values);
    let projector_corpus = projector_corpus_hash(&projector_values);
    let representation_audit = RepresentationAuditReport {
        suite_version: "representation-audit-v1".to_owned(),
        canonical_corpus_hash: canonical_corpus,
        projector_corpus_hash: projector_corpus,
        identity_directory_hash: hash("identity-directory"),
        stratification_input_hash: hash("representation-stratification"),
        prefix_corpus_hashes: AUDITED_PREFIX_DIMENSIONS
            .map(|dimensions| prefix_corpus_hash(&canonical_values, dimensions)),
        query_sample_hash: hash("representation-query-sample"),
        sample_rows: 20,
        overall_recall: [[0.9; 3]; 4],
        stratified_report_hash: hash("representation-strata"),
        diagnostic_report_hash: hash("representation-diagnostics"),
        clump_report_hash: hash("representation-clumps"),
    };
    let relation_policy_hash = crate::salt::relation::relation_policy_hash(&HashMap::new(), &[]);
    let mut empty_tree = ContentHasher::new(b"hash.graph.atlas.salt.merge-tree.v2");
    empty_tree.update(&0.0_f64.to_bits().to_le_bytes());
    let empty_tree_hash = empty_tree.finish();
    let canonical_condition = 0.5;
    let condition_domain_hash = hash("condition-domain");
    let selection_evidence_hash = hash("selection-evidence");
    let quantization_step = 1.0e-3;
    let canonical_field_hash = quantized_field_content_hash(
        canonical_condition,
        condition_domain_hash,
        selection_evidence_hash,
        true,
        quantization_step,
        core::iter::repeat_n([0.0; 2], representation_rows),
    );
    let persistence_comparison = PersistenceComparisonReport {
        suite_version: "persistence-quality-v1".to_owned(),
        evaluator_contract_hash: hash("persistence-evaluator"),
        checkpoint_hash: hash("projector"),
        candidate_field_hash: canonical_field_hash,
        candidate_tree_hash: empty_tree_hash,
        reference_tree_hash: empty_tree_hash,
        reference_source_hash: hash("landmarks"),
        fixed_thresholds: vec![0.01, 0.05, 0.10],
        candidate_leaf_counts: vec![0, 0, 0],
        reference_leaf_counts: vec![0, 0, 0],
        candidate_normalized_total: 0.0,
        reference_normalized_total: 0.0,
        minimum_ratio: 0.5,
        maximum_ratio: 2.0,
        candidate_low_persistence_mass: 0.0,
        reference_low_persistence_mass: 0.0,
        maximum_low_persistence_ratio: 1.5,
        candidate_noise_persistence: 0.0,
        reference_noise_persistence: 0.0,
        maximum_noise_ratio: 1.5,
        planted_shape_cases: 6,
        planted_shape_failures: 0,
        distribution_report_hash: hash("persistence-distributions"),
        planted_shape_report_hash: hash("persistence-planted-shapes"),
        noise_report_hash: hash("persistence-noise"),
    };
    let projected_field = canonical_field_hash;
    let semantic_fidelity_report = hash("semantic-fidelity-report");
    let subgroup_report = hash("subgroup-report");
    let quality = crate::salt::generation::ConditionQuality::new(
        projected_field,
        semantic_fidelity_report,
        subgroup_report,
        0.98,
        1.5,
    );
    let audit = crate::salt::graph::audit::RecallAudit {
        backend: semantic_backend,
        sample: audit_sample,
        sample_rows: 20,
        neighbors_per_row: 50,
        matched: 970,
        expected: 1_000,
        recall: 0.97,
    };
    GenerationManifest {
        format_version: GENERATION_MANIFEST_FORMAT_VERSION,
        generation_id: GenerationId::new(hash("generation")),
        created_at: JiffTimestamp::UNIX_EPOCH,
        assurance_mode: GenerationAssuranceMode::IndependentAuthorities,
        input_snapshot: InputSnapshotManifest {
            ontology_transaction_time: Timestamp::<TransactionTime>::UNIX_EPOCH,
            knowledge_transaction_time: Timestamp::<TransactionTime>::UNIX_EPOCH,
            knowledge_decision_time_policy: KnowledgeDecisionTimePolicy::Pinned {
                timestamp: Timestamp::<DecisionTime>::UNIX_EPOCH,
            },
            ontology_hash: hash("ontology"),
            knowledge_hash: hash("knowledge"),
            store_snapshot_identity: hash("store-snapshot"),
            authorization_revision: AuthorizationRevision::new(hash("authorization-revision")),
            extraction_receipt_hash: hash("store-extraction-receipt"),
            frozen_input_hash: hash("frozen-input"),
        },
        embedding: EmbeddingManifest {
            model: "provider/model".to_owned(),
            producer_contract_hash: hash("producer"),
            canonical_corpus_hash: canonical_corpus,
            projector_corpus_hash: projector_corpus,
            representation_audit,
            canonical_dimensions: CANONICAL_DIMENSIONS,
            projector_dimensions: PROJECTOR_DIMENSIONS,
            transform_version: TRANSFORM_VERSION.to_owned(),
            transform_hash: transform_contract_hash(),
            golden_vectors_hash: transform_golden_vectors_hash(),
        },
        semantic_graph: SemanticGraphManifest {
            neighbors: 30,
            metric: SemanticMetric::Cosine,
            backend: "exact-test".to_owned(),
            backend_hash: semantic_backend,
            configuration_hash: hash("semantic-configuration"),
            weight_hash: hash("semantic-weights"),
            graph_hash: hash("semantic-graph"),
            exact_audit_hash: audit.content_hash(),
            exact_audit_sample_hash: audit_sample,
            exact_audit_sample_rows: 20,
            exact_audit_neighbors: 50,
            exact_audit_matched: 970,
            exact_audit_expected: 1_000,
            recall_at_50: 0.97,
        },
        landmarks: LandmarkManifest {
            maximum_count: 4,
            actual_count: 2,
            selection_version: "weighted-priority-v1".to_owned(),
            seed: 41,
            retained_fraction: 2.0 / 52.0,
            artifact_hash: hash("landmarks"),
            persistence_reference_source_hash: hash("landmarks"),
        },
        projector: ProjectorManifest {
            architecture_version: PROJECTOR_ARCHITECTURE_VERSION,
            width: 8,
            residual_blocks: 1,
            type_conditioning: false,
            type_context_dimensions: 0,
            role_count: 3,
            role_dimensions: 2,
            relation_conditioning: true,
            checkpoint_hash: hash("projector"),
            loss_config_hash: hash("loss"),
            training_config_hash: hash("training"),
            relation_gradient_beta_positive: 0.1,
            relation_gradient_beta_negative: 0.0,
            relation_gradient_beta_total: 0.1,
        },
        relations: RelationManifest {
            security_mode: RelationSecurityMode::AtlasSafeLinks,
            security_allow_list_hash: hash("allow-list"),
            security_geometry_hash: hash("security-geometry"),
            edge_snapshot_hash: hash("edges"),
            relation_card_format_version: CARD_FORMAT_VERSION,
            relation_card_corpus_hash: hash("cards"),
            annotation_corpus_hash: hash("annotations"),
            annotation_prompt_family_version: "relation-policy-v1".to_owned(),
            annotation_vote_schedule: "3x-independent".to_owned(),
            reviewed_holdout_hash: hash("holdout"),
            policy_precedence_version: "v1".to_owned(),
            policy_input_hash: hash("policy-input"),
            policy_hash: relation_policy_hash,
            policy_evaluation_report_hash: hash("policy-evaluation-report"),
            authorization_noninterference_report_hash: hash("authorization-noninterference-report"),
            security_approval_report_hash: hash("security-approval-report"),
            classifier_version: "diagonal-shrinkage-v1".to_owned(),
            classifier_model_hash: hash("classifier"),
            classifier_temperature: 1.0,
            class_prior: Some([0.2, 0.3, 0.5]),
            applicability_method_version: "mahalanobis-v1".to_owned(),
            applicability_config_hash: hash("applicability"),
            classifier_ood_edge_volume_fraction: 0.1,
            reviewed_edge_volume_fraction: 0.8,
            strength_head: StrengthHeadManifest {
                enabled: false,
                band_vote_corpus_hash: hash("band-votes"),
                eligibility_threshold_proximal: 0.2,
                model_form: StrengthModelForm::Ordinal,
                model_hash: hash("strength-model"),
                calibration_hash: hash("strength-calibration"),
                zeta: [0.5, 1.0, 2.0],
                materialized_table_hash: None,
            },
            attraction_geometry_coefficients: AttractionGeometryManifest {
                coincident: 0.0,
                proximal: 1.0,
                overlay: 0.0,
            },
            attraction_force_pruning_threshold: 0.0,
            negative_admission: NegativeAdmissionManifest {
                policy_distribution_stage:
                    ProtectionDistributionStage::ProtectionSpecificPreAttractionGate,
                protection_coefficients: ProtectionCoefficientManifest {
                    coincident: 1.0,
                    proximal: 1.0,
                    overlay: 0.0,
                },
                protection_applicability: ProtectionApplicabilityManifest {
                    mode: ProtectionApplicabilityMode::Floor,
                    hard_negative_floor: 0.0,
                    ordinary_negative_floor: 0.0,
                    ordering_validated: true,
                    attraction_applicability_unchanged: true,
                    selection_experiment_hash: hash("protection-experiment"),
                },
                pair_aggregation: PairAggregation::Max,
                hard_negative_protection_threshold: 0.2,
                ordinary_negative_protection_threshold: 0.4,
                protect_ordinary_negatives: true,
            },
            coincident_gate: CoincidentGateManifest {
                enabled: false,
                class_probability_threshold: 0.8,
                applicability_threshold: 0.8,
                precision_lcb_threshold: 0.9,
            },
            typed_deconflict: TypedDeconflictManifest {
                enabled: false,
                classifier_class_schema: ClassifierClassSchema::Cpo,
                geometry_coefficient: 0.0,
                admission_threshold: 0.0,
                signed_margin_threshold: 0.0,
                normalized_minimum_radius: 0.0,
                pair_aggregation: PairAggregation::Max,
                conflict_policy: ConflictPolicy::QuarantineNoForceProtect,
                exclude_from_generic_negatives: true,
            },
            derived_strength_persisted_as_authority: false,
        },
        variants: VariantManifest {
            canonical_variant: VariantId::CANONICAL,
            published_variant_count: 1,
            maximum_published_variants: 8,
            entries: vec![VariantEntryManifest {
                id: VariantId::CANONICAL,
                global_relation_condition: canonical_condition,
                condition_domain_hash,
                selection_evidence_hash,
                quality_suite_version: "fixture-quality-v1".to_owned(),
                projected_field_hash: projected_field,
                quality_report_hash: quality.content_hash(),
                semantic_fidelity_report_hash: semantic_fidelity_report,
                semantic_fidelity: 0.98,
                minimum_semantic_fidelity: 0.95,
                subgroup_report_hash: subgroup_report,
                maximum_subgroup_degradation: 1.5,
                maximum_allowed_subgroup_degradation: 2.0,
                relation_baseline_field_hash: hash("relation-baseline-field"),
                baseline_relation_loss: 1.0,
                canonical_relation_loss: 0.5,
                relation_loss_tolerance: 0.0,
                canonical_field_hash,
                procrustes_transform: [1.0, 1.0, 0.0, 0.0, 0.0],
                quantization_step,
                clamp_count: 0,
                clamp_rate: 0.0,
                bucket_index_hash: hash("buckets"),
                morton_index_hash: hash("morton"),
                analytic_configuration_hash: hash("analytic-configuration"),
                merge_tree_hash: empty_tree_hash,
                normalized_persistence: 0.0,
                persistence_comparison,
            }],
        },
        storage: StorageManifest {
            row_count: u64::try_from(representation_rows).expect("fixture rows should fit u64"),
            row_id_encoding: RowIdEncoding::U32,
            identity_directory_hash: hash("identity-directory"),
            base_revision: BaseRevision::ZERO,
            initial_delta_revision: DeltaRevision::ZERO,
        },
        artifacts: vec![
            artifact(
                ArtifactRole::Representations,
                "representations.salt",
                hash("representations"),
                Some(REPRESENTATION_FORMAT),
            ),
            artifact(
                ArtifactRole::RelationClassifier,
                "classifier.salt",
                hash("classifier"),
                Some(CLASSIFIER_FORMAT),
            ),
            artifact(
                ArtifactRole::SemanticGraph,
                "semantic.salt",
                hash("semantic-graph"),
                Some(SEMANTIC_GRAPH_FORMAT),
            ),
            artifact(
                ArtifactRole::RelationIndexes,
                "relations.salt",
                hash("relation-indexes"),
                Some(RELATION_FORMAT),
            ),
            artifact(
                ArtifactRole::LandmarkSkeleton,
                "landmarks.salt",
                hash("landmarks"),
                Some(LANDMARK_FORMAT),
            ),
            artifact(
                ArtifactRole::LandmarkReferencePersistence,
                "landmark-reference.salt",
                hash("landmark-reference"),
                Some(PERSISTENCE_REFERENCE_FORMAT),
            ),
            artifact(
                ArtifactRole::ProjectorCheckpoint,
                "projector.mpk",
                hash("projector"),
                None,
            ),
            artifact(
                ArtifactRole::CanonicalBase,
                "base.salt",
                hash("base"),
                Some(BASE_ARTIFACT_FORMAT),
            ),
            artifact(
                ArtifactRole::CanonicalAnalytics,
                "analytics.salt",
                hash("analytics"),
                Some(ANALYTIC_FORMAT),
            ),
            artifact(
                ArtifactRole::RepresentationReport,
                "representation-report.json",
                hash("representation-report-artifact"),
                None,
            ),
            artifact(
                ArtifactRole::SemanticFidelityReport,
                "semantic-fidelity-report.json",
                hash("semantic-fidelity-report-artifact"),
                None,
            ),
            artifact(
                ArtifactRole::RelationPolicyReport,
                "relation-policy-report.json",
                hash("relation-policy-report-artifact"),
                None,
            ),
            artifact(
                ArtifactRole::MergeTreePersistenceReport,
                "merge-tree-persistence-report.json",
                hash("merge-tree-persistence-report-artifact"),
                None,
            ),
            artifact(
                ArtifactRole::SubgroupBehaviorReport,
                "subgroup-behavior-report.json",
                hash("subgroup-behavior-report-artifact"),
                None,
            ),
            artifact(
                ArtifactRole::AuthorizationNoninterferenceReport,
                "authorization-noninterference-report.json",
                hash("authorization-noninterference-report-artifact"),
                None,
            ),
            artifact(
                ArtifactRole::SecurityApprovalReport,
                "security-approval-report.json",
                hash("security-approval-report-artifact"),
                None,
            ),
            artifact(
                ArtifactRole::CompanionPinReport,
                "companion-pin-report.json",
                hash("companion-pin-report-artifact"),
                None,
            ),
            artifact(
                ArtifactRole::LegacyLayout,
                "layout-a000.f32",
                hash("legacy-layout"),
                None,
            ),
            artifact(
                ArtifactRole::LegacyIdentities,
                "salt-identities-a000.json",
                hash("legacy-identities"),
                None,
            ),
            artifact(
                ArtifactRole::LegacyExportManifest,
                "salt-export-a000.json",
                hash("legacy-manifest"),
                None,
            ),
        ],
        serving: ServingManifest {
            authorization_adapter_version: "hash-auth-v1".to_owned(),
            gate_evidence_authority: "test-release-authority".to_owned(),
            gate_evidence_public_key: crate::salt::release::test_support::signer()
                .verifier()
                .public_key(),
            wire_versions: vec![2, 1],
            style_version: "atlas-style-v1".to_owned(),
            canvas_companion_version: "1.4.0".to_owned(),
            canvas_companion_sha256: hash("canvas"),
            companion_compatibility_report_hash: hash("companion-compatibility-report"),
            shader_contract_version: "shader-v1".to_owned(),
        },
        reproducibility: ReproducibilityManifest {
            code_revision: "0123456789abcdef".to_owned(),
            binary_fingerprint: hash("generation-binary"),
            execution_contract,
            config_hash: hash("config"),
            seeds: vec![
                SeedManifest {
                    name: "projector".to_owned(),
                    value: 2,
                },
                SeedManifest {
                    name: "landmarks".to_owned(),
                    value: 1,
                },
            ],
        },
    }
}

fn artifact(
    role: ArtifactRole,
    relative_path: &str,
    content_hash: ContentHash,
    format: Option<ArtifactFormat>,
) -> ArtifactManifest {
    ArtifactManifest {
        role,
        relative_path: relative_path.to_owned(),
        content_hash,
        byte_length: 1,
        format: format.map(Into::into),
    }
}

#[derive(Debug, Copy, Clone)]
struct FixtureProvenance {
    bucket_index: ContentHash,
    morton_index: ContentHash,
    identity_directory: ContentHash,
    edge_snapshot: ContentHash,
    merge_tree: ContentHash,
}

fn fixture_provenance(rows: usize) -> FixtureProvenance {
    let mut bucket_index = ContentHasher::new(b"hash.graph.atlas.salt.bucket-index.v1");
    let mut morton_index = ContentHasher::new(b"hash.graph.atlas.salt.morton-index.v1");
    let mut identity_directory = ContentHasher::new(b"hash.graph.atlas.salt.identity-directory.v1");
    for row in 0..rows {
        let row = u32::try_from(row).expect("fixture row should fit u32");
        bucket_index.update(&row.to_le_bytes());
        bucket_index.update(&0_u32.to_le_bytes());
        bucket_index.update(&row.to_le_bytes());
        morton_index.update(&row.to_le_bytes());
        morton_index.update(&row.to_le_bytes());
        identity_directory.update(&row.to_le_bytes());
        identity_directory.update(&[0; 16]);
        identity_directory.update(&[0; 16]);
        identity_directory.update(&[0]);
        identity_directory.update(&[0; 16]);
    }
    let mut merge_tree = ContentHasher::new(b"hash.graph.atlas.salt.merge-tree.v2");
    merge_tree.update(&0.0_f64.to_bits().to_le_bytes());
    let mut edge_snapshot = ContentHasher::new(b"hash.graph.atlas.salt.relation-edge-snapshot.v2");
    edge_snapshot.update(&0_u64.to_le_bytes());
    edge_snapshot.update(&0_u64.to_le_bytes());
    FixtureProvenance {
        bucket_index: bucket_index.finish(),
        morton_index: morton_index.finish(),
        identity_directory: identity_directory.finish(),
        edge_snapshot: edge_snapshot.finish(),
        merge_tree: merge_tree.finish(),
    }
}

fn publish_test_artifacts(directory: &Utf8Path, manifest: &mut GenerationManifest) {
    let rows =
        usize::try_from(manifest.storage.row_count).expect("fixture row count should fit usize");
    let neighbors = manifest.semantic_graph.neighbors;
    let landmarks = manifest.landmarks.actual_count;
    let provenance = fixture_provenance(rows);
    manifest.storage.identity_directory_hash = provenance.identity_directory;
    manifest
        .embedding
        .representation_audit
        .identity_directory_hash = provenance.identity_directory;
    manifest.relations.edge_snapshot_hash = provenance.edge_snapshot;
    manifest.variants.entries[0].bucket_index_hash = provenance.bucket_index;
    manifest.variants.entries[0].morton_index_hash = provenance.morton_index;
    manifest.variants.entries[0].merge_tree_hash = provenance.merge_tree;
    let mut semantic_weights = ContentHasher::new(b"hash.graph.atlas.salt.semantic-weights.v1");
    for _ in 0..rows.saturating_mul(neighbors) {
        semantic_weights.update(&1.0_f32.to_bits().to_le_bytes());
    }
    manifest.semantic_graph.weight_hash = semantic_weights.finish();
    let canonical = manifest.variants.entries[0].clone();
    let semantic_provenance = [
        manifest.semantic_graph.backend_hash,
        manifest.semantic_graph.configuration_hash,
        manifest.semantic_graph.weight_hash,
    ];
    let representation_provenance = [
        manifest.embedding.canonical_corpus_hash,
        manifest.embedding.projector_corpus_hash,
    ];
    let relation_provenance = [
        manifest.relations.policy_hash,
        manifest.relations.edge_snapshot_hash,
    ];
    let projector_config = ProjectorConfig {
        width: manifest.projector.width,
        residual_blocks: manifest.projector.residual_blocks,
        type_context_dimensions: manifest.projector.type_context_dimensions,
        role_count: manifest.projector.role_count,
        role_dimensions: manifest.projector.role_dimensions,
    };
    let mut reference_source = manifest.landmarks.artifact_hash;
    for artifact in &mut manifest.artifacts {
        let role = artifact.role;
        let path = directory.join(&artifact.relative_path);
        if let Some(format) = artifact.format {
            let published = publish_test_mmap(
                &path,
                artifact.role,
                format.artifact_format(),
                rows,
                neighbors,
                landmarks,
                &canonical,
                representation_provenance,
                semantic_provenance,
                relation_provenance,
                provenance.identity_directory,
                reference_source,
                None,
            );
            if role == ArtifactRole::LandmarkSkeleton {
                reference_source = published.content_hash;
            }
            *artifact =
                ArtifactManifest::mmap(artifact.role, artifact.relative_path.clone(), published);
        } else if artifact.role == ArtifactRole::ProjectorCheckpoint {
            let model = ConditionedProjector::<Candle>::new(projector_config, &CandleDevice::Cpu)
                .expect("test projector architecture should validate");
            let published = publish_projector_checkpoint(&path, &model)
                .expect("test checkpoint should publish");
            *artifact = ArtifactManifest::opaque(
                artifact.role,
                artifact.relative_path.clone(),
                published.content_hash,
                published.byte_length,
            );
        } else {
            debug_assert!(matches!(
                artifact.role,
                ArtifactRole::RepresentationReport
                    | ArtifactRole::SemanticFidelityReport
                    | ArtifactRole::RelationPolicyReport
                    | ArtifactRole::MergeTreePersistenceReport
                    | ArtifactRole::SubgroupBehaviorReport
                    | ArtifactRole::AuthorizationNoninterferenceReport
                    | ArtifactRole::SecurityApprovalReport
                    | ArtifactRole::CompanionPinReport
                    | ArtifactRole::LegacyLayout
                    | ArtifactRole::LegacyIdentities
                    | ArtifactRole::LegacyExportManifest
            ));
        }
    }
    publish_report_fixtures(directory, manifest);
    publish_legacy_fixture(directory, manifest);
    manifest.relations.classifier_model_hash =
        artifact_hash(manifest, ArtifactRole::RelationClassifier);
    manifest.semantic_graph.graph_hash = artifact_hash(manifest, ArtifactRole::SemanticGraph);
    manifest.landmarks.artifact_hash = artifact_hash(manifest, ArtifactRole::LandmarkSkeleton);
    manifest.landmarks.persistence_reference_source_hash = manifest.landmarks.artifact_hash;
    manifest.projector.checkpoint_hash = artifact_hash(manifest, ArtifactRole::ProjectorCheckpoint);
    manifest.variants.entries[0]
        .persistence_comparison
        .reference_source_hash = manifest.landmarks.artifact_hash;
    manifest.variants.entries[0]
        .persistence_comparison
        .checkpoint_hash = manifest.projector.checkpoint_hash;
}

fn publish_report_fixtures(directory: &Utf8Path, manifest: &mut GenerationManifest) {
    for role in [
        ArtifactRole::RepresentationReport,
        ArtifactRole::SemanticFidelityReport,
        ArtifactRole::RelationPolicyReport,
        ArtifactRole::MergeTreePersistenceReport,
        ArtifactRole::SubgroupBehaviorReport,
        ArtifactRole::AuthorizationNoninterferenceReport,
        ArtifactRole::SecurityApprovalReport,
        ArtifactRole::CompanionPinReport,
    ] {
        let suite_version = match role {
            ArtifactRole::RepresentationReport => {
                &manifest.embedding.representation_audit.suite_version
            }
            ArtifactRole::SemanticFidelityReport | ArtifactRole::SubgroupBehaviorReport => {
                &manifest.variants.entries[0].quality_suite_version
            }
            ArtifactRole::RelationPolicyReport => &manifest.relations.policy_precedence_version,
            ArtifactRole::MergeTreePersistenceReport => {
                &manifest.variants.entries[0]
                    .persistence_comparison
                    .suite_version
            }
            ArtifactRole::AuthorizationNoninterferenceReport
            | ArtifactRole::SecurityApprovalReport => {
                &manifest.serving.authorization_adapter_version
            }
            ArtifactRole::CompanionPinReport => &manifest.serving.canvas_companion_version,
            _ => unreachable!("fixture report list contains only report roles"),
        };
        let bytes = serde_json::to_vec(&serde_json::json!({
            "schemaVersion": 1,
            "suiteVersion": suite_version,
            "outcome": "pass",
            "subjects": {"fixture": "fixture-subject"},
            "measurements": {}
        }))
        .expect("fixture report should serialize");
        publish_opaque_fixture(directory, manifest, role, &bytes);
    }
}

#[derive(serde::Serialize)]
struct FixtureIdentityDocument {
    version: u32,
    rows: Vec<FixtureIdentityRow>,
}

#[derive(serde::Serialize)]
struct FixtureIdentityRow {
    row: u32,
    web_id: uuid::Uuid,
    entity_uuid: uuid::Uuid,
    draft_id: Option<uuid::Uuid>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct FixtureLegacyExport {
    version: u32,
    tag: u16,
    condition: f64,
    quantization_step: f64,
    coordinate_field_hash: ContentHash,
    row_count: usize,
    layout_file: String,
    layout_hash: ContentHash,
    identities_file: String,
    identities_hash: ContentHash,
}

fn publish_legacy_fixture(directory: &Utf8Path, manifest: &mut GenerationManifest) {
    let row_count =
        usize::try_from(manifest.storage.row_count).expect("fixture row count should fit usize");
    publish_opaque_fixture(
        directory,
        manifest,
        ArtifactRole::LegacyLayout,
        &vec![0; row_count * 2 * size_of::<f32>()],
    );
    let identities = FixtureIdentityDocument {
        version: 1,
        rows: (0..row_count)
            .map(|row| FixtureIdentityRow {
                row: u32::try_from(row).expect("fixture row should fit u32"),
                web_id: uuid::Uuid::nil(),
                entity_uuid: uuid::Uuid::nil(),
                draft_id: None,
            })
            .collect(),
    };
    publish_opaque_fixture(
        directory,
        manifest,
        ArtifactRole::LegacyIdentities,
        &serde_json::to_vec(&identities).expect("fixture identities should serialize"),
    );
    let layout = manifest
        .artifacts
        .iter()
        .find(|artifact| artifact.role == ArtifactRole::LegacyLayout)
        .expect("fixture layout should exist")
        .clone();
    let identities = manifest
        .artifacts
        .iter()
        .find(|artifact| artifact.role == ArtifactRole::LegacyIdentities)
        .expect("fixture identities should exist")
        .clone();
    let canonical = &manifest.variants.entries[0];
    let export = FixtureLegacyExport {
        version: 2,
        tag: 0,
        condition: canonical.global_relation_condition,
        quantization_step: canonical.quantization_step,
        coordinate_field_hash: canonical.canonical_field_hash,
        row_count,
        layout_file: layout.relative_path,
        layout_hash: layout.content_hash,
        identities_file: identities.relative_path,
        identities_hash: identities.content_hash,
    };
    publish_opaque_fixture(
        directory,
        manifest,
        ArtifactRole::LegacyExportManifest,
        &serde_json::to_vec(&export).expect("fixture export should serialize"),
    );
}

fn publish_opaque_fixture(
    directory: &Utf8Path,
    manifest: &mut GenerationManifest,
    role: ArtifactRole,
    bytes: &[u8],
) {
    let artifact = manifest
        .artifacts
        .iter_mut()
        .find(|artifact| artifact.role == role)
        .expect("fixture opaque artifact should exist");
    let relative_path = artifact.relative_path.clone();
    fs::write(directory.join(&relative_path), bytes).expect("opaque fixture should publish");
    *artifact = ArtifactManifest::opaque(
        role,
        relative_path,
        ContentHash::digest(bytes),
        u64::try_from(bytes.len()).expect("fixture length should fit u64"),
    );
}

pub(crate) fn publish_fixture_artifacts(directory: &Utf8Path, manifest: &mut GenerationManifest) {
    publish_test_artifacts(directory, manifest);
}

fn publish_test_mmap(
    path: &Utf8Path,
    role: ArtifactRole,
    format: ArtifactFormat,
    rows: usize,
    neighbors: usize,
    landmarks: usize,
    canonical: &VariantEntryManifest,
    representation_provenance: [ContentHash; 2],
    semantic_provenance: [ContentHash; 3],
    relation_provenance: [ContentHash; 2],
    identity_directory_hash: ContentHash,
    reference_source_hash: ContentHash,
    canonical_coordinates: Option<&[f32]>,
) -> PublishedArtifact {
    match role {
        ArtifactRole::Representations => {
            let canonical = vec![0.0_f32; rows * CANONICAL_DIMENSIONS];
            let projector = vec![0.0_f32; rows * PROJECTOR_DIMENSIONS];
            let roles = vec![0_u32; rows];
            let normalization_floor = [NORMALIZATION_EPSILON];
            publish(
                path,
                format,
                vec![
                    section(1, &[rows, CANONICAL_DIMENSIONS], &canonical),
                    section(2, &[rows, PROJECTOR_DIMENSIONS], &projector),
                    section(3, &[rows], &roles),
                    section(4, &[32], representation_provenance[0].as_bytes()),
                    section(5, &[32], representation_provenance[1].as_bytes()),
                    section(6, &[32], identity_directory_hash.as_bytes()),
                    section(7, &[1], &normalization_floor),
                ],
            )
        }
        ArtifactRole::RelationClassifier | ArtifactRole::StrengthHead => {
            let class_order = [0_u8, 1, 2];
            let coefficients = vec![0.0_f64; 3 * CANONICAL_DIMENSIONS];
            let intercepts = [0.0_f64; 3];
            let temperature = [1.0_f64];
            let mean = vec![0.0_f64; CANONICAL_DIMENSIONS];
            let scales = vec![1.0_f64; CANONICAL_DIMENSIONS];
            let distances = [0.0_f64];
            publish(
                path,
                format,
                vec![
                    section(1, &[3], &class_order),
                    section(2, &[3, CANONICAL_DIMENSIONS], &coefficients),
                    section(3, &[3], &intercepts),
                    section(4, &[1], &temperature),
                    section(5, &[CANONICAL_DIMENSIONS], &mean),
                    section(6, &[CANONICAL_DIMENSIONS], &scales),
                    section(7, &[1], &distances),
                ],
            )
        }
        ArtifactRole::SemanticGraph => {
            let mut indices = Vec::with_capacity(rows * neighbors);
            let mut distances = Vec::with_capacity(rows * neighbors);
            for row in 0..rows {
                for neighbor in (0..rows)
                    .filter(|neighbor| *neighbor != row)
                    .take(neighbors)
                {
                    indices.push(u32::try_from(neighbor).expect("fixture row should fit u32"));
                    distances.push(
                        f32::from(u16::try_from(neighbor).expect("fixture row should fit u16"))
                            / f32::from(
                                u16::try_from(rows).expect("fixture row count should fit u16"),
                            ),
                    );
                }
            }
            let weights = vec![1.0_f32; rows * neighbors];
            publish(
                path,
                format,
                vec![
                    section(1, &[rows, neighbors], &indices),
                    section(2, &[rows, neighbors], &distances),
                    section(3, &[rows, neighbors], &weights),
                    section(4, &[32], semantic_provenance[0].as_bytes()),
                    section(5, &[32], semantic_provenance[1].as_bytes()),
                    section(6, &[32], semantic_provenance[2].as_bytes()),
                ],
            )
        }
        ArtifactRole::RelationIndexes => {
            let counts = [0_u64, 0];
            let empty_u8: [u8; 0] = [];
            let empty_u32: [u32; 0] = [];
            let empty_f64: [f64; 0] = [];
            let empty_policy_offsets = [0_u64];
            publish(
                path,
                format,
                vec![
                    section(1, &[32], relation_provenance[0].as_bytes()),
                    section(2, &[2], &counts),
                    section(3, &[0, 16], &empty_u8),
                    section(4, &[0, 16], &empty_u8),
                    section(5, &[0], &empty_u8),
                    section(6, &[0, 16], &empty_u8),
                    section(7, &[0], &empty_u32),
                    section(8, &[0], &empty_u32),
                    section(9, &[0], &empty_u32),
                    section(10, &[0], &empty_f64),
                    section(11, &[0], &empty_u8),
                    section(12, &[0], &empty_f64),
                    section(13, &[0], &empty_f64),
                    section(14, &[0], &empty_f64),
                    section(15, &[0], &empty_f64),
                    section(16, &[0], &empty_u32),
                    section(17, &[0], &empty_u32),
                    section(18, &[0], &empty_f64),
                    section(19, &[0], &empty_f64),
                    section(20, &[0], &empty_u8),
                    section(21, &[32], relation_provenance[1].as_bytes()),
                    section(22, &[1], &empty_policy_offsets),
                    section(23, &[0], &empty_u8),
                    section(24, &[0], &empty_u32),
                    section(25, &[0], &empty_u8),
                    section(26, &[0, 3], &empty_f64),
                    section(27, &[0], &empty_f64),
                    section(28, &[0, 3], &empty_f64),
                    section(29, &[0], &empty_f64),
                    section(30, &[0], &empty_u8),
                ],
            )
        }
        ArtifactRole::LandmarkSkeleton => {
            let selected = [0_u32, 1];
            assert_eq!(landmarks, selected.len());
            let assignments = (0..rows).map(|row| u32::from(row == 1)).collect::<Vec<_>>();
            let coordinates = [0.0_f64, 0.0, 1.0, 0.0];
            publish(
                path,
                format,
                vec![
                    section(1, &[landmarks], &selected),
                    section(2, &[rows], &assignments),
                    section(3, &[landmarks, 2], &coordinates),
                ],
            )
        }
        ArtifactRole::LandmarkReferencePersistence => {
            let density_maximum = [0.0_f64];
            let empty_f64: [f64; 0] = [];
            let empty_u64: [u64; 0] = [];
            publish(
                path,
                format,
                vec![
                    section(1, &[32], canonical.analytic_configuration_hash.as_bytes()),
                    section(2, &[32], reference_source_hash.as_bytes()),
                    section(3, &[1], &density_maximum),
                    section(4, &[0], &empty_f64),
                    section(5, &[0], &empty_f64),
                    section(
                        6,
                        &[32],
                        canonical
                            .persistence_comparison
                            .reference_tree_hash
                            .as_bytes(),
                    ),
                    section(7, &[0], &empty_u64),
                    section(8, &[0], &empty_u64),
                ],
            )
        }
        ArtifactRole::CanonicalBase => {
            let row_ids = (0..rows)
                .map(|row| u32::try_from(row).expect("fixture row should fit u32"))
                .collect::<Vec<_>>();
            let coordinates =
                canonical_coordinates.map_or_else(|| vec![0.0_f32; rows * 2], <[f32]>::to_vec);
            let buckets = vec![0_u32; rows];
            let priorities = row_ids.clone();
            let morton = (0..rows)
                .map(|row| u32::try_from(row).expect("fixture row should fit u32"))
                .collect::<Vec<_>>();
            let offsets = [
                0_u64,
                u64::try_from(rows).expect("fixture row count should fit u64"),
            ];
            let identities = vec![0_u8; rows * 16];
            let drafts = vec![0_u8; rows];
            let condition = [canonical.global_relation_condition];
            let quantization_step = [canonical.quantization_step];
            publish(
                path,
                format,
                vec![
                    section(1, &[rows], &row_ids),
                    section(2, &[rows, 2], &coordinates),
                    section(3, &[rows], &buckets),
                    section(4, &[rows], &priorities),
                    section(5, &[rows], &morton),
                    section(6, &[2], &offsets),
                    section(7, &[rows, 16], &identities),
                    section(8, &[rows, 16], &identities),
                    section(9, &[rows], &drafts),
                    section(10, &[rows, 16], &identities),
                    section(11, &[32], canonical.canonical_field_hash.as_bytes()),
                    section(12, &[1], &condition),
                    section(13, &[32], canonical.condition_domain_hash.as_bytes()),
                    section(14, &[32], canonical.selection_evidence_hash.as_bytes()),
                    section(15, &[5], &canonical.procrustes_transform),
                    section(16, &[32], identity_directory_hash.as_bytes()),
                    section(17, &[1], &quantization_step),
                ],
            )
        }
        ArtifactRole::CanonicalAnalytics => {
            let bounds = [0.0_f64; 4];
            let density = [0.0_f64; 4];
            let empty_f64: [f64; 0] = [];
            let empty_u32: [u32; 0] = [];
            let empty_u64: [u64; 0] = [];
            let empty_u8: [u8; 0] = [];
            let pixel_regions = [u32::MAX; 4];
            let point_regions = vec![u32::MAX; rows];
            let label_offsets = [0_u64];
            publish(
                path,
                format,
                vec![
                    section(1, &[32], canonical.analytic_configuration_hash.as_bytes()),
                    section(2, &[2, 2], &bounds),
                    section(3, &[2, 2], &density),
                    section(4, &[0], &empty_f64),
                    section(5, &[0], &empty_f64),
                    section(6, &[2, 2], &pixel_regions),
                    section(7, &[rows], &point_regions),
                    section(8, &[0], &empty_u64),
                    section(9, &[0], &empty_f64),
                    section(10, &[0], &empty_u32),
                    section(11, &[0], &empty_u32),
                    section(12, &[1], &label_offsets),
                    section(13, &[0], &empty_u8),
                    section(14, &[0], &empty_u64),
                    section(15, &[0], &empty_u64),
                    section(16, &[0], &empty_u32),
                    section(17, &[0], &empty_u32),
                    section(18, &[0], &empty_f64),
                    section(19, &[0], &empty_u64),
                    section(20, &[0], &empty_u32),
                ],
            )
        }
        ArtifactRole::ProjectorCheckpoint
        | ArtifactRole::RepresentationReport
        | ArtifactRole::SemanticFidelityReport
        | ArtifactRole::RelationPolicyReport
        | ArtifactRole::MergeTreePersistenceReport
        | ArtifactRole::SubgroupBehaviorReport
        | ArtifactRole::AuthorizationNoninterferenceReport
        | ArtifactRole::SecurityApprovalReport
        | ArtifactRole::CompanionPinReport => unreachable!("artifact is opaque"),
        ArtifactRole::LegacyLayout
        | ArtifactRole::LegacyIdentities
        | ArtifactRole::LegacyExportManifest => unreachable!("legacy export is opaque"),
    }
}

fn publish_protection_fixture(
    path: &Utf8Path,
    policy_hash: ContentHash,
    edge_snapshot_hash: ContentHash,
    hard_mass: f64,
) -> PublishedArtifact {
    let counts = [0_u64, 1];
    let no_bytes: [u8; 0] = [];
    let no_ordinals: [u32; 0] = [];
    let no_scalars: [f64; 0] = [];
    let policy_offsets = [0_u64];
    let first = [0_u32];
    let second = [1_u32];
    let hard_mass = [hard_mass];
    let ordinary_mass = [0.5_f64];
    let flags = [0b11_u8];
    publish(
        path,
        RELATION_FORMAT,
        vec![
            section(1, &[32], policy_hash.as_bytes()),
            section(2, &[2], &counts),
            section(3, &[0, 16], &no_bytes),
            section(4, &[0, 16], &no_bytes),
            section(5, &[0], &no_bytes),
            section(6, &[0, 16], &no_bytes),
            section(7, &[0], &no_ordinals),
            section(8, &[0], &no_ordinals),
            section(9, &[0], &no_ordinals),
            section(10, &[0], &no_scalars),
            section(11, &[0], &no_bytes),
            section(12, &[0], &no_scalars),
            section(13, &[0], &no_scalars),
            section(14, &[0], &no_scalars),
            section(15, &[0], &no_scalars),
            section(16, &[1], &first),
            section(17, &[1], &second),
            section(18, &[1], &hard_mass),
            section(19, &[1], &ordinary_mass),
            section(20, &[1], &flags),
            section(21, &[32], edge_snapshot_hash.as_bytes()),
            section(22, &[1], &policy_offsets),
            section(23, &[0], &no_bytes),
            section(24, &[0], &no_ordinals),
            section(25, &[0], &no_bytes),
            section(26, &[0, 3], &no_scalars),
            section(27, &[0], &no_scalars),
            section(28, &[0, 3], &no_scalars),
            section(29, &[0], &no_scalars),
            section(30, &[0], &no_bytes),
        ],
    )
}

fn publish(
    path: &Utf8Path,
    format: ArtifactFormat,
    sections: Vec<ArtifactSection<'_>>,
) -> PublishedArtifact {
    publish_artifact(path, format, &sections).expect("test artifact should publish")
}

fn section<'data, T>(id: u16, dimensions: &[usize], values: &'data [T]) -> ArtifactSection<'data>
where
    T: ArtifactScalar,
{
    ArtifactSection::new(SectionId::new(id), dimensions, values)
        .expect("test artifact section should be valid")
}

#[inline]
fn artifact_hash(manifest: &GenerationManifest, role: ArtifactRole) -> ContentHash {
    manifest
        .artifacts
        .iter()
        .find(|artifact| artifact.role == role)
        .expect("test artifact role should exist")
        .content_hash
}

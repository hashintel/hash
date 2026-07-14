use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use time::OffsetDateTime;

use super::*;
use crate::salt::{
    card::CARD_FORMAT_VERSION,
    hash::ContentHash,
    projector::PROJECTOR_ARCHITECTURE_VERSION,
    representation::{CANONICAL_DIMENSIONS, PROJECTOR_DIMENSIONS},
    revision::{BaseRevision, DeltaRevision, GenerationId, VariantId},
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
fn unpinned_companion_cannot_form_a_manifest_identity() {
    let mut manifest = manifest();
    manifest.serving.canvas_companion_version = "TBD".to_owned();

    assert!(matches!(
        manifest.validate(),
        Err(ManifestError::MissingText {
            field: "serving.canvas_companion_version"
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

fn manifest() -> GenerationManifest {
    let hash = |name: &str| ContentHash::digest(name.as_bytes());
    GenerationManifest {
        generation_id: GenerationId::new(hash("generation")),
        created_at: OffsetDateTime::UNIX_EPOCH,
        input_snapshot: InputSnapshotManifest {
            ontology_transaction_time: Timestamp::<TransactionTime>::UNIX_EPOCH,
            knowledge_transaction_time: Timestamp::<TransactionTime>::UNIX_EPOCH,
            knowledge_decision_time_policy: KnowledgeDecisionTimePolicy::Pinned {
                timestamp: Timestamp::<DecisionTime>::UNIX_EPOCH,
            },
            ontology_hash: hash("ontology"),
            knowledge_hash: hash("knowledge"),
        },
        embedding: EmbeddingManifest {
            model: "provider/model".to_owned(),
            producer_contract_hash: hash("producer"),
            canonical_dimensions: CANONICAL_DIMENSIONS,
            projector_dimensions: PROJECTOR_DIMENSIONS,
            transform_version: "matryoshka-prefix-v1".to_owned(),
            transform_hash: hash("transform"),
            golden_vectors_hash: hash("golden-vectors"),
        },
        semantic_graph: SemanticGraphManifest {
            neighbors: 30,
            metric: SemanticMetric::Cosine,
            backend: "exact-test".to_owned(),
            graph_hash: hash("semantic-graph"),
            exact_audit_hash: hash("exact-audit"),
            recall_at_50: 0.97,
        },
        landmarks: LandmarkManifest {
            maximum_count: 4,
            actual_count: 2,
            selection_version: "weighted-priority-v1".to_owned(),
            seed: 41,
            retained_fraction: 0.5,
            artifact_hash: hash("landmarks"),
        },
        projector: ProjectorManifest {
            architecture_version: PROJECTOR_ARCHITECTURE_VERSION,
            width: 256,
            residual_blocks: 4,
            type_conditioning: true,
            relation_conditioning: true,
            checkpoint_hash: hash("projector"),
            loss_config_hash: hash("loss"),
            relation_gradient_beta_positive: 0.1,
            relation_gradient_beta_negative: 0.0,
            relation_gradient_beta_total: 0.1,
        },
        relations: RelationManifest {
            security_mode: RelationSecurityMode::AtlasSafeLinks,
            security_allow_list_hash: hash("allow-list"),
            edge_snapshot_hash: hash("edges"),
            relation_card_format_version: CARD_FORMAT_VERSION,
            relation_card_corpus_hash: hash("cards"),
            annotation_corpus_hash: hash("annotations"),
            annotation_prompt_family_version: "relation-policy-v1".to_owned(),
            annotation_vote_schedule: "3x-independent".to_owned(),
            reviewed_holdout_hash: hash("holdout"),
            policy_precedence_version: "v1".to_owned(),
            policy_hash: hash("policy"),
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
                global_relation_condition: 0.5,
                procrustes_transform: [1.0, 1.0, 0.0, 0.0, 0.0],
                quantization_step: 1.0e-3,
                clamp_count: 0,
                clamp_rate: 0.0,
                bucket_index_hash: hash("buckets"),
                morton_index_hash: hash("morton"),
                merge_tree_hash: hash("merge-tree"),
            }],
        },
        storage: StorageManifest {
            row_count: 2,
            row_id_encoding: RowIdEncoding::U32,
            base_revision: BaseRevision::ZERO,
            initial_delta_revision: DeltaRevision::ZERO,
        },
        serving: ServingManifest {
            authorization_adapter_version: "hash-auth-v1".to_owned(),
            wire_versions: vec![2, 1],
            style_version: "atlas-style-v1".to_owned(),
            canvas_companion_version: "1.4.0".to_owned(),
            canvas_companion_sha256: hash("canvas"),
            shader_contract_version: "shader-v1".to_owned(),
        },
        reproducibility: ReproducibilityManifest {
            code_revision: "0123456789abcdef".to_owned(),
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

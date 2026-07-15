use std::fs;

use burn::backend::{Candle, candle::CandleDevice};
use camino::{Utf8Path, Utf8PathBuf};
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use jiff::Timestamp as JiffTimestamp;
use tempfile::tempdir;

use super::*;
use crate::salt::{
    card::CARD_FORMAT_VERSION,
    format::{
        ANALYTIC_FORMAT, BASE_ARTIFACT_FORMAT, CLASSIFIER_FORMAT, LANDMARK_FORMAT, RELATION_FORMAT,
        SEMANTIC_GRAPH_FORMAT,
    },
    hash::{ContentHash, ContentHasher},
    projector::{
        ConditionedProjector, PROJECTOR_ARCHITECTURE_VERSION, ProjectorConfig,
        publish_projector_checkpoint,
    },
    representation::{CANONICAL_DIMENSIONS, PROJECTOR_DIMENSIONS},
    revision::{BaseRevision, DeltaRevision, GenerationId, VariantId},
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

fn manifest() -> GenerationManifest {
    fixture_manifest()
}

pub(crate) fn fixture_manifest() -> GenerationManifest {
    let hash = |name: &str| ContentHash::digest(name.as_bytes());
    GenerationManifest {
        generation_id: GenerationId::new(hash("generation")),
        created_at: JiffTimestamp::UNIX_EPOCH,
        input_snapshot: InputSnapshotManifest {
            ontology_transaction_time: Timestamp::<TransactionTime>::UNIX_EPOCH,
            knowledge_transaction_time: Timestamp::<TransactionTime>::UNIX_EPOCH,
            knowledge_decision_time_policy: KnowledgeDecisionTimePolicy::Pinned {
                timestamp: Timestamp::<DecisionTime>::UNIX_EPOCH,
            },
            ontology_hash: hash("ontology"),
            knowledge_hash: hash("knowledge"),
            frozen_input_hash: hash("frozen-input"),
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
            backend_hash: hash("semantic-backend"),
            configuration_hash: hash("semantic-configuration"),
            weight_hash: hash("semantic-weights"),
            graph_hash: hash("semantic-graph"),
            exact_audit_hash: hash("exact-audit"),
            recall_at_50: 0.97,
        },
        landmarks: LandmarkManifest {
            maximum_count: 4,
            actual_count: 2,
            selection_version: "weighted-priority-v1".to_owned(),
            seed: 41,
            retained_fraction: 2.0 / 52.0,
            artifact_hash: hash("landmarks"),
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
                condition_domain_hash: hash("condition-domain"),
                selection_evidence_hash: hash("selection-evidence"),
                canonical_field_hash: hash("canonical-field"),
                procrustes_transform: [1.0, 1.0, 0.0, 0.0, 0.0],
                quantization_step: 1.0e-3,
                clamp_count: 0,
                clamp_rate: 0.0,
                bucket_index_hash: hash("buckets"),
                morton_index_hash: hash("morton"),
                analytic_configuration_hash: hash("analytic-configuration"),
                merge_tree_hash: hash("merge-tree"),
            }],
        },
        storage: StorageManifest {
            row_count: 52,
            row_id_encoding: RowIdEncoding::U32,
            identity_directory_hash: hash("identity-directory"),
            base_revision: BaseRevision::ZERO,
            initial_delta_revision: DeltaRevision::ZERO,
        },
        artifacts: vec![
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
        bucket_index.update(&0_u32.to_le_bytes());
        bucket_index.update(&row.to_le_bytes());
        morton_index.update(&row.to_le_bytes());
        identity_directory.update(&row.to_le_bytes());
        identity_directory.update(&[0; 16]);
        identity_directory.update(&[0; 16]);
        identity_directory.update(&[0]);
        identity_directory.update(&[0; 16]);
    }
    let mut merge_tree = ContentHasher::new(b"hash.graph.atlas.salt.merge-tree.v1");
    merge_tree.update(&0.0_f64.to_bits().to_le_bytes());
    FixtureProvenance {
        bucket_index: bucket_index.finish(),
        morton_index: morton_index.finish(),
        identity_directory: identity_directory.finish(),
        edge_snapshot: ContentHasher::new(b"hash.graph.atlas.salt.relation-edge-snapshot.v1")
            .finish(),
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
    manifest.relations.edge_snapshot_hash = provenance.edge_snapshot;
    manifest.variants.entries[0].bucket_index_hash = provenance.bucket_index;
    manifest.variants.entries[0].morton_index_hash = provenance.morton_index;
    manifest.variants.entries[0].merge_tree_hash = provenance.merge_tree;
    let canonical = manifest.variants.entries[0].clone();
    let semantic_provenance = [
        manifest.semantic_graph.backend_hash,
        manifest.semantic_graph.configuration_hash,
        manifest.semantic_graph.weight_hash,
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
    for artifact in &mut manifest.artifacts {
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
                semantic_provenance,
                relation_provenance,
                provenance.identity_directory,
            );
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
            let bytes = artifact.role.to_string();
            fs::write(&path, bytes.as_bytes()).expect("opaque fixture should publish");
            *artifact = ArtifactManifest::opaque(
                artifact.role,
                artifact.relative_path.clone(),
                ContentHash::digest(bytes.as_bytes()),
                u64::try_from(bytes.len()).expect("fixture length should fit u64"),
            );
        }
    }
    manifest.relations.classifier_model_hash =
        artifact_hash(manifest, ArtifactRole::RelationClassifier);
    manifest.semantic_graph.graph_hash = artifact_hash(manifest, ArtifactRole::SemanticGraph);
    manifest.landmarks.artifact_hash = artifact_hash(manifest, ArtifactRole::LandmarkSkeleton);
    manifest.projector.checkpoint_hash = artifact_hash(manifest, ArtifactRole::ProjectorCheckpoint);
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
    semantic_provenance: [ContentHash; 3],
    relation_provenance: [ContentHash; 2],
    identity_directory_hash: ContentHash,
) -> PublishedArtifact {
    match role {
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
        ArtifactRole::CanonicalBase => {
            let row_ids = (0..rows)
                .map(|row| u32::try_from(row).expect("fixture row should fit u32"))
                .collect::<Vec<_>>();
            let coordinates = vec![0.0_f32; rows * 2];
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
                ],
            )
        }
        ArtifactRole::ProjectorCheckpoint => unreachable!("checkpoint is opaque"),
        ArtifactRole::LegacyLayout
        | ArtifactRole::LegacyIdentities
        | ArtifactRole::LegacyExportManifest => unreachable!("legacy export is opaque"),
    }
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

use core::fmt;

use hash_graph_temporal_versioning::{DecisionTime, Timestamp as GraphTimestamp, TransactionTime};
use jiff::Timestamp;
use serde::{Deserialize, Serialize};

use crate::salt::{
    hash::{ContentHash, ContentHasher},
    revision::{AuthorizationRevision, BaseRevision, DeltaRevision, GenerationId, VariantId},
};

pub(crate) const GENERATION_MANIFEST_FORMAT_VERSION: u32 = 18;

/// Complete immutable inputs and artifacts for one atlas generation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct GenerationManifest {
    pub format_version: u32,
    pub generation_id: GenerationId,
    pub created_at: Timestamp,
    pub input_snapshot: InputSnapshotManifest,
    pub embedding: EmbeddingManifest,
    pub semantic_graph: SemanticGraphManifest,
    pub landmarks: LandmarkManifest,
    pub projector: ProjectorManifest,
    pub relations: RelationManifest,
    pub variants: VariantManifest,
    pub storage: StorageManifest,
    pub artifacts: Vec<ArtifactManifest>,
    pub serving: ServingManifest,
    pub reproducibility: ReproducibilityManifest,
}

/// Bitemporal bounds and source identities frozen before generation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct InputSnapshotManifest {
    pub ontology_transaction_time: GraphTimestamp<TransactionTime>,
    pub knowledge_transaction_time: GraphTimestamp<TransactionTime>,
    pub knowledge_decision_time_policy: KnowledgeDecisionTimePolicy,
    pub ontology_hash: ContentHash,
    pub knowledge_hash: ContentHash,
    /// Store-issued identity of the repeatable-read extraction transaction.
    pub store_snapshot_identity: ContentHash,
    pub authorization_revision: AuthorizationRevision,
    /// Store-issued attestation binding extraction payload and snapshot axes.
    pub extraction_receipt_hash: ContentHash,
    pub frozen_input_hash: ContentHash,
}

/// How knowledge decision time is resolved within the pinned transaction view.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, tag = "mode", rename_all = "snake_case")]
pub(crate) enum KnowledgeDecisionTimePolicy {
    Pinned {
        timestamp: GraphTimestamp<DecisionTime>,
    },
    LatestAtTransaction,
}

/// Canonical embedding producer and projector-prefix transform.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct EmbeddingManifest {
    pub model: String,
    pub producer_contract_hash: ContentHash,
    pub canonical_corpus_hash: ContentHash,
    pub projector_corpus_hash: ContentHash,
    pub representation_audit: crate::salt::representation::RepresentationAuditReport,
    pub canonical_dimensions: usize,
    pub projector_dimensions: usize,
    pub transform_version: String,
    pub transform_hash: ContentHash,
    pub golden_vectors_hash: ContentHash,
}

/// Persisted semantic-neighbor artifact and exact recall audit.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SemanticGraphManifest {
    #[serde(rename = "k")]
    pub neighbors: usize,
    pub metric: SemanticMetric,
    pub backend: String,
    pub backend_hash: ContentHash,
    pub configuration_hash: ContentHash,
    pub weight_hash: ContentHash,
    pub graph_hash: ContentHash,
    pub exact_audit_hash: ContentHash,
    pub exact_audit_sample_hash: ContentHash,
    pub exact_audit_sample_rows: usize,
    pub exact_audit_neighbors: usize,
    pub exact_audit_matched: u64,
    pub exact_audit_expected: u64,
    pub recall_at_50: f64,
}

/// Metric used by semantic graph search and auditing.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SemanticMetric {
    Cosine,
}

/// Bounded landmark selection and skeleton identity.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct LandmarkManifest {
    #[serde(rename = "max_count")]
    pub maximum_count: usize,
    pub actual_count: usize,
    pub selection_version: String,
    pub seed: u64,
    pub retained_fraction: f64,
    pub artifact_hash: ContentHash,
    pub persistence_reference_source_hash: ContentHash,
}

/// Projector architecture, checkpoint, objective, and relation budgets.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ProjectorManifest {
    pub architecture_version: u32,
    pub width: usize,
    pub residual_blocks: usize,
    pub type_conditioning: bool,
    pub type_context_dimensions: usize,
    pub role_count: usize,
    pub role_dimensions: usize,
    pub relation_conditioning: bool,
    pub checkpoint_hash: ContentHash,
    pub loss_config_hash: ContentHash,
    pub training_config_hash: ContentHash,
    pub relation_gradient_beta_positive: f64,
    pub relation_gradient_beta_negative: f64,
    pub relation_gradient_beta_total: f64,
}

/// Security, policy, strength, and relation-energy contracts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct RelationManifest {
    pub security_mode: RelationSecurityMode,
    pub security_allow_list_hash: ContentHash,
    pub security_geometry_hash: ContentHash,
    pub edge_snapshot_hash: ContentHash,
    pub relation_card_format_version: u32,
    pub relation_card_corpus_hash: ContentHash,
    pub annotation_corpus_hash: ContentHash,
    pub annotation_prompt_family_version: String,
    pub annotation_vote_schedule: String,
    pub reviewed_holdout_hash: ContentHash,
    pub policy_precedence_version: String,
    pub policy_input_hash: ContentHash,
    pub policy_hash: ContentHash,
    pub policy_evaluation_report_hash: ContentHash,
    pub authorization_noninterference_report_hash: ContentHash,
    pub security_approval_report_hash: ContentHash,
    pub classifier_version: String,
    pub classifier_model_hash: ContentHash,
    pub classifier_temperature: f64,
    pub class_prior: Option<[f64; 3]>,
    pub applicability_method_version: String,
    pub applicability_config_hash: ContentHash,
    pub classifier_ood_edge_volume_fraction: f64,
    pub reviewed_edge_volume_fraction: f64,
    pub strength_head: StrengthHeadManifest,
    pub attraction_geometry_coefficients: AttractionGeometryManifest,
    pub attraction_force_pruning_threshold: f64,
    pub negative_admission: NegativeAdmissionManifest,
    pub coincident_gate: CoincidentGateManifest,
    pub typed_deconflict: TypedDeconflictManifest,
    pub derived_strength_persisted_as_authority: bool,
}

/// Which admitted snapshot links may influence geometry.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum RelationSecurityMode {
    PublicLinksOnly,
    AtlasSafeLinks,
    AllSnapshotLinks,
}

/// Frozen shared strength-head contract.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct StrengthHeadManifest {
    pub enabled: bool,
    pub band_vote_corpus_hash: ContentHash,
    #[serde(rename = "eligibility_threshold_p_P")]
    pub eligibility_threshold_proximal: f64,
    pub model_form: StrengthModelForm,
    pub model_hash: ContentHash,
    pub calibration_hash: ContentHash,
    pub zeta: [f64; 3],
    #[serde(rename = "materialized_h_table_hash")]
    pub materialized_table_hash: Option<ContentHash>,
}

/// Form of the bounded shared strength model.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum StrengthModelForm {
    Ordinal,
    Softmax,
}

/// Globally shared Coincident, Proximal, and Overlay coefficients.
#[derive(Debug, Copy, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct AttractionGeometryManifest {
    pub coincident: f64,
    pub proximal: f64,
    pub overlay: f64,
}

/// No-repel protection contract, independent from attraction admission.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct NegativeAdmissionManifest {
    pub policy_distribution_stage: ProtectionDistributionStage,
    pub protection_coefficients: ProtectionCoefficientManifest,
    pub protection_applicability: ProtectionApplicabilityManifest,
    pub pair_aggregation: PairAggregation,
    pub hard_negative_protection_threshold: f64,
    pub ordinary_negative_protection_threshold: f64,
    pub protect_ordinary_negatives: bool,
}

/// Stage at which no-repel protection consumes policy probabilities.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ProtectionDistributionStage {
    ProtectionSpecificPreAttractionGate,
}

/// Policy-class coefficients used only for protection.
#[derive(Debug, Copy, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ProtectionCoefficientManifest {
    pub coincident: f64,
    pub proximal: f64,
    pub overlay: f64,
}

/// Applicability-floor experiment bound to no-repel protection.
#[derive(Debug, Copy, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ProtectionApplicabilityManifest {
    pub mode: ProtectionApplicabilityMode,
    pub hard_negative_floor: f64,
    pub ordinary_negative_floor: f64,
    pub ordering_validated: bool,
    pub attraction_applicability_unchanged: bool,
    pub selection_experiment_hash: ContentHash,
}

/// Transformation of applicability for no-repel protection.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ProtectionApplicabilityMode {
    Floor,
}

/// Parallel-link reduction used by pair-level policy channels.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum PairAggregation {
    Max,
}

/// Evidence gate controlling Coincident geometry globally.
#[derive(Debug, Copy, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CoincidentGateManifest {
    pub enabled: bool,
    pub class_probability_threshold: f64,
    pub applicability_threshold: f64,
    pub precision_lcb_threshold: f64,
}

/// Staged typed minimum-separation contract.
#[derive(Debug, Copy, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct TypedDeconflictManifest {
    pub enabled: bool,
    pub classifier_class_schema: ClassifierClassSchema,
    pub geometry_coefficient: f64,
    pub admission_threshold: f64,
    pub signed_margin_threshold: f64,
    pub normalized_minimum_radius: f64,
    pub pair_aggregation: PairAggregation,
    pub conflict_policy: ConflictPolicy,
    pub exclude_from_generic_negatives: bool,
}

/// Policy-class output schema.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) enum ClassifierClassSchema {
    #[serde(rename = "CPO")]
    Cpo,
    #[serde(rename = "CPOD")]
    Cpod,
}

/// Handling of contradictory signed policy evidence.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ConflictPolicy {
    QuarantineNoForceProtect,
}

/// Canonical coordinate-field publication.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct VariantManifest {
    pub canonical_variant: VariantId,
    pub published_variant_count: usize,
    #[serde(rename = "max_published_variants")]
    pub maximum_published_variants: usize,
    pub entries: Vec<VariantEntryManifest>,
}

/// One materialized coordinate field.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct VariantEntryManifest {
    pub id: VariantId,
    pub global_relation_condition: f64,
    pub condition_domain_hash: ContentHash,
    pub selection_evidence_hash: ContentHash,
    pub quality_suite_version: String,
    pub projected_field_hash: ContentHash,
    pub quality_report_hash: ContentHash,
    pub semantic_fidelity_report_hash: ContentHash,
    pub semantic_fidelity: f64,
    pub minimum_semantic_fidelity: f64,
    pub subgroup_report_hash: ContentHash,
    pub maximum_subgroup_degradation: f64,
    pub maximum_allowed_subgroup_degradation: f64,
    pub relation_baseline_field_hash: ContentHash,
    pub baseline_relation_loss: f64,
    pub canonical_relation_loss: f64,
    pub relation_loss_tolerance: f64,
    pub canonical_field_hash: ContentHash,
    pub procrustes_transform: [f64; 5],
    pub quantization_step: f64,
    pub clamp_count: u64,
    pub clamp_rate: f64,
    pub bucket_index_hash: ContentHash,
    pub morton_index_hash: ContentHash,
    pub analytic_configuration_hash: ContentHash,
    pub merge_tree_hash: ContentHash,
    pub normalized_persistence: f64,
    pub persistence_comparison: crate::salt::generation::PersistenceComparisonReport,
}

/// Base/delta storage identity and row encoding.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct StorageManifest {
    pub row_count: u64,
    pub row_id_encoding: RowIdEncoding,
    pub identity_directory_hash: ContentHash,
    pub base_revision: BaseRevision,
    pub initial_delta_revision: DeltaRevision,
}

/// Persisted row-identifier representation.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum RowIdEncoding {
    U32,
    U64,
    ShardedU32,
}

/// Runtime role of one immutable generation artifact.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum ArtifactRole {
    Representations,
    RelationClassifier,
    StrengthHead,
    SemanticGraph,
    RelationIndexes,
    LandmarkSkeleton,
    LandmarkReferencePersistence,
    ProjectorCheckpoint,
    CanonicalBase,
    CanonicalAnalytics,
    LegacyLayout,
    LegacyIdentities,
    LegacyExportManifest,
}

impl fmt::Display for ArtifactRole {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Self::Representations => "representations",
            Self::RelationClassifier => "relation classifier",
            Self::StrengthHead => "strength head",
            Self::SemanticGraph => "semantic graph",
            Self::RelationIndexes => "relation indexes",
            Self::LandmarkSkeleton => "landmark skeleton",
            Self::LandmarkReferencePersistence => "landmark reference persistence",
            Self::ProjectorCheckpoint => "projector checkpoint",
            Self::CanonicalBase => "canonical base",
            Self::CanonicalAnalytics => "canonical analytics",
            Self::LegacyLayout => "legacy layout",
            Self::LegacyIdentities => "legacy identities",
            Self::LegacyExportManifest => "legacy export manifest",
        };
        formatter.write_str(name)
    }
}

/// Binary schema identity for an mmap artifact.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ArtifactFormatManifest {
    pub kind: u16,
    pub version: u16,
}

/// Content identity and generation-relative location of one required artifact.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ArtifactManifest {
    pub role: ArtifactRole,
    pub relative_path: String,
    pub content_hash: ContentHash,
    pub byte_length: u64,
    pub format: Option<ArtifactFormatManifest>,
}

/// Authorization, wire, style, and companion compatibility pins.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ServingManifest {
    pub authorization_adapter_version: String,
    pub gate_evidence_authority: String,
    pub gate_evidence_public_key: ContentHash,
    pub wire_versions: Vec<u16>,
    pub style_version: String,
    pub canvas_companion_version: String,
    pub canvas_companion_sha256: ContentHash,
    pub companion_compatibility_report_hash: ContentHash,
    pub shader_contract_version: String,
}

/// Source revision, complete configuration, and deterministic seeds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReproducibilityManifest {
    pub code_revision: String,
    /// Domain-separated digest of the executable that performed generation.
    pub binary_fingerprint: ContentHash,
    /// Runner-observed compiler, target, backend, and native arithmetic scope.
    pub execution_contract: ExecutionContractManifest,
    pub config_hash: ContentHash,
    pub seeds: Vec<SeedManifest>,
}

/// Complete arithmetic scope required to reproduce one generation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ExecutionContractManifest {
    pub version: u16,
    pub generator_version: String,
    pub rustc_release: String,
    pub rustc_commit: String,
    pub rustc_host: String,
    pub target: String,
    pub target_features: String,
    pub profile: String,
    pub optimization_level: String,
    pub debug: String,
    pub rustflags_hex: String,
    pub dependency_lock_hash: ContentHash,
    pub training_backend: String,
    pub rayon_threads: usize,
    pub operating_system: String,
    pub math_runtime: String,
    pub runtime_cpu_features: String,
    pub floating_point_control: String,
    pub math_library_images: String,
    pub candle_version: String,
    pub candle_cpu_threads: usize,
    pub gemm_version: String,
    pub gemm_kernel: String,
    pub gemm_cache_configuration: String,
    pub gemm_threading_threshold: usize,
    pub gemm_lhs_packing_threshold_single_thread: usize,
    pub gemm_lhs_packing_threshold_multi_thread: usize,
    pub gemm_rhs_packing_threshold: usize,
    pub salt_simd_mode: String,
    pub usearch_version: String,
    pub usearch_compiled_isa: String,
    pub usearch_available_isa: String,
    pub usearch_cosine_f32_isa: String,
    pub usearch_l2sq_f32_isa: String,
    pub contract_hash: ContentHash,
}

impl ExecutionContractManifest {
    /// Recomputes the canonical identity of every declared execution property.
    #[must_use]
    #[expect(
        clippy::little_endian_bytes,
        reason = "execution contracts use canonical cross-platform integer encodings"
    )]
    pub(crate) fn content_hash(&self) -> ContentHash {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.execution-contract.v3");
        hasher.update(&self.version.to_le_bytes());
        for component in [
            &self.generator_version,
            &self.rustc_release,
            &self.rustc_commit,
            &self.rustc_host,
            &self.target,
            &self.target_features,
            &self.profile,
            &self.optimization_level,
            &self.debug,
            &self.rustflags_hex,
            &self.training_backend,
            &self.operating_system,
            &self.math_runtime,
            &self.runtime_cpu_features,
            &self.floating_point_control,
            &self.math_library_images,
            &self.candle_version,
            &self.gemm_version,
            &self.gemm_kernel,
            &self.gemm_cache_configuration,
            &self.salt_simd_mode,
            &self.usearch_version,
            &self.usearch_compiled_isa,
            &self.usearch_available_isa,
            &self.usearch_cosine_f32_isa,
            &self.usearch_l2sq_f32_isa,
        ] {
            hasher.update(component.as_bytes());
        }
        hasher.update(self.dependency_lock_hash.as_bytes());
        for value in [
            self.rayon_threads,
            self.candle_cpu_threads,
            self.gemm_threading_threshold,
            self.gemm_lhs_packing_threshold_single_thread,
            self.gemm_lhs_packing_threshold_multi_thread,
            self.gemm_rhs_packing_threshold,
        ] {
            hasher.update(
                &u64::try_from(value)
                    .expect("Rayon thread count should fit u64")
                    .to_le_bytes(),
            );
        }
        hasher.finish()
    }
}

/// One named deterministic seed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SeedManifest {
    pub name: String,
    pub value: u64,
}

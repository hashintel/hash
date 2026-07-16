#![expect(
    clippy::little_endian_bytes,
    reason = "manifest index identities use canonical little-endian scalar encodings"
)]

use super::CanonicalGenerationError;
use crate::salt::{
    evaluation::{CanonicalQuantization, QuantizedCanonicalField},
    generation::{
        ConditionQuality, ConditionQualityPolicy, LegacyCanvasExport, PersistenceComparisonReport,
    },
    graph::{SemanticGraphConfig, audit::RecallAudit},
    hash::{ContentHash, ContentHasher},
    landmark::{LandmarkConfig, LandmarkSelection},
    manifest::{ArtifactManifest, ArtifactRole, GenerationManifest},
    materialize::RankedPoint,
    projector::{ProjectorConfig, ProjectorLossConfig},
    relation::{AttractionConfig, ProtectionConfig},
    representation::PublishedRepresentations,
    storage::mmap::PublishedArtifact,
};

#[derive(Debug, Copy, Clone)]
pub(super) struct CanonicalGateMeasurements {
    pub relation_baseline_field_hash: ContentHash,
    pub baseline_relation_loss: f64,
    pub canonical_relation_loss: f64,
    pub relation_loss_tolerance: f64,
    pub normalized_persistence: f64,
}

#[expect(
    clippy::too_many_arguments,
    clippy::too_many_lines,
    reason = "every independently published artifact is explicit at the manifest boundary"
)]
pub(super) fn populate_manifest(
    manifest: &mut GenerationManifest,
    security_geometry_hash: ContentHash,
    edge_snapshot_hash: ContentHash,
    security_allow_list_hash: ContentHash,
    relation_policy_hash: ContentHash,
    audit: RecallAudit,
    selection: &LandmarkSelection,
    persistence_reference_source_hash: ContentHash,
    canonical: &QuantizedCanonicalField,
    quality_suite_version: &str,
    quality: ConditionQuality,
    quality_policy: ConditionQualityPolicy,
    quantization: CanonicalQuantization,
    ranked: &[RankedPoint],
    analytic_configuration_hash: ContentHash,
    merge_tree_hash: ContentHash,
    persistence_comparison: PersistenceComparisonReport,
    gate_measurements: CanonicalGateMeasurements,
    row_count: usize,
    identity_directory_hash: ContentHash,
    projector: ProjectorConfig,
    projector_loss: ProjectorLossConfig,
    loss_hash: ContentHash,
    training_hash: ContentHash,
    representations: PublishedRepresentations,
    classifier: PublishedArtifact,
    semantic: PublishedArtifact,
    semantic_backend_hash: ContentHash,
    semantic_configuration_hash: ContentHash,
    semantic_weight_hash: ContentHash,
    relations: PublishedArtifact,
    landmarks: PublishedArtifact,
    reference_persistence: PublishedArtifact,
    checkpoint_hash: ContentHash,
    checkpoint_length: u64,
    base: PublishedArtifact,
    analytics: PublishedArtifact,
    legacy: &LegacyCanvasExport,
    semantic_config: SemanticGraphConfig,
    landmark_config: LandmarkConfig,
    attraction_config: AttractionConfig,
    protection_config: ProtectionConfig,
) -> Result<(), CanonicalGenerationError> {
    manifest.embedding.canonical_corpus_hash = representations.canonical_hash;
    manifest.embedding.projector_corpus_hash = representations.projector_hash;
    manifest.semantic_graph.neighbors = semantic_config.neighbors.get();
    format!("usearch-{}-single-threaded-build", usearch::version())
        .clone_into(&mut manifest.semantic_graph.backend);
    manifest.semantic_graph.backend_hash = semantic_backend_hash;
    manifest.semantic_graph.configuration_hash = semantic_configuration_hash;
    manifest.semantic_graph.weight_hash = semantic_weight_hash;
    manifest.semantic_graph.graph_hash = semantic.content_hash;
    manifest.semantic_graph.exact_audit_hash = audit.content_hash();
    manifest.semantic_graph.exact_audit_sample_hash = audit.sample;
    manifest.semantic_graph.exact_audit_sample_rows = audit.sample_rows;
    manifest.semantic_graph.exact_audit_neighbors = audit.neighbors_per_row;
    manifest.semantic_graph.exact_audit_matched = audit.matched;
    manifest.semantic_graph.exact_audit_expected = audit.expected;
    manifest.semantic_graph.recall_at_50 = audit.recall;

    manifest.landmarks.maximum_count = landmark_config.maximum_count.get();
    manifest.landmarks.actual_count = selection.rows().len();
    manifest.landmarks.seed = landmark_config.seed;
    manifest.landmarks.retained_fraction = if selection.rows().is_empty() {
        0.0
    } else {
        f64::from(
            u32::try_from(selection.retained_count())
                .expect("retained landmark count should fit u32"),
        ) / f64::from(u32::try_from(selection.rows().len()).expect("landmark count should fit u32"))
    };
    manifest.landmarks.artifact_hash = landmarks.content_hash;
    manifest.landmarks.persistence_reference_source_hash = persistence_reference_source_hash;

    manifest.projector.width = projector.width;
    manifest.projector.residual_blocks = projector.residual_blocks;
    manifest.projector.type_conditioning = projector.type_context_dimensions != 0;
    manifest.projector.type_context_dimensions = projector.type_context_dimensions;
    manifest.projector.role_count = projector.role_count;
    manifest.projector.role_dimensions = projector.role_dimensions;
    manifest.projector.relation_conditioning = true;
    manifest.projector.checkpoint_hash = checkpoint_hash;
    manifest.projector.loss_config_hash = loss_hash;
    manifest.projector.training_config_hash = training_hash;
    manifest.projector.relation_gradient_beta_positive = projector_loss.budget.positive();
    manifest.projector.relation_gradient_beta_negative = 0.0;
    manifest.projector.relation_gradient_beta_total = projector_loss.budget.total();

    manifest.relations.security_allow_list_hash = security_allow_list_hash;
    manifest.relations.security_geometry_hash = security_geometry_hash;
    manifest.relations.edge_snapshot_hash = edge_snapshot_hash;
    manifest.relations.policy_hash = relation_policy_hash;
    manifest.relations.classifier_model_hash = classifier.content_hash;
    manifest
        .relations
        .attraction_geometry_coefficients
        .coincident = attraction_config.coefficients.coincident;
    manifest.relations.attraction_geometry_coefficients.proximal =
        attraction_config.coefficients.proximal;
    manifest.relations.attraction_geometry_coefficients.overlay = 0.0;
    manifest.relations.attraction_force_pruning_threshold =
        attraction_config.force_pruning_threshold;
    manifest
        .relations
        .negative_admission
        .protection_applicability
        .hard_negative_floor = protection_config.hard_floor.get();
    manifest
        .relations
        .negative_admission
        .protection_applicability
        .ordinary_negative_floor = protection_config.ordinary_floor.get();
    manifest
        .relations
        .negative_admission
        .hard_negative_protection_threshold = protection_config.hard_threshold.get();
    manifest
        .relations
        .negative_admission
        .ordinary_negative_protection_threshold = protection_config.ordinary_threshold.get();
    manifest
        .relations
        .negative_admission
        .protect_ordinary_negatives = protection_config.protect_ordinary_negatives;
    let canonical_entry = manifest
        .variants
        .entries
        .iter_mut()
        .find(|entry| entry.id == manifest.variants.canonical_variant)
        .ok_or(CanonicalGenerationError::ManifestContractCanonical)?;
    let selection = canonical.selection();
    canonical_entry.global_relation_condition = selection.condition().get();
    canonical_entry.condition_domain_hash = selection.domain_version();
    canonical_entry.selection_evidence_hash = selection.evidence();
    quality_suite_version.clone_into(&mut canonical_entry.quality_suite_version);
    canonical_entry.projected_field_hash = quality.projected_field();
    canonical_entry.quality_report_hash = quality.content_hash();
    canonical_entry.semantic_fidelity_report_hash = quality.semantic_fidelity_report();
    canonical_entry.semantic_fidelity = quality.semantic_fidelity();
    canonical_entry.minimum_semantic_fidelity = quality_policy.minimum_semantic_fidelity;
    canonical_entry.subgroup_report_hash = quality.subgroup_report();
    canonical_entry.maximum_subgroup_degradation = quality.maximum_subgroup_degradation();
    canonical_entry.maximum_allowed_subgroup_degradation =
        quality_policy.maximum_subgroup_degradation;
    canonical_entry.quantization_step = canonical.quantization_step();
    canonical_entry.clamp_count = quantization.clamp_count();
    canonical_entry.clamp_rate = quantization.clamp_rate();
    canonical_entry.relation_baseline_field_hash = gate_measurements.relation_baseline_field_hash;
    canonical_entry.baseline_relation_loss = gate_measurements.baseline_relation_loss;
    canonical_entry.canonical_relation_loss = gate_measurements.canonical_relation_loss;
    canonical_entry.relation_loss_tolerance = gate_measurements.relation_loss_tolerance;
    canonical_entry.canonical_field_hash = canonical.content_hash();
    canonical_entry.procrustes_transform =
        canonical
            .alignment()
            .map_or([1.0, 1.0, 0.0, 0.0, 0.0], |alignment| {
                [
                    alignment.scale(),
                    alignment.rotation()[0],
                    alignment.rotation()[1],
                    alignment.translation()[0],
                    alignment.translation()[1],
                ]
            });
    canonical_entry.bucket_index_hash = ranked_hash(
        b"hash.graph.atlas.salt.bucket-index.v1",
        ranked,
        |point, hasher| {
            hasher.update(&u32::from(point.bucket).to_le_bytes());
            hasher.update(&point.priority_rank.to_le_bytes());
        },
    );
    canonical_entry.morton_index_hash = ranked_hash(
        b"hash.graph.atlas.salt.morton-index.v1",
        ranked,
        |point, hasher| hasher.update(&point.morton.get().to_le_bytes()),
    );
    canonical_entry.analytic_configuration_hash = analytic_configuration_hash;
    canonical_entry.merge_tree_hash = merge_tree_hash;
    canonical_entry.normalized_persistence = gate_measurements.normalized_persistence;
    canonical_entry.persistence_comparison = persistence_comparison;

    manifest.storage.row_count = u64::try_from(row_count).expect("row count should fit u64");
    manifest.storage.identity_directory_hash = identity_directory_hash;
    manifest.storage.base_revision = crate::salt::revision::BaseRevision::ZERO;
    manifest.storage.initial_delta_revision = crate::salt::revision::DeltaRevision::ZERO;

    let mut artifacts = vec![
        ArtifactManifest::mmap(
            ArtifactRole::Representations,
            super::run::REPRESENTATION_FILE,
            representations.artifact,
        ),
        ArtifactManifest::mmap(
            ArtifactRole::RelationClassifier,
            super::run::CLASSIFIER_FILE,
            classifier,
        ),
    ];
    artifacts.extend([
        ArtifactManifest::mmap(
            ArtifactRole::SemanticGraph,
            super::run::SEMANTIC_FILE,
            semantic,
        ),
        ArtifactManifest::mmap(
            ArtifactRole::RelationIndexes,
            super::run::RELATION_FILE,
            relations,
        ),
        ArtifactManifest::mmap(
            ArtifactRole::LandmarkSkeleton,
            super::run::LANDMARK_FILE,
            landmarks,
        ),
        ArtifactManifest::mmap(
            ArtifactRole::LandmarkReferencePersistence,
            super::run::REFERENCE_PERSISTENCE_FILE,
            reference_persistence,
        ),
        ArtifactManifest::opaque(
            ArtifactRole::ProjectorCheckpoint,
            super::run::PROJECTOR_FILE,
            checkpoint_hash,
            checkpoint_length,
        ),
        ArtifactManifest::mmap(ArtifactRole::CanonicalBase, super::run::BASE_FILE, base),
        ArtifactManifest::mmap(
            ArtifactRole::CanonicalAnalytics,
            super::run::ANALYTIC_FILE,
            analytics,
        ),
        ArtifactManifest::opaque(
            ArtifactRole::LegacyLayout,
            legacy
                .layout
                .path
                .file_name()
                .expect("legacy layout should have a file name"),
            legacy.layout.content_hash,
            legacy.layout.byte_length,
        ),
        ArtifactManifest::opaque(
            ArtifactRole::LegacyIdentities,
            legacy
                .identities
                .path
                .file_name()
                .expect("legacy identities should have a file name"),
            legacy.identities.content_hash,
            legacy.identities.byte_length,
        ),
        ArtifactManifest::opaque(
            ArtifactRole::LegacyExportManifest,
            legacy
                .manifest
                .path
                .file_name()
                .expect("legacy export manifest should have a file name"),
            legacy.manifest.content_hash,
            legacy.manifest.byte_length,
        ),
    ]);
    manifest.artifacts = artifacts;
    Ok(())
}

fn ranked_hash(
    domain: &'static [u8],
    ranked: &[RankedPoint],
    update: impl Fn(&RankedPoint, &mut ContentHasher),
) -> ContentHash {
    let mut hasher = ContentHasher::new(domain);
    for point in ranked {
        hasher.update(&point.row.as_u32().to_le_bytes());
        update(point, &mut hasher);
    }
    hasher.finish()
}

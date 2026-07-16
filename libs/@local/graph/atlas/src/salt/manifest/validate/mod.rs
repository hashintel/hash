//! Semantic validation for immutable generation manifests.
//!
//! JSON decoding proves only that fields have the expected Rust shape. Release
//! validation additionally proves that those fields describe one supported,
//! internally consistent generation. This module is the central fail-closed
//! boundary for that second check.
//!
//! Validation proceeds in dependency order:
//!
//! 1. input, authorization, and representation identities must be nonzero and bind the persisted
//!    row domain;
//! 2. compiled numerical contracts such as representation dimensions, transform golden vectors,
//!    graph neighborhood size, and projector architecture must match the running binary;
//! 3. relation policy, strength, negative protection, variants, base/delta revisions, and serving
//!    pins must agree across manifest sections;
//! 4. every required artifact role must appear exactly once with a canonical relative path,
//!    expected schema, length, and content hash; and
//! 5. reproducibility seeds and configuration identities must be complete.
//!
//! Artifact loading performs a second layer of validation over actual bytes.
//! Role-specific schema checks prove section shapes and numerical invariants;
//! cross-artifact checks prove, for example, that the legacy layout contains
//! the exact quantized coordinates from the canonical base. Neither a valid
//! hash nor a valid manifest alone is sufficient.
//!
//! [`GenerationManifest::canonical_bytes`] first calls this validation and then
//! sorts set-like fields into their canonical order. The resulting SHA-256
//! identity therefore names semantics and one unambiguous JSON encoding.

use std::collections::HashSet;

use error_stack::{Report, ResultExt as _};

use super::{
    ExecutionContractManifest, GENERATION_MANIFEST_FORMAT_VERSION, GenerationManifest,
    ManifestError, artifact::validate_artifacts,
};
use crate::salt::{
    generation::ConditionQuality,
    graph::audit::{AUDIT_NEIGHBORS, MINIMUM_RECALL, RecallAudit},
    hash::ContentHash,
    projector::{PROJECTOR_ARCHITECTURE_VERSION, ProjectorConfig},
    representation::{
        CANONICAL_DIMENSIONS, PROJECTOR_DIMENSIONS, TRANSFORM_VERSION, transform_contract_hash,
        transform_golden_vectors_hash,
    },
    revision::{BaseRevision, DeltaRevision, MAX_PUBLISHED_VARIANTS, VariantId},
};

mod relation;

const SEMANTIC_NEIGHBORS: usize = 30;

impl GenerationManifest {
    /// Validates the complete immutable generation contract.
    ///
    /// Structural validation is deliberately stricter than Serde shape
    /// validation. It fixes the v1 representation sizes, graph neighborhood,
    /// `FiLM` conditioning, relation factorization, single canonical variant,
    /// initial base/delta revisions, and serving companion pins.
    ///
    /// # Errors
    ///
    /// This returns the first missing, non-finite, out-of-range, or
    /// contract-inconsistent field in canonical section order.
    pub(crate) fn validate(&self) -> Result<(), ManifestError> {
        exact(
            "format_version",
            self.format_version == GENERATION_MANIFEST_FORMAT_VERSION,
            "the current manifest format version",
        )?;
        for (field, value) in [
            (
                "input_snapshot.ontology_hash",
                self.input_snapshot.ontology_hash,
            ),
            (
                "input_snapshot.knowledge_hash",
                self.input_snapshot.knowledge_hash,
            ),
            (
                "input_snapshot.store_snapshot_identity",
                self.input_snapshot.store_snapshot_identity,
            ),
            (
                "input_snapshot.authorization_revision",
                self.input_snapshot.authorization_revision.content_hash(),
            ),
            (
                "input_snapshot.extraction_receipt_hash",
                self.input_snapshot.extraction_receipt_hash,
            ),
            (
                "input_snapshot.frozen_input_hash",
                self.input_snapshot.frozen_input_hash,
            ),
        ] {
            nonzero_hash(field, value)?;
        }
        nonzero_hash(
            "embedding.producer_contract_hash",
            self.embedding.producer_contract_hash,
        )?;
        exact(
            "embedding.transform_version",
            self.embedding.transform_version == TRANSFORM_VERSION,
            "the compiled projector transform version",
        )?;
        exact(
            "embedding.transform_hash",
            self.embedding.transform_hash == transform_contract_hash(),
            "the compiled projector transform contract",
        )?;
        exact(
            "embedding.golden_vectors_hash",
            self.embedding.golden_vectors_hash == transform_golden_vectors_hash(),
            "the compiled projector transform golden vectors",
        )?;
        self.validate_embedding()?;
        self.validate_semantic_graph()?;
        self.validate_landmarks()?;
        self.validate_projector()?;
        self.validate_relations()?;
        self.validate_variants()?;
        self.validate_storage()?;
        validate_artifacts(self)?;
        self.validate_serving()?;
        self.validate_reproducibility()?;
        Ok(())
    }

    /// Serializes the validated manifest using deterministic struct-field order.
    ///
    /// # Errors
    ///
    /// This returns an error when validation or JSON serialization fails.
    pub(crate) fn canonical_bytes(&self) -> Result<Vec<u8>, Report<ManifestError>> {
        self.validate().map_err(Report::new)?;
        let mut canonical = self.clone();
        canonical
            .variants
            .entries
            .sort_unstable_by_key(|entry| entry.id);
        canonical.serving.wire_versions.sort_unstable();
        canonical
            .reproducibility
            .seeds
            .sort_unstable_by(|left, right| left.name.cmp(&right.name));
        serde_json::to_vec(&canonical).change_context(ManifestError::Serialization)
    }

    /// Computes the canonical manifest-file identity.
    ///
    /// # Errors
    ///
    /// This returns an error when validation or serialization fails.
    pub(crate) fn content_hash(&self) -> Result<ContentHash, Report<ManifestError>> {
        self.canonical_bytes()
            .map(|bytes| ContentHash::digest(&bytes))
    }

    fn validate_embedding(&self) -> Result<(), ManifestError> {
        required_text("embedding.model", &self.embedding.model)?;
        required_text(
            "embedding.transform_version",
            &self.embedding.transform_version,
        )?;
        exact(
            "embedding.canonical_dimensions",
            self.embedding.canonical_dimensions == CANONICAL_DIMENSIONS,
            "3072",
        )?;
        exact(
            "embedding.projector_dimensions",
            self.embedding.projector_dimensions == PROJECTOR_DIMENSIONS,
            "512",
        )?;
        exact(
            "embedding.canonical_corpus_hash",
            self.embedding.canonical_corpus_hash != ContentHash::from_bytes([0; 32]),
            "a nonzero persisted corpus identity",
        )?;
        exact(
            "embedding.projector_corpus_hash",
            self.embedding.projector_corpus_hash != ContentHash::from_bytes([0; 32]),
            "a nonzero persisted corpus identity",
        )?;
        exact(
            "embedding.representation_audit",
            self.embedding
                .representation_audit
                .validate_summary(usize::try_from(self.storage.row_count).unwrap_or(usize::MAX))
                .is_ok()
                && self.embedding.representation_audit.canonical_corpus_hash
                    == self.embedding.canonical_corpus_hash
                && self.embedding.representation_audit.projector_corpus_hash
                    == self.embedding.projector_corpus_hash
                && self.embedding.representation_audit.identity_directory_hash
                    == self.storage.identity_directory_hash,
            "a complete report bound to persisted representations and identities",
        )
    }

    #[expect(
        clippy::cast_precision_loss,
        reason = "exact-audit counts are bounded far below f64 integer precision"
    )]
    fn validate_semantic_graph(&self) -> Result<(), ManifestError> {
        required_text("semantic_graph.backend", &self.semantic_graph.backend)?;
        for (field, value) in [
            (
                "semantic_graph.backend_hash",
                self.semantic_graph.backend_hash,
            ),
            (
                "semantic_graph.configuration_hash",
                self.semantic_graph.configuration_hash,
            ),
            ("semantic_graph.graph_hash", self.semantic_graph.graph_hash),
            (
                "semantic_graph.weight_hash",
                self.semantic_graph.weight_hash,
            ),
            (
                "semantic_graph.exact_audit_sample_hash",
                self.semantic_graph.exact_audit_sample_hash,
            ),
            (
                "semantic_graph.exact_audit_hash",
                self.semantic_graph.exact_audit_hash,
            ),
        ] {
            nonzero_hash(field, value)?;
        }
        let rows = usize::try_from(self.storage.row_count).unwrap_or(usize::MAX);
        exact(
            "semantic_graph.neighbors",
            self.semantic_graph.neighbors == SEMANTIC_NEIGHBORS,
            "30",
        )?;
        fraction(
            "semantic_graph.recall_at_50",
            self.semantic_graph.recall_at_50,
        )?;
        exact(
            "semantic_graph.recall_at_50",
            self.semantic_graph.recall_at_50 >= MINIMUM_RECALL,
            "at least the production ANN recall threshold",
        )?;
        exact(
            "semantic_graph.exact_audit_sample_rows",
            self.semantic_graph.exact_audit_sample_rows > 0
                && self.semantic_graph.exact_audit_sample_rows <= rows,
            "between one and the frozen corpus row count",
        )?;
        exact(
            "semantic_graph.exact_audit_neighbors",
            rows > 1 && self.semantic_graph.exact_audit_neighbors == AUDIT_NEIGHBORS.min(rows - 1),
            "recall@50, bounded only by corpus size",
        )?;
        let expected = self
            .semantic_graph
            .exact_audit_sample_rows
            .checked_mul(self.semantic_graph.exact_audit_neighbors)
            .and_then(|count| u64::try_from(count).ok());
        exact(
            "semantic_graph.exact_audit_expected",
            expected == Some(self.semantic_graph.exact_audit_expected)
                && self.semantic_graph.exact_audit_matched
                    <= self.semantic_graph.exact_audit_expected,
            "the complete sampled recall denominator and a bounded numerator",
        )?;
        let measured_recall = self.semantic_graph.exact_audit_matched as f64
            / self.semantic_graph.exact_audit_expected as f64;
        exact(
            "semantic_graph.recall_at_50",
            measured_recall.to_bits() == self.semantic_graph.recall_at_50.to_bits(),
            "the ratio of exact matched and expected neighbors",
        )?;
        let audit = RecallAudit {
            backend: self.semantic_graph.backend_hash,
            sample: self.semantic_graph.exact_audit_sample_hash,
            sample_rows: self.semantic_graph.exact_audit_sample_rows,
            neighbors_per_row: self.semantic_graph.exact_audit_neighbors,
            matched: self.semantic_graph.exact_audit_matched,
            expected: self.semantic_graph.exact_audit_expected,
            recall: self.semantic_graph.recall_at_50,
        };
        exact(
            "semantic_graph.exact_audit_hash",
            audit.content_hash() == self.semantic_graph.exact_audit_hash,
            "the canonical exact-audit measurement identity",
        )
    }

    fn validate_landmarks(&self) -> Result<(), ManifestError> {
        required_text(
            "landmarks.selection_version",
            &self.landmarks.selection_version,
        )?;
        if self.landmarks.actual_count == 0
            || self.landmarks.actual_count > self.landmarks.maximum_count
        {
            return Err(ManifestError::LandmarkCapacity {
                actual: self.landmarks.actual_count,
                maximum: self.landmarks.maximum_count,
            });
        }
        nonzero_hash("landmarks.artifact_hash", self.landmarks.artifact_hash)?;
        nonzero_hash(
            "landmarks.persistence_reference_source_hash",
            self.landmarks.persistence_reference_source_hash,
        )?;
        fraction(
            "landmarks.retained_fraction",
            self.landmarks.retained_fraction,
        )
    }

    fn validate_projector(&self) -> Result<(), ManifestError> {
        for (field, value) in [
            ("projector.checkpoint_hash", self.projector.checkpoint_hash),
            (
                "projector.loss_config_hash",
                self.projector.loss_config_hash,
            ),
            (
                "projector.training_config_hash",
                self.projector.training_config_hash,
            ),
        ] {
            nonzero_hash(field, value)?;
        }
        exact(
            "serving.companion_compatibility_report_hash",
            ![
                self.serving.canvas_companion_sha256,
                self.relations.security_allow_list_hash,
                self.relations.security_geometry_hash,
                self.relations.policy_hash,
                self.relations.policy_evaluation_report_hash,
                self.relations.authorization_noninterference_report_hash,
                self.relations.security_approval_report_hash,
            ]
            .contains(&self.serving.companion_compatibility_report_hash),
            "a domain-separated report identity that does not alias its subject or another report",
        )?;
        exact(
            "projector.configuration",
            ProjectorConfig {
                width: self.projector.width,
                residual_blocks: self.projector.residual_blocks,
                type_context_dimensions: self.projector.type_context_dimensions,
                role_count: self.projector.role_count,
                role_dimensions: self.projector.role_dimensions,
            }
            .validate()
            .is_ok(),
            "a bounded architecture within the M0 resource envelope",
        )?;
        exact(
            "projector.architecture_version",
            self.projector.architecture_version == PROJECTOR_ARCHITECTURE_VERSION,
            "the supported architecture version",
        )?;
        exact(
            "projector.width",
            self.projector.width > 0,
            "strictly positive",
        )?;
        exact(
            "projector.residual_blocks",
            self.projector.residual_blocks > 0,
            "strictly positive",
        )?;
        exact(
            "projector.type_context_dimensions",
            self.projector.type_conditioning == (self.projector.type_context_dimensions != 0),
            "non-zero exactly when type conditioning is enabled",
        )?;
        exact(
            "projector.role_count",
            self.projector.role_count == 3,
            "the three supported entity roles",
        )?;
        exact(
            "projector.role_dimensions",
            self.projector.role_dimensions > 0,
            "strictly positive",
        )?;
        exact(
            "projector.input_dimensions",
            PROJECTOR_DIMENSIONS
                .checked_add(self.projector.type_context_dimensions)
                .and_then(|dimensions| dimensions.checked_add(self.projector.role_dimensions))
                .is_some(),
            "representable as usize",
        )?;
        exact(
            "projector.relation_conditioning",
            self.projector.relation_conditioning,
            "enabled",
        )?;
        nonnegative_finite(
            "projector.relation_gradient_beta_positive",
            self.projector.relation_gradient_beta_positive,
        )?;
        nonnegative_finite(
            "projector.relation_gradient_beta_negative",
            self.projector.relation_gradient_beta_negative,
        )?;
        nonnegative_finite(
            "projector.relation_gradient_beta_total",
            self.projector.relation_gradient_beta_total,
        )?;
        exact(
            "projector.relation_gradient_beta_negative",
            self.projector.relation_gradient_beta_negative == 0.0,
            "zero while typed Deconflict is disabled",
        )?;
        exact(
            "projector.relation_gradient_beta_positive",
            self.projector.relation_gradient_beta_positive
                <= self.projector.relation_gradient_beta_total,
            "no greater than the total relation-gradient budget",
        )
    }

    #[expect(
        clippy::too_many_lines,
        reason = "variant validation keeps the signed manifest contract auditable in field order"
    )]
    fn validate_variants(&self) -> Result<(), ManifestError> {
        let variants = &self.variants;
        if variants.published_variant_count != variants.entries.len()
            || variants.entries.len() != 1
            || variants.maximum_published_variants != usize::from(MAX_PUBLISHED_VARIANTS)
        {
            return Err(ManifestError::VariantCount {
                declared: variants.published_variant_count,
                entries: variants.entries.len(),
                maximum: variants.maximum_published_variants,
            });
        }
        exact(
            "variants.canonical_variant",
            variants.canonical_variant == VariantId::CANONICAL,
            "variant 0",
        )?;
        let mut identifiers = HashSet::with_capacity(variants.entries.len());
        if variants
            .entries
            .iter()
            .any(|entry| !identifiers.insert(entry.id))
        {
            return Err(ManifestError::DuplicateVariant);
        }
        let canonical = variants
            .entries
            .iter()
            .find(|entry| entry.id == variants.canonical_variant)
            .ok_or(ManifestError::MissingCanonicalVariant)?;
        positive_finite(
            "variants.entries.quantization_step",
            canonical.quantization_step,
        )?;
        fraction("variants.entries.clamp_rate", canonical.clamp_rate)?;
        let row_count = u32::try_from(self.storage.row_count).map_err(|_error| {
            ManifestError::InvalidInvariant {
                field: "variants.entries.clamp_count",
                expected: "representable for two components per u32 row",
            }
        })?;
        let component_count = 2 * u64::from(row_count);
        exact(
            "variants.entries.clamp_count",
            component_count != 0 && canonical.clamp_count <= component_count,
            "no greater than two components per nonempty row",
        )?;
        let expected_clamp_rate =
            m0_count_as_f64(canonical.clamp_count) / m0_count_as_f64(component_count);
        exact(
            "variants.entries.clamp_rate",
            canonical.clamp_rate.to_bits() == expected_clamp_rate.to_bits(),
            "the measured clamp count divided by two components per row",
        )?;
        required_text(
            "variants.entries.quality_suite_version",
            &canonical.quality_suite_version,
        )?;
        exact(
            "variants.entries.quality_suite_version",
            canonical.quality_suite_version.trim() == canonical.quality_suite_version,
            "canonical text without surrounding whitespace",
        )?;
        fraction(
            "variants.entries.semantic_fidelity",
            canonical.semantic_fidelity,
        )?;
        fraction(
            "variants.entries.minimum_semantic_fidelity",
            canonical.minimum_semantic_fidelity,
        )?;
        exact(
            "variants.entries.semantic_fidelity",
            canonical.semantic_fidelity >= canonical.minimum_semantic_fidelity,
            "no less than the release-policy floor",
        )?;
        for (field, value) in [
            (
                "variants.entries.maximum_subgroup_degradation",
                canonical.maximum_subgroup_degradation,
            ),
            (
                "variants.entries.maximum_allowed_subgroup_degradation",
                canonical.maximum_allowed_subgroup_degradation,
            ),
        ] {
            nonnegative_finite(field, value)?;
        }
        exact(
            "variants.entries.maximum_allowed_subgroup_degradation",
            canonical.maximum_allowed_subgroup_degradation >= 1.0,
            "at least one",
        )?;
        exact(
            "variants.entries.maximum_subgroup_degradation",
            canonical.maximum_subgroup_degradation
                <= canonical.maximum_allowed_subgroup_degradation,
            "no greater than the release-policy ceiling",
        )?;
        let quality = ConditionQuality::new(
            canonical.projected_field_hash,
            canonical.semantic_fidelity_report_hash,
            canonical.subgroup_report_hash,
            canonical.semantic_fidelity,
            canonical.maximum_subgroup_degradation,
        );
        exact(
            "variants.entries.quality_report_hash",
            quality.content_hash() == canonical.quality_report_hash,
            "the canonical typed quality measurement",
        )?;
        let zero = ContentHash::from_bytes([0; 32]);
        exact(
            "variants.entries.relation_baseline_field_hash",
            canonical.relation_baseline_field_hash != zero,
            "a nonzero exact persisted-coordinate identity",
        )?;
        exact(
            "variants.entries.canonical_field_hash",
            canonical.canonical_field_hash != zero,
            "a nonzero exact persisted-coordinate identity",
        )?;
        exact(
            "variants.entries.projected_field_hash",
            canonical.projected_field_hash == canonical.canonical_field_hash,
            "the exact quantized field published to readers",
        )?;
        for (field, value) in [
            (
                "variants.entries.baseline_relation_loss",
                canonical.baseline_relation_loss,
            ),
            (
                "variants.entries.canonical_relation_loss",
                canonical.canonical_relation_loss,
            ),
            (
                "variants.entries.relation_loss_tolerance",
                canonical.relation_loss_tolerance,
            ),
            (
                "variants.entries.normalized_persistence",
                canonical.normalized_persistence,
            ),
        ] {
            finite(field, value)?;
            exact(field, value >= 0.0, "nonnegative")?;
        }
        exact(
            "variants.entries.canonical_relation_loss",
            canonical.canonical_relation_loss
                <= canonical.baseline_relation_loss + canonical.relation_loss_tolerance,
            "no greater than baseline plus the measured tolerance",
        )?;
        exact(
            "variants.entries.persistence_comparison",
            canonical.persistence_comparison.validate().is_ok()
                && canonical.persistence_comparison.candidate_field_hash
                    == canonical.canonical_field_hash
                && canonical.persistence_comparison.candidate_tree_hash
                    == canonical.merge_tree_hash
                && canonical
                    .persistence_comparison
                    .candidate_normalized_total
                    .to_bits()
                    == canonical.normalized_persistence.to_bits()
                && canonical.persistence_comparison.checkpoint_hash
                    == self.projector.checkpoint_hash
                && canonical.persistence_comparison.reference_source_hash
                    == self.landmarks.persistence_reference_source_hash,
            "a valid candidate/reference report bound to the canonical output",
        )?;
        for value in canonical
            .procrustes_transform
            .into_iter()
            .chain([canonical.global_relation_condition])
        {
            finite("variants.entries.transform", value)?;
        }
        let baseline_condition = canonical.global_relation_condition.to_bits() == 0.0_f64.to_bits();
        exact(
            "variants.entries.global_relation_condition",
            baseline_condition || canonical.global_relation_condition > 0.0,
            "exact positive zero or a positive finite condition",
        )?;
        exact(
            "variants.entries.procrustes_transform.baseline",
            !baseline_condition
                || canonical
                    .procrustes_transform
                    .into_iter()
                    .zip([1.0_f64, 1.0, 0.0, 0.0, 0.0])
                    .all(|(actual, expected)| actual.to_bits() == expected.to_bits()),
            "the identity transform for the unaligned zero-condition baseline",
        )?;
        exact(
            "variants.entries.procrustes_transform.scale",
            canonical.procrustes_transform[0] > 0.0,
            "strictly positive",
        )?;
        let rotation_norm = canonical.procrustes_transform[1].mul_add(
            canonical.procrustes_transform[1],
            canonical.procrustes_transform[2] * canonical.procrustes_transform[2],
        );
        exact(
            "variants.entries.procrustes_transform.rotation",
            (rotation_norm - 1.0).abs() <= 1.0e-9,
            "an orientation-preserving unit rotation",
        )?;
        Ok(())
    }

    fn validate_storage(&self) -> Result<(), ManifestError> {
        nonzero_hash(
            "storage.identity_directory_hash",
            self.storage.identity_directory_hash,
        )?;
        exact(
            "storage.row_count",
            self.storage.row_count > 0 && u32::try_from(self.storage.row_count).is_ok(),
            "representable by the selected u32 encoding",
        )?;
        exact(
            "storage.row_id_encoding",
            matches!(self.storage.row_id_encoding, super::RowIdEncoding::U32),
            "u32 for the initial generation",
        )?;
        exact(
            "storage.base_revision",
            self.storage.base_revision == BaseRevision::ZERO,
            "zero",
        )?;
        exact(
            "storage.initial_delta_revision",
            self.storage.initial_delta_revision == DeltaRevision::ZERO,
            "zero",
        )
    }

    fn validate_serving(&self) -> Result<(), ManifestError> {
        required_text(
            "serving.authorization_adapter_version",
            &self.serving.authorization_adapter_version,
        )?;
        required_text(
            "serving.gate_evidence_authority",
            &self.serving.gate_evidence_authority,
        )?;
        required_text("serving.style_version", &self.serving.style_version)?;
        required_text(
            "serving.canvas_companion_version",
            &self.serving.canvas_companion_version,
        )?;
        required_text(
            "serving.shader_contract_version",
            &self.serving.shader_contract_version,
        )?;
        for (field, value) in [
            (
                "serving.gate_evidence_public_key",
                self.serving.gate_evidence_public_key,
            ),
            (
                "serving.canvas_companion_sha256",
                self.serving.canvas_companion_sha256,
            ),
            (
                "serving.companion_compatibility_report_hash",
                self.serving.companion_compatibility_report_hash,
            ),
        ] {
            nonzero_hash(field, value)?;
        }
        exact(
            "serving.wire_versions",
            !self.serving.wire_versions.is_empty(),
            "non-empty",
        )?;
        let unique = self
            .serving
            .wire_versions
            .iter()
            .copied()
            .collect::<HashSet<_>>();
        exact(
            "serving.wire_versions",
            unique.len() == self.serving.wire_versions.len(),
            "unique",
        )
    }

    fn validate_reproducibility(&self) -> Result<(), ManifestError> {
        required_text(
            "reproducibility.code_revision",
            &self.reproducibility.code_revision,
        )?;
        nonzero_hash(
            "reproducibility.binary_fingerprint",
            self.reproducibility.binary_fingerprint,
        )?;
        validate_execution_contract(&self.reproducibility.execution_contract)?;
        nonzero_hash(
            "reproducibility.config_hash",
            self.reproducibility.config_hash,
        )?;
        let mut names = HashSet::with_capacity(self.reproducibility.seeds.len());
        for seed in &self.reproducibility.seeds {
            required_text("reproducibility.seeds.name", &seed.name)?;
            if !names.insert(seed.name.as_str()) {
                return Err(ManifestError::DuplicateSeed);
            }
        }
        Ok(())
    }
}

fn validate_execution_contract(execution: &ExecutionContractManifest) -> Result<(), ManifestError> {
    nonzero_hash(
        "reproducibility.execution_contract.dependency_lock_hash",
        execution.dependency_lock_hash,
    )?;
    for (field, value) in [
        (
            "reproducibility.execution_contract.generator_version",
            execution.generator_version.as_str(),
        ),
        (
            "reproducibility.execution_contract.rustc_release",
            execution.rustc_release.as_str(),
        ),
        (
            "reproducibility.execution_contract.rustc_commit",
            execution.rustc_commit.as_str(),
        ),
        (
            "reproducibility.execution_contract.rustc_host",
            execution.rustc_host.as_str(),
        ),
        (
            "reproducibility.execution_contract.target",
            execution.target.as_str(),
        ),
        (
            "reproducibility.execution_contract.profile",
            execution.profile.as_str(),
        ),
        (
            "reproducibility.execution_contract.optimization_level",
            execution.optimization_level.as_str(),
        ),
        (
            "reproducibility.execution_contract.debug",
            execution.debug.as_str(),
        ),
        (
            "reproducibility.execution_contract.training_backend",
            execution.training_backend.as_str(),
        ),
        (
            "reproducibility.execution_contract.operating_system",
            execution.operating_system.as_str(),
        ),
        (
            "reproducibility.execution_contract.math_runtime",
            execution.math_runtime.as_str(),
        ),
        (
            "reproducibility.execution_contract.runtime_cpu_features",
            execution.runtime_cpu_features.as_str(),
        ),
        (
            "reproducibility.execution_contract.floating_point_control",
            execution.floating_point_control.as_str(),
        ),
        (
            "reproducibility.execution_contract.math_library_images",
            execution.math_library_images.as_str(),
        ),
        (
            "reproducibility.execution_contract.candle_version",
            execution.candle_version.as_str(),
        ),
        (
            "reproducibility.execution_contract.gemm_version",
            execution.gemm_version.as_str(),
        ),
        (
            "reproducibility.execution_contract.gemm_kernel",
            execution.gemm_kernel.as_str(),
        ),
        (
            "reproducibility.execution_contract.gemm_cache_configuration",
            execution.gemm_cache_configuration.as_str(),
        ),
        (
            "reproducibility.execution_contract.salt_simd_mode",
            execution.salt_simd_mode.as_str(),
        ),
        (
            "reproducibility.execution_contract.usearch_version",
            execution.usearch_version.as_str(),
        ),
    ] {
        required_text(field, value)?;
    }
    exact(
        "reproducibility.execution_contract.version",
        execution.version == 3,
        "three",
    )?;
    exact(
        "reproducibility.execution_contract.rayon_threads",
        execution.rayon_threads > 0,
        "a positive observed thread count",
    )?;
    exact(
        "reproducibility.execution_contract.candle_cpu_threads",
        execution.candle_cpu_threads > 0,
        "a positive observed Candle thread count",
    )?;
    exact(
        "reproducibility.execution_contract.contract_hash",
        execution.contract_hash == execution.content_hash(),
        "the hash recomputed from every execution property",
    )
}

#[inline]
fn required_text(field: &'static str, value: &str) -> Result<(), ManifestError> {
    let value = value.trim();
    if value.is_empty() || value.eq_ignore_ascii_case("TBD") {
        Err(ManifestError::MissingText { field })
    } else {
        Ok(())
    }
}

#[inline]
const fn exact(
    field: &'static str,
    condition: bool,
    expected: &'static str,
) -> Result<(), ManifestError> {
    if condition {
        Ok(())
    } else {
        Err(ManifestError::InvalidInvariant { field, expected })
    }
}

#[inline]
fn nonzero_hash(field: &'static str, value: ContentHash) -> Result<(), ManifestError> {
    exact(
        field,
        value != ContentHash::from_bytes([0; 32]),
        "a nonzero content identity",
    )
}

#[inline]
const fn finite(field: &'static str, value: f64) -> Result<(), ManifestError> {
    if value.is_finite() {
        Ok(())
    } else {
        Err(ManifestError::InvalidFinite { field, value })
    }
}

#[inline]
fn positive_finite(field: &'static str, value: f64) -> Result<(), ManifestError> {
    finite(field, value)?;
    exact(field, value > 0.0, "strictly positive")
}

#[inline]
fn nonnegative_finite(field: &'static str, value: f64) -> Result<(), ManifestError> {
    finite(field, value)?;
    exact(field, !value.is_sign_negative(), "non-negative")
}

#[inline]
fn fraction(field: &'static str, value: f64) -> Result<(), ManifestError> {
    if value.is_finite() && !value.is_sign_negative() && value <= 1.0 {
        Ok(())
    } else {
        Err(ManifestError::InvalidFraction { field, value })
    }
}

#[inline]
#[expect(
    clippy::cast_precision_loss,
    reason = "M0 validates counts below 2^33, which f64 represents exactly"
)]
fn m0_count_as_f64(value: u64) -> f64 {
    debug_assert!(value <= 2 * u64::from(u32::MAX));
    value as f64
}

fn probability_vector(field: &'static str, probabilities: [f64; 3]) -> Result<(), ManifestError> {
    for probability in probabilities {
        fraction(field, probability)?;
    }
    exact(
        field,
        (probabilities.into_iter().sum::<f64>() - 1.0).abs() <= 1.0e-9,
        "a probability vector summing to one",
    )
}

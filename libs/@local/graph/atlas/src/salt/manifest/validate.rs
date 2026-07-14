use std::collections::HashSet;

use error_stack::{Report, ResultExt as _};

use super::{GenerationManifest, ManifestError};
use crate::salt::{
    card::CARD_FORMAT_VERSION,
    hash::ContentHash,
    projector::PROJECTOR_ARCHITECTURE_VERSION,
    representation::{CANONICAL_DIMENSIONS, PROJECTOR_DIMENSIONS},
    revision::{BaseRevision, DeltaRevision, MAX_PUBLISHED_VARIANTS, VariantId},
};

const SEMANTIC_NEIGHBORS: usize = 30;

impl GenerationManifest {
    /// Validates the complete immutable generation contract.
    ///
    /// Structural validation is deliberately stricter than Serde shape
    /// validation. It fixes the v1 representation sizes, graph neighborhood,
    /// FiLM conditioning, relation factorization, single canonical variant,
    /// initial base/delta revisions, and serving companion pins.
    ///
    /// # Errors
    ///
    /// This returns the first missing, non-finite, out-of-range, or
    /// contract-inconsistent field in canonical section order.
    pub(crate) fn validate(&self) -> Result<(), ManifestError> {
        self.validate_embedding()?;
        self.validate_semantic_graph()?;
        self.validate_landmarks()?;
        self.validate_projector()?;
        self.validate_relations()?;
        self.validate_variants()?;
        self.validate_storage()?;
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
        )
    }

    fn validate_semantic_graph(&self) -> Result<(), ManifestError> {
        required_text("semantic_graph.backend", &self.semantic_graph.backend)?;
        exact(
            "semantic_graph.neighbors",
            self.semantic_graph.neighbors == SEMANTIC_NEIGHBORS,
            "30",
        )?;
        fraction(
            "semantic_graph.recall_at_50",
            self.semantic_graph.recall_at_50,
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
        fraction(
            "landmarks.retained_fraction",
            self.landmarks.retained_fraction,
        )
    }

    fn validate_projector(&self) -> Result<(), ManifestError> {
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

    fn validate_relations(&self) -> Result<(), ManifestError> {
        let relations = &self.relations;
        for (field, value) in [
            (
                "relations.annotation_prompt_family_version",
                relations.annotation_prompt_family_version.as_str(),
            ),
            (
                "relations.annotation_vote_schedule",
                relations.annotation_vote_schedule.as_str(),
            ),
            (
                "relations.policy_precedence_version",
                relations.policy_precedence_version.as_str(),
            ),
            (
                "relations.classifier_version",
                relations.classifier_version.as_str(),
            ),
            (
                "relations.applicability_method_version",
                relations.applicability_method_version.as_str(),
            ),
        ] {
            required_text(field, value)?;
        }
        exact(
            "relations.relation_card_format_version",
            relations.relation_card_format_version == CARD_FORMAT_VERSION,
            "the current corpus format",
        )?;
        positive_finite(
            "relations.classifier_temperature",
            relations.classifier_temperature,
        )?;
        fraction(
            "relations.classifier_ood_edge_volume_fraction",
            relations.classifier_ood_edge_volume_fraction,
        )?;
        fraction(
            "relations.reviewed_edge_volume_fraction",
            relations.reviewed_edge_volume_fraction,
        )?;
        if let Some(prior) = relations.class_prior {
            probability_vector("relations.class_prior", prior)?;
        }
        self.validate_strength_head()?;
        self.validate_attraction_geometry()?;
        nonnegative_finite(
            "relations.attraction_force_pruning_threshold",
            relations.attraction_force_pruning_threshold,
        )?;
        self.validate_negative_admission()?;
        self.validate_coincident_gate()?;
        self.validate_typed_deconflict()?;
        exact(
            "relations.derived_strength_persisted_as_authority",
            !relations.derived_strength_persisted_as_authority,
            "false",
        )
    }

    fn validate_strength_head(&self) -> Result<(), ManifestError> {
        let strength = &self.relations.strength_head;
        exact(
            "relations.strength_head.eligibility_threshold_proximal",
            strength.eligibility_threshold_proximal == 0.2,
            "0.2",
        )?;
        exact(
            "relations.strength_head.zeta",
            strength.zeta == [0.5, 1.0, 2.0],
            "[0.5, 1.0, 2.0]",
        )
    }

    fn validate_attraction_geometry(&self) -> Result<(), ManifestError> {
        let coefficients = self.relations.attraction_geometry_coefficients;
        nonnegative_finite(
            "relations.attraction_geometry_coefficients.coincident",
            coefficients.coincident,
        )?;
        exact(
            "relations.attraction_geometry_coefficients.proximal",
            coefficients.proximal == 1.0,
            "1.0",
        )?;
        exact(
            "relations.attraction_geometry_coefficients.overlay",
            coefficients.overlay == 0.0,
            "0.0",
        )
    }

    fn validate_negative_admission(&self) -> Result<(), ManifestError> {
        let admission = &self.relations.negative_admission;
        let coefficients = admission.protection_coefficients;
        exact(
            "relations.negative_admission.protection_coefficients",
            coefficients.coincident == 1.0
                && coefficients.proximal == 1.0
                && coefficients.overlay == 0.0,
            "[1.0, 1.0, 0.0]",
        )?;
        let applicability = admission.protection_applicability;
        fraction(
            "relations.negative_admission.hard_negative_floor",
            applicability.hard_negative_floor,
        )?;
        fraction(
            "relations.negative_admission.ordinary_negative_floor",
            applicability.ordinary_negative_floor,
        )?;
        exact(
            "relations.negative_admission.protection_applicability.ordering_validated",
            applicability.ordering_validated
                && applicability.ordinary_negative_floor <= applicability.hard_negative_floor,
            "true with ordinary floor no greater than hard floor",
        )?;
        exact(
            "relations.negative_admission.protection_applicability.\
             attraction_applicability_unchanged",
            applicability.attraction_applicability_unchanged,
            "true",
        )?;
        fraction(
            "relations.negative_admission.hard_negative_protection_threshold",
            admission.hard_negative_protection_threshold,
        )?;
        fraction(
            "relations.negative_admission.ordinary_negative_protection_threshold",
            admission.ordinary_negative_protection_threshold,
        )?;
        exact(
            "relations.negative_admission.protection_thresholds",
            admission.hard_negative_protection_threshold
                <= admission.ordinary_negative_protection_threshold,
            "hard threshold no greater than ordinary threshold",
        )
    }

    fn validate_coincident_gate(&self) -> Result<(), ManifestError> {
        let gate = self.relations.coincident_gate;
        fraction(
            "relations.coincident_gate.class_probability_threshold",
            gate.class_probability_threshold,
        )?;
        fraction(
            "relations.coincident_gate.applicability_threshold",
            gate.applicability_threshold,
        )?;
        fraction(
            "relations.coincident_gate.precision_lcb_threshold",
            gate.precision_lcb_threshold,
        )?;
        if !gate.enabled {
            exact(
                "relations.attraction_geometry_coefficients.coincident",
                self.relations.attraction_geometry_coefficients.coincident == 0.0,
                "zero while the Coincident gate is disabled",
            )?;
        }
        Ok(())
    }

    fn validate_typed_deconflict(&self) -> Result<(), ManifestError> {
        let deconflict = self.relations.typed_deconflict;
        exact(
            "relations.typed_deconflict.enabled",
            !deconflict.enabled,
            "false for v1",
        )?;
        exact(
            "relations.typed_deconflict.classifier_class_schema",
            matches!(
                deconflict.classifier_class_schema,
                super::ClassifierClassSchema::Cpo
            ),
            "CPO while typed Deconflict is disabled",
        )?;
        exact(
            "relations.typed_deconflict.geometry_coefficient",
            deconflict.geometry_coefficient == 0.0,
            "0.0 while disabled",
        )?;
        for (field, value) in [
            (
                "relations.typed_deconflict.admission_threshold",
                deconflict.admission_threshold,
            ),
            (
                "relations.typed_deconflict.signed_margin_threshold",
                deconflict.signed_margin_threshold,
            ),
            (
                "relations.typed_deconflict.normalized_minimum_radius",
                deconflict.normalized_minimum_radius,
            ),
        ] {
            nonnegative_finite(field, value)?;
        }
        exact(
            "relations.typed_deconflict.exclude_from_generic_negatives",
            deconflict.exclude_from_generic_negatives,
            "true",
        )
    }

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
        for value in canonical
            .procrustes_transform
            .into_iter()
            .chain([canonical.global_relation_condition])
        {
            finite("variants.entries.transform", value)?;
        }
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
        exact(
            "storage.row_count",
            self.storage.row_count > 0 && self.storage.row_count <= u64::from(u32::MAX),
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
        required_text("serving.style_version", &self.serving.style_version)?;
        required_text(
            "serving.canvas_companion_version",
            &self.serving.canvas_companion_version,
        )?;
        required_text(
            "serving.shader_contract_version",
            &self.serving.shader_contract_version,
        )?;
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

#[inline]
fn required_text(field: &'static str, value: &str) -> Result<(), ManifestError> {
    if value.trim().is_empty() || value.eq_ignore_ascii_case("TBD") {
        Err(ManifestError::MissingText { field })
    } else {
        Ok(())
    }
}

#[inline]
fn exact(
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
fn finite(field: &'static str, value: f64) -> Result<(), ManifestError> {
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
    exact(field, value >= 0.0, "non-negative")
}

#[inline]
fn fraction(field: &'static str, value: f64) -> Result<(), ManifestError> {
    if value.is_finite() && (0.0..=1.0).contains(&value) {
        Ok(())
    } else {
        Err(ManifestError::InvalidFraction { field, value })
    }
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

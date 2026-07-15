//! Cross-field invariants for relation-policy provenance.
//!
//! Attraction and no-repel protection are separate channels: changing an
//! attraction coefficient must not alter which pairs are protected from
//! generic negative sampling. The manifest therefore fixes both coefficient
//! vectors, applicability-floor ordering, threshold ordering, and the staged
//! status of signed geometry as one indivisible contract.

#![expect(
    clippy::float_cmp,
    reason = "manifest contract constants require exact IEEE-754 representations"
)]

use super::{
    exact, fraction, nonnegative_finite, nonzero_hash, positive_finite, probability_vector,
    required_text,
};
use crate::salt::{
    card::CARD_FORMAT_VERSION,
    manifest::{ClassifierClassSchema, GenerationManifest, ManifestError},
};

impl GenerationManifest {
    #[expect(
        clippy::too_many_lines,
        reason = "relation manifest validation keeps the complete cross-field contract visible"
    )]
    pub(super) fn validate_relations(&self) -> Result<(), ManifestError> {
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
        for (field, value) in [
            (
                "relations.security_allow_list_hash",
                relations.security_allow_list_hash,
            ),
            (
                "relations.security_geometry_hash",
                relations.security_geometry_hash,
            ),
            ("relations.edge_snapshot_hash", relations.edge_snapshot_hash),
            (
                "relations.relation_card_corpus_hash",
                relations.relation_card_corpus_hash,
            ),
            (
                "relations.annotation_corpus_hash",
                relations.annotation_corpus_hash,
            ),
            (
                "relations.reviewed_holdout_hash",
                relations.reviewed_holdout_hash,
            ),
            ("relations.policy_input_hash", relations.policy_input_hash),
            ("relations.policy_hash", relations.policy_hash),
            (
                "relations.policy_evaluation_report_hash",
                relations.policy_evaluation_report_hash,
            ),
            (
                "relations.authorization_noninterference_report_hash",
                relations.authorization_noninterference_report_hash,
            ),
            (
                "relations.classifier_model_hash",
                relations.classifier_model_hash,
            ),
            (
                "relations.applicability_config_hash",
                relations.applicability_config_hash,
            ),
        ] {
            nonzero_hash(field, value)?;
        }
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
            "relations.strength_head.enabled",
            !strength.enabled,
            "false for the initial release profile",
        )?;
        exact(
            "relations.strength_head.materialized_h_table_hash",
            strength.materialized_table_hash.is_none(),
            "absent while the initial release uses unit strength",
        )?;
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
        exact(
            "relations.coincident_gate.enabled",
            !gate.enabled,
            "false for the initial release profile",
        )?;
        exact(
            "relations.attraction_geometry_coefficients.coincident",
            self.relations.attraction_geometry_coefficients.coincident == 0.0,
            "zero for the initial release profile",
        )
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
                ClassifierClassSchema::Cpo
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
}

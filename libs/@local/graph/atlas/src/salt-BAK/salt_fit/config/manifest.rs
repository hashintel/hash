//! Validation for externally governed manifest claims.

use super::{FitConfigurationError, decode_hex_32};
use crate::salt_fit::FitManifestContractV1;

pub(super) fn validate_manifest_contract(
    contract: &FitManifestContractV1,
) -> Result<(), FitConfigurationError> {
    validate_text(contract)?;
    validate_hashes(contract)?;
    validate_probabilities(contract)?;
    validate_wire_versions(contract)
}

fn validate_text(contract: &FitManifestContractV1) -> Result<(), FitConfigurationError> {
    for (field, value) in [
        (
            "manifest.embedding.model",
            contract.embedding.model.as_str(),
        ),
        (
            "manifest.relations.annotationPromptFamilyVersion",
            contract.relations.annotation_prompt_family_version.as_str(),
        ),
        (
            "manifest.relations.annotationVoteSchedule",
            contract.relations.annotation_vote_schedule.as_str(),
        ),
        (
            "manifest.relations.policyPrecedenceVersion",
            contract.relations.policy_precedence_version.as_str(),
        ),
        (
            "manifest.relations.classifierVersion",
            contract.relations.classifier_version.as_str(),
        ),
        (
            "manifest.relations.applicabilityMethodVersion",
            contract.relations.applicability_method_version.as_str(),
        ),
        (
            "manifest.serving.authorizationAdapterVersion",
            contract.serving.authorization_adapter_version.as_str(),
        ),
        (
            "manifest.serving.styleVersion",
            contract.serving.style_version.as_str(),
        ),
        (
            "manifest.serving.canvasCompanionVersion",
            contract.serving.canvas_companion_version.as_str(),
        ),
        (
            "manifest.serving.shaderContractVersion",
            contract.serving.shader_contract_version.as_str(),
        ),
    ] {
        if value.is_empty() || value.trim() != value || value.eq_ignore_ascii_case("TBD") {
            return Err(FitConfigurationError::Invalid {
                field,
                reason: "manifest contract text must be non-placeholder canonical text",
            });
        }
    }
    Ok(())
}

fn validate_hashes(contract: &FitManifestContractV1) -> Result<(), FitConfigurationError> {
    for (field, value) in [
        (
            "manifest.embedding.producerContractHash",
            contract.embedding.producer_contract_hash.as_str(),
        ),
        (
            "manifest.relations.relationCardCorpusHash",
            contract.relations.relation_card_corpus_hash.as_str(),
        ),
        (
            "manifest.relations.annotationCorpusHash",
            contract.relations.annotation_corpus_hash.as_str(),
        ),
        (
            "manifest.relations.reviewedHoldoutHash",
            contract.relations.reviewed_holdout_hash.as_str(),
        ),
        (
            "manifest.relations.applicabilityConfigHash",
            contract.relations.applicability_config_hash.as_str(),
        ),
    ] {
        match decode_hex_32(value) {
            Some(bytes) if bytes != [0; 32] => {}
            Some(_) | None => {
                return Err(FitConfigurationError::Invalid {
                    field,
                    reason: "must contain a nonzero lowercase SHA-256 identity",
                });
            }
        }
    }
    Ok(())
}

fn validate_probabilities(contract: &FitManifestContractV1) -> Result<(), FitConfigurationError> {
    for (field, value) in [
        (
            "manifest.relations.classifierOodEdgeVolumeFraction",
            contract.relations.classifier_ood_edge_volume_fraction,
        ),
        (
            "manifest.relations.reviewedEdgeVolumeFraction",
            contract.relations.reviewed_edge_volume_fraction,
        ),
    ] {
        if !value.is_finite() || !(0.0..=1.0).contains(&value) {
            return Err(FitConfigurationError::Invalid {
                field,
                reason: "manifest fractions must be finite probabilities",
            });
        }
    }
    if let Some(prior) = contract.relations.class_prior {
        let sum = prior.iter().sum::<f64>();
        if prior.iter().any(|value| !value.is_finite() || *value < 0.0)
            || (sum - 1.0).abs() > 1.0e-12
        {
            return Err(FitConfigurationError::Invalid {
                field: "manifest.relations.classPrior",
                reason: "class prior must be a finite probability vector summing to one",
            });
        }
    }
    Ok(())
}

fn validate_wire_versions(contract: &FitManifestContractV1) -> Result<(), FitConfigurationError> {
    let versions = &contract.serving.wire_versions;
    if versions.is_empty()
        || versions.len() > 16
        || versions.contains(&0)
        || !versions.is_sorted_by(|left, right| left < right)
    {
        return Err(FitConfigurationError::Invalid {
            field: "manifest.serving.wireVersions",
            reason: "wire versions must be nonzero, sorted, unique, and contain at most 16 values",
        });
    }
    Ok(())
}

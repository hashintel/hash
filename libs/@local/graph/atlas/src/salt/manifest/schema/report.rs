//! Validation shared by persisted external gate reports.

use serde::Deserialize;

use crate::salt::manifest::{ArtifactRole, GenerationAssuranceMode, GenerationManifest};

const MAXIMUM_GATE_REPORT_BYTES: usize = 16 * 1_024 * 1_024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportEnvelope {
    schema_version: u32,
    suite_version: String,
    outcome: String,
    subjects: serde_json::Map<String, serde_json::Value>,
    attesting: Option<bool>,
}

pub(super) fn validate(
    role: ArtifactRole,
    bytes: &[u8],
    manifest: &GenerationManifest,
) -> Result<(), &'static str> {
    if bytes.is_empty() || bytes.len() > MAXIMUM_GATE_REPORT_BYTES {
        return Err("gate report size is outside the supported envelope");
    }
    let report: ReportEnvelope = serde_json::from_slice(bytes)
        .map_err(|_error| "gate report does not match its JSON schema")?;
    let expected_outcome = match (manifest.assurance_mode, role) {
        (
            GenerationAssuranceMode::EvidenceDeferredLocal,
            ArtifactRole::RepresentationReport
            | ArtifactRole::SemanticFidelityReport
            | ArtifactRole::SubgroupBehaviorReport,
        ) => {
            (report.outcome == "deferred" && report.attesting == Some(false))
                || (report.outcome == "pass" && report.attesting != Some(false))
        }
        _ => report.outcome == "pass",
    };
    if report.schema_version != 1
        || !expected_outcome
        || report.subjects.is_empty()
        || report.suite_version != expected_suite(role, manifest)?
    {
        return Err("gate report envelope differs from the manifest contract");
    }
    Ok(())
}

fn expected_suite(role: ArtifactRole, manifest: &GenerationManifest) -> Result<&str, &'static str> {
    match role {
        ArtifactRole::RepresentationReport => {
            Ok(&manifest.embedding.representation_audit.suite_version)
        }
        ArtifactRole::SemanticFidelityReport | ArtifactRole::SubgroupBehaviorReport => {
            Ok(&canonical_variant(manifest)?.quality_suite_version)
        }
        ArtifactRole::RelationPolicyReport => Ok(&manifest.relations.policy_precedence_version),
        ArtifactRole::MergeTreePersistenceReport => Ok(&canonical_variant(manifest)?
            .persistence_comparison
            .suite_version),
        ArtifactRole::AuthorizationNoninterferenceReport | ArtifactRole::SecurityApprovalReport => {
            Ok(&manifest.serving.authorization_adapter_version)
        }
        ArtifactRole::CompanionPinReport => Ok(&manifest.serving.canvas_companion_version),
        _ => Err("non-report artifact was routed through the report validator"),
    }
}

fn canonical_variant(
    manifest: &GenerationManifest,
) -> Result<&crate::salt::manifest::VariantEntryManifest, &'static str> {
    manifest
        .variants
        .entries
        .iter()
        .find(|variant| variant.id == manifest.variants.canonical_variant)
        .ok_or("canonical variant is missing while validating gate reports")
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::salt::manifest::fixture_manifest;

    #[test]
    fn deferred_quality_reports_require_an_explicit_non_attesting_outcome() {
        let mut manifest = fixture_manifest();
        manifest.assurance_mode = GenerationAssuranceMode::EvidenceDeferredLocal;
        let suite = &manifest.embedding.representation_audit.suite_version;
        let report = serde_json::to_vec(&json!({
            "schemaVersion": 1,
            "suiteVersion": suite,
            "outcome": "deferred",
            "attesting": false,
            "subjects": {"fixture": "fixture-subject"}
        }))
        .expect("report should serialize");

        validate(ArtifactRole::RepresentationReport, &report, &manifest)
            .expect("explicitly deferred representation report should validate");

        let semantic_suite = &manifest
            .variants
            .entries
            .iter()
            .find(|variant| variant.id == manifest.variants.canonical_variant)
            .expect("canonical variant should exist")
            .quality_suite_version;
        let semantic_report = serde_json::to_vec(&json!({
            "schemaVersion": 1,
            "suiteVersion": semantic_suite,
            "outcome": "deferred",
            "attesting": false,
            "subjects": {"projectedField": "fixture-subject"}
        }))
        .expect("report should serialize");
        validate(
            ArtifactRole::SemanticFidelityReport,
            &semantic_report,
            &manifest,
        )
        .expect("explicitly deferred semantic report should validate");

        let mut falsely_attesting: serde_json::Value =
            serde_json::from_slice(&report).expect("report should decode");
        falsely_attesting["attesting"] = json!(true);
        let falsely_attesting =
            serde_json::to_vec(&falsely_attesting).expect("report should serialize");
        assert!(
            validate(
                ArtifactRole::RepresentationReport,
                &falsely_attesting,
                &manifest
            )
            .is_err()
        );
    }
}

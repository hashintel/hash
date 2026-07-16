//! Validation shared by persisted external gate reports.

use serde::Deserialize;

use crate::salt::manifest::{ArtifactRole, GenerationManifest};

const MAXIMUM_GATE_REPORT_BYTES: usize = 16 * 1_024 * 1_024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportEnvelope {
    schema_version: u32,
    suite_version: String,
    outcome: String,
    subjects: serde_json::Map<String, serde_json::Value>,
}

pub(super) fn validate(
    role: ArtifactRole,
    bytes: &[u8],
    manifest: &GenerationManifest,
) -> Result<(), &'static str> {
    if bytes.is_empty() || bytes.len() > MAXIMUM_GATE_REPORT_BYTES {
        return Err("gate report size is outside the supported envelope");
    }
    let report: ReportEnvelope =
        serde_json::from_slice(bytes).map_err(|_error| "gate report is not valid JSON")?;
    if report.schema_version != 1
        || report.outcome != "pass"
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

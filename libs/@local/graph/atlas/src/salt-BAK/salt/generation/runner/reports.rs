//! Exact report artifacts consumed by independent release authorities.

use camino::Utf8Path;
use serde::Serialize;

use super::{CanonicalGenerationError, FrozenGenerationInput};
use crate::salt::{
    evaluation::QuantizedCanonicalField,
    generation::{
        GenerationError, LegacyExportFile, PersistedConditionQuality, PersistenceComparisonReport,
        publish_opaque_file,
    },
    hash::ContentHash,
};

pub(super) const REPRESENTATION_REPORT_FILE: &str = "representation-report.json";
pub(super) const SEMANTIC_REPORT_FILE: &str = "semantic-fidelity-report.json";
pub(super) const RELATION_POLICY_REPORT_FILE: &str = "relation-policy-report.json";
pub(super) const PERSISTENCE_REPORT_FILE: &str = "merge-tree-persistence-report.json";
pub(super) const SUBGROUP_REPORT_FILE: &str = "subgroup-behavior-report.json";
pub(super) const AUTHORIZATION_REPORT_FILE: &str = "authorization-noninterference-report.json";
pub(super) const SECURITY_REPORT_FILE: &str = "security-approval-report.json";
pub(super) const COMPANION_REPORT_FILE: &str = "companion-pin-report.json";

pub(super) struct PublishedGateReports {
    pub representation: LegacyExportFile,
    pub semantic_fidelity: LegacyExportFile,
    pub relation_policy: LegacyExportFile,
    pub merge_tree_persistence: LegacyExportFile,
    pub subgroup_behavior: LegacyExportFile,
    pub authorization_noninterference: LegacyExportFile,
    pub security_approval: LegacyExportFile,
    pub companion_pin: LegacyExportFile,
}

pub(super) fn publish_gate_reports(
    directory: &Utf8Path,
    input: &FrozenGenerationInput,
    canonical: &QuantizedCanonicalField,
    quality: &PersistedConditionQuality,
    persistence: &PersistenceComparisonReport,
) -> Result<PublishedGateReports, CanonicalGenerationError> {
    let measurement = quality.measurement();
    if measurement.projected_field() != canonical.content_hash() {
        return Err(CanonicalGenerationError::GateReport {
            gate: "condition-quality",
            reason: "persisted reports name a different canonical field",
        });
    }
    let persistence_document = report(
        &persistence.suite_version,
        PersistenceSubjects {
            checkpoint: persistence.checkpoint_hash,
            candidate_tree: persistence.candidate_tree_hash,
            reference_tree: persistence.reference_tree_hash,
            report_identity: persistence.content_hash(),
        },
        persistence,
    )
    .map_err(GenerationError::from)?;

    Ok(PublishedGateReports {
        representation: publish_opaque_file(
            &directory.join(REPRESENTATION_REPORT_FILE),
            &input.external_gate_reports.representation,
        )?,
        semantic_fidelity: publish_opaque_file(
            &directory.join(SEMANTIC_REPORT_FILE),
            quality.semantic_fidelity_report(),
        )?,
        relation_policy: publish_opaque_file(
            &directory.join(RELATION_POLICY_REPORT_FILE),
            &input.external_gate_reports.relation_policy,
        )?,
        merge_tree_persistence: publish_opaque_file(
            &directory.join(PERSISTENCE_REPORT_FILE),
            &persistence_document,
        )?,
        subgroup_behavior: publish_opaque_file(
            &directory.join(SUBGROUP_REPORT_FILE),
            quality.subgroup_report(),
        )?,
        authorization_noninterference: publish_opaque_file(
            &directory.join(AUTHORIZATION_REPORT_FILE),
            &input.external_gate_reports.authorization_noninterference,
        )?,
        security_approval: publish_opaque_file(
            &directory.join(SECURITY_REPORT_FILE),
            &input.external_gate_reports.security_approval,
        )?,
        companion_pin: publish_opaque_file(
            &directory.join(COMPANION_REPORT_FILE),
            &input.external_gate_reports.companion_pin,
        )?,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReportEnvelope<'suite, Subjects, Measurements> {
    schema_version: u32,
    suite_version: &'suite str,
    outcome: &'static str,
    subjects: Subjects,
    measurements: Measurements,
}

fn report<Subjects, Measurements>(
    suite_version: &str,
    subjects: Subjects,
    measurements: Measurements,
) -> Result<Vec<u8>, serde_json::Error>
where
    Subjects: Serialize,
    Measurements: Serialize,
{
    serde_json::to_vec(&ReportEnvelope {
        schema_version: 1,
        suite_version,
        outcome: "pass",
        subjects,
        measurements,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PersistenceSubjects {
    checkpoint: ContentHash,
    candidate_tree: ContentHash,
    reference_tree: ContentHash,
    report_identity: ContentHash,
}

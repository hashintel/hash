//! Deterministic non-attesting placeholders for the deferred assurance envelope.

use std::collections::BTreeMap;

use serde::Serialize;

use crate::salt::{ContentHash, salt_fit_boundary::GenerationManifest};

const MOCK_VERSION: &str = "mock-non-attesting-v1";
const MOCK_WARNING: &str =
    "placeholder only; this document provides no provenance, review, approval, or attestation";
const MOCK_COMPANION: &[u8] =
    b"HASH SALT mock non-attesting companion v1\nnot a deployable client artifact\n";

/// Generated placeholders used only to satisfy fields in the current manifest envelope.
pub(super) struct DeferredMockInputs {
    pub relation_report: Vec<u8>,
    pub security_report: Vec<u8>,
    pub companion: ContentHash,
    pub companion_report: Vec<u8>,
}

/// Replaces the five unavailable provenance identities with domain-separated mock identities.
pub(super) fn apply_mock_manifest_claims(manifest: &mut GenerationManifest) {
    manifest.embedding.producer_contract_hash = mock_identity(b"embedding-producer-contract");
    manifest.relations.relation_card_corpus_hash = mock_identity(b"relation-card-corpus");
    manifest.relations.annotation_corpus_hash = mock_identity(b"classifier-annotation-corpus");
    manifest.relations.reviewed_holdout_hash = mock_identity(b"classifier-reviewed-holdout");
    manifest.relations.applicability_config_hash =
        mock_identity(b"classifier-applicability-configuration");

    MOCK_VERSION.clone_into(&mut manifest.relations.annotation_prompt_family_version);
    MOCK_VERSION.clone_into(&mut manifest.relations.annotation_vote_schedule);
    MOCK_VERSION.clone_into(&mut manifest.relations.applicability_method_version);
    manifest.relations.class_prior = None;
    manifest.relations.classifier_ood_edge_volume_fraction = 0.0;
    manifest.relations.reviewed_edge_volume_fraction = 0.0;
    MOCK_VERSION.clone_into(&mut manifest.serving.canvas_companion_version);
}

/// Generates plainly marked mock reports and companion identity from real model bindings.
pub(super) fn generate_mock_inputs(
    manifest: &GenerationManifest,
    classifier_hash: &str,
    policy_hash: &str,
) -> Result<DeferredMockInputs, serde_json::Error> {
    let companion = ContentHash::digest(MOCK_COMPANION);
    let companion_hash = companion.to_string();
    Ok(DeferredMockInputs {
        relation_report: report(
            &manifest.relations.policy_precedence_version,
            [
                ("classifier", classifier_hash),
                ("relationPolicyInputs", policy_hash),
            ],
        )?,
        security_report: report(
            &manifest.serving.authorization_adapter_version,
            [
                ("classifier", classifier_hash),
                ("relationPolicyInputs", policy_hash),
            ],
        )?,
        companion,
        companion_report: report(
            &manifest.serving.canvas_companion_version,
            [("companion", companion_hash.as_str())],
        )?,
    })
}

fn mock_identity(subject: &'static [u8]) -> ContentHash {
    let mut bytes = b"hash.graph.atlas.salt.mock-non-attesting.v1:".to_vec();
    bytes.extend_from_slice(subject);
    ContentHash::digest(&bytes)
}

fn report<const N: usize>(
    suite_version: &str,
    subjects: [(&str, &str); N],
) -> Result<Vec<u8>, serde_json::Error> {
    serde_json::to_vec(&MockReportV1 {
        schema_version: 1,
        suite_version,
        outcome: "pass",
        subjects: subjects
            .into_iter()
            .map(|(name, identity)| (name.to_owned(), identity.to_owned()))
            .collect(),
        attestation: "mock_non_attesting",
        warning: MOCK_WARNING,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MockReportV1<'a> {
    schema_version: u32,
    suite_version: &'a str,
    outcome: &'static str,
    subjects: BTreeMap<String, String>,
    attestation: &'static str,
    warning: &'static str,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::salt::ContentHash;

    #[test]
    fn mock_identities_are_nonzero_distinct_and_stable() {
        let identities = [
            mock_identity(b"embedding-producer-contract"),
            mock_identity(b"relation-card-corpus"),
            mock_identity(b"classifier-annotation-corpus"),
            mock_identity(b"classifier-reviewed-holdout"),
            mock_identity(b"classifier-applicability-configuration"),
        ];
        assert!(identities.iter().all(|identity| {
            *identity != ContentHash::from_bytes([0; 32])
                && identities
                    .iter()
                    .filter(|candidate| *candidate == identity)
                    .count()
                    == 1
        }));
        assert_eq!(
            mock_identity(b"relation-card-corpus"),
            mock_identity(b"relation-card-corpus")
        );
    }

    #[test]
    fn mock_report_is_plainly_non_attesting() {
        let bytes =
            report("suite-v1", [("subject", "identity")]).expect("mock report should serialize");
        let document: serde_json::Value =
            serde_json::from_slice(&bytes).expect("mock report should be JSON");
        assert_eq!(document["attestation"], "mock_non_attesting");
        assert!(
            document["warning"]
                .as_str()
                .is_some_and(|warning| warning.contains("no provenance"))
        );
    }
}

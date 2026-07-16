use crate::salt::{
    graph::audit::RecallAudit,
    manifest::{ArtifactRole, GenerationManifest},
    release::{
        ExternalGateGrant, ExternalGateGrantIssuer, ExternalGateVerifierSet, GateEvidence,
        GateEvidenceError, GateEvidencePayload, GateEvidenceSet, GateId, GateSigner, ReleaseHead,
        TrustedExternalGateAuthority, reproducibility_output_hash,
    },
    revision::DataRevision,
};

#[must_use]
pub(crate) fn signer() -> GateSigner {
    GateSigner::new("test-release-authority", [0x5A; 32])
        .expect("fixed test authority should validate")
}

pub(crate) fn configure_authority(manifest: &mut GenerationManifest) {
    let verifier = signer().verifier();
    manifest.serving.gate_evidence_authority = verifier.authority().to_owned();
    manifest.serving.gate_evidence_public_key = verifier.public_key();
}

pub(crate) fn passing_evidence(manifest: &GenerationManifest) -> GateEvidenceSet {
    let signer = signer();
    let verifier = signer.verifier();
    let head = ReleaseHead {
        generation: manifest.generation_id,
        data: DataRevision::new(
            manifest.storage.base_revision,
            manifest.storage.initial_delta_revision,
        ),
        manifest: manifest
            .content_hash()
            .expect("test manifest should validate"),
    };
    let mut payloads = passing_payloads_without_ann(manifest);
    payloads.push(GateEvidencePayload::ann_recall(recall_audit(manifest)));
    let documents = payloads
        .into_iter()
        .map(|payload| {
            GateEvidence::sign(head, payload, &signer).expect("test gate evidence should serialize")
        })
        .collect();
    GateEvidenceSet::new(head, manifest, &verifier, &external_verifiers(), documents)
        .expect("complete test evidence should verify")
}

#[must_use]
pub(crate) fn recall_audit(manifest: &GenerationManifest) -> RecallAudit {
    RecallAudit {
        backend: manifest.semantic_graph.backend_hash,
        sample: manifest.semantic_graph.exact_audit_sample_hash,
        sample_rows: manifest.semantic_graph.exact_audit_sample_rows,
        neighbors_per_row: manifest.semantic_graph.exact_audit_neighbors,
        matched: manifest.semantic_graph.exact_audit_matched,
        expected: manifest.semantic_graph.exact_audit_expected,
        recall: manifest.semantic_graph.recall_at_50,
    }
}

pub(crate) fn passing_payloads_without_ann(
    manifest: &GenerationManifest,
) -> Vec<GateEvidencePayload> {
    let head = release_head(manifest);
    let canonical = manifest
        .variants
        .entries
        .iter()
        .find(|variant| variant.id == manifest.variants.canonical_variant)
        .expect("fixture manifest should contain its canonical variant");
    let attested = |gate: GateId| {
        let (suite_version, role) = match gate {
            GateId::Representation => (
                manifest
                    .embedding
                    .representation_audit
                    .suite_version
                    .as_str(),
                ArtifactRole::RepresentationReport,
            ),
            GateId::SemanticFidelity => (
                canonical.quality_suite_version.as_str(),
                ArtifactRole::SemanticFidelityReport,
            ),
            GateId::SubgroupBehavior => (
                canonical.quality_suite_version.as_str(),
                ArtifactRole::SubgroupBehaviorReport,
            ),
            GateId::MergeTreePersistence => (
                canonical.persistence_comparison.suite_version.as_str(),
                ArtifactRole::MergeTreePersistenceReport,
            ),
            GateId::RelationPolicy => (
                manifest.relations.policy_precedence_version.as_str(),
                ArtifactRole::RelationPolicyReport,
            ),
            GateId::AuthorizationNoninterference => (
                manifest.serving.authorization_adapter_version.as_str(),
                ArtifactRole::AuthorizationNoninterferenceReport,
            ),
            GateId::SecurityApproval => (
                manifest.serving.authorization_adapter_version.as_str(),
                ArtifactRole::SecurityApprovalReport,
            ),
            GateId::CompanionPin => (
                manifest.serving.canvas_companion_version.as_str(),
                ArtifactRole::CompanionPinReport,
            ),
            GateId::AnnRecall
            | GateId::RelationSatisfaction
            | GateId::TemporalDrift
            | GateId::SnapshotConsistency
            | GateId::Reproducibility => unreachable!("runner-owned gate cannot be attested"),
        };
        let report = manifest
            .artifacts
            .iter()
            .find(|artifact| artifact.role == role)
            .expect("fixture manifest should contain every report artifact")
            .content_hash;
        ExternalGateGrant::sign(head, gate, suite_version, report, &external_signer(gate))
            .expect("test suite version should validate")
    };
    vec![
        GateEvidencePayload::Representation(attested(GateId::Representation)),
        GateEvidencePayload::SemanticFidelity(attested(GateId::SemanticFidelity)),
        GateEvidencePayload::RelationPolicy(attested(GateId::RelationPolicy)),
        GateEvidencePayload::relation_satisfaction(
            canonical.selection_evidence_hash,
            canonical.relation_baseline_field_hash,
            canonical.canonical_field_hash,
            canonical.baseline_relation_loss,
            canonical.canonical_relation_loss,
            canonical.relation_loss_tolerance,
        ),
        GateEvidencePayload::merge_tree_persistence(
            &canonical.persistence_comparison,
            attested(GateId::MergeTreePersistence),
        ),
        GateEvidencePayload::SubgroupBehavior(attested(GateId::SubgroupBehavior)),
        GateEvidencePayload::AuthorizationNoninterference(attested(
            GateId::AuthorizationNoninterference,
        )),
        GateEvidencePayload::snapshot_consistency(
            manifest.input_snapshot.frozen_input_hash,
            manifest.input_snapshot.store_snapshot_identity,
            manifest.input_snapshot.extraction_receipt_hash,
            manifest.relations.security_geometry_hash,
            manifest.storage.identity_directory_hash,
            manifest.storage.row_count,
        ),
        GateEvidencePayload::reproducibility(
            manifest.reproducibility.config_hash,
            reproducibility_output_hash(manifest),
            reproducibility_output_hash(manifest),
            manifest.artifacts.len(),
        ),
        GateEvidencePayload::SecurityApproval(attested(GateId::SecurityApproval)),
        GateEvidencePayload::CompanionPin(attested(GateId::CompanionPin)),
    ]
}

#[derive(Debug)]
pub(crate) struct TestExternalGateGrantIssuer;

impl TestExternalGateGrantIssuer {
    #[must_use]
    pub(crate) fn new() -> Self {
        Self
    }
}

impl ExternalGateGrantIssuer for TestExternalGateGrantIssuer {
    fn issue(
        &self,
        head: ReleaseHead,
        manifest: &GenerationManifest,
        gate: GateId,
    ) -> Result<ExternalGateGrant, GateEvidenceError> {
        let signer = external_signer(gate);
        let canonical = manifest
            .variants
            .entries
            .iter()
            .find(|variant| variant.id == manifest.variants.canonical_variant)
            .expect("validated manifest should contain its canonical variant");
        let scoped_grant = match gate {
            GateId::Representation => Some((
                manifest
                    .embedding
                    .representation_audit
                    .suite_version
                    .as_str(),
                ArtifactRole::RepresentationReport,
            )),
            GateId::SemanticFidelity => Some((
                canonical.quality_suite_version.as_str(),
                ArtifactRole::SemanticFidelityReport,
            )),
            GateId::SubgroupBehavior => Some((
                canonical.quality_suite_version.as_str(),
                ArtifactRole::SubgroupBehaviorReport,
            )),
            GateId::MergeTreePersistence => Some((
                canonical.persistence_comparison.suite_version.as_str(),
                ArtifactRole::MergeTreePersistenceReport,
            )),
            GateId::RelationPolicy => Some((
                manifest.relations.policy_precedence_version.as_str(),
                ArtifactRole::RelationPolicyReport,
            )),
            GateId::AuthorizationNoninterference => Some((
                manifest.serving.authorization_adapter_version.as_str(),
                ArtifactRole::AuthorizationNoninterferenceReport,
            )),
            GateId::SecurityApproval => Some((
                manifest.serving.authorization_adapter_version.as_str(),
                ArtifactRole::SecurityApprovalReport,
            )),
            GateId::CompanionPin => Some((
                manifest.serving.canvas_companion_version.as_str(),
                ArtifactRole::CompanionPinReport,
            )),
            GateId::AnnRecall
            | GateId::RelationSatisfaction
            | GateId::TemporalDrift
            | GateId::SnapshotConsistency
            | GateId::Reproducibility => None,
        };
        if let Some((suite_version, role)) = scoped_grant {
            let report = manifest
                .artifacts
                .iter()
                .find(|artifact| artifact.role == role)
                .expect("test manifest should contain every external gate report")
                .content_hash;
            return ExternalGateGrant::sign(head, gate, suite_version, report, &signer);
        }
        let mut report =
            crate::salt::hash::ContentHasher::new(b"hash.graph.atlas.salt.test-external-report.v1");
        report.update(gate.to_string().as_bytes());
        report.update(head.manifest.as_bytes());
        report.update(manifest.reproducibility.config_hash.as_bytes());
        ExternalGateGrant::sign(head, gate, "test-suite-v1", report.finish(), &signer)
    }
}

pub(crate) fn external_authorities(
    issuer: &TestExternalGateGrantIssuer,
) -> Vec<TrustedExternalGateAuthority<'_>> {
    [
        GateId::Representation,
        GateId::SemanticFidelity,
        GateId::RelationPolicy,
        GateId::MergeTreePersistence,
        GateId::SubgroupBehavior,
        GateId::AuthorizationNoninterference,
        GateId::SecurityApproval,
        GateId::CompanionPin,
    ]
    .into_iter()
    .map(|gate| {
        TrustedExternalGateAuthority::new(gate, issuer, external_signer(gate).verifier())
            .expect("test external gate should validate")
    })
    .collect()
}

pub(crate) fn external_verifiers() -> ExternalGateVerifierSet {
    ExternalGateVerifierSet::new(
        &signer().verifier(),
        [
            GateId::Representation,
            GateId::SemanticFidelity,
            GateId::RelationPolicy,
            GateId::MergeTreePersistence,
            GateId::SubgroupBehavior,
            GateId::AuthorizationNoninterference,
            GateId::SecurityApproval,
            GateId::CompanionPin,
        ]
        .into_iter()
        .map(|gate| (gate, external_signer(gate).verifier()))
        .collect(),
    )
    .expect("test external authorities should be independent and complete")
}

fn release_head(manifest: &GenerationManifest) -> ReleaseHead {
    ReleaseHead {
        generation: manifest.generation_id,
        data: DataRevision::new(
            manifest.storage.base_revision,
            manifest.storage.initial_delta_revision,
        ),
        manifest: manifest
            .content_hash()
            .expect("test manifest should validate"),
    }
}

pub(crate) fn external_signer(gate: GateId) -> GateSigner {
    let discriminator = match gate {
        GateId::Representation => 1,
        GateId::SemanticFidelity => 2,
        GateId::RelationPolicy => 3,
        GateId::MergeTreePersistence => 4,
        GateId::SubgroupBehavior => 5,
        GateId::AuthorizationNoninterference => 6,
        GateId::SecurityApproval => 7,
        GateId::CompanionPin => 8,
        gate @ (GateId::AnnRecall
        | GateId::RelationSatisfaction
        | GateId::TemporalDrift
        | GateId::SnapshotConsistency
        | GateId::Reproducibility) => panic!("{gate} is not an external test gate"),
    };
    GateSigner::new(
        format!("test-external-authority-{discriminator}"),
        [0x6B + discriminator; 32],
    )
    .expect("fixed external authority should validate")
}

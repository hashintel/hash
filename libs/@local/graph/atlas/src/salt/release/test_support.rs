use crate::salt::{
    hash::ContentHash,
    manifest::GenerationManifest,
    release::{
        EvidenceAttestation, GateEvidence, GateEvidencePayload, GateEvidenceSet, GateId,
        GateSigner, ReleaseHead,
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
    payloads.push(GateEvidencePayload::ann_recall(
        manifest.semantic_graph.exact_audit_hash,
        manifest.semantic_graph.recall_at_50,
    ));
    let documents = payloads
        .into_iter()
        .map(|payload| {
            GateEvidence::sign(head, payload, &signer).expect("test gate evidence should serialize")
        })
        .collect();
    GateEvidenceSet::new(head, manifest, &verifier, documents)
        .expect("complete test evidence should verify")
}

pub(crate) fn passing_payloads_without_ann(
    manifest: &GenerationManifest,
) -> Vec<GateEvidencePayload> {
    let attested = |gate: GateId| {
        EvidenceAttestation::new(
            "test-suite-v1",
            ContentHash::digest(gate.to_string().as_bytes()),
            true,
        )
        .expect("test suite version should validate")
    };
    vec![
        GateEvidencePayload::Representation(attested(GateId::Representation)),
        GateEvidencePayload::SemanticFidelity(attested(GateId::SemanticFidelity)),
        GateEvidencePayload::RelationPolicy(attested(GateId::RelationPolicy)),
        GateEvidencePayload::RelationSatisfaction(attested(GateId::RelationSatisfaction)),
        GateEvidencePayload::MergeTreePersistence(attested(GateId::MergeTreePersistence)),
        GateEvidencePayload::TemporalDrift(attested(GateId::TemporalDrift)),
        GateEvidencePayload::SubgroupBehavior(attested(GateId::SubgroupBehavior)),
        GateEvidencePayload::AuthorizationNoninterference(attested(
            GateId::AuthorizationNoninterference,
        )),
        GateEvidencePayload::SnapshotConsistency(attested(GateId::SnapshotConsistency)),
        GateEvidencePayload::Reproducibility(attested(GateId::Reproducibility)),
        GateEvidencePayload::SecurityApproval(attested(GateId::SecurityApproval)),
        GateEvidencePayload::CompanionPin {
            document_version: manifest.serving.canvas_companion_version.clone(),
            document_hash: manifest.serving.canvas_companion_sha256,
            wire_versions: manifest.serving.wire_versions.clone(),
            shader_contract_version: manifest.serving.shader_contract_version.clone(),
        },
    ]
}

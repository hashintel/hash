use burn::backend::{NdArray, ndarray::NdArrayDevice};
use camino::Utf8PathBuf;
use tempfile::tempdir;

use super::*;
use crate::salt::{
    activation::{ActivationOutcome, FileActivationStore},
    hash::ContentHash,
    manifest::{fixture_manifest, publish_fixture_artifacts, publish_manifest},
    revision::{BaseRevision, DataRevision, DeltaRevision, GenerationId},
};

#[test]
fn report_order_and_identity_do_not_depend_on_collection_order() {
    let head = release_head();
    let forward = passing_outcomes();
    let mut reverse = forward.clone();
    reverse.reverse();

    let forward = GateReport::new(head, forward).expect("complete gates should pass");
    let reverse = GateReport::new(head, reverse).expect("reordered complete gates should pass");

    assert_eq!(forward, reverse);
    assert_eq!(forward.content_hash(), reverse.content_hash());
    assert_eq!(
        forward
            .outcomes()
            .iter()
            .map(|outcome| outcome.gate)
            .collect::<Vec<_>>(),
        GateId::required()
    );
    let approved = forward.approve().expect("canonical report should approve");
    assert_eq!(approved.head(), head);
    assert_ne!(approved.report(), head.manifest);
}

#[test]
fn deserialized_report_must_preserve_canonical_gate_order() {
    let report =
        GateReport::new(release_head(), passing_outcomes()).expect("complete gates should pass");
    let mut value = serde_json::to_value(report).expect("report should encode");
    value["outcomes"]
        .as_array_mut()
        .expect("outcomes should be an array")
        .reverse();
    let reordered: GateReport = serde_json::from_value(value).expect("report shape should decode");

    assert_eq!(
        reordered.validate(),
        Err(ReleaseGateError::NonCanonicalOrder)
    );
    assert_eq!(
        reordered.approve(),
        Err(ReleaseGateError::NonCanonicalOrder)
    );
}

#[test]
fn missing_and_duplicate_evidence_fail_closed() {
    let head = release_head();
    let mut missing = passing_outcomes();
    missing.retain(|outcome| outcome.gate != GateId::SecurityApproval);
    assert_eq!(
        GateReport::new(head, missing),
        Err(ReleaseGateError::Missing {
            gate: GateId::SecurityApproval
        })
    );

    let mut duplicate = passing_outcomes();
    duplicate.push(duplicate[0]);
    assert_eq!(
        GateReport::new(head, duplicate),
        Err(ReleaseGateError::Duplicate {
            gate: GateId::Representation
        })
    );

    let mut unexpected = passing_outcomes();
    unexpected.push(GateOutcome {
        gate: GateId::TemporalDrift,
        evidence: ContentHash::digest(b"not-applicable-to-initial-m0"),
    });
    assert_eq!(
        GateReport::new(head, unexpected),
        Err(ReleaseGateError::Unexpected {
            gate: GateId::TemporalDrift
        })
    );
}

#[test]
fn measured_relation_evidence_cannot_override_manifest_truth() {
    let manifest = fixture_manifest();
    let signer = test_support::signer();
    let verifier = signer.verifier();
    let head = ReleaseHead {
        generation: manifest.generation_id,
        data: DataRevision::new(
            manifest.storage.base_revision,
            manifest.storage.initial_delta_revision,
        ),
        manifest: manifest
            .content_hash()
            .expect("fixture manifest should serialize"),
    };
    let canonical = &manifest.variants.entries[0];
    let mut payloads = test_support::passing_payloads_without_ann(&manifest);
    payloads.retain(|payload| payload.gate() != GateId::RelationSatisfaction);
    payloads.extend([
        GateEvidencePayload::relation_satisfaction(
            canonical.selection_evidence_hash,
            canonical.relation_baseline_field_hash,
            canonical.canonical_field_hash,
            canonical.baseline_relation_loss,
            canonical.baseline_relation_loss + 1.0,
            canonical.relation_loss_tolerance,
        ),
        GateEvidencePayload::ann_recall(test_support::recall_audit(&manifest)),
    ]);
    let documents = payloads
        .into_iter()
        .map(|payload| {
            GateEvidence::sign(head, payload, &signer).expect("fixture evidence should sign")
        })
        .collect();

    assert!(matches!(
        GateEvidenceSet::new(
            head,
            &manifest,
            &verifier,
            &test_support::external_verifiers(),
            documents,
        ),
        Err(GateEvidenceError::Failed {
            gate: GateId::RelationSatisfaction,
            ..
        })
    ));
}

#[test]
fn external_approval_for_another_head_is_rejected() {
    let manifest = fixture_manifest();
    let signer = test_support::signer();
    let verifier = signer.verifier();
    let head = ReleaseHead {
        generation: manifest.generation_id,
        data: DataRevision::new(
            manifest.storage.base_revision,
            manifest.storage.initial_delta_revision,
        ),
        manifest: manifest
            .content_hash()
            .expect("fixture manifest should serialize"),
    };
    let wrong_head = ReleaseHead {
        manifest: ContentHash::digest(b"another manifest"),
        ..head
    };
    let external_signer = GateSigner::new("other-head-approver", [0x7C; 32])
        .expect("test external authority should validate");
    let wrong_grant = ExternalGateGrant::sign(
        wrong_head,
        GateId::RelationPolicy,
        "relation-policy-suite-v1",
        ContentHash::digest(b"reviewed holdout report"),
        &external_signer,
    )
    .expect("wrong-head grant should still be internally valid");
    let mut payloads = test_support::passing_payloads_without_ann(&manifest);
    payloads.retain(|payload| payload.gate() != GateId::RelationPolicy);
    payloads.extend([
        GateEvidencePayload::RelationPolicy(wrong_grant),
        GateEvidencePayload::ann_recall(test_support::recall_audit(&manifest)),
    ]);
    let documents = payloads
        .into_iter()
        .map(|payload| {
            GateEvidence::sign(head, payload, &signer).expect("fixture evidence should sign")
        })
        .collect();

    assert!(matches!(
        GateEvidenceSet::new(
            head,
            &manifest,
            &verifier,
            &test_support::external_verifiers(),
            documents,
        ),
        Err(GateEvidenceError::Failed {
            gate: GateId::RelationPolicy,
            ..
        })
    ));
}

#[test]
fn external_quality_grant_must_name_the_measured_report() {
    let manifest = fixture_manifest();
    let signer = test_support::signer();
    let verifier = signer.verifier();
    let head = ReleaseHead {
        generation: manifest.generation_id,
        data: DataRevision::new(
            manifest.storage.base_revision,
            manifest.storage.initial_delta_revision,
        ),
        manifest: manifest
            .content_hash()
            .expect("fixture manifest should serialize"),
    };
    let canonical = &manifest.variants.entries[0];
    let external_signer = test_support::external_signer(GateId::SemanticFidelity);
    let wrong_grant = ExternalGateGrant::sign(
        head,
        GateId::SemanticFidelity,
        canonical.quality_suite_version.clone(),
        ContentHash::digest(b"a different semantic report"),
        &external_signer,
    )
    .expect("wrong report grant should still be internally valid");
    let mut payloads = test_support::passing_payloads_without_ann(&manifest);
    payloads.retain(|payload| payload.gate() != GateId::SemanticFidelity);
    payloads.extend([
        GateEvidencePayload::SemanticFidelity(wrong_grant),
        GateEvidencePayload::ann_recall(test_support::recall_audit(&manifest)),
    ]);
    let documents = payloads
        .into_iter()
        .map(|payload| {
            GateEvidence::sign(head, payload, &signer).expect("fixture evidence should sign")
        })
        .collect();

    assert!(matches!(
        GateEvidenceSet::new(
            head,
            &manifest,
            &verifier,
            &test_support::external_verifiers(),
            documents,
        ),
        Err(GateEvidenceError::Failed {
            gate: GateId::SemanticFidelity,
            ..
        })
    ));
}

#[test]
fn policy_and_authorization_grants_reject_subject_hashes_in_place_of_reports() {
    let manifest = fixture_manifest();
    let signer = test_support::signer();
    let verifier = signer.verifier();
    let head = ReleaseHead {
        generation: manifest.generation_id,
        data: DataRevision::new(
            manifest.storage.base_revision,
            manifest.storage.initial_delta_revision,
        ),
        manifest: manifest
            .content_hash()
            .expect("fixture manifest should serialize"),
    };
    for (gate, suite_version, subject_hash) in [
        (
            GateId::RelationPolicy,
            manifest.relations.policy_precedence_version.as_str(),
            manifest.relations.policy_hash,
        ),
        (
            GateId::AuthorizationNoninterference,
            manifest.serving.authorization_adapter_version.as_str(),
            manifest.relations.security_geometry_hash,
        ),
    ] {
        let grant = ExternalGateGrant::sign(
            head,
            gate,
            suite_version,
            subject_hash,
            &test_support::external_signer(gate),
        )
        .expect("subject-bound grant should still be internally valid");
        let replacement = match gate {
            GateId::RelationPolicy => GateEvidencePayload::RelationPolicy(grant),
            GateId::AuthorizationNoninterference => {
                GateEvidencePayload::AuthorizationNoninterference(grant)
            }
            GateId::Representation
            | GateId::AnnRecall
            | GateId::SemanticFidelity
            | GateId::RelationSatisfaction
            | GateId::MergeTreePersistence
            | GateId::TemporalDrift
            | GateId::SubgroupBehavior
            | GateId::SnapshotConsistency
            | GateId::Reproducibility
            | GateId::SecurityApproval
            | GateId::CompanionPin => {
                unreachable!("fixture includes only report-bound gates")
            }
        };
        let mut payloads = test_support::passing_payloads_without_ann(&manifest);
        payloads.retain(|payload| payload.gate() != gate);
        payloads.extend([
            replacement,
            GateEvidencePayload::ann_recall(test_support::recall_audit(&manifest)),
        ]);
        let documents = payloads
            .into_iter()
            .map(|payload| {
                GateEvidence::sign(head, payload, &signer).expect("fixture evidence should sign")
            })
            .collect();

        assert!(matches!(
            GateEvidenceSet::new(
                head,
                &manifest,
                &verifier,
                &test_support::external_verifiers(),
                documents,
            ),
            Err(GateEvidenceError::Failed {
                gate: failed_gate,
                ..
            }) if failed_gate == gate
        ));
    }
}

#[test]
fn externally_signed_grant_from_an_unpinned_restart_key_is_rejected() {
    let manifest = fixture_manifest();
    let signer = test_support::signer();
    let verifier = signer.verifier();
    let head = ReleaseHead {
        generation: manifest.generation_id,
        data: DataRevision::new(
            manifest.storage.base_revision,
            manifest.storage.initial_delta_revision,
        ),
        manifest: manifest
            .content_hash()
            .expect("fixture manifest should serialize"),
    };
    let canonical = &manifest.variants.entries[0];
    let unpinned = GateSigner::new("unpinned-quality-approver", [0x7D; 32])
        .expect("test external authority should validate");
    let grant = ExternalGateGrant::sign(
        head,
        GateId::SemanticFidelity,
        canonical.quality_suite_version.clone(),
        canonical.semantic_fidelity_report_hash,
        &unpinned,
    )
    .expect("correctly scoped unpinned grant should sign");
    let mut payloads = test_support::passing_payloads_without_ann(&manifest);
    payloads.retain(|payload| payload.gate() != GateId::SemanticFidelity);
    payloads.extend([
        GateEvidencePayload::SemanticFidelity(grant),
        GateEvidencePayload::ann_recall(test_support::recall_audit(&manifest)),
    ]);
    let documents = payloads
        .into_iter()
        .map(|payload| {
            GateEvidence::sign(head, payload, &signer).expect("fixture evidence should sign")
        })
        .collect();

    assert!(matches!(
        GateEvidenceSet::new(
            head,
            &manifest,
            &verifier,
            &test_support::external_verifiers(),
            documents,
        ),
        Err(GateEvidenceError::Failed {
            gate: GateId::SemanticFidelity,
            ..
        })
    ));
}

#[test]
fn external_authority_pins_cannot_reuse_the_release_key() {
    let release = test_support::signer().verifier();
    let entries = [
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
    .map(|gate| (gate, release.clone()))
    .collect();

    assert!(matches!(
        ExternalGateVerifierSet::new(&release, entries),
        Err(GateEvidenceError::Failed {
            gate: GateId::Representation,
            ..
        })
    ));
}

#[test]
fn external_authority_pins_must_use_pairwise_distinct_keys() {
    let release = test_support::signer().verifier();
    let shared = GateSigner::new("shared-external-authority", [0xA4; 32])
        .expect("test authority should validate")
        .verifier();
    let gates = [
        GateId::Representation,
        GateId::SemanticFidelity,
        GateId::RelationPolicy,
        GateId::MergeTreePersistence,
        GateId::SubgroupBehavior,
        GateId::AuthorizationNoninterference,
        GateId::SecurityApproval,
        GateId::CompanionPin,
    ];
    let entries = gates
        .into_iter()
        .enumerate()
        .map(|(index, gate)| {
            let verifier = if index < 2 {
                shared.clone()
            } else {
                GateSigner::new(
                    format!("external-authority-{index}"),
                    [u8::try_from(index + 1).expect("gate index should fit u8"); 32],
                )
                .expect("test authority should validate")
                .verifier()
            };
            (gate, verifier)
        })
        .collect();

    assert!(matches!(
        ExternalGateVerifierSet::new(&release, entries),
        Err(GateEvidenceError::Failed {
            gate: GateId::SemanticFidelity,
            ..
        })
    ));
}

#[test]
fn external_authority_pins_must_use_pairwise_distinct_names() {
    let release = test_support::signer().verifier();
    let gates = [
        GateId::Representation,
        GateId::SemanticFidelity,
        GateId::RelationPolicy,
        GateId::MergeTreePersistence,
        GateId::SubgroupBehavior,
        GateId::AuthorizationNoninterference,
        GateId::SecurityApproval,
        GateId::CompanionPin,
    ];
    let entries = gates
        .into_iter()
        .enumerate()
        .map(|(index, gate)| {
            let authority = if index < 2 {
                "shared-external-authority".to_owned()
            } else {
                format!("external-authority-{index}")
            };
            let verifier = GateSigner::new(
                authority,
                [u8::try_from(index + 1).expect("gate index should fit u8"); 32],
            )
            .expect("test authority should validate")
            .verifier();
            (gate, verifier)
        })
        .collect();

    assert!(matches!(
        ExternalGateVerifierSet::new(&release, entries),
        Err(GateEvidenceError::Failed {
            gate: GateId::SemanticFidelity,
            ..
        })
    ));
}

#[test]
fn external_issuer_cannot_substitute_an_untrusted_key() {
    let manifest = fixture_manifest();
    let head = ReleaseHead {
        generation: manifest.generation_id,
        data: DataRevision::new(
            manifest.storage.base_revision,
            manifest.storage.initial_delta_revision,
        ),
        manifest: manifest
            .content_hash()
            .expect("fixture manifest should serialize"),
    };
    let issuer = test_support::TestExternalGateGrantIssuer::new();
    let authority = TrustedExternalGateAuthority::new(
        GateId::RelationPolicy,
        &issuer,
        test_support::signer().verifier(),
    )
    .expect("external gate should validate");

    assert!(matches!(
        authority.issue(head, &manifest),
        Err(GateEvidenceError::Failed {
            gate: GateId::RelationPolicy,
            ..
        })
    ));
}

#[test]
fn gated_publication_remains_inactive_until_explicit_compare_exchange() {
    let directory = tempdir().expect("temporary directory should exist");
    let root = Utf8PathBuf::from_path_buf(directory.path().to_owned())
        .expect("temporary path should be UTF-8");
    let mut manifest = fixture_manifest();
    let generation_directory = root
        .join("generations")
        .join(manifest.generation_id.to_string());
    std::fs::create_dir_all(&generation_directory).expect("generation directory should be created");
    publish_fixture_artifacts(&generation_directory, &mut manifest);
    let published = publish_manifest(&generation_directory.join("manifest.json"), &manifest)
        .expect("fixture manifest should publish");
    let evidence = test_support::passing_evidence(&manifest);
    assert_eq!(evidence.head().manifest, published.content_hash);
    let release = publish_gated_candidate(&root, &evidence).expect("candidate should publish");
    let store = FileActivationStore::<NdArray>::new(
        root.clone(),
        test_support::signer().verifier(),
        test_support::external_verifiers(),
        NdArrayDevice::Cpu,
    );

    assert_eq!(store.current().expect("active pointer should read"), None);
    assert_eq!(
        store
            .compare_exchange(None, release)
            .expect("explicit activation should succeed"),
        ActivationOutcome::Activated(release.into())
    );
    assert_eq!(
        store.current().expect("active pointer should read"),
        Some(release.into())
    );

    let unpinned_verifiers = ExternalGateVerifierSet::new(
        &test_support::signer().verifier(),
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
        .enumerate()
        .map(|(index, gate)| {
            (
                gate,
                GateSigner::new(
                    format!("unpinned-restart-authority-{index}"),
                    [0xA7 + u8::try_from(index).expect("gate index should fit u8"); 32],
                )
                .expect("test authority should validate")
                .verifier(),
            )
        })
        .collect(),
    )
    .expect("independent but unpinned restart authorities should form a set");
    assert!(
        FileActivationStore::<NdArray>::new(
            root,
            test_support::signer().verifier(),
            unpinned_verifiers,
            NdArrayDevice::Cpu,
        )
        .current()
        .is_err(),
        "restart must reject external grants under different out-of-band pins",
    );
}

fn release_head() -> ReleaseHead {
    ReleaseHead {
        generation: GenerationId::new(ContentHash::digest(b"generation")),
        data: DataRevision::new(BaseRevision::ZERO, DeltaRevision::ZERO),
        manifest: ContentHash::digest(b"manifest"),
    }
}

fn passing_outcomes() -> Vec<GateOutcome> {
    GateId::required()
        .iter()
        .copied()
        .enumerate()
        .map(|(index, gate)| GateOutcome {
            gate,
            evidence: ContentHash::digest(format!("required-gate-{index}").as_bytes()),
        })
        .collect()
}

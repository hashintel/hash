use burn::backend::{Candle, candle::CandleDevice};
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
fn missing_duplicate_and_failed_evidence_fail_closed() {
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

    let mut failed = passing_outcomes();
    failed
        .iter_mut()
        .find(|outcome| outcome.gate == GateId::AnnRecall)
        .expect("ANN gate should exist")
        .passed = false;
    assert_eq!(
        GateReport::new(head, failed),
        Err(ReleaseGateError::Failed {
            gate: GateId::AnnRecall
        })
    );
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
    let store = FileActivationStore::<Candle>::new(
        root,
        test_support::signer().verifier(),
        CandleDevice::Cpu,
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
            passed: true,
            evidence: ContentHash::digest(&index.to_le_bytes()),
        })
        .collect()
}

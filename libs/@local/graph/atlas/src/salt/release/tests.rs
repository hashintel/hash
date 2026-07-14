use super::*;
use crate::salt::{
    hash::ContentHash,
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
    let approved = forward.approve();
    assert_eq!(approved.head(), head);
    assert_ne!(approved.report(), head.manifest);
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

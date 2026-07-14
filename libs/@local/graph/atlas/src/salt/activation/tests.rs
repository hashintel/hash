use camino::Utf8Path;

use super::*;
use crate::salt::{
    hash::ContentHash,
    release::{GateId, GateOutcome, GateReport, GatedRelease, ReleaseHead},
    revision::{DataRevision, GenerationId},
};

#[test]
fn activation_is_idempotent_and_rejects_a_stale_expected_head() {
    let directory = tempfile::tempdir().expect("activation directory should open");
    let root = Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8");
    let first = gated_release("first");
    let second = gated_release("second");
    create_generation_directory(root, first);
    create_generation_directory(root, second);
    publish_candidate_marker(root, first).expect("first candidate should publish");
    publish_candidate_marker(root, second).expect("second candidate should publish");
    let store = FileActivationStore::new(root);

    let first_active = ActiveRelease::from(first);
    assert_eq!(
        store
            .compare_exchange(None, first)
            .expect("initial activation should write"),
        ActivationOutcome::Activated(first_active)
    );
    assert_eq!(
        store
            .compare_exchange(None, first)
            .expect("retry should be idempotent"),
        ActivationOutcome::AlreadyActive(first_active)
    );
    assert_eq!(
        store
            .compare_exchange(None, second)
            .expect("stale expected head should report conflict"),
        ActivationOutcome::Conflict {
            actual: Some(first_active)
        }
    );

    let second_active = ActiveRelease::from(second);
    assert_eq!(
        store
            .compare_exchange(Some(first_active), second)
            .expect("matching expected head should activate"),
        ActivationOutcome::Activated(second_active)
    );
    assert_eq!(
        store.current().expect("active pointer should load"),
        Some(second_active)
    );
}

#[test]
fn activation_requires_the_exact_published_candidate_marker() {
    let directory = tempfile::tempdir().expect("activation directory should open");
    let root = Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8");
    let release = gated_release("missing");
    let store = FileActivationStore::new(root);

    assert!(matches!(
        store.compare_exchange(None, release),
        Err(ActivationError::MissingCandidate { generation })
            if generation == release.head().generation
    ));
}

fn create_generation_directory(root: &Utf8Path, release: GatedRelease) {
    std::fs::create_dir_all(
        root.join("generations")
            .join(release.head().generation.to_string()),
    )
    .expect("candidate directory should be created");
}

fn gated_release(name: &str) -> GatedRelease {
    let head = ReleaseHead {
        generation: GenerationId::new(ContentHash::digest(name.as_bytes())),
        data: DataRevision::ZERO,
        manifest: ContentHash::digest(format!("{name}-manifest").as_bytes()),
    };
    let outcomes = GateId::required()
        .iter()
        .copied()
        .enumerate()
        .map(|(index, gate)| GateOutcome {
            gate,
            passed: true,
            evidence: ContentHash::digest(format!("{name}-{index}-evidence").as_bytes()),
        })
        .collect();
    GateReport::new(head, outcomes)
        .expect("all fixture gates pass")
        .approve()
}

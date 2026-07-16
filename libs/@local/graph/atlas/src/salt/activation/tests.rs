#![expect(
    deprecated,
    reason = "M0 reproducibility tests intentionally pin Burn's Candle CPU backend"
)]

use burn::backend::{Candle, candle::CandleDevice};
use camino::Utf8Path;

use super::*;
use crate::salt::{
    hash::ContentHash,
    manifest::{ArtifactRole, fixture_manifest, publish_fixture_artifacts, publish_manifest},
    release::{
        GateId, GateOutcome, GateReport, GatedRelease, ReleaseHead, publish_gated_candidate,
        test_support::{passing_evidence, signer},
    },
    revision::{DataRevision, GenerationId},
};

#[test]
fn activation_is_idempotent_and_rejects_a_stale_expected_head() {
    let directory = tempfile::tempdir().expect("activation directory should open");
    let root = Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8");
    let first = publish_release(root, "first");
    let second = publish_release(root, "second");
    let store = activation_store(root);

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
    assert_eq!(
        store
            .compare_exchange(Some(second_active), first)
            .expect("a verified prior candidate should remain rollback-capable"),
        ActivationOutcome::Activated(first_active)
    );
    assert_eq!(
        store.current().expect("rolled-back pointer should load"),
        Some(first_active)
    );
}

#[test]
fn compensating_restore_is_conditional_and_can_restore_no_active_head() {
    let directory = tempfile::tempdir().expect("activation directory should open");
    let root = Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8");
    let first = publish_release(root, "restore-first");
    let second = publish_release(root, "restore-second");
    let store = activation_store(root);
    let first_active = ActiveRelease::from(first);
    let second_active = ActiveRelease::from(second);

    store
        .compare_exchange(None, first)
        .expect("first release should activate");
    store
        .compare_exchange(Some(first_active), second)
        .expect("second release should activate");
    assert!(
        store
            .restore_if_current(second_active, Some(first_active))
            .expect("matching current release should restore")
    );
    assert_eq!(
        store.current().expect("restored release should load"),
        Some(first_active)
    );
    assert!(
        !store
            .restore_if_current(second_active, None)
            .expect("stale compensation should not mutate")
    );
    assert!(
        store
            .restore_if_current(first_active, None)
            .expect("matching current release should deactivate")
    );
    assert_eq!(
        store.current().expect("deactivated state should load"),
        None
    );
}

#[test]
fn activation_requires_the_exact_published_candidate_marker() {
    let directory = tempfile::tempdir().expect("activation directory should open");
    let root = Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8");
    let release = gated_release("missing");
    let store = activation_store(root);

    assert!(matches!(
        store.compare_exchange(None, release),
        Err(ActivationError::MissingCandidate { generation })
            if generation == release.head().generation
    ));
}

#[test]
fn withdrawn_candidate_cannot_be_activated_but_keeps_diagnostics() {
    let directory = tempfile::tempdir().expect("activation directory should open");
    let root = Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8");
    let release = publish_release(root, "withdrawn");

    withdraw_candidate_marker(root, release).expect("inactive candidate should be withdrawn");

    assert!(matches!(
        activation_store(root).compare_exchange(None, release),
        Err(ActivationError::MissingCandidate { generation })
            if generation == release.head().generation
    ));
    assert!(
        root.join("generations")
            .join(release.head().generation.to_string())
            .join("release-report.json")
            .is_file(),
        "withdrawal should preserve immutable diagnostics"
    );
}

#[test]
fn activation_revalidates_the_durable_release_report() {
    let directory = tempfile::tempdir().expect("activation directory should open");
    let root = Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8");
    let release = publish_release(root, "deleted-report");
    std::fs::remove_file(
        root.join("generations")
            .join(release.head().generation.to_string())
            .join("release-report.json"),
    )
    .expect("release report should be removable in the fixture");

    assert!(matches!(
        activation_store(root).compare_exchange(None, release),
        Err(ActivationError::CandidateMismatch { generation })
            if generation == release.head().generation
    ));
}

#[test]
fn activation_rejects_a_candidate_with_a_missing_artifact() {
    let directory = tempfile::tempdir().expect("activation directory should open");
    let root = Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8");
    let release = publish_release(root, "missing-artifact");
    std::fs::remove_file(
        root.join("generations")
            .join(release.head().generation.to_string())
            .join("semantic.salt"),
    )
    .expect("semantic artifact should be removable in the fixture");

    assert!(matches!(
        activation_store(root).compare_exchange(None, release),
        Err(ActivationError::Manifest(_))
    ));
}

#[test]
fn restart_loading_fails_closed_after_active_artifact_corruption() {
    let directory = tempfile::tempdir().expect("activation directory should open");
    let root = Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8");
    let release = publish_release(root, "restart-corruption");
    let store = activation_store(root);
    store
        .compare_exchange(None, release)
        .expect("fixture release should activate");
    std::fs::remove_file(
        root.join("generations")
            .join(release.head().generation.to_string())
            .join("base.salt"),
    )
    .expect("base artifact should be removable in the fixture");

    assert!(matches!(
        activation_store(root).current(),
        Err(ActivationError::Manifest(_))
    ));
}

#[test]
fn restart_loads_every_mapped_role_and_the_declared_projector() {
    let directory = tempfile::tempdir().expect("activation directory should open");
    let root = Utf8Path::from_path(directory.path()).expect("temporary path should be UTF-8");
    let release = publish_release(root, "complete-restart");
    activation_store(root)
        .compare_exchange(None, release)
        .expect("fixture release should activate");

    let restarted = activation_store(root)
        .load_active()
        .expect("active generation should load")
        .expect("active generation should exist");

    assert_eq!(restarted.release(), ActiveRelease::from(release));
    assert_eq!(
        restarted.manifest().generation_id,
        release.head().generation
    );
    for role in [
        ArtifactRole::Representations,
        ArtifactRole::RelationClassifier,
        ArtifactRole::SemanticGraph,
        ArtifactRole::RelationIndexes,
        ArtifactRole::LandmarkSkeleton,
        ArtifactRole::LandmarkReferencePersistence,
        ArtifactRole::CanonicalBase,
        ArtifactRole::CanonicalAnalytics,
    ] {
        assert!(restarted.artifact(role).is_some(), "{role:?} should map");
    }
    let _projector = restarted.projector();
}

fn publish_release(root: &Utf8Path, name: &str) -> GatedRelease {
    let generation = GenerationId::new(ContentHash::digest(name.as_bytes()));
    let directory = root.join("generations").join(generation.to_string());
    std::fs::create_dir_all(&directory).expect("generation directory should create");
    let mut manifest = fixture_manifest();
    manifest.generation_id = generation;
    publish_fixture_artifacts(&directory, &mut manifest);
    let published = publish_manifest(&directory.join("manifest.json"), &manifest)
        .expect("fixture manifest should publish");
    let evidence = passing_evidence(&manifest);
    assert_eq!(evidence.head().manifest, published.content_hash);
    publish_gated_candidate(root, &evidence).expect("gated candidate should publish")
}

fn activation_store(root: &Utf8Path) -> FileActivationStore<Candle> {
    FileActivationStore::new(
        root,
        signer().verifier(),
        crate::salt::release::test_support::external_verifiers(),
        CandleDevice::Cpu,
    )
}

fn gated_release(name: &str) -> GatedRelease {
    gate_report(name)
        .approve()
        .expect("canonical gate report should approve")
}

fn gate_report(name: &str) -> GateReport {
    gate_report_for_head(
        name,
        ReleaseHead {
            generation: GenerationId::new(ContentHash::digest(name.as_bytes())),
            data: DataRevision::ZERO,
            manifest: ContentHash::digest(format!("{name}-manifest").as_bytes()),
        },
    )
}

fn gate_report_for_head(name: &str, head: ReleaseHead) -> GateReport {
    let outcomes = GateId::required()
        .iter()
        .copied()
        .enumerate()
        .map(|(index, gate)| GateOutcome {
            gate,
            evidence: ContentHash::digest(format!("{name}-{index}-evidence").as_bytes()),
        })
        .collect();
    GateReport::new(head, outcomes).expect("all fixture gates pass")
}

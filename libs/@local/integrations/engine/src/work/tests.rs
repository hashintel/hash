use pretty_assertions::assert_eq;
use rstest::rstest;
use serde_json::{Value, json};
use uuid::Uuid;

use super::{
    EventId, MAX_RECORD_BYTES, RecordError, StatePhase, StateVersion, StateVersionId,
    StateVersionRef, StateVersionV1, WorkId, WorkKind, WorkManifest, WorkManifestV1,
};
use crate::ArtifactRef;

/// The stored form of an artifact reference whose digest is `fill` repeated.
fn artifact_json(fill: u8) -> Value {
    let sha256 = hex::encode([fill; 32]);
    json!({
        "version": "v1",
        "value": {
            "key": format!("artifacts/sha256/{fill:02x}/{sha256}.json"),
            "sha256": sha256,
            "size": 1,
            "format": "json",
        },
    })
}

fn artifact(fill: u8) -> ArtifactRef {
    serde_json::from_value(artifact_json(fill)).expect("should deserialize the reference")
}

fn state() -> StateVersionV1 {
    StateVersionV1 {
        owner: Uuid::from_u128(1),
        parent: Some(StateVersionRef {
            id: StateVersionId([9; 32]),
            artifact: artifact(9),
        }),
        phase: StatePhase::LinksCommitted,
        generation: 2,
        workspace: artifact(1),
        captures: vec![artifact(2)],
        desired_projection: artifact(3),
        definition_digest: [7; 32],
        definition_digest_encoding_version: 1,
    }
}

fn encoded(state: &StateVersion) -> Vec<u8> {
    serde_json::to_vec(state).expect("should serialize the state version")
}

#[test]
fn state_wire_format() {
    let state = StateVersion::V1(state());

    assert_eq!(
        serde_json::to_value(&state).expect("should serialize the state version"),
        json!({
            "version": "v1",
            "value": {
                "owner": "00000000-0000-0000-0000-000000000001",
                "parent": { "id": "09".repeat(32), "artifact": artifact_json(9) },
                "phase": "links_committed",
                "generation": 2,
                "workspace": artifact_json(1),
                "captures": [artifact_json(2)],
                "desired_projection": artifact_json(3),
                "definition_digest": "07".repeat(32),
                "definition_digest_encoding_version": 1,
            },
        }),
        "should store the state version in its wire format"
    );
    assert_eq!(
        state.id().to_string(),
        "f51d27f22ddee364984a338274445af68058942bb2f70428c4588feda2661f8f",
        "should keep the ID of a stored state version"
    );
}

#[rstest]
#[case::owner(|state: &mut StateVersionV1| state.owner = Uuid::from_u128(2))]
#[case::parent(|state: &mut StateVersionV1| state.parent = None)]
#[case::phase(|state: &mut StateVersionV1| state.phase = StatePhase::SourcesCommitted)]
#[case::generation(|state: &mut StateVersionV1| state.generation = 3)]
#[case::workspace(|state: &mut StateVersionV1| state.workspace = artifact(4))]
#[case::captures(|state: &mut StateVersionV1| state.captures.push(artifact(4)))]
#[case::desired_projection(|state: &mut StateVersionV1| state.desired_projection = artifact(4))]
#[case::definition_digest(|state: &mut StateVersionV1| state.definition_digest = [4; 32])]
#[case::definition_digest_encoding_version(
    |state: &mut StateVersionV1| state.definition_digest_encoding_version = 2
)]
fn state_id_fields(#[case] change: fn(&mut StateVersionV1)) {
    let mut changed = state();
    change(&mut changed);

    assert_ne!(
        StateVersion::V1(changed).id(),
        StateVersion::V1(state()).id(),
        "should give a changed state another ID"
    );
}

#[test]
fn state_decode_round_trip() {
    let state = StateVersion::V1(state());

    let decoded =
        StateVersion::decode(&encoded(&state), state.id()).expect("should decode the state");
    assert_eq!(decoded, state, "should decode the state that was stored");
}

#[test]
fn state_decode_other_id() {
    let state = StateVersion::V1(state());

    let error = StateVersion::decode(&encoded(&state), StateVersionId([0; 32]))
        .expect_err("should reject a state with another ID");
    assert!(
        matches!(error.current_context(), RecordError::Mismatch),
        "should report the mismatch"
    );
}

#[test]
fn state_decode_size_limit() {
    let state = StateVersion::V1(state());
    let mut bytes = encoded(&state);
    // Trailing whitespace keeps the JSON valid, so only the size changes.
    bytes.resize(MAX_RECORD_BYTES, b' ');
    StateVersion::decode(&bytes, state.id()).expect("should decode a record at the limit");

    bytes.push(b' ');
    let error = StateVersion::decode(&bytes, state.id()).expect_err("should reject the record");
    assert!(
        matches!(error.current_context(), RecordError::Decode),
        "should report the record as undecodable"
    );
}

#[rstest]
#[case::unknown_version(|state: &mut Value| state["version"] = json!("v2"))]
#[case::unknown_envelope_field(|state: &mut Value| state["etag"] = json!("etag"))]
#[case::unknown_field(|state: &mut Value| state["value"]["created_at"] = json!("2026-11-11"))]
#[case::stream_phase(|state: &mut Value| state["value"]["phase"] = json!("stream"))]
#[case::unknown_parent_field(|state: &mut Value| state["value"]["parent"]["etag"] = json!("etag"))]
#[case::unknown_artifact_field(|state: &mut Value| state["value"]["workspace"]["etag"] = json!("etag"))]
fn state_decode_malformed(#[case] tamper: fn(&mut Value)) {
    let state = StateVersion::V1(state());
    let mut stored = serde_json::to_value(&state).expect("should serialize the state version");
    tamper(&mut stored);

    let error = StateVersion::decode(
        &serde_json::to_vec(&stored).expect("should serialize the tampered record"),
        state.id(),
    )
    .expect_err("should reject the record");
    assert!(
        matches!(error.current_context(), RecordError::Decode),
        "should report the record as undecodable"
    );
}

fn state_ref(fill: u8) -> StateVersionRef {
    StateVersionRef {
        id: StateVersionId([fill; 32]),
        artifact: artifact(fill),
    }
}

/// A reference to the state `fill` stored as another artifact.
fn relocated(fill: u8) -> StateVersionRef {
    StateVersionRef {
        id: StateVersionId([fill; 32]),
        artifact: artifact(4),
    }
}

fn apply(run: u128, candidate: u8) -> WorkKind {
    WorkKind::Apply {
        run_id: Uuid::from_u128(run),
        candidate: state_ref(candidate),
    }
}

fn restore(
    failed_run: u128,
    failed_work: u8,
    target: Option<StateVersionRef>,
    contaminated: StateVersionRef,
) -> WorkKind {
    WorkKind::Restore {
        failed_run_id: Uuid::from_u128(failed_run),
        failed_work_id: WorkId([failed_work; 32]),
        target,
        contaminated,
    }
}

fn reconcile(target: StateVersionRef, applied_incarnation: Option<u8>, cycle: u64) -> WorkKind {
    WorkKind::Reconcile {
        target,
        applied_incarnation: applied_incarnation.map(|fill| EventId([fill; 32])),
        cycle,
    }
}

fn manifest(kind: WorkKind) -> WorkManifestV1 {
    WorkManifestV1 {
        web: Uuid::from_u128(10),
        connector: "aviation".parse().expect("should be a connector ID"),
        owner: Uuid::from_u128(1),
        kind,
        effects: artifact(5),
        effect_count: 3,
        effect_identity_version: 1,
        effect_encoding_version: 1,
    }
}

fn work_id(manifest: WorkManifestV1) -> WorkId {
    WorkManifest::V1(manifest).id()
}

#[test]
fn manifest_wire_format() {
    let manifest = WorkManifest::V1(manifest(reconcile(state_ref(6), Some(11), 2)));

    assert_eq!(
        serde_json::to_value(&manifest).expect("should serialize the work manifest"),
        json!({
            "version": "v1",
            "value": {
                "web": "00000000-0000-0000-0000-00000000000a",
                "connector": "aviation",
                "owner": "00000000-0000-0000-0000-000000000001",
                "kind": {
                    "kind": "reconcile",
                    "value": {
                        "target": { "id": "06".repeat(32), "artifact": artifact_json(6) },
                        "applied_incarnation": "0b".repeat(32),
                        "cycle": 2,
                    },
                },
                "effects": artifact_json(5),
                "effect_count": 3,
                "effect_identity_version": 1,
                "effect_encoding_version": 1,
            },
        }),
        "should store the work manifest in its wire format"
    );
}

#[rstest]
#[case::apply(
    apply(20, 6),
    "c8f17fe748757d1116f034f708b36b68057b2b83eb86e48a33f89605d92b8ffd"
)]
#[case::restore(
    restore(21, 7, Some(state_ref(6)), state_ref(8)),
    "098d69948c9fe2d22ea21d6b2246ee99fe418332c2f0e52ce267766e3719b74a"
)]
#[case::reconcile(
    reconcile(state_ref(6), Some(11), 2),
    "ce2c813149f729de350a4135c74f86a6034caeef3eed910a263293ee6206c38b"
)]
fn manifest_id_pinned(#[case] kind: WorkKind, #[case] id: &str) {
    assert_eq!(
        work_id(manifest(kind)).to_string(),
        id,
        "should keep the ID of a stored work manifest"
    );
}

#[rstest]
fn manifest_id_integration(
    #[values(
        apply(20, 6),
        restore(21, 7, Some(state_ref(6)), state_ref(8)),
        reconcile(state_ref(6), Some(11), 2)
    )]
    kind: WorkKind,
    #[values(
        |work: &mut WorkManifestV1| work.web = Uuid::from_u128(99),
        |work: &mut WorkManifestV1| work.connector = "other".parse().expect("should be a connector ID"),
        |work: &mut WorkManifestV1| work.owner = Uuid::from_u128(99)
    )]
    change: fn(&mut WorkManifestV1),
) {
    let mut changed = manifest(kind.clone());
    change(&mut changed);

    assert_ne!(
        work_id(changed),
        work_id(manifest(kind)),
        "should give work of another integration or owner another ID"
    );
}

#[rstest]
#[case::run(|work: &mut WorkManifestV1| work.kind = apply(99, 6))]
#[case::candidate(|work: &mut WorkManifestV1| work.kind = apply(20, 4))]
#[case::effects(|work: &mut WorkManifestV1| work.effects = artifact(4))]
#[case::effect_count(|work: &mut WorkManifestV1| work.effect_count = 4)]
#[case::effect_identity_version(|work: &mut WorkManifestV1| work.effect_identity_version = 2)]
#[case::effect_encoding_version(|work: &mut WorkManifestV1| work.effect_encoding_version = 2)]
fn apply_id_fields(#[case] change: fn(&mut WorkManifestV1)) {
    let mut changed = manifest(apply(20, 6));
    change(&mut changed);

    assert_ne!(
        work_id(changed),
        work_id(manifest(apply(20, 6))),
        "should give a changed apply another ID"
    );
}

#[rstest]
fn recovery_id_replanned_effects(
    #[values(
        restore(21, 7, Some(state_ref(6)), state_ref(8)),
        reconcile(state_ref(6), Some(11), 2)
    )]
    kind: WorkKind,
) {
    let mut replanned = manifest(kind.clone());
    replanned.effects = artifact(4);
    replanned.effect_count = 4;
    replanned.effect_identity_version = 2;
    replanned.effect_encoding_version = 2;

    assert_eq!(
        work_id(replanned),
        work_id(manifest(kind)),
        "should keep the ID when the effects are planned again"
    );
}

#[rstest]
#[case::failed_run(restore(99, 7, Some(state_ref(6)), state_ref(8)), true)]
#[case::target_artifact(restore(21, 7, Some(relocated(6)), state_ref(8)), true)]
#[case::contaminated_artifact(restore(21, 7, Some(state_ref(6)), relocated(8)), true)]
#[case::failed_work(restore(21, 4, Some(state_ref(6)), state_ref(8)), false)]
#[case::target(restore(21, 7, Some(state_ref(4)), state_ref(8)), false)]
#[case::empty_target(restore(21, 7, None, state_ref(8)), false)]
#[case::contaminated(restore(21, 7, Some(state_ref(6)), state_ref(4)), false)]
fn restore_id(#[case] kind: WorkKind, #[case] same_id: bool) {
    assert_eq!(
        work_id(manifest(kind))
            == work_id(manifest(restore(21, 7, Some(state_ref(6)), state_ref(8)))),
        same_id,
        "should keep the ID only if the failed work and the states it names are unchanged"
    );
}

#[rstest]
#[case::target_artifact(reconcile(relocated(6), Some(11), 2), true)]
#[case::target(reconcile(state_ref(4), Some(11), 2), false)]
#[case::incarnation(reconcile(state_ref(6), Some(4), 2), false)]
#[case::no_incarnation(reconcile(state_ref(6), None, 2), false)]
#[case::cycle(reconcile(state_ref(6), Some(11), 3), false)]
fn reconcile_id(#[case] kind: WorkKind, #[case] same_id: bool) {
    assert_eq!(
        work_id(manifest(kind)) == work_id(manifest(reconcile(state_ref(6), Some(11), 2))),
        same_id,
        "should keep the ID only if the target state, incarnation and cycle are unchanged"
    );
}

#[test]
fn manifest_decode_round_trip() {
    let manifest = WorkManifest::V1(manifest(restore(21, 7, None, state_ref(8))));
    let bytes = serde_json::to_vec(&manifest).expect("should serialize the work manifest");

    let decoded = WorkManifest::decode(&bytes, manifest.id()).expect("should decode the manifest");
    assert_eq!(
        decoded, manifest,
        "should decode the manifest that was stored"
    );

    let error = WorkManifest::decode(&bytes, WorkId([0; 32]))
        .expect_err("should reject a manifest with another ID");
    assert!(
        matches!(error.current_context(), RecordError::Mismatch),
        "should report the mismatch"
    );
}

#[rstest]
#[case::unknown_envelope_field(|work: &mut Value| work["etag"] = json!("etag"))]
#[case::unknown_kind(|work: &mut Value| work["value"]["kind"]["kind"] = json!("rollback"))]
#[case::unknown_kind_field(|work: &mut Value| work["value"]["kind"]["value"]["phase"] = json!("x"))]
#[case::invalid_connector(|work: &mut Value| work["value"]["connector"] = json!("Not A Name"))]
fn manifest_decode_malformed(#[case] tamper: fn(&mut Value)) {
    let manifest = WorkManifest::V1(manifest(apply(20, 6)));
    let mut stored = serde_json::to_value(&manifest).expect("should serialize the work manifest");
    tamper(&mut stored);

    let error = WorkManifest::decode(
        &serde_json::to_vec(&stored).expect("should serialize the tampered record"),
        manifest.id(),
    )
    .expect_err("should reject the record");
    assert!(
        matches!(error.current_context(), RecordError::Decode),
        "should report the record as undecodable"
    );
}

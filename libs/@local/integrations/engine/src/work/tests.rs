use pretty_assertions::assert_eq;
use rstest::rstest;
use serde_json::{Value, json};
use uuid::Uuid;

use super::{
    MAX_RECORD_BYTES, RecordError, StateVersion, StateVersionId, StateVersionRef, StateVersionV1,
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
        generation: 2,
        workspace: artifact(1),
        captures: vec![artifact(2)],
        desired_projection: artifact(3),
    }
}

fn encoded(state: &StateVersion) -> Vec<u8> {
    serde_json::to_vec(state).expect("should serialize the state version")
}

#[test]
fn state_version_wire_format() {
    let state = StateVersion::V1(state());

    assert_eq!(
        serde_json::to_value(&state).expect("should serialize the state version"),
        json!({
            "version": "v1",
            "value": {
                "owner": "00000000-0000-0000-0000-000000000001",
                "parent": { "id": "09".repeat(32), "artifact": artifact_json(9) },
                "generation": 2,
                "workspace": artifact_json(1),
                "captures": [artifact_json(2)],
                "desired_projection": artifact_json(3),
            },
        })
    );
    assert_eq!(
        state.id().to_string(),
        "b3ce83f4331161cd4210ecf8d47acf44ca697bc16bb676c5249356c617628b90"
    );
}

#[rstest]
#[case::owner(|state: &mut StateVersionV1| state.owner = Uuid::from_u128(2))]
#[case::parent(|state: &mut StateVersionV1| state.parent = None)]
#[case::generation(|state: &mut StateVersionV1| state.generation = 3)]
#[case::workspace(|state: &mut StateVersionV1| state.workspace = artifact(4))]
#[case::captures(|state: &mut StateVersionV1| state.captures.push(artifact(4)))]
#[case::desired_projection(|state: &mut StateVersionV1| state.desired_projection = artifact(4))]
fn state_id_covers_every_field(#[case] change: fn(&mut StateVersionV1)) {
    let mut changed = state();
    change(&mut changed);

    assert_ne!(
        StateVersion::V1(changed).id(),
        StateVersion::V1(state()).id(),
        "should give a changed state another ID"
    );
}

#[test]
fn decode_round_trips() {
    let state = StateVersion::V1(state());

    let decoded =
        StateVersion::decode(&encoded(&state), state.id()).expect("should decode the state");
    assert_eq!(decoded, state);
}

#[test]
fn decode_rejects_another_state() {
    let state = StateVersion::V1(state());

    let error = StateVersion::decode(&encoded(&state), StateVersionId([0; 32]))
        .expect_err("should reject a state with another ID");
    assert!(
        matches!(error.current_context(), RecordError::Mismatch),
        "should report the mismatch"
    );
}

#[test]
fn decode_rejects_oversized_records() {
    let state = StateVersion::V1(state());
    let mut bytes = encoded(&state);
    // Trailing whitespace keeps the JSON valid, so only the size is wrong.
    bytes.resize(MAX_RECORD_BYTES + 1, b' ');

    let error = StateVersion::decode(&bytes, state.id()).expect_err("should reject the record");
    assert!(
        matches!(error.current_context(), RecordError::Decode),
        "should report the record as undecodable"
    );
}

#[rstest]
#[case::unknown_version(|state: &mut Value| state["version"] = json!("v2"))]
#[case::unknown_field(|state: &mut Value| state["value"]["phase"] = json!("sources_committed"))]
#[case::unknown_parent_field(|state: &mut Value| state["value"]["parent"]["etag"] = json!("etag"))]
fn decode_rejects_malformed_records(#[case] tamper: fn(&mut Value)) {
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

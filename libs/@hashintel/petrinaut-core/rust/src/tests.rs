use serde_json::{Value, json};

use crate::{CommitNodePositions, PetrinautInstance};

fn document() -> Value {
    json!({"places": [{"id":"p", "x":0, "y":0}], "transitions": [], "types": [], "parameters": [], "differentialEquations": []})
}

fn instance(limit: usize) -> PetrinautInstance {
    PetrinautInstance::new(document(), limit, "initial".to_owned(), false)
        .expect("should accept a document")
}

#[test]
fn history_round_trip_nested_values() {
    let mut instance = instance(50);
    let initial = document();
    let mut next = initial.clone();
    next["places"] =
        json!([{"id":"other", "values":[null, true, "\u{1f4ab}", {"field":"value"}]}, {"id":"p2"}]);
    next["scenarios"] = json!([{ "nested": {"0": [1, 2, 3]} }]);
    instance
        .replace_document(next.clone(), "edit".to_owned())
        .expect("should commit");
    instance.go_to_index(0).expect("should undo");
    assert_eq!(instance.document(), &initial);
    instance.go_to_index(1).expect("should redo");
    assert_eq!(instance.document(), &next);
}

#[test]
fn history_truncates_redo_and_retains_baseline() {
    let mut instance = instance(2);
    for index in 1..=3 {
        let mut next = document();
        next["places"][0]["x"] = json!(index);
        instance
            .replace_document(next, index.to_string())
            .expect("should commit");
    }
    assert_eq!(instance.timestamps(), vec!["1", "2", "3"]);
    instance
        .go_to_index(0)
        .expect("should undo retained changes");
    assert_eq!(instance.document()["places"][0]["x"], 1);
    instance
        .replace_document(document(), "branch".to_owned())
        .expect("should commit");
    assert_eq!(instance.timestamps(), vec!["1", "branch"]);
    assert!(
        instance
            .go_to_index(2)
            .expect("should ignore invalid index")
            .is_empty()
    );
}

#[test]
fn commit_invalid_document_is_atomic() {
    let mut instance = instance(50);
    instance
        .replace_document(json!({"places": null}), "bad".to_owned())
        .expect_err("should reject an invalid document");
    assert_eq!(instance.document(), &document());
    assert_eq!(instance.current_index(), 0);
}

#[test]
fn positions_target_subnet_and_undo() {
    let mut initial = document();
    initial["subnets"] = json!([{ "id":"subnet", "places":[{"id":"p", "x":0, "y":0}] }]);
    let mut instance = PetrinautInstance::new(initial.clone(), 50, "initial".to_owned(), false)
        .expect("should create instance");
    let input: CommitNodePositions = serde_json::from_value(json!({ "targetSubnetId":"subnet", "commits":[{"id":"p", "itemType":"place", "position":{"x":42, "y":-7}}] })).expect("should parse command");
    instance
        .commit_node_positions(&input, "move".to_owned())
        .expect("should move");
    assert_eq!(instance.document()["places"][0]["x"], 0);
    assert_eq!(
        instance.document()["subnets"][0]["places"][0]["x"].as_f64(),
        Some(42.0)
    );
    instance.go_to_index(0).expect("should undo move");
    assert_eq!(instance.document(), &initial);
}

#[test]
fn positions_missing_subnet_is_atomic() {
    let mut instance = instance(50);
    let input: CommitNodePositions =
        serde_json::from_value(json!({ "targetSubnetId":"missing", "commits":[] }))
            .expect("should parse command");
    instance
        .commit_node_positions(&input, "move".to_owned())
        .expect_err("should reject a missing subnet");
    assert_eq!(instance.document(), &document());
}

#[test]
fn positions_unchanged_numbers_are_noop() {
    let mut instance = instance(50);
    let input: CommitNodePositions = serde_json::from_value(
        json!({ "commits":[{"id":"p", "itemType":"place", "position":{"x":0, "y":0}}] }),
    )
    .expect("should parse command");
    assert!(
        instance
            .commit_node_positions(&input, "move".to_owned())
            .expect("should accept positions")
            .is_empty()
    );
    assert_eq!(instance.timestamps(), vec!["initial"]);
}

#[test]
fn readonly_and_history_disabled() {
    let mut readonly = PetrinautInstance::new(document(), 50, "initial".to_owned(), true)
        .expect("should create readonly instance");
    let mut next = document();
    next["places"] = json!([]);
    assert!(
        readonly
            .replace_document(next.clone(), "edit".to_owned())
            .expect("should ignore write")
            .is_empty()
    );
    assert_eq!(readonly.document(), &document());
    let mut instance = instance(0);
    instance
        .replace_document(next.clone(), "edit".to_owned())
        .expect("should commit");
    assert_eq!(instance.document(), &next);
    assert_eq!(instance.timestamps(), vec!["initial"]);
}

#[test]
fn commit_preserves_large_native_integers() {
    let mut initial = document();
    initial["metadata"] = json!({"sequence": (1_u64 << 53)});
    let mut instance = PetrinautInstance::new(initial.clone(), 50, "initial".to_owned(), false)
        .expect("should create instance");
    let mut next = initial.clone();
    next["metadata"]["sequence"] = json!(((1_u64 << 53) + 1));
    assert!(
        !instance
            .replace_document(next.clone(), "edit".to_owned())
            .expect("should commit distinct integers")
            .is_empty()
    );
    assert_eq!(instance.document(), &next);
    instance.go_to_index(0).expect("should undo");
    assert_eq!(instance.document(), &initial);
}

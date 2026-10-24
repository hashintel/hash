use serde_json::{Value, json};

use crate::{Command, CommitNodePositions, Extensions, PetrinautInstance};

fn document() -> Value {
    normalize(
        json!({"places": [place("p")], "transitions": [], "types": [], "parameters": [], "differentialEquations": []}),
    )
}

fn normalize(value: Value) -> Value {
    crate::model::Sdcpn::from_input(value)
        .expect("fixture should be a valid document")
        .to_json()
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
    next["metadata"] =
        json!({"values":[null, true, "\u{1f4ab}", {"field":"value"}], "nested":{"0":[1,2,3]}});
    next["places"] = json!([place("other"), place("p2")]);
    next = normalize(next);
    instance
        .replace_document(next.clone(), "edit".to_owned())
        .expect("should commit");
    instance.go_to_index(0).expect("should undo");
    assert_eq!(instance.document(), &normalize(initial));
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
    assert_eq!(instance.document()["places"][0]["x"], 1.0);
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
    initial["subnets"] =
        json!([{ "id":"subnet", "name":"Reusable", "places":[place("p")], "transitions":[] }]);
    let mut instance =
        PetrinautInstance::new(normalize(initial.clone()), 50, "initial".to_owned(), false)
            .expect("should create instance");
    let input: CommitNodePositions = serde_json::from_value(json!({ "targetSubnetId":"subnet", "commits":[{"id":"p", "itemType":"place", "position":{"x":42, "y":-7}}] })).expect("should parse command");
    instance
        .commit_node_positions(&input, "move".to_owned())
        .expect("should move");
    assert_eq!(instance.document()["places"][0]["x"], 0.0);
    assert_eq!(
        instance.document()["subnets"][0]["places"][0]["x"].as_f64(),
        Some(42.0)
    );
    instance.go_to_index(0).expect("should undo move");
    assert_eq!(instance.document(), &normalize(initial.clone()));
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
    let mut instance =
        PetrinautInstance::new(normalize(initial.clone()), 50, "initial".to_owned(), false)
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
    assert_eq!(instance.document(), &normalize(initial.clone()));
}

#[test]
fn extension_policy_applies_to_initial_state_and_all_commits() {
    let mut initial = document();
    initial["places"][0] = json!({"id":"p", "name":"Queue", "x":0, "y":0, "colorId":"color", "dynamicsEnabled":true, "differentialEquationId":"equation", "visualizerCode":"code"});
    initial["scenarios"] = json!([{"id":"scenario", "name":"Scenario", "scenarioParameters":[], "parameterOverrides":{"rate":"1"}, "initialState":{"type":"per_place", "content":{"p":[[1],[2]]}}}]);
    let policy = Extensions {
        colors: false,
        parameters: false,
        ..Extensions::default()
    };
    let mut instance = PetrinautInstance::new_with_extensions(
        initial.clone(),
        50,
        "initial".to_owned(),
        false,
        policy,
    )
    .expect("should create instance");
    assert_eq!(instance.document()["places"][0]["colorId"], Value::Null);
    assert_eq!(instance.document()["places"][0]["dynamicsEnabled"], false);
    assert!(
        instance.document()["places"][0]
            .get("visualizerCode")
            .is_none()
    );
    assert_eq!(
        instance.document()["scenarios"][0]["initialState"]["content"]
            [crate::model::canonical_id("p")],
        "2"
    );
    assert_eq!(
        instance.document()["scenarios"][0]["parameterOverrides"],
        json!({})
    );
    let baseline = instance.document().clone();
    initial["places"][0]["x"] = json!(7);
    instance
        .replace_document(initial, "edit".to_owned())
        .expect("should commit sanitized draft");
    assert_eq!(instance.document()["places"][0]["colorId"], Value::Null);
    instance.go_to_index(0).expect("should undo");
    assert_eq!(instance.document(), &baseline);
}

#[test]
fn command_dispatch_records_one_transaction_and_preserves_redo_after_failure() {
    let mut instance = instance(50);
    let command: Command = serde_json::from_value(json!({"type":"commitNodePositions", "input":{"commits":[{"id":"p", "itemType":"place", "position":{"x":8,"y":9}}]}})).expect("should parse edit");
    instance
        .execute(&command, "move".to_owned())
        .expect("should execute edit");
    instance.go_to_index(0).expect("should undo");
    let bad: Command = serde_json::from_value(
        json!({"type":"commitNodePositions", "input":{"targetSubnetId":"missing", "commits":[]}}),
    )
    .expect("should parse edit");
    instance
        .execute(&bad, "bad".to_owned())
        .expect_err("should reject missing subnet");
    assert_eq!(instance.timestamps(), vec!["initial", "move"]);
    instance.go_to_index(1).expect("should retain redo");
    assert_eq!(instance.document()["places"][0]["x"], 8.0);
}

fn place(id: &str) -> Value {
    json!({"id":id, "name":"Queue", "colorId":null, "dynamicsEnabled":false, "differentialEquationId":null, "x":0, "y":0})
}

fn command(value: Value) -> Command {
    serde_json::from_value(value).expect("should parse command")
}

#[test]
fn place_dynamics_failure_preserves_redo() {
    let mut instance = instance(50);
    let add = command(json!({"type":"addPlace", "input":{"place":place("new")}}));
    instance
        .execute(&add, "add".to_owned())
        .expect("should add place");
    let update = command(
        json!({"type":"updatePlace", "input":{"placeId":"new", "update":{"description":"changed"}}}),
    );
    instance
        .execute(&update, "update".to_owned())
        .expect("should update place");
    let changed = instance.document().clone();
    instance.go_to_index(1).expect("should undo update");
    let baseline = instance.document().clone();
    let invalid = command(
        json!({"type":"updatePlace", "input":{"placeId":"new", "update":{"dynamicsEnabled":true,"differentialEquationId":"missing"}}}),
    );
    assert_eq!(
        instance
            .execute(&invalid, "bad".to_owned())
            .expect_err("should validate equation"),
        format!(
            "Place `Queue` references differential equation ID `{}` which does not exist.",
            crate::model::canonical_id("missing")
        )
    );
    assert_eq!(
        instance.document(),
        &baseline,
        "should preserve the document on validation failure"
    );
    instance
        .go_to_index(2)
        .expect("should retain redo after failure");
    assert_eq!(
        instance.document(),
        &changed,
        "should restore the valid update"
    );
}

#[test]
fn place_removal_cascades_subnet_ports_atomically() {
    let transition = json!({"id":"t", "name":"Move", "inputArcs":[{"endpoint":{"kind":"componentPort","componentInstanceId":"i","portPlaceId":"port"},"weight":1,"type":"read"}], "outputArcs":[], "lambdaType":"predicate", "lambdaCode":"return true", "transitionKernelCode":"", "x":0,"y":0});
    let mut initial = document();
    let mut port = place("port");
    port["isPort"] = json!(true);
    let mut subnet = document();
    subnet["id"] = json!("subnet");
    subnet["name"] = json!("Reusable");
    subnet["places"] = json!([port]);
    subnet["transitions"] = json!([{"id":"inside","name":"Move", "x":0,"y":0,"inputArcs":[],"outputArcs":[{"placeId":"port","weight":1}],"lambdaType":"predicate","lambdaCode":"","transitionKernelCode":""}]);
    let mut other = document();
    other["id"] = json!("other");
    other["name"] = json!("Other");
    other["componentInstances"] =
        json!([{"id":"i","name":"Instance","subnetId":"subnet","parameterValues":{},"x":0,"y":0}]);
    other["transitions"] = json!([transition]);
    initial["componentInstances"] = other["componentInstances"].clone();
    initial["transitions"] = other["transitions"].clone();
    initial["subnets"] = json!([subnet, other]);
    let mut instance =
        PetrinautInstance::new(normalize(initial.clone()), 50, "initial".to_owned(), false)
            .expect("should create instance");
    let remove = command(
        json!({"type":"removePlace", "input":{"placeId":"port","targetSubnetId":"subnet"}}),
    );
    instance
        .execute(&remove, "remove".to_owned())
        .expect("should remove port");
    assert_eq!(
        instance.document()["transitions"][0]["inputArcs"],
        json!([]),
        "should remove root port references"
    );
    assert_eq!(
        instance.document()["subnets"][1]["transitions"][0]["inputArcs"],
        json!([]),
        "should remove references in other subnets"
    );
    assert_eq!(
        instance.document()["subnets"][0]["transitions"][0]["outputArcs"],
        json!([]),
        "should remove local place references"
    );
    assert_eq!(
        instance.current_index(),
        1,
        "should record one atomic deletion"
    );
    instance
        .go_to_index(0)
        .expect("should undo all cascading edits");
    assert_eq!(
        instance.document(),
        &normalize(initial.clone()),
        "should restore the complete net"
    );
}

#[test]
fn place_validation_and_missing_targets_are_atomic() {
    let mut instance = instance(50);
    instance
        .execute(
            &command(json!({"type":"addPlace", "input":{"place":place("valid")}})),
            "add".to_owned(),
        )
        .expect("should add place");
    let baseline = instance.document().clone();
    for update in [
        json!({"x": 10}),
        json!({"name":"lowercase"}),
        json!({"capacity":-1}),
        json!({"capacity":0.5}),
        json!({"isPort":null}),
    ] {
        instance
            .execute(
                &command(
                    json!({"type":"updatePlace", "input":{"placeId":"valid","update":update}}),
                ),
                "bad".to_owned(),
            )
            .expect_err("should validate native place updates");
        assert_eq!(
            instance.document(),
            &baseline,
            "should preserve state after invalid updates"
        );
    }
    instance.execute(&command(json!({"type":"removePlace", "input":{"placeId":"valid","targetSubnetId":"missing"}})), "bad".to_owned()).expect_err("should reject a missing subnet");
    assert_eq!(
        instance.current_index(),
        1,
        "should retain only the valid transaction"
    );
}

fn transition() -> Value {
    json!({"id":"t", "name":"Move", "inputArcs":[], "outputArcs":[], "lambdaType":"predicate", "lambdaCode":"return true;", "transitionKernelCode":"", "x":0, "y":0})
}

fn graph() -> Value {
    let mut initial = document();
    initial["places"] = json!([place("p"), place("q")]);
    initial["transitions"] = json!([transition()]);
    initial
}

#[test]
fn transition_edits_target_subnet_and_undo() {
    let mut initial = graph();
    let mut subnet = graph();
    subnet["id"] = json!("subnet");
    subnet["name"] = json!("Reusable");
    initial["subnets"] = json!([subnet]);
    let mut instance =
        PetrinautInstance::new(normalize(initial.clone()), 50, "initial".to_owned(), false)
            .expect("should create instance");
    let mut added = transition();
    added["id"] = json!("added");
    added["name"] = json!("  Display name  ");
    instance.execute(&command(json!({"type":"addTransition","input":{"targetSubnetId":"subnet","transition":added}})), "add".to_owned()).expect("should add transition to subnet");
    assert_eq!(
        instance.document()["transitions"]
            .as_array()
            .expect("should contain transitions")
            .len(),
        1,
        "should leave root transitions unchanged"
    );
    assert_eq!(
        instance.document()["subnets"][0]["transitions"][1]["name"],
        "Display name",
        "should normalize display names"
    );
    instance.execute(&command(json!({"type":"updateTransition","input":{"targetSubnetId":"subnet","transitionId":"added","update":{"name":"Updated name","metadata":{"nested":[1,true,null]}}}})), "update".to_owned()).expect("should update transition fields");
    let updated = instance.document().clone();
    instance.execute(&command(json!({"type":"updateTransition","input":{"targetSubnetId":"subnet","transitionId":"added","update":{"inputArcs":[]}}})), "bad".to_owned()).expect_err("should keep arcs behind their dedicated commands");
    assert_eq!(
        instance.document(),
        &updated,
        "should preserve the document on failure"
    );
    instance.execute(&command(json!({"type":"removeTransition","input":{"targetSubnetId":"subnet","transitionId":"added"}})), "remove".to_owned()).expect("should remove transition");
    instance.go_to_index(2).expect("should undo removal");
    assert_eq!(
        instance.document(),
        &updated,
        "should restore all transition fields"
    );
    instance
        .go_to_index(0)
        .expect("should undo creation and edits");
    assert_eq!(
        instance.document(),
        &normalize(initial.clone()),
        "should restore the initial document"
    );
}

#[test]
fn arc_edits_preserve_identity_and_history() {
    let initial = graph();
    let mut instance =
        PetrinautInstance::new(normalize(initial.clone()), 50, "initial".to_owned(), false)
            .expect("should create instance");
    let target = json!({"transitionId":"t","arcDirection":"input","endpoint":{"kind":"place","placeId":"p"}});
    let add = command(json!({"type":"addArc","input":{"target":target,"weight":1,"type":"read"}}));
    instance
        .execute(&add, "add".to_owned())
        .expect("should add arc");
    assert!(
        instance
            .execute(&add, "duplicate".to_owned())
            .expect("should ignore duplicate endpoint")
            .is_empty(),
        "should not record duplicate arcs"
    );
    instance
        .execute(
            &command(json!({"type":"updateArcWeight","input":{"target":target,"weight":2.5}})),
            "weight".to_owned(),
        )
        .expect("should preserve fractional weights");
    instance
        .execute(
            &command(json!({"type":"updateArcType","input":{"target":target,"type":"inhibitor"}})),
            "type".to_owned(),
        )
        .expect("should update input arc type");
    instance.execute(&command(json!({"type":"updateArcPlace","input":{"target":target,"newEndpoint":{"kind":"place","placeId":"q"}}})), "endpoint".to_owned()).expect("should replace endpoint");
    assert_eq!(
        instance.document()["transitions"][0]["inputArcs"],
        json!([{"placeId":crate::model::canonical_id("q"),"weight":2.5,"type":"inhibitor"}]),
        "should preserve arc weight and type while replacing the reference"
    );
    let final_state = instance.document().clone();
    instance.go_to_index(1).expect("should undo arc edits");
    let mut invalid =
        command(json!({"type":"updateArcWeight","input":{"target":target,"weight":1}}));
    if let Command::UpdateArcWeight(input) = &mut invalid {
        input.weight = f64::NAN;
    }
    assert_eq!(
        instance
            .execute(&invalid, "bad".to_owned())
            .expect_err("should validate native numeric values"),
        "Arc weight must be a positive finite number"
    );
    instance
        .go_to_index(4)
        .expect("should preserve redo after invalid weight");
    assert_eq!(
        instance.document(),
        &final_state,
        "should restore the last valid arc"
    );
    let remove = command(
        json!({"type":"removeArc","input":{"transitionId":"t","arcDirection":"input","endpoint":{"kind":"place","placeId":"q"}}}),
    );
    instance
        .execute(&remove, "remove".to_owned())
        .expect("should remove the replaced endpoint");
    assert_eq!(
        instance.document()["transitions"][0]["inputArcs"],
        json!([]),
        "should remove the arc"
    );
    instance.go_to_index(0).expect("should undo all commands");
    assert_eq!(
        instance.document(),
        &normalize(initial.clone()),
        "should restore the complete initial graph"
    );
    let mut readonly =
        PetrinautInstance::new(normalize(initial.clone()), 50, "initial".to_owned(), true)
            .expect("should create readonly instance");
    readonly
        .execute(&add, "ignored".to_owned())
        .expect("should ignore readonly edits");
    assert_eq!(
        readonly.document(),
        &normalize(initial),
        "should preserve readonly state"
    );
    assert_eq!(
        readonly.current_index(),
        0,
        "should not record readonly edits"
    );
}

#[test]
fn arc_reference_failures_are_atomic() {
    let mut initial = graph();
    let mut subnet = graph();
    subnet["id"] = json!("subnet");
    subnet["name"] = json!("Reusable");
    subnet["name"] = json!("Reusable");
    initial["subnets"] = json!([subnet]);
    initial["componentInstances"] = json!([{"id":"instance","name":"Instance","subnetId":"subnet","parameterValues":{},"x":0,"y":0}]);
    let mut instance =
        PetrinautInstance::new(normalize(initial.clone()), 50, "initial".to_owned(), false)
            .expect("should create instance");
    for (endpoint, message) in [
        (
            json!({"kind":"place","placeId":"missing"}),
            "Arc references place ID `missing` which does not exist in the target net.",
        ),
        (
            json!({"kind":"componentPort","componentInstanceId":"missing","portPlaceId":"p"}),
            "Arc references component instance ID `missing` which does not exist in the target \
             net.",
        ),
        (
            json!({"kind":"componentPort","componentInstanceId":"instance","portPlaceId":"missing"}),
            "Arc references subnet port place ID `missing` which does not exist in subnet \
             `Reusable`.",
        ),
        (
            json!({"kind":"componentPort","componentInstanceId":"instance","portPlaceId":"p"}),
            "Arc references subnet place `Queue`, but only places marked `isPort` can be used as \
             component ports.",
        ),
    ] {
        let add = command(
            json!({"type":"addArc","input":{"target":{"transitionId":"t","arcDirection":"output","endpoint":endpoint},"weight":1}}),
        );
        assert_eq!(
            instance
                .execute(&add, "bad".to_owned())
                .expect_err("should validate endpoint references"),
            message.replace(
                "`missing`",
                &format!("`{}`", crate::model::canonical_id("missing"))
            )
        );
        assert_eq!(
            instance.document(),
            &normalize(initial.clone()),
            "should preserve the document after invalid references"
        );
    }
    assert_eq!(
        instance.current_index(),
        0,
        "should not record failed arc edits"
    );
}

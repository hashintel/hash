//! Full Graph states transcribed from scenario and stage-4 expectation tables.

use alloc::collections::BTreeMap;

use serde_json::{Value, value::RawValue};
use similar_asserts::assert_eq;
use type_system::principal::actor::ActorEntityUuid;

use super::expected::{BASE, Fixtures, array, number, text};
use crate::graph::{FakeGraph, Graph as _, GraphResponse, Recorded, RequestKind};

struct ExpectedEntity {
    archived: bool,
    editions: u64,
    properties: Value,
}

fn state_changes(scenario: &str, run: u64) -> &'static [(&'static str, u64, bool, &'static str)] {
    // The edition counts below come from stage-4-send.md §7.6; they are deliberately not
    // computed by applying the writes under test to a second implementation of the fake.
    match (scenario, run) {
        ("S2", 2) => &[("AC-N100", 2, false, "AC-N100-changed-model")],
        ("S2", 3) => &[
            ("AC-N100", 2, false, "AC-N100-changed-model"),
            ("AC-SEXXX", 2, false, "AC-SEXXX-without-mass"),
        ],
        ("S3", 2) => &[
            ("AC-N100", 2, true, "AC-N100"),
            ("L-N100-ESSA", 2, true, "L-N100-ESSA"),
        ],
        ("S3", 3 | 4) => &[
            ("AC-N100", 3, false, "AC-N100"),
            ("L-N100-ESSA", 3, false, "L-N100-ESSA"),
        ],
        ("S3", 5) => &[
            ("AC-N100", 4, true, "AC-N100"),
            ("L-N100-ESSA", 4, true, "L-N100-ESSA"),
            ("AC-SEXXX", 2, true, "AC-SEXXX"),
            ("L-SEXXX-ESSA", 2, true, "L-SEXXX-ESSA"),
        ],
        ("S5", 2) => &[
            ("AC-SEXXX", 2, true, "AC-SEXXX"),
            ("AC-N100", 2, true, "AC-N100"),
            ("L-N100-ESSA", 2, true, "L-N100-ESSA"),
            ("L-SEXXX-ESSA", 2, true, "L-SEXXX-ESSA"),
            ("AC2-SEXXX", 1, false, "AC2-SEXXX"),
            ("AC2-N100", 1, false, "AC2-N100"),
            ("L2-SEXXX-ESSA", 1, false, "L2-SEXXX-ESSA"),
            ("L2-N100-ESSA", 1, false, "L2-N100-ESSA"),
        ],
        ("S7", 2) => &[
            ("AC-N100", 2, false, "AC-N100-changed-model"),
            ("AC-GABCD", 1, false, "AC-GABCD"),
        ],
        ("S7", 3) => &[
            ("AC-N100", 3, false, "AC-N100"),
            ("AC-GABCD", 2, true, "AC-GABCD"),
        ],
        ("S8", 2) => &[
            ("AC-N100", 2, false, "AC-N100-changed-model"),
            ("AF-ESSB", 2, true, "AF-ESSB"),
            ("AF-ESGG", 1, false, "AF-ESGG"),
        ],
        ("S8", 3) => &[
            ("AC-N100", 3, false, "AC-N100"),
            ("AF-ESSB", 3, false, "AF-ESSB"),
            ("AF-ESGG", 2, true, "AF-ESGG"),
        ],
        ("S8", 4) => &[
            ("AC-N100", 4, true, "AC-N100"),
            ("AF-ESSB", 4, true, "AF-ESSB"),
            ("AF-ESGG", 2, true, "AF-ESGG"),
            ("AC-SEXXX", 2, true, "AC-SEXXX"),
            ("AF-ESSA", 2, true, "AF-ESSA"),
            ("L-N100-ESSA", 2, true, "L-N100-ESSA"),
            ("L-SEXXX-ESSA", 2, true, "L-SEXXX-ESSA"),
        ],
        ("S9", 2) => &[
            ("AC-N100", 3, false, "AC-N100"),
            ("AF-ESSA", 3, false, "AF-ESSA"),
        ],
        ("S9", 3 | 4) => &[
            ("AC-N100", 4, true, "AC-N100"),
            ("AF-ESSA", 3, false, "AF-ESSA"),
            ("L-N100-ESSA", 2, true, "L-N100-ESSA"),
        ],
        _ => &[],
    }
}

fn expected_state(
    fixture: &Fixtures,
    scenario: &str,
    run: u64,
) -> BTreeMap<String, ExpectedEntity> {
    let mut state: BTreeMap<String, _> = BASE
        .into_iter()
        .map(|alias| {
            (
                alias.into(),
                ExpectedEntity {
                    archived: false,
                    editions: 1,
                    properties: fixture.properties(alias),
                },
            )
        })
        .collect();
    for (alias, editions, archived, properties) in state_changes(scenario, run) {
        state.insert(
            (*alias).into(),
            ExpectedEntity {
                archived: *archived,
                editions: *editions,
                properties: fixture.properties(properties),
            },
        );
    }
    if scenario == "S6" && run == 1 {
        state.remove("AC-N100");
        state.remove("L-N100-ESSA");
    }
    if scenario == "S4" && run == 3 {
        for alias in ["AC-SEXXX", "AC-N100"] {
            let entity = state.get_mut(alias).expect("should include each aircraft");
            entity.editions = 2;
            entity.properties["value"]
                .as_object_mut()
                .expect("should specify properties")
                .remove("https://example.com/@demo/types/property-type/model/");
        }
    }
    state
}

pub(super) fn assert_state(fixture: &Fixtures, scenario: &str, run: u64, graph: &FakeGraph) {
    let expected = expected_state(fixture, scenario, run);
    for alias in fixture.identities["entities"]
        .as_object()
        .expect("should specify identities")
        .keys()
    {
        let actual = graph.entity(fixture.id(alias));
        let Some(expected) = expected.get(alias) else {
            assert!(
                actual.is_none(),
                "should leave {alias} absent in {scenario} run {run}"
            );
            continue;
        };
        let actual = actual.expect("should contain the expected entity");
        assert_eq!(
            actual.archived, expected.archived,
            "should match {alias} archive state in {scenario} run {run}"
        );
        assert_eq!(
            actual.editions, expected.editions,
            "should match {alias} edition count in {scenario} run {run}"
        );
        assert_eq!(
            serde_json::to_value(actual.properties).expect("should encode observable properties"),
            expected.properties,
            "should match {alias} properties in {scenario} run {run}"
        );
    }
}

pub(super) async fn prepare(
    fixture: &Fixtures,
    scenario: &str,
    run: &Value,
    actor: ActorEntityUuid,
    graph: &FakeGraph,
) {
    graph.clear_answers();
    graph.reachable();
    if scenario == "S6" && number(&run["number"]) == 1 {
        graph.answer(RequestKind::Create, fixture.id("AC-N100"), 400);
    }
    if scenario == "S7" && number(&run["number"]) == 2 {
        graph.unreachable_after(2);
    }
    if scenario == "S9" && number(&run["number"]) == 2 {
        for (alias, kind) in [("AC-N100", "archive"), ("AF-ESSA", "patch")] {
            let body = fixture
                .body(scenario, run, alias, kind)
                .replace("Arlanda", "Stockholm");
            let body: Box<RawValue> =
                serde_json::from_str(&body).expect("should parse independent drift body");
            assert_eq!(graph.patch(actor, &[&body]).await, GraphResponse::Applied);
        }
    }
    drop(graph.requests());
}

struct ExpectedRequest {
    kind: RequestKind,
    ids: Vec<String>,
    bodies: Vec<String>,
    response: GraphResponse,
}

fn explicit_request(
    fixture: &Fixtures,
    scenario: &str,
    run: &Value,
    request: &Value,
) -> ExpectedRequest {
    let method = text(&request["method"]);
    let response = if request["response"] == "Applied" {
        GraphResponse::Applied
    } else {
        GraphResponse::Status(
            u16::try_from(number(&request["response"])).expect("should fit an HTTP status"),
        )
    };
    let aliases = array(&request["entities"]);
    ExpectedRequest {
        kind: if method == "create" {
            RequestKind::Create
        } else {
            RequestKind::Patch
        },
        ids: aliases
            .iter()
            .map(|alias| text(&fixture.identity(text(alias))["entity_id"]).to_owned())
            .collect(),
        bodies: aliases
            .iter()
            .map(|alias| fixture.body(scenario, run, text(alias), method))
            .collect(),
        response,
    }
}

fn requests(
    fixture: &Fixtures,
    scenario: &str,
    run: &Value,
    writes: &Value,
) -> Vec<ExpectedRequest> {
    if let Some(requests) = run["requests"].as_array() {
        return requests
            .iter()
            .map(|request| explicit_request(fixture, scenario, run, request))
            .collect();
    }
    let mut expected = Vec::new();
    let rows = array(&writes["rows"]);
    for group in rows.chunk_by(|left, right| left[1] == right[1]) {
        let first = group.first().expect("should contain a write in each group");
        let create = first[3] == "insert";
        let body = if create { 9 } else { 10 };
        let response = if scenario == "S7"
            && number(&run["number"]) == 3
            && first[4] == fixture.identity("L-GABCD-ESSB")["entity_id"]
        {
            GraphResponse::Status(404)
        } else {
            GraphResponse::Applied
        };
        expected.push(ExpectedRequest {
            kind: if create {
                RequestKind::Create
            } else {
                RequestKind::Patch
            },
            ids: group.iter().map(|row| text(&row[4]).to_owned()).collect(),
            bodies: group
                .iter()
                .map(|row| text(&row[body]).to_owned())
                .collect(),
            response,
        });
    }
    if scenario == "S7" && number(&run["number"]) == 2 {
        expected.truncate(2);
        let failed = &rows[2];
        for _ in 0..5 {
            expected.push(ExpectedRequest {
                kind: RequestKind::Create,
                ids: vec![text(&failed[4]).into()],
                bodies: vec![text(&failed[9]).into()],
                response: GraphResponse::Unreachable,
            });
        }
    }
    expected
}

pub(super) fn assert_requests(
    fixture: &Fixtures,
    scenario: &str,
    run: &Value,
    writes: &Value,
    actor: ActorEntityUuid,
    actual: &[Recorded],
) {
    let expected = requests(fixture, scenario, run, writes);
    assert_eq!(
        actual.len(),
        expected.len(),
        "should issue exactly the specified requests"
    );
    for (actual, expected) in actual.iter().zip(expected) {
        assert_eq!(actual.actor, actor);
        assert_eq!(actual.kind, expected.kind);
        assert_eq!(actual.response, expected.response);
        assert_eq!(
            actual
                .entity_ids
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>(),
            expected.ids
        );
        assert_eq!(
            actual.bodies.iter().map(AsRef::as_ref).collect::<Vec<_>>(),
            expected
                .bodies
                .iter()
                .map(String::as_str)
                .collect::<Vec<_>>(),
            "should send the exact independently specified request strings"
        );
    }
}

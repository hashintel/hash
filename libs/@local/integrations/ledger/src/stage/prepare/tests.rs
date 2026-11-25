use core::fmt::Write as _;

use duckdb::types::Value;
use hash_integrations_definition::{Action, Definition, EntitySink, LinkPipeline, StepKind};
use pretty_assertions::assert_eq;
use type_system::{
    knowledge::entity::id::EntityId, ontology::VersionedUrl, principal::actor_group::WebId,
};
use uuid::Uuid;

use super::{
    changes::{Changes, Context},
    entity_id::derive_entity_id,
};
use crate::{run::RunId, sync_table::Op};

const NAMESPACE: &str = "aviation";
const TYPES: &str = "https://example.com/@demo/types";
const COLUMNS: [&str; 8] = [
    "_op",
    "_seq",
    "TAIL",
    "MODEL",
    "FIRST_FLIGHT",
    "EMPTY_MASS",
    "MASS_UNIT",
    "HOME_BASE",
];

fn definition() -> Definition {
    Definition::from_yaml(include_str!(
        "../../../../definition/examples/aviation.yaml"
    ))
    .expect("the example should be a valid definition")
}

fn sink<'definition>(
    definition: &'definition Definition,
    entity_type: &str,
) -> &'definition EntitySink {
    definition
        .entity_pipelines()
        .iter()
        .flat_map(|pipeline| &pipeline.steps)
        .find_map(|step| match &step.kind {
            StepKind::Action(Action::Sink(sink)) if sink.entity_type == url(entity_type) => {
                Some(sink)
            }
            StepKind::Action(_) | StepKind::Branch(_) => None,
        })
        .expect("the example should have the sink")
}

fn based_at(definition: &Definition) -> &LinkPipeline {
    definition
        .link_pipelines()
        .first()
        .expect("the example should link aircraft to airfields")
}

fn url(path: &str) -> VersionedUrl {
    format!("{TYPES}/{path}/v/1")
        .parse()
        .expect("should be a valid versioned URL")
}

fn web_id() -> WebId {
    WebId::new(Uuid::from_u128(0xA2C8_E6C7_485D_4B54_A248_53C9_B9B0_14A2))
}

fn id(entity_type: &str, source_id: &str) -> EntityId {
    derive_entity_id(web_id(), NAMESPACE, &url(entity_type), source_id)
}

/// Rows of `COLUMNS`, as a sink table holds them: a kind of change, its `_seq` and text.
fn rows(rows: &[(&str, [&str; 6])]) -> Vec<Vec<Value>> {
    rows.iter()
        .zip(0_i64..)
        .map(|((op, values), seq)| {
            [Value::Text((*op).to_owned()), Value::BigInt(seq)]
                .into_iter()
                .chain(values.iter().map(|value| Value::Text((*value).to_owned())))
                .collect()
        })
        .collect()
}

/// The changes of the aircraft sink and the link pipeline for `aircraft`.
fn changes(aircraft: &[Vec<Value>]) -> Changes {
    let definition = definition();
    let context = Context {
        run: RunId::new(),
        web_id: web_id(),
        id_namespace: NAMESPACE,
        unit_maps: definition.unit_maps(),
    };
    let columns = COLUMNS.map(Box::from);
    let mut changes = Changes::default();
    context
        .entity_changes(
            &mut changes,
            sink(&definition, "entity-type/aircraft"),
            &columns,
            aircraft.iter().map(Vec::as_slice),
        )
        .expect("the aircraft should become changes");
    context
        .link_changes(
            &mut changes,
            based_at(&definition),
            &columns,
            aircraft.iter().map(Vec::as_slice),
        )
        .expect("the links should become changes");
    changes
}

/// Every change made from a few aviation rows, and every issue, for review as a whole.
fn render(changes: &Changes) -> String {
    let mut rendered = String::new();
    for row in &changes.rows {
        let op = serde_json::to_value(row.op).expect("the op should render");
        writeln!(
            rendered,
            "{} {} {} {}",
            row.seq,
            op.as_str().unwrap_or_default(),
            row.entity_type,
            row.entity_id
        )
        .expect("writing to a string should succeed");
        if let (Some(left), Some(right)) = (row.left_entity_id, row.right_entity_id) {
            writeln!(rendered, "{left} -> {right}").expect("writing to a string should succeed");
        }
        // Through `Value`, whose map sorts its keys: the properties are held in a `HashMap`.
        let properties = serde_json::to_value(&row.properties)
            .and_then(|properties| serde_json::to_string_pretty(&properties))
            .expect("the properties should render");
        writeln!(rendered, "{properties}\n").expect("writing to a string should succeed");
    }
    rendered.push_str("issues:\n");
    for issue in &changes.issues {
        let issue = serde_json::to_string(issue).expect("the issue should render");
        writeln!(rendered, "  {issue}").expect("writing to a string should succeed");
    }
    rendered
}

/// Turns aircraft and their links into changes, covering a clean row, a bad date, a blank amount,
/// a blank tail and a missing home base.
#[test]
fn aviation_changes() {
    let changes = changes(&rows(&[
        (
            "insert",
            ["SE-XXX", "DC-3", "17.12.1935", "8030", "KG", "ESSA"],
        ),
        ("update", ["G-ABC", "  Ju 52 ", "unknown", "", "KG", ""]),
        (
            "insert",
            ["", "L-1049", "1957-07-15", "69000", "LB", "ESSA"],
        ),
    ]));

    insta::assert_snapshot!(render(&changes));
}

#[test]
fn changes_follow_the_kind_of_change() {
    let changes = changes(&rows(&[
        (
            "insert",
            ["SE-XXX", "DC-3", "1946-04-02", "8030", "KG", "ESSA"],
        ),
        (
            "update",
            ["N100", "L-1049", "1957-07-15", "69000", "LB", "ESSB"],
        ),
        (
            "delete",
            ["G-OLD", "Ju 52", "1932-10-13", "6500", "KG", "ESSA"],
        ),
    ]));

    let aircraft = |tail| id("entity-type/aircraft", tail);
    let airfield = |icao| id("entity-type/airfield", icao);
    assert_eq!(
        changes
            .rows
            .iter()
            .map(|row| (
                row.op,
                row.seq,
                row.left_entity_id,
                row.right_entity_id,
                row.properties.value.is_empty()
            ))
            .collect::<Vec<_>>(),
        [
            (Op::CreateEntity, 0, None, None, false),
            (Op::UpdateEntity, 1, None, None, false),
            (Op::ArchiveEntity, 2, None, None, true),
            (
                Op::CreateLink,
                0,
                Some(aircraft("SE-XXX")),
                Some(airfield("ESSA")),
                true
            ),
            (
                Op::UpdateLink,
                1,
                Some(aircraft("N100")),
                Some(airfield("ESSB")),
                true
            ),
            (
                Op::ArchiveLink,
                2,
                Some(aircraft("G-OLD")),
                Some(airfield("ESSA")),
                true
            ),
        ],
        "each row should become the change its `_op` names, and an archive should have no \
         properties"
    );
    assert_eq!(
        changes
            .rows
            .iter()
            .take(3)
            .map(|row| row.entity_id)
            .collect::<Vec<_>>(),
        [aircraft("SE-XXX"), aircraft("N100"), aircraft("G-OLD")],
        "the left end of each link should be the entity its row changes"
    );
    assert_eq!(changes.issues, [], "the rows should convert without issues");
}

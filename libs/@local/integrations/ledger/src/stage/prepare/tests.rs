use alloc::collections::BTreeMap;
use core::fmt::Write as _;

use duckdb::types::Value;
use hash_integrations_definition::{Action, Definition, EntitySink, LinkPipeline, StepKind};
use tempfile::TempDir;
use type_system::{ontology::VersionedUrl, principal::actor_group::WebId};
use uuid::Uuid;

use super::{
    changes::{Changes, Context},
    run_pipelines,
    workspace::{Workspace, WorkspaceConfig},
};
use crate::run::RunId;

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
        // The properties are held in a `HashMap`, so they are sorted to render the same each time.
        let properties = row.properties.value.iter().collect::<BTreeMap<_, _>>();
        let properties =
            serde_json::to_string_pretty(&properties).expect("the properties should render");
        writeln!(rendered, "{properties}\n").expect("writing to a string should succeed");
    }
    rendered.push_str("issues:\n");
    for issue in &changes.issues {
        let issue = serde_json::to_string(issue).expect("the issue should render");
        writeln!(rendered, "  {issue}").expect("writing to a string should succeed");
    }
    rendered
}

/// Turns aircraft and their links into changes, covering each kind of change, a bad date, a blank
/// amount, a blank tail and a missing home base. A delete archives without properties.
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
        (
            "delete",
            ["G-OLD", "Ju 52", "1932-10-13", "6500", "KG", "ESSB"],
        ),
    ]));

    insta::assert_snapshot!(render(&changes));
}

#[test]
fn checkpoint_source() {
    // A source that is the checkpoint another pipeline writes.
    let definition = Definition::from_yaml(include_str!(
        "../../../tests/fixtures/checkpoint-source.yaml"
    ))
    .expect("the definition should be valid");
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = Workspace::open(
        &directory.path().join("workspace.duckdb"),
        WorkspaceConfig::default(),
        &[],
    )
    .expect("the workspace should open");
    workspace
        .create_table(
            "_source/orders",
            "SELECT 'insert' AS _op, '{}' AS _key, 0::BIGINT AS _seq, 7 AS id",
        )
        .expect("the staged table should be created");
    let staged = BTreeMap::from([(
        "orders".parse().expect("should be a source name"),
        Box::from("_source/orders"),
    )]);

    let tables = run_pipelines(&workspace, &definition, &staged)
        .expect("the pipelines should run without a staged table for the checkpoint source");

    let [sink] = tables.sinks.as_slice() else {
        panic!("the definition should have one sink");
    };
    let rows = workspace
        .query(&format!("SELECT id FROM \"{}\"", sink.table))
        .expect("the sink's rows should be readable");
    assert_eq!(
        rows.iter().collect::<Vec<_>>(),
        [[Value::Int(7)].as_slice()],
        "the sink of the checkpoint source should read the rows the checkpoint saved"
    );
}

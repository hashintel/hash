use alloc::collections::BTreeMap;
use core::assert_matches;

use duckdb::types::Value;
use hash_integrations_definition::{Definition, EntityPipeline, PrimaryKey, SourceKind, Variables};
use pretty_assertions::assert_eq;
use rstest::rstest;
use tempfile::TempDir;

use super::PreparationError;
use crate::stage::prepare::workspace::{Identifier, StatementError, Workspace, WorkspaceConfig};

fn open(directory: &TempDir) -> Workspace {
    Workspace::open(
        &directory.path().join("workspace.duckdb"),
        WorkspaceConfig::default(),
        &[],
    )
    .expect("the workspace should open")
}

fn key(columns: &[&str]) -> PrimaryKey {
    PrimaryKey::new(
        columns
            .iter()
            .map(|column| column.parse().expect("the column name should be valid")),
    )
    .expect("the key should be valid")
}

fn pipeline(steps: &str) -> EntityPipeline {
    let mut indented = String::new();
    for line in steps.lines() {
        indented.push_str("        ");
        indented.push_str(line);
        indented.push('\n');
    }
    let definition = Definition::from_yaml(&format!(
        "connector: demo\nunitMaps:\n  masses:\n    fallback: \
         https://example.com/data-type/mass/v/1\nsources:\n  source:\n    primaryKey: [ID]\n    \
         sql: SELECT 1 AS ID\npipelines:\n  entities:\n    - source: source\n      \
         steps:\n{indented}"
    ))
    .expect("the definition should parse");
    definition
        .entity_pipelines()
        .first()
        .expect("the definition should contain a pipeline")
        .clone()
}

/// Writes the rows of `sql` to `table` with the internal columns that staging adds.
fn source(workspace: &Workspace, table: &str, sql: &str, key: &PrimaryKey) {
    let keys = key
        .columns()
        .iter()
        .map(|column| {
            let column = Identifier::new(column.as_ref());
            format!("{column} := {column}")
        })
        .collect::<Vec<_>>()
        .join(", ");
    workspace
        .create_table(
            table,
            &format!(
                "SELECT 'insert' AS _op, to_json(struct_pack({keys}))::VARCHAR AS _key, \
                 row_number() OVER () AS _seq, source.* FROM ({sql}) AS source"
            ),
        )
        .expect("the source table should be created");
}

fn values(workspace: &Workspace, table: &str) -> Vec<Value> {
    let rows = workspace
        .query(&format!("SELECT VALUE FROM \"{table}\" ORDER BY ID"))
        .expect("the values should be readable");
    rows.iter()
        .map(|row| row.first().expect("the row should have a value").clone())
        .collect()
}

#[test]
fn pipeline_branch_isolation() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory);
    source(
        &workspace,
        "source",
        "SELECT 1 AS ID, 10 AS VALUE",
        &key(&["ID"]),
    );
    let pipeline = pipeline(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/pipeline-branches.yaml"
    )));
    let prepared = workspace
        .prepare_pipeline(&pipeline, "source", &BTreeMap::new())
        .expect("the branches should run");
    let [first, second, main] = prepared.sinks.as_slice() else {
        panic!("three sink tables should be produced");
    };
    assert_eq!(
        values(&workspace, &first.table),
        [Value::Int(110)],
        "the first branch should use the source"
    );
    assert_eq!(
        values(&workspace, &second.table),
        [Value::Int(210)],
        "the second branch should use the same source"
    );
    assert_eq!(
        values(&workspace, &main.table),
        [Value::Int(11)],
        "the main pipeline should retain its input across branches"
    );
    source(
        &workspace,
        "source",
        "SELECT 2 AS ID, 99 AS VALUE",
        &key(&["ID"]),
    );
    let checkpoint = prepared
        .checkpoints
        .values()
        .next()
        .expect("the checkpoint should exist");
    assert_eq!(
        values(&workspace, checkpoint),
        [Value::Int(10)],
        "checkpoints should retain their rows after the source is replaced"
    );
    assert_eq!(
        values(&workspace, &first.table),
        [Value::Int(110)],
        "a sink after a step should name that step's table, which the new source leaves as it is"
    );
}

#[test]
fn pipeline_metadata_loss() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory);
    source(&workspace, "source", "SELECT 1 AS ID", &key(&["ID"]));
    let report = workspace
        .prepare_pipeline(
            &pipeline("- id: lose-metadata\n  sql: SELECT ID FROM input\n"),
            "source",
            &BTreeMap::new(),
        )
        .expect_err("steps should preserve metadata");
    assert!(
        matches!(report.current_context(), PreparationError::Step { step } if step.as_ref() == "lose-metadata"),
        "the failing step should be named: {report:?}"
    );
    assert!(
        report.frames().any(|frame| matches!(
            frame.downcast_ref::<PreparationError>(),
            Some(PreparationError::Metadata { .. })
        )),
        "the report should retain the metadata failure: {report:?}"
    );
}

#[test]
fn pipeline_named_inputs() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory);
    source(
        &workspace,
        "source",
        "SELECT 1 AS ID, 10 AS VALUE",
        &key(&["ID"]),
    );
    workspace
        .create_table("lookup", "SELECT 1 AS ID, 5 AS VALUE")
        .expect("the lookup table should be created");
    let mut pipeline = pipeline(
        "- id: join\n  sql: SELECT input._op, input._key, input._seq, input.ID, input.VALUE + \
         other.VALUE AS VALUE FROM input JOIN other USING (ID)\n",
    );
    let checkpoint = "upstream"
        .parse()
        .expect("the checkpoint name should be valid");
    pipeline.inputs.insert(
        "other".parse().expect("the alias should be valid"),
        checkpoint,
    );
    let report = workspace
        .prepare_pipeline(&pipeline, "source", &BTreeMap::new())
        .expect_err("a missing input should be reported");
    assert!(
        matches!(
            report.current_context(),
            PreparationError::MissingCheckpoint { .. }
        ),
        "the missing checkpoint should be reported: {report:?}"
    );
    let checkpoints = BTreeMap::from([(
        "upstream"
            .parse()
            .expect("the checkpoint name should be valid"),
        Box::from("lookup"),
    )]);
    let prepared = workspace
        .prepare_pipeline(&pipeline, "source", &checkpoints)
        .expect("the input alias should resolve");
    assert_eq!(
        values(&workspace, &prepared.table),
        [Value::Int(15)],
        "SQL should read the bound checkpoint"
    );
    let aliases = workspace
        .query(
            "SELECT count(*) FROM information_schema.tables WHERE table_name IN ('input', 'other')",
        )
        .expect("the catalog should be readable");
    assert_eq!(
        aliases.iter().next(),
        Some([Value::BigInt(0)].as_slice()),
        "input aliases should not leave catalog objects behind"
    );
}

#[test]
fn pipeline_sql_sandbox() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory);
    source(&workspace, "source", "SELECT 1 AS ID", &key(&["ID"]));
    let report = workspace
        .prepare_pipeline(
            &pipeline("- id: unsafe\n  sql: SELECT * FROM read_csv('secrets.csv')\n"),
            "source",
            &BTreeMap::new(),
        )
        .expect_err("pipeline SQL should obey the workspace sandbox");
    assert!(
        matches!(report.downcast_ref::<StatementError>(), Some(StatementError::TableFunction { name }) if name.as_ref() == "read_csv"),
        "the forbidden table function should be reported: {report:?}"
    );
    let prepared = workspace
        .prepare_pipeline(
            &pipeline("- id: valid\n  sql: SELECT * FROM input\n"),
            "source",
            &BTreeMap::new(),
        )
        .expect("a failed step should leave the workspace usable");
    let rows = workspace
        .query(&format!("SELECT ID FROM \"{}\"", prepared.table))
        .expect("the output should be readable");
    assert_eq!(
        rows.iter().next(),
        Some([Value::Int(1)].as_slice()),
        "the next pipeline should retain source values"
    );
}

#[test]
fn link_named_inputs() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory);
    let definition = Definition::from_yaml(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/pipeline-links.yaml"
    )))
    .expect("the definition should parse");
    workspace
        .create_table("left_data", "SELECT 1 AS ID")
        .expect("the left table should be created");
    workspace
        .create_table("right_data", "SELECT 2 AS ID")
        .expect("the right table should be created");
    let checkpoints = BTreeMap::from([
        (
            "left".parse().expect("the checkpoint should be valid"),
            Box::from("left_data"),
        ),
        (
            "right".parse().expect("the checkpoint should be valid"),
            Box::from("right_data"),
        ),
    ]);
    let pipeline = definition
        .link_pipelines()
        .first()
        .expect("the link pipeline should exist");
    let prepared = workspace
        .prepare_link_pipeline(pipeline, &checkpoints)
        .expect("the named inputs should combine");
    let rows = workspace
        .query(&format!(
            "SELECT FROM_ID, TO_ID FROM \"{}\"",
            prepared.table
        ))
        .expect("the link rows should be readable");
    assert_eq!(
        rows.iter().next(),
        Some([Value::Int(1), Value::Int(2)].as_slice()),
        "the next step should see the previous join as input"
    );
}

#[test]
fn definition_aviation_tables() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory);
    let definition = Definition::from_yaml(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../definition/examples/aviation.yaml"
    )))
    .expect("the aviation definition should parse");
    let mut checkpoints = BTreeMap::new();
    let mut sinks = Vec::new();
    for pipeline in definition.entity_pipelines() {
        let source_definition = definition
            .sources()
            .get(&pipeline.source)
            .expect("the pipeline source should exist");
        let table = match &source_definition.kind {
            SourceKind::Sql { query, primary_key } => {
                let table = format!("_source/{}", pipeline.source).into_boxed_str();
                source(&workspace, &table, query.as_ref(), primary_key);
                table
            }
            SourceKind::Checkpoint { checkpoint } => checkpoints
                .get(checkpoint)
                .cloned()
                .expect("the checkpoint source should exist"),
            SourceKind::Local { .. } | SourceKind::Postgres { .. } | SourceKind::Rest { .. } => {
                panic!("the aviation fixture should use SQL and checkpoint sources")
            }
        };
        let prepared = workspace
            .prepare_pipeline(pipeline, &table, &checkpoints)
            .expect("the aviation pipeline should be prepared");
        checkpoints.extend(prepared.checkpoints);
        sinks.extend(prepared.sinks);
    }
    assert_eq!(
        sinks.len(),
        2,
        "airfields and aircraft should each produce an entity sink"
    );
    for sink in &sinks {
        let rows = workspace
            .query(&format!("SELECT count(*) FROM \"{}\"", sink.table))
            .expect("the prepared sink should be readable");
        assert_eq!(
            rows.iter().next(),
            Some([Value::BigInt(2)].as_slice()),
            "each sink should contain two rows"
        );
    }
    let link = definition
        .link_pipelines()
        .first()
        .expect("the aviation link should exist");
    let prepared = workspace
        .prepare_link_pipeline(link, &checkpoints)
        .expect("the aviation links should be prepared");
    assert_eq!(
        prepared.pipeline, *link,
        "the prepared link should carry its pipeline"
    );
    let rows = workspace
        .query(&format!(
            "SELECT TAIL, HOME_BASE FROM \"{}\" ORDER BY TAIL",
            prepared.table
        ))
        .expect("the link endpoints should be readable");
    assert_eq!(
        rows.iter().collect::<Vec<_>>(),
        [
            [
                Value::Text("N100".to_owned()),
                Value::Text("ESSA".to_owned())
            ],
            [
                Value::Text("SE-XXX".to_owned()),
                Value::Text("ESSA".to_owned())
            ],
        ],
        "both aircraft should link to their home airfield"
    );
}

#[test]
fn pipeline_bound_parameters() {
    let directory = TempDir::new().expect("the directory should be created");
    let variables = Variables::try_from(BTreeMap::from([(
        "INCREMENT"
            .parse()
            .expect("the variable name should be valid"),
        Box::from("7"),
    )]))
    .expect("the variables should be valid");
    let workspace = Workspace::open(
        &directory.path().join("workspace.duckdb"),
        WorkspaceConfig {
            variables,
            ..WorkspaceConfig::default()
        },
        &[],
    )
    .expect("the workspace should open");
    source(
        &workspace,
        "source",
        "SELECT $increment::INTEGER AS ID, 10 AS VALUE",
        &key(&["ID"]),
    );
    let prepared = workspace
        .prepare_pipeline(
            &pipeline(
                "- id: add\n  sql: SELECT _op, _key, _seq, ID, VALUE + $Increment::INTEGER AS \
                 VALUE FROM input; -- step terminator\n",
            ),
            "source",
            &BTreeMap::new(),
        )
        .expect("canonicalized SQL should retain named parameters");
    assert_eq!(
        values(&workspace, &prepared.table),
        [Value::Int(17)],
        "both source and step parameters should bind by name"
    );
}

#[rstest]
#[case::all_three("'insert' AS _op, '{}' AS _key, 1::BIGINT AS _seq", true)]
#[case::without_seq("'insert' AS _op, '{}' AS _key", false)]
#[case::seq_as_text("'insert' AS _op, '{}' AS _key, '1' AS _seq", false)]
#[case::null_seq("'insert' AS _op, '{}' AS _key, NULL::BIGINT AS _seq", false)]
#[case::op_as_integer("1 AS _op, '{}' AS _key, 1::BIGINT AS _seq", false)]
#[case::null_op("NULL::VARCHAR AS _op, '{}' AS _key, 1::BIGINT AS _seq", false)]
#[case::null_key("'insert' AS _op, NULL::VARCHAR AS _key, 1::BIGINT AS _seq", false)]
fn check_metadata_on_a_link_table(#[case] metadata: &str, #[case] accepted: bool) {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory);
    workspace
        .create_table(
            "link",
            &format!("SELECT {metadata}, 1 AS FROM_ID, 2 AS TO_ID"),
        )
        .expect("the link table should be created");
    let result = workspace.check_metadata("link");
    if accepted {
        result.expect("a table with `_op`, `_key` and `_seq` should pass");
    } else {
        let report = result.expect_err("a table without usable metadata should be refused");
        assert_matches!(
            report.current_context(),
            PreparationError::Metadata { table } if table.as_ref() == "link"
        );
    }
}

#[test]
fn sink_names_its_input_table() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory);
    source(
        &workspace,
        "source",
        "SELECT 1 AS ID, 'a' AS NAME",
        &key(&["ID"]),
    );
    let prepared = workspace
        .prepare_pipeline(
            &pipeline(
                "- id: sink\n  sink:\n    entityType: https://example.com/entity/v/1\n    \
                 entityId: ID\n    properties:\n      https://example.com/property/v/1: NAME\n",
            ),
            "source",
            &BTreeMap::new(),
        )
        .expect("the sink should be prepared");
    let [sink] = prepared.sinks.as_slice() else {
        panic!("one sink should be produced");
    };
    assert_eq!(
        sink.table.as_ref(),
        "source",
        "the sink should name its input table instead of a copy"
    );
    assert_eq!(
        sink.sink.entity_id.as_ref(),
        "ID",
        "the sink should carry its mapping"
    );
}

#[rstest]
#[case::entity_id("entityId: MISSING\n")]
#[case::property(
    "entityId: ID\n    properties:\n      https://example.com/property/v/1: MISSING\n"
)]
#[case::coerced(
    "entityId: ID\n    properties:\n      https://example.com/property/v/1: { column: MISSING, \
     coerce: date }\n"
)]
#[case::unit(
    "entityId: ID\n    properties:\n      https://example.com/property/v/1: { amount: ID, unit: \
     MISSING, unitMap: masses }\n"
)]
fn sink_refuses_missing_column(#[case] mapping: &str) {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory);
    source(&workspace, "source", "SELECT 1 AS ID", &key(&["ID"]));
    let report = workspace
        .prepare_pipeline(
            &pipeline(&format!(
                "- id: sink\n  sink:\n    entityType: https://example.com/entity/v/1\n    \
                 {mapping}"
            )),
            "source",
            &BTreeMap::new(),
        )
        .expect_err("a sink should refuse a column its input lacks");
    assert_matches!(
        report.current_context(),
        PreparationError::Step { step } if step.as_ref() == "sink"
    );
    assert!(
        report.frames().any(|frame| matches!(
            frame.downcast_ref::<PreparationError>(),
            Some(PreparationError::MissingColumn { column }) if column.as_ref() == "MISSING"
        )),
        "the report should name the missing column: {report:?}"
    );
}

#[test]
fn pipeline_input_without_metadata() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory);
    workspace
        .create_table("source", "SELECT 'insert' AS _op, '{}' AS _key, 1 AS ID")
        .expect("the source table should be created");
    let report = workspace
        .prepare_pipeline(
            &pipeline("- id: valid\n  sql: SELECT * FROM input\n"),
            "source",
            &BTreeMap::new(),
        )
        .expect_err("an input without `_seq` should be refused before any step runs");
    assert_matches!(
        report.current_context(),
        PreparationError::Metadata { table } if table.as_ref() == "source"
    );
}

#[rstest]
#[case::from("MISSING", "TO_ID", "NAME")]
#[case::to("FROM_ID", "MISSING", "NAME")]
#[case::property("FROM_ID", "TO_ID", "MISSING")]
fn link_refuses_missing_column(#[case] from: &str, #[case] to: &str, #[case] property: &str) {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory);
    let definition = Definition::from_yaml(
        &include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/pipeline-link-columns.yaml"
        ))
        .replace("FROM_COLUMN", from)
        .replace("TO_COLUMN", to)
        .replace("PROPERTY_COLUMN", property),
    )
    .expect("the definition should parse");
    workspace
        .create_table("rows", "SELECT 1 AS FROM_ID, 2 AS TO_ID, 'a' AS NAME")
        .expect("the checkpoint table should be created");
    let checkpoints = BTreeMap::from([(
        "rows".parse().expect("the checkpoint should be valid"),
        Box::from("rows"),
    )]);
    let link = definition
        .link_pipelines()
        .first()
        .expect("the link pipeline should exist");
    let report = workspace
        .prepare_link_pipeline(link, &checkpoints)
        .expect_err("a link should refuse a column its table lacks");
    assert_matches!(
        report.current_context(),
        PreparationError::MissingColumn { column } if column.as_ref() == "MISSING"
    );
}

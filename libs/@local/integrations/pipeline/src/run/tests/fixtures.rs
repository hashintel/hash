//! Checkpoints encoded from independently reviewed rows, without calling a producer stage.

use alloc::collections::BTreeMap;
use std::fs;

use duckdb::types::Value as DuckValue;
use hash_integrations_definition::Variables;
use serde::Deserialize;
use serde_json::Value as JsonValue;
use similar_asserts::assert_eq;
use tempfile::TempDir;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

use super::{context, run_id};
use crate::{
    ArtifactRef, RunContext, RunId, Workspace,
    run::{
        marker,
        table::{Cell, Column, ColumnKind, RowFile, load_table, store_query},
    },
    sql::{Identifier, literal},
    stage::{
        capture::{CaptureOutput, CapturedSource},
        diff::{DiffCounts, DiffOutput, TargetDiff},
        plan::PlanOutput,
        send::SendOutput,
    },
};

const SCHEMAS: &str = include_str!("../../../tests/fixtures/schemas.json");
const FIRST_RUN: &str = include_str!("../../../tests/fixtures/s1-checkpoints.json");

#[derive(Deserialize)]
struct FixtureColumn<'schema> {
    name: &'schema str,
    #[serde(rename = "type")]
    kind: &'schema str,
    nullable: bool,
}

/// Returns the first-run expectations, including the opaque consumer seed hashes.
pub(crate) fn first_run() -> JsonValue {
    serde_json::from_str(FIRST_RUN).expect("should decode the independently supplied expectations")
}

fn columns(schema: &str) -> Vec<Column> {
    let schemas: BTreeMap<&'static str, Vec<FixtureColumn<'static>>> =
        serde_json::from_str(SCHEMAS).expect("should decode the supplied checkpoint schemas");
    schemas
        .get(schema)
        .expect("should name a supplied checkpoint schema")
        .iter()
        .map(|column| Column {
            name: column.name,
            kind: match column.kind {
                "VARCHAR" => ColumnKind::Text,
                "USMALLINT" => ColumnKind::UInt16,
                "UINTEGER" => ColumnKind::UInt32,
                "UBIGINT" => ColumnKind::UInt64,
                "BOOLEAN" => ColumnKind::Boolean,
                kind => panic!("should use a supported fixture column type, found {kind}"),
            },
            nullable: column.nullable,
        })
        .collect()
}

fn cell(value: &JsonValue) -> Cell {
    match value {
        JsonValue::Null => Cell::Null,
        JsonValue::String(value) => Cell::Text(value.as_str().into()),
        JsonValue::Bool(value) => Cell::Boolean(*value),
        JsonValue::Number(value) => Cell::UInt(
            value
                .as_u64()
                .expect("should contain an unsigned fixture cell"),
        ),
        JsonValue::Array(_) | JsonValue::Object(_) => {
            panic!("should encode request objects as exact JSON text cells")
        }
    }
}

/// Encodes a supplied table as a consumer fixture using only generic file IO.
pub(crate) async fn store_expected(context: &RunContext, table: &JsonValue) -> ArtifactRef {
    let schema = table["schema"]
        .as_str()
        .expect("should name the table's independent schema");
    let mut writer = RowFile::create(context, &columns(schema))
        .expect("should create an independently specified table");
    for row in table["rows"]
        .as_array()
        .expect("should contain independently specified rows")
    {
        let cells: Vec<_> = row
            .as_array()
            .expect("should contain one ordered cell array per row")
            .iter()
            .map(cell)
            .collect();
        writer
            .push(&cells)
            .expect("should write a supplied fixture row");
    }
    writer
        .store(context)
        .await
        .expect("should store the fixture")
}

/// Independent checkpoints for testing each consumer before its producer exists.
pub(crate) struct Checkpoints {
    pub capture: CaptureOutput,
    pub diff: DiffOutput,
    pub plan: PlanOutput,
    pub send: SendOutput,
}

/// Builds S1's checkpoints from literal expected schemas, rows, and exact JSON bodies.
pub(crate) async fn checkpoints(context: &RunContext) -> Checkpoints {
    let expected = first_run();
    let run = &expected["run_1"];
    let mut sources = BTreeMap::new();
    for (name, source) in run["capture"]["sources"]
        .as_object()
        .expect("should contain the aviation source expectations")
    {
        sources.insert(
            name.parse().expect("should parse the source name"),
            CapturedSource {
                file: store_expected(context, source).await,
                rows: source["count"]
                    .as_u64()
                    .expect("should contain a row count"),
            },
        );
    }
    let capture = CaptureOutput {
        captured_at: OffsetDateTime::parse(
            run["capture"]["captured_at"]
                .as_str()
                .expect("should contain the fixed capture time"),
            &Rfc3339,
        )
        .expect("should parse the fixed capture time"),
        sources,
        adopted_from: None,
    };
    let mut targets = BTreeMap::new();
    for (target, changes) in run["diff"]["changes"]
        .as_object()
        .expect("should contain independently specified changes")
    {
        let counts: DiffCounts =
            serde_json::from_value(run["diff"]["target_counts"][target].clone())
                .expect("should decode the specified target counts");
        targets.insert(
            target.parse().expect("should parse the fixture target"),
            TargetDiff {
                changes: Some(store_expected(context, changes).await),
                counts,
            },
        );
    }
    Checkpoints {
        capture,
        diff: DiffOutput {
            base: None,
            resent: Vec::new(),
            hashes: store_expected(context, &run["diff"]["hashes"]).await,
            archives: store_expected(context, &run["diff"]["archives"]).await,
            issues: store_expected(context, &run["diff"]["issues"]).await,
            targets,
        },
        plan: PlanOutput {
            writes: store_expected(context, &run["plan"]["writes"]).await,
            issues: store_expected(context, &run["plan"]["issues"]).await,
            batches: 2,
            counts: serde_json::from_value(run["plan"]["counts"].clone())
                .expect("should decode independently specified operation counts"),
        },
        send: serde_json::from_value(run["send"].clone())
            .expect("should decode the independently specified send output"),
    }
}

fn expected_value(value: &JsonValue, column: &Column) -> DuckValue {
    match cell(value) {
        Cell::Null => DuckValue::Null,
        Cell::Text(text) => DuckValue::Text(text.into_string()),
        Cell::Boolean(value) => DuckValue::Boolean(value),
        Cell::UInt(value) => match column.kind {
            ColumnKind::UInt16 => {
                DuckValue::USmallInt(u16::try_from(value).expect("should fit the declared column"))
            }
            ColumnKind::UInt32 => {
                DuckValue::UInt(u32::try_from(value).expect("should fit the declared column"))
            }
            ColumnKind::UInt64 => DuckValue::UBigInt(value),
            ColumnKind::Text | ColumnKind::Boolean => {
                panic!("should use an integer column for an integer fixture")
            }
        },
    }
}

/// Verifies decoded schema and ordered rows, including request strings and null cells.
pub(crate) async fn assert_table(
    context: &RunContext,
    workspace: &Workspace,
    artifact: &ArtifactRef,
    table: &str,
    expected: &JsonValue,
) {
    load_table(context, workspace, artifact, table.into())
        .await
        .expect("should materialize the fixture into a fresh workspace");
    let schema = expected["schema"].as_str().expect("should name a schema");
    let schemas: BTreeMap<&str, Vec<FixtureColumn<'_>>> =
        serde_json::from_str(SCHEMAS).expect("should decode fixture schemas");
    let expected_schema: Vec<_> = schemas
        .get(schema)
        .expect("should name a supplied schema")
        .iter()
        .map(|column| {
            vec![
                DuckValue::Text(column.name.to_owned()),
                DuckValue::Text(column.kind.to_owned()),
            ]
        })
        .collect();
    let actual_schema = workspace
        .query(
            format!(
                "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \
                 {} ORDER BY ordinal_position",
                literal(table)
            )
            .into(),
        )
        .await
        .expect("should read the consumer's decoded schema");
    assert_eq!(
        actual_schema.iter().map(<[_]>::to_vec).collect::<Vec<_>>(),
        expected_schema,
        "should preserve the independent schema of {table}"
    );
    let columns = columns(schema);
    let expected_rows: Vec<Vec<_>> = expected["rows"]
        .as_array()
        .expect("should contain expected rows")
        .iter()
        .map(|row| {
            let cells = row.as_array().expect("should contain ordered cells");
            assert_eq!(cells.len(), columns.len(), "should supply every column");
            cells
                .iter()
                .zip(&columns)
                .map(|(value, column)| expected_value(value, column))
                .collect()
        })
        .collect();
    let actual = workspace
        .query(format!("SELECT * FROM {} ORDER BY rowid", Identifier::new(table)).into())
        .await
        .expect("should read the persisted row order");
    assert_eq!(
        actual.iter().map(<[_]>::to_vec).collect::<Vec<_>>(),
        expected_rows,
        "should preserve the independent rows and exact JSON of {table}"
    );
}

/// Publishes a complete fixture run for consumers that discover predecessor markers.
pub(crate) async fn bind_checkpoints(context: &RunContext, run: RunId, fixture: &Checkpoints) {
    marker::finish(
        context,
        &context.namespace.capture_output(run.into()),
        &fixture.capture,
    )
    .await
    .expect("should bind the independent capture");
    marker::finish(
        context,
        &context.namespace.diff_output(run.into()),
        &fixture.diff,
    )
    .await
    .expect("should bind the independent diff");
    marker::finish(
        context,
        &context.namespace.plan_output(run.into()),
        &fixture.plan,
    )
    .await
    .expect("should bind the independent plan");
    marker::finish(
        context,
        &context.namespace.send_output(run.into()),
        &fixture.send,
    )
    .await
    .expect("should bind the independent delivery result");
}

#[tokio::test]
async fn checkpoints_fresh_scratch() {
    let directory = TempDir::new().expect("should create fixture storage");
    let producer = context(directory.path());
    let fixture = checkpoints(&producer).await;
    let run = run_id(1);
    bind_checkpoints(&producer, run, &fixture).await;
    fs::remove_dir_all(&producer.scratch).expect("should remove all producer scratch state");

    let consumer = context(directory.path());
    let capture: CaptureOutput =
        marker::finished(&consumer, &consumer.namespace.capture_output(run.into()))
            .await
            .expect("should read the persisted capture marker")
            .expect("should contain a capture marker");
    let diff: DiffOutput = marker::finished(&consumer, &consumer.namespace.diff_output(run.into()))
        .await
        .expect("should read the persisted diff marker")
        .expect("should contain a diff marker");
    let plan: PlanOutput = marker::finished(&consumer, &consumer.namespace.plan_output(run.into()))
        .await
        .expect("should read the persisted plan marker")
        .expect("should contain a plan marker");
    let send: SendOutput = marker::finished(&consumer, &consumer.namespace.send_output(run.into()))
        .await
        .expect("should read the persisted send marker")
        .expect("should contain a send marker");
    assert_eq!(
        capture, fixture.capture,
        "should preserve capture references and time"
    );
    assert_eq!(
        diff, fixture.diff,
        "should preserve the diff's complete references"
    );
    assert_eq!(
        plan, fixture.plan,
        "should preserve the planned file references"
    );
    assert_eq!(send, fixture.send, "should preserve completion counts");

    let workspace = consumer
        .open_workspace(Variables::default())
        .await
        .expect("should open a fresh consumer workspace");
    let expected = first_run();
    let first = &expected["run_1"];
    for (name, source) in &capture.sources {
        assert_table(
            &consumer,
            &workspace,
            &source.file,
            &format!("capture/{name}"),
            &first["capture"]["sources"][name.to_string()],
        )
        .await;
    }
    for (name, artifact) in [
        ("hashes", &diff.hashes),
        ("archives", &diff.archives),
        ("issues", &diff.issues),
    ] {
        assert_table(&consumer, &workspace, artifact, name, &first["diff"][name]).await;
    }
    for (target, output) in &diff.targets {
        let name = target.to_string();
        assert_table(
            &consumer,
            &workspace,
            output.changes.as_ref().expect("should contain insert rows"),
            &name,
            &first["diff"]["changes"][&name],
        )
        .await;
    }
    assert_table(
        &consumer,
        &workspace,
        &plan.writes,
        "writes",
        &first["plan"]["writes"],
    )
    .await;
    assert_table(
        &consumer,
        &workspace,
        &plan.issues,
        "plan_issues",
        &first["plan"]["issues"],
    )
    .await;
    workspace
        .close()
        .await
        .expect("should close the consumer workspace");
}

#[tokio::test]
async fn checkpoints_empty_and_rejected() {
    let directory = TempDir::new().expect("should create fixture storage");
    let producer = context(directory.path());
    let expected = first_run();
    let rejected: JsonValue =
        serde_json::from_str(include_str!("../../../tests/fixtures/rejected-rows.json"))
            .expect("should decode independent rejection expectations");
    let tables = [
        ("empty_writes", &expected["run_2"]["plan"]["writes"]),
        ("empty_archives", &expected["run_2"]["diff"]["archives"]),
        ("empty_issues", &expected["run_2"]["diff"]["issues"]),
        ("rejected", &rejected),
        ("empty_rejected", &rejected["empty"]),
    ];
    let mut artifacts = Vec::new();
    for (_, table) in &tables {
        artifacts.push(store_expected(&producer, table).await);
    }
    fs::remove_dir_all(&producer.scratch).expect("should remove producer scratch");
    let consumer = context(directory.path());
    let workspace = consumer
        .open_workspace(Variables::default())
        .await
        .expect("should open fresh scratch");
    for ((name, table), artifact) in tables.into_iter().zip(artifacts) {
        assert_table(&consumer, &workspace, &artifact, name, table).await;
    }
    workspace
        .close()
        .await
        .expect("should close the consumer workspace");
}

#[tokio::test]
async fn checkpoint_nontext_inputs() {
    let directory = TempDir::new().expect("should create fixture storage");
    let producer = context(directory.path());
    let workspace = producer
        .open_workspace(Variables::default())
        .await
        .expect("should open fixture encoder");
    // Literal typed source rows establish the seam independently of row preparation or planning.
    let artifact = store_query(
        &producer,
        &workspace,
        "SELECT * FROM (VALUES (0::UBIGINT, 12.30::DECIMAL(12,2), 1.5::DOUBLE, DATE '2026-11-06', \
         TIMESTAMP '2026-11-06 12:00:00', true), (1::UBIGINT, NULL, NULL, NULL, NULL, NULL)) AS \
         input(_row, amount, ratio, day, observed, enabled) ORDER BY _row"
            .into(),
    )
    .await
    .expect("should encode independent nontext rows");
    workspace
        .close()
        .await
        .expect("should close the fixture encoder");
    fs::remove_dir_all(&producer.scratch).expect("should remove producer workspace and scratch");
    let consumer = context(directory.path());
    let workspace = consumer
        .open_workspace(Variables::default())
        .await
        .expect("should open fresh scratch");
    load_table(&consumer, &workspace, &artifact, "typed".into())
        .await
        .expect("should load the typed fixture");
    let schema = workspace
        .query(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \
             'typed' ORDER BY ordinal_position"
                .into(),
        )
        .await
        .expect("should read decoded types");
    let expected_schema: Vec<_> = [
        ("_row", "UBIGINT"),
        ("amount", "DECIMAL(12,2)"),
        ("ratio", "DOUBLE"),
        ("day", "DATE"),
        ("observed", "TIMESTAMP"),
        ("enabled", "BOOLEAN"),
    ]
    .map(|(name, kind)| vec![DuckValue::Text(name.into()), DuckValue::Text(kind.into())])
    .into();
    assert_eq!(
        schema.iter().map(<[_]>::to_vec).collect::<Vec<_>>(),
        expected_schema,
        "should retain every mapped input type"
    );
    let rows = workspace
        .query(
            "SELECT _row, amount::VARCHAR, ratio, day::VARCHAR, observed::VARCHAR, enabled FROM \
             typed ORDER BY _row"
                .into(),
        )
        .await
        .expect("should read exact persisted values");
    assert_eq!(
        rows.iter().map(<[_]>::to_vec).collect::<Vec<_>>(),
        vec![
            vec![
                DuckValue::UBigInt(0),
                DuckValue::Text("12.30".into()),
                DuckValue::Double(1.5),
                DuckValue::Text("2026-11-06".into()),
                DuckValue::Text("2026-11-06 12:00:00".into()),
                DuckValue::Boolean(true)
            ],
            vec![
                DuckValue::UBigInt(1),
                DuckValue::Null,
                DuckValue::Null,
                DuckValue::Null,
                DuckValue::Null,
                DuckValue::Null
            ],
        ],
        "should retain nontext values and nulls across the persisted seam"
    );
    workspace
        .close()
        .await
        .expect("should close typed consumer workspace");
}

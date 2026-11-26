use alloc::{collections::BTreeMap, sync::Arc};
use core::assert_matches;
use std::{fs::File, path::Path};

use arrow_array::{ArrayRef, RecordBatch, StringArray};
use duckdb::types::Value;
use error_stack::Report;
use hash_integrations_definition::{Definition, EntityPipeline, PrimaryKey};
use parquet::arrow::ArrowWriter;
use pretty_assertions::assert_eq;
use rstest::rstest;
use tempfile::TempDir;

use super::{
    CAPTURE_INVALID, DEFINITION_INVALID, ROWS_INVALID, STEP_FAILED, prepare, prepare_incremental,
};
use crate::{
    run::{self, PreparePart, RunId, Stage},
    stage::{
        capture,
        failure::permanent,
        prepare::{
            pipeline::PreparationError,
            workspace::{Workspace, WorkspaceConfig},
        },
    },
    storage::Storage,
    sync_table::{self, Op},
    testing::{bucket, minio, namespace, started, started_with},
};

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
        "connector: demo\nsources:\n  source:\n    primaryKey: [ID]\n    sql: SELECT 1 AS \
         ID\npipelines:\n  entities:\n    - source: source\n      steps:\n{indented}"
    ))
    .expect("the definition should parse");
    definition
        .entity_pipelines()
        .first()
        .expect("the definition should contain a pipeline")
        .clone()
}

/// Loads the rows of `sql` as the captured table `_capture/source`.
fn captured(workspace: &Workspace, sql: &str) {
    workspace
        .create_table("_capture/source", sql)
        .expect("the captured table should be created");
}

fn stage(workspace: &Workspace, primary_key: &[&str]) -> Result<(), Report<PreparationError>> {
    super::staging::stage(
        workspace,
        "_capture/source",
        "_source/source",
        &key(primary_key),
    )
}

#[test]
fn staging_composite_keys() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory);
    captured(
        &workspace,
        "SELECT * FROM (VALUES ('insert', 1, 'a\"b'), ('delete', 2, 'c')) AS t(_change, ID, NAME)",
    );
    stage(&workspace, &["NAME", "ID"]).expect("the source should be staged");
    let rows = workspace
        .query("SELECT concat_ws(' ', _op, _seq, _key) FROM \"_source/source\" ORDER BY _seq")
        .expect("the metadata should be readable");
    assert_eq!(
        rows.iter().map(<[Value]>::to_vec).collect::<Vec<_>>(),
        [
            [Value::Text(r#"insert 0 {"NAME":"a\"b","ID":1}"#.to_owned())],
            [Value::Text(r#"delete 1 {"NAME":"c","ID":2}"#.to_owned())],
        ],
        "`_op` should be `_change`, `_seq` the order of the rows, and keys should retain field \
         order and escape source text"
    );
}

#[test]
fn staging_invalid_columns() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory);
    captured(&workspace, "SELECT 'insert' AS _change, 1 AS ID, 2 AS _SeQ");
    let report = stage(&workspace, &["ID"]).expect_err("metadata collisions should be refused");
    assert_matches!(
        report.current_context(),
        PreparationError::ReservedColumn { column } if column.as_ref() == "_SeQ",
        "metadata collisions should be case insensitive: {report:?}"
    );
    captured(
        &workspace,
        "SELECT 'insert' AS _change, 1 AS ID, 2 AS RowId",
    );
    let report = stage(&workspace, &["ID"]).expect_err("a column `rowid` should be refused");
    assert_matches!(
        report.current_context(),
        PreparationError::ReservedColumn { column } if column.as_ref() == "RowId",
        "a column `rowid` should be refused, as `_seq` is read from the row id: {report:?}"
    );
    captured(&workspace, "SELECT 'insert' AS _change, 1 AS OTHER");
    let report = stage(&workspace, &["ID"]).expect_err("missing key columns should be refused");
    assert_matches!(
        report.current_context(),
        PreparationError::MissingColumn { column } if column.as_ref() == "ID",
        "the missing key should be named: {report:?}"
    );
}

#[test]
fn staging_empty_source() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory);
    captured(
        &workspace,
        "SELECT 'insert' AS _change, 1 AS ID WHERE false",
    );
    stage(&workspace, &["ID"]).expect("empty sources should be staged");
    assert_eq!(
        workspace
            .count("SELECT count(*) FROM \"_source/source\"")
            .expect("the rows should be counted"),
        0,
        "an empty source should have no rows"
    );
    let prepared = workspace
        .prepare_pipeline(
            &pipeline("- id: empty\n  sql: SELECT * FROM input\n"),
            "_source/source",
            &BTreeMap::new(),
        )
        .expect("empty tables should retain their metadata schema");
    let rows = workspace
        .query(&format!("SELECT * FROM \"{}\"", prepared.table))
        .expect("the output schema should be readable");
    assert_eq!(
        rows.columns(),
        [
            Box::from("_op"),
            Box::from("_key"),
            Box::from("_seq"),
            Box::from("ID")
        ],
        "empty staging tables should retain metadata and data columns"
    );
}

/// Writes a Parquet file at `path` with the text `columns` and one row of each of `rows`. A
/// value a row does not have is null.
fn parquet(path: &Path, columns: &[&str], rows: &[&[&str]]) {
    let arrays = columns.iter().enumerate().map(|(index, column)| {
        let values: ArrayRef = Arc::new(
            rows.iter()
                .map(|row| row.get(index).copied())
                .collect::<StringArray>(),
        );
        (*column, values)
    });
    let batch = RecordBatch::try_from_iter(arrays).expect("should build the rows");
    let file = File::create(path).expect("should create the Parquet file");
    let mut writer =
        ArrowWriter::try_new(file, batch.schema(), None).expect("should open the Parquet writer");
    writer.write(&batch).expect("should write the rows");
    writer.close().expect("should finish the Parquet file");
}

const AIRCRAFT: [&str; 7] = [
    "_change",
    "TAIL",
    "MODEL",
    "FIRST_FLIGHT",
    "EMPTY_MASS",
    "MASS_UNIT",
    "HOME_BASE",
];
const AIRFIELDS: [&str; 3] = ["_change", "ICAO", "FIELD_NAME"];

/// A table to capture: its name, its columns and its rows.
type Table<'a> = (&'a str, &'a [&'a str], &'a [&'a [&'a str]]);

/// Captures `run` with one file per table of `tables`.
async fn captured_run(storage: &Storage, run: RunId, directory: &TempDir, tables: &[Table<'_>]) {
    let mut files = BTreeMap::new();
    for (table, columns, rows) in tables {
        let path = directory.path().join(format!("{table}.parquet"));
        parquet(&path, columns, rows);
        files.insert(table.parse().expect("should be a source name"), path);
    }
    capture(storage, run, &files)
        .await
        .expect("should capture the run");
}

const LINKS_OF_TWO_TABLES: &str = include_str!("../../../../tests/fixtures/pipeline-links.yaml");

const ENTITY_INPUTS: &str = include_str!("../../../../tests/fixtures/pipeline-entity-inputs.yaml");
/// A definition with one table, whose steps are `STEP` and a sink.
const ONE_STEP: &str = include_str!("../../../../tests/fixtures/pipeline-one-step.yaml");

const AIRCRAFT_ROW: Table<'static> = ("aircraft", &["_change", "TAIL"], &[&["insert", "SE-XXX"]]);
const NO_AIRFIELDS: Table<'static> = ("airfields", &AIRFIELDS, &[]);
const NO_CHANGE: Table<'static> = ("aircraft", &["TAIL"], &[&["SE-XXX"]]);
const UNKNOWN_CHANGE: Table<'static> = ("aircraft", &["_change", "TAIL"], &[&["upsert", "SE-XXX"]]);
const FLIGHTS: Table<'static> = ("flights", &["_change"], &[]);

#[rstest]
#[case::missing_change(
    None,
    &[NO_CHANGE, NO_AIRFIELDS],
    CAPTURE_INVALID,
    "the capture file of `aircraft` cannot be staged: table has no column `_change`"
)]
#[case::invalid_change(
    None,
    &[UNKNOWN_CHANGE, NO_AIRFIELDS],
    CAPTURE_INVALID,
    "the capture file of `aircraft` cannot be staged: a row's kind of change is not"
)]
#[case::missing_file(
    None,
    &[AIRCRAFT_ROW],
    CAPTURE_INVALID,
    "the table `airfields` has no capture file"
)]
#[case::unknown_file(
    None,
    &[AIRCRAFT_ROW, NO_AIRFIELDS, FLIGHTS],
    CAPTURE_INVALID,
    "the capture file `flights` is of no table"
)]
#[case::entity_reads_two_tables(
    Some(ENTITY_INPUTS.to_owned()),
    &[AIRCRAFT_ROW, NO_AIRFIELDS],
    DEFINITION_INVALID,
    "the pipeline `aircraft` reads a second table"
)]
#[case::link_reads_two_tables(
    Some(LINKS_OF_TWO_TABLES.to_owned()),
    &[AIRCRAFT_ROW],
    DEFINITION_INVALID,
    "the pipeline `joined` reads a second table"
)]
#[case::failing_step(
    Some(ONE_STEP.replace("STEP", "SELECT MISSING FROM input")),
    &[AIRCRAFT_ROW],
    STEP_FAILED,
    "pipeline step `step` failed"
)]
#[case::rewritten_change(
    Some(ONE_STEP.replace("STEP", "SELECT * REPLACE ('upsert' AS _op) FROM input")),
    &[AIRCRAFT_ROW],
    ROWS_INVALID,
    "a row's kind of change is not"
)]
#[tokio::test]
async fn prepare_refused(
    #[case] definition: Option<String>,
    #[case] tables: &[Table<'static>],
    #[case] code: &'static str,
    #[case] reason: &str,
) {
    let storage = Storage::memory();
    let run = RunId::new();
    match definition {
        Some(definition) => started_with(&storage, run, &definition).await,
        None => started(&storage, run).await,
    }
    let directory = TempDir::new().expect("should create a directory");
    captured_run(&storage, run, &directory, tables).await;

    let error = prepare_incremental(&storage, run)
        .await
        .expect_err("the run should be refused");

    assert_eq!(*error.current_context(), permanent(Stage::Prepare, code));
    let failure = run::load(&storage, run)
        .await
        .expect("should load run.json")
        .0
        .failure
        .expect("the failure should be recorded");
    assert_eq!((failure.stage, &*failure.code), (Stage::Prepare, code));
    assert!(
        failure.message.contains(reason),
        "the message should name the cause: {}",
        failure.message
    );
}

/// Three kinds of change to aircraft, and two to airfields. The date of `N100` does not convert.
const AVIATION_ROWS: [Table<'static>; 2] = [
    (
        "aircraft",
        &AIRCRAFT,
        &[
            &[
                "insert",
                "SE-XXX",
                "DC-3",
                "1946-04-02",
                "8030",
                "KG",
                "ESSA",
            ],
            &["update", "N100", "L-1049", "unknown", "69000", "LB", "ESSB"],
            &[
                "delete",
                "G-OLD",
                "Ju 52",
                "1932-10-13",
                "6500",
                "KG",
                "ESSA",
            ],
        ],
    ),
    (
        "airfields",
        &AIRFIELDS,
        &[
            &["insert", "ESSA", "Arlanda"],
            &["update", "ESSB", "Bromma"],
        ],
    ),
];

/// The stage on the aviation example, after an earlier attempt that wrote the sync table but not
/// `run.json`.
#[tokio::test]
async fn prepare_aviation() {
    let (_minio, port) = minio().await;
    let storage = Storage::s3(bucket(port), &namespace()).expect("should open the bucket");
    let run = RunId::new();
    started(&storage, run).await;
    let directory = TempDir::new().expect("should create a directory");
    captured_run(&storage, run, &directory, &AVIATION_ROWS).await;

    let (record, _) = run::load(&storage, run)
        .await
        .expect("should load run.json");
    prepare(&storage, &record)
        .await
        .expect("the first attempt should write the sync table");
    let first = sync_table::read(&storage, run)
        .await
        .expect("should read the sync table");
    prepare_incremental(&storage, run)
        .await
        .expect("should prepare the run");

    let issues = format!("runs/{run}/issues.jsonl");
    assert_eq!(
        run::load(&storage, run)
            .await
            .expect("should load run.json")
            .0
            .prepare,
        Some(PreparePart {
            rows: 8,
            issues: Some(issues.clone().into_boxed_str()),
            issue_count: 1,
        }),
        "the prepare part should count the rows and the issue"
    );
    let rows = sync_table::read(&storage, run)
        .await
        .expect("should read the sync table");
    assert_eq!(
        rows, first,
        "a second attempt should write the same rows as the first"
    );
    let mut changes = rows.iter().map(|row| (row.seq, row.op)).collect::<Vec<_>>();
    changes.sort_unstable();
    assert_eq!(
        changes,
        [
            (0, Op::CreateEntity),
            (0, Op::CreateEntity),
            (0, Op::CreateLink),
            (1, Op::UpdateEntity),
            (1, Op::UpdateEntity),
            (1, Op::UpdateLink),
            (2, Op::ArchiveLink),
            (2, Op::ArchiveEntity),
        ],
        "each row should be in the sync table once"
    );
    let file = storage
        .download(&issues, directory.path())
        .await
        .expect("the issues file should be in the bucket");
    let lines = std::fs::read_to_string(file).expect("should read the issues file");
    assert_eq!(
        lines.lines().count(),
        1,
        "the issues file should hold the date that cannot be converted: {lines}"
    );
}

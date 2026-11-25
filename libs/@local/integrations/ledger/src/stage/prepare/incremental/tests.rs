// From `engine/tests/pipeline.rs:1-51`
#![expect(missing_docs, reason = "integration tests")]

extern crate alloc;

use alloc::collections::BTreeMap;
use core::{assert_matches, future::poll_fn, task::Poll, time::Duration};

use duckdb::types::Value;
use hash_integrations_definition::{Definition, EntityPipeline, PrimaryKey};
use hash_integrations_engine::{
    AssertionFailure, PreparationError, TableAssertions, Workspace, WorkspaceConfig,
};
use pretty_assertions::assert_eq;
use tempfile::TempDir;

async fn open(directory: &TempDir) -> Workspace {
    Workspace::open(
        directory.path().join("workspace.duckdb"),
        WorkspaceConfig::default(),
    )
    .await
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

// From `engine/tests/pipeline.rs:75-105`
#[tokio::test]
async fn staging_composite_keys() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    let count = workspace
        .stage_table(
            "source".into(),
            "SELECT 1 AS ID, 'a\"b' AS NAME; -- trailing comment".into(),
            key(&["NAME", "ID"]),
            TableAssertions::default(),
        )
        .await
        .expect("the source should be staged");
    assert_eq!(count, 1, "staging should return the source row count");
    let rows = workspace
        .query("SELECT _op, _key, ID FROM source".into())
        .await
        .expect("the metadata should be readable");
    assert_eq!(
        rows.iter().next(),
        Some(
            [
                Value::Text("snapshot".to_owned()),
                Value::Text("{\"NAME\":\"a\\\"b\",\"ID\":1}".to_owned()),
                Value::Int(1)
            ]
            .as_slice()
        ),
        "keys should retain field order and escape source text"
    );
}

// From `engine/tests/pipeline.rs:181-213`
#[tokio::test]
async fn staging_invalid_columns() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    let report = workspace
        .stage_table(
            "source".into(),
            "SELECT 1 AS ID, 2 AS _KeY".into(),
            key(&["ID"]),
            TableAssertions::default(),
        )
        .await
        .expect_err("metadata collisions should be refused");
    assert_matches!(
        report.current_context(),
        PreparationError::ReservedColumn { column } if column.as_ref() == "_KeY",
        "metadata collisions should be case insensitive: {report:?}"
    );
    let report = workspace
        .stage_table(
            "source".into(),
            "SELECT 1 AS OTHER".into(),
            key(&["ID"]),
            TableAssertions::default(),
        )
        .await
        .expect_err("missing key columns should be refused");
    assert_matches!(
        report.current_context(),
        PreparationError::MissingColumn { column } if column.as_ref() == "ID",
        "the missing key should be named: {report:?}"
    );
}

// From `engine/tests/pipeline.rs:425-456`
#[tokio::test]
async fn staging_empty_source() {
    let directory = TempDir::new().expect("the directory should be created");
    let workspace = open(&directory).await;
    let count = workspace
        .stage_table(
            "source".into(),
            "SELECT 1 AS ID WHERE false".into(),
            key(&["ID"]),
            TableAssertions::default(),
        )
        .await
        .expect("empty sources should be staged");
    assert_eq!(count, 0, "an empty source should report no rows");
    let prepared = workspace
        .prepare_pipeline(
            pipeline("- id: empty\n  sql: SELECT * FROM input\n"),
            "source".into(),
            BTreeMap::new(),
        )
        .await
        .expect("empty tables should retain their metadata schema");
    let rows = workspace
        .query(format!("SELECT * FROM \"{}\"", prepared.table).into_boxed_str())
        .await
        .expect("the output schema should be readable");
    assert_eq!(
        rows.columns(),
        [Box::from("_op"), Box::from("_key"), Box::from("ID")],
        "empty staging tables should retain metadata and data columns"
    );
}
